import {
  getAiModelEngine,
  getAiModelId,
  isRecoverableAiError,
  recoverAiModelFromRuntimeError,
  startAiModelDownload,
} from './webllmManager'
import {
  CHAMPION_QUESTION_TEMPLATES,
  FINANCE_QUESTION_TEMPLATES,
  HIRE_QUESTION_TEMPLATES,
  JOURNALISTS,
  MATCH_QUESTION_TEMPLATES,
  NEWSPAPERS,
  UPCOMING_EVENT_QUESTION_TEMPLATES,
} from './interviewData'
import {
  BRIDGE_SYSTEM_PROMPT_LINES,
  COUNTER_QUESTION_SYSTEM_PROMPT_LINES,
  EVALUATE_SYSTEM_PROMPT_LINES,
  BRIDGE_USER_INSTRUCTION,
  FALLBACK_BRIDGE_REPLY,
  FALLBACK_ACCEPT_REPLY,
} from './interviewPrompts'

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)]

const stripCodeFence = (value) => {
  const text = String(value || '').trim()
  if (!text.startsWith('```')) {
    return text
  }

  return text
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim()
}

const parseJson = (value) => {
  try {
    return JSON.parse(stripCodeFence(value))
  } catch {
    return null
  }
}

const looksLikeQuestion = (value) => /\?\s*$/.test(String(value || '').trim())

const generateFollowUpBridgeReply = async ({ journalistName, newspaperName, userAnswer, counterQuestion, transcript, t }) => {
  const bridgeMessages = [
    {
      role: 'system',
      content: BRIDGE_SYSTEM_PROMPT_LINES.join(' '),
    },
    {
      role: 'user',
      content: [
        `Journalist: ${journalistName}`,
        `Newspaper: ${newspaperName}`,
        `Player answer: "${userAnswer}"`,
        `Follow-up question to ask next: "${counterQuestion}"`,
        `Recent transcript: ${JSON.stringify((transcript || []).slice(-8))}`,
      ].join('\n'),
    },
  ]

  try {
    const bridgeText = await completeText(bridgeMessages, { temperature: 0.7, maxTokens: 80 })
    const bridgeParsed = parseJson(bridgeText)
    const reply = typeof bridgeParsed?.reply === 'string' ? bridgeParsed.reply.trim() : ''
    if (reply && !looksLikeQuestion(reply)) {
      return reply
    }
  } catch {
    // Fall through to deterministic fallback.
  }

  return t?.('dashboard.ai.bridgeFallback', FALLBACK_BRIDGE_REPLY) || FALLBACK_BRIDGE_REPLY
}

const generateForcedCounterQuestion = async ({ journalistName, newspaperName, currentQuestion, userAnswer, transcript }) => {
  const questionMessages = [
    {
      role: 'system',
      content: COUNTER_QUESTION_SYSTEM_PROMPT_LINES.join(' '),
    },
    {
      role: 'user',
      content: [
        `Journalist: ${journalistName}`,
        `Newspaper: ${newspaperName}`,
        `Original question: "${currentQuestion}"`,
        `Player answer: "${userAnswer}"`,
        `Recent transcript: ${JSON.stringify((transcript || []).slice(-8))}`,
      ].join('\n'),
    },
  ]

  try {
    const questionText = await completeText(questionMessages, { temperature: 0.7, maxTokens: 90 })
    const questionParsed = parseJson(questionText)
    const counterQuestion = typeof questionParsed?.counterQuestion === 'string'
      ? questionParsed.counterQuestion.trim()
      : ''

    if (counterQuestion) {
      return looksLikeQuestion(counterQuestion) ? counterQuestion : `${counterQuestion}?`
    }
  } catch {
    // Fall through to deterministic fallback.
  }

  return ''
}

const formatCurrency = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '$0'
  }

  return `$${Math.round(numeric).toLocaleString('en-US')}`
}

const buildFactsFromContext = (context = {}) => {
  const newestEmployees = Array.isArray(context.newestEmployees) ? context.newestEmployees.filter(Boolean) : []
  const latestHire = newestEmployees[0] || 'your latest recruit'

  const recentMatches = Array.isArray(context.recentMatches) ? context.recentMatches : []
  const latestMatch = recentMatches[0] || {}
  const latestMatchParticipants = Array.isArray(latestMatch.participants) && latestMatch.participants.length > 0
    ? latestMatch.participants.join(' vs ')
    : 'your recent top performers'
  const latestMatchWinner = latestMatch.winner || 'no clear winner'
  const latestMatchRating = Number.isFinite(Number(latestMatch.rating))
    ? Number(latestMatch.rating).toFixed(1)
    : 'N/A'

  const champions = Array.isArray(context.champions) ? context.champions : []
  const firstChampionRow = champions[0] || {}
  const currentTitle = firstChampionRow.title || 'your top championship'
  const currentChampion = Array.isArray(firstChampionRow.holders) && firstChampionRow.holders.length > 0
    ? firstChampionRow.holders.join(' & ')
    : 'your current champion'

  return {
    latestHire,
    secondLatestHire: newestEmployees[1] || latestHire,
    thirdLatestHire: newestEmployees[2] || latestHire,
    companyName: context.companyName || 'your promotion',
    upcomingEvent: context.upcomingEvent || 'your next event',
    cash: formatCurrency(context.cash),
    fans: Number(context.fans || 0).toLocaleString('en-US'),
    prestige: Number(context.prestige || 0).toLocaleString('en-US'),
    day: String(context.day || 1),
    week: String(context.week || 1),
    latestMatchParticipants,
    latestMatchWinner,
    latestMatchRating,
    currentChampion,
    currentTitle,
  }
}

const hydrateTemplate = (template, facts) => {
  return template.replace(/#\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = facts[key]
    return value == null ? '' : String(value)
  })
}

const selectInterviewQuestion = (context = {}, t = (_key, fallback) => fallback) => {
  const facts = buildFactsFromContext(context)
  const topics = []
  if (Array.isArray(context.recentMatches) && context.recentMatches.length > 0) topics.push(['match', MATCH_QUESTION_TEMPLATES])
  if (context.upcomingEvent && context.upcomingEvent !== 'No announced event') topics.push(['event', UPCOMING_EVENT_QUESTION_TEMPLATES])
  if ((context.champions || []).some((champion) => champion?.holders?.length)) topics.push(['champion', CHAMPION_QUESTION_TEMPLATES])
  if (Array.isArray(context.newestEmployees) && context.newestEmployees.length > 0) topics.push(['hire', HIRE_QUESTION_TEMPLATES])
  if (Number.isFinite(Number(context.cash))) topics.push(['finance', FINANCE_QUESTION_TEMPLATES])

  if (topics.length === 0) {
    return {
      topic: 'general',
      question: t('dashboard.ai.genericQuestion', {}, 'What is your top priority for your promotion right now?'),
    }
  }

  const [topic, templates] = topics[Math.floor(Math.random() * topics.length)]
  const template = templates[Math.floor(Math.random() * templates.length)]
  const localizedQuestionValue = t(`dashboard.ai.interviewQuestions.${topic}`, facts, '')
  const localizedQuestion = typeof localizedQuestionValue === 'string' ? localizedQuestionValue : ''
  const question = localizedQuestion
    ? hydrateTemplate(localizedQuestion, facts)
    : hydrateTemplate(template, facts)

  return { topic, question }
}

const getEngine = async () => {
  const existingEngine = getAiModelEngine()
  if (existingEngine) {
    return existingEngine
  }

  return startAiModelDownload()
}

const completeText = async (messages, options = {}) => {
  const requestCompletion = async () => {
    const engine = await getEngine()
    return engine.chat.completions.create({
      model: getAiModelId(),
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 420,
    })
  }

  let completion
  try {
    completion = await requestCompletion()
  } catch (error) {
    if (!isRecoverableAiError(error)) {
      throw error
    }

    await recoverAiModelFromRuntimeError(error)
    completion = await requestCompletion()
  }

  const content = completion?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' ')
      .trim()
  }

  return ''
}

export const createInterviewScenario = async (context, { t } = {}) => {
  const translate = (key, options, fallback) => t
    ? t(key, { ...options, defaultValue: fallback })
    : fallback
  const journalistName = pickRandom(JOURNALISTS)
  const newspaperName = pickRandom(NEWSPAPERS)
  const featuredWrestlerName = String(context?.featuredWrestlerName || '').trim()
  const rivalWrestlerName = String(context?.rivalWrestlerName || '').trim()
  const firstQuestion = featuredWrestlerName
    ? rivalWrestlerName
      ? translate('dashboard.ai.storyRivalQuestion', { featured: featuredWrestlerName, rival: rivalWrestlerName }, `How will ${featuredWrestlerName} respond to the challenge from ${rivalWrestlerName}?`)
      : translate('dashboard.ai.storyQuestion', { featured: featuredWrestlerName }, `What direction are you planning for ${featuredWrestlerName}?`)
    : null
  const selectedQuestion = featuredWrestlerName
    ? { topic: 'story', question: firstQuestion }
    : selectInterviewQuestion(context, (key, facts, fallback) => (
        t ? t(key, { ...facts, defaultValue: fallback }) : fallback
      ))

  return {
    journalistName,
    newspaperName,
    situation: featuredWrestlerName
      ? rivalWrestlerName
        ? translate('dashboard.ai.storyRivalSituation', { featured: featuredWrestlerName, rival: rivalWrestlerName }, `This interview is focused on ${featuredWrestlerName} and the rivalry with ${rivalWrestlerName}.`)
        : translate('dashboard.ai.storySituation', { featured: featuredWrestlerName }, `This interview is focused on ${featuredWrestlerName}.`)
      : '',
    topic: selectedQuestion.topic,
    questions: [selectedQuestion.question || t('dashboard.ai.genericQuestion', 'What is your top priority for your promotion right now?')],
  }
}

export const evaluateInterviewAnswer = async ({
  journalistName,
  newspaperName,
  currentQuestion,
  userAnswer,
  transcript,
  allowCounter,
  forceCounter,
  t,
}) => {
  const messages = [
    {
      role: 'system',
      content: EVALUATE_SYSTEM_PROMPT_LINES.join(' '),
    },
    {
      role: 'user',
      content: [
        `Journalist: ${journalistName}`,
        `Newspaper: ${newspaperName}`,
        `Can ask follow-up? ${allowCounter ? 'Yes' : 'No'}`,
        `Must ask follow-up now? ${forceCounter ? 'Yes' : 'No'}`,
        `Question I asked: "${currentQuestion}"`,
        `Their answer: "${userAnswer}"`,
        `Recent transcript: ${JSON.stringify((transcript || []).slice(-8))}`,
        BRIDGE_USER_INSTRUCTION,
      ].join('\n'),
    },
  ]

  try {
    const text = await completeText(messages, { temperature: 0.65, maxTokens: 240 })
    const parsed = parseJson(text)
    let decision = forceCounter && allowCounter ? 'counter' : 'accept'
    let reply = typeof parsed?.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : (t?.('dashboard.ai.acceptFallback', FALLBACK_ACCEPT_REPLY) || FALLBACK_ACCEPT_REPLY)
    let counterQuestion = typeof parsed?.counterQuestion === 'string' ? parsed.counterQuestion.trim() : ''

    if (decision === 'counter' && !counterQuestion && looksLikeQuestion(reply)) {
      counterQuestion = reply
      reply = await generateFollowUpBridgeReply({
        journalistName,
        newspaperName,
        userAnswer,
        counterQuestion,
        transcript,
        t,
      })
    }

    if (decision === 'accept' && looksLikeQuestion(reply)) {
      reply = t?.('dashboard.ai.acceptFallback', FALLBACK_ACCEPT_REPLY) || FALLBACK_ACCEPT_REPLY
    }

    if (decision === 'counter' && !counterQuestion) {
      const forcedCounterQuestion = await generateForcedCounterQuestion({
        journalistName,
        newspaperName,
        currentQuestion,
        userAnswer,
        transcript,
      })

      if (forcedCounterQuestion) {
        counterQuestion = forcedCounterQuestion
      } else {
        throw new Error('Unable to generate the required follow-up question')
      }
    }

    return {
      decision,
      reply,
      counterQuestion: decision === 'counter' ? counterQuestion : '',
    }
  } catch (error) {
    throw new Error(`Interview evaluation failed: ${error?.message || 'unknown error'}`, { cause: error })
  }
}

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'our', 'the', 'this', 'to', 'we', 'what', 'will', 'with', 'you', 'your'])
const getTokens = (text) => String(text || '').toLowerCase().match(/[a-z0-9']+/g) || []

const getGroundedTokens = (text) => new Set(getTokens(text)
  .filter((token) => token.length > 2 && !STOP_WORDS.has(token)))

const hasUnnegatedSignal = (tokens, signals) => tokens.some((token, index) => (
  signals.includes(token)
  && (() => {
    const preceding = tokens.slice(Math.max(0, index - 7), index)
    const lastNegation = Math.max(...['not', 'never', "don't", 'cannot', "can't"].map((negation) => preceding.lastIndexOf(negation)))
    return lastNegation < 0 || preceding.slice(lastNegation + 1).includes('but')
  })()
))

export const scoreInterviewAnswer = ({ userAnswer, currentQuestion = '' }) => {
  const answer = String(userAnswer || '').trim()
  if (!answer) {
    return {
      score: -2,
      professionalism: -6,
      hype: -2,
      controversy: 4,
      detailLevel: 0,
      confidence: 0,
      relevance: 0,
      clarity: 0,
      needsFollowUp: true,
    }
  }

  const tokens = getTokens(answer)
  const answerTerms = getGroundedTokens(answer)
  const questionTerms = getGroundedTokens(currentQuestion)
  const overlap = [...answerTerms].filter((token) => questionTerms.has(token)).length
  const relevance = questionTerms.size === 0 ? 1 : Math.min(3, overlap)
  const wordCount = tokens.length
  const vague = hasUnnegatedSignal(tokens, ['maybe', 'whatever', 'idk'])
    || /\bno comment\b|\bnot sure\b/i.test(answer)
  const hostile = hasUnnegatedSignal(tokens, ['hate', 'trash', 'stupid', 'idiot', 'kill'])
  const controversy = hasUnnegatedSignal(tokens, ['controversy', 'shock', 'chaos', 'destroy', 'blood']) ? 2 : 0
  const clarity = Math.min(2, Math.floor(answerTerms.size / 3))
  const confidence = hasUnnegatedSignal(tokens, ['definitely', 'guarantee', 'prove', 'win']) ? 1 : 0
  const relevant = relevance > 0
  const detailLevel = Math.min(3, relevance + clarity)
  const needsFollowUp = vague || !relevant || wordCount < 5 || (questionTerms.size > 0 && overlap === 0)
  const professionalism = (relevant ? 2 : -2) + clarity - (hostile ? 4 : 0) - (vague ? 2 : 0)
  const hype = confidence + (relevant ? 1 : 0)
  const score = Math.max(-6, Math.min(8, professionalism + hype + relevance - (relevant ? 0 : 2) - controversy - (vague ? 2 : 0)))

  return {
    score,
    professionalism,
    hype,
    controversy: controversy + (hostile ? 2 : 0),
    detailLevel,
    confidence,
    relevance,
    clarity,
    needsFollowUp,
  }
}

export const buildInterviewTurnResult = async ({
  interview,
  currentQuestion,
  userAnswer,
  transcript = [],
  metrics = {},
  t,
}) => {
  const answerScore = scoreInterviewAnswer({ userAnswer, currentQuestion })
  const followUpCount = Number(interview?.followUpCount) || 0
  const maxFollowUps = Math.max(0, Number(interview?.maxFollowUps ?? 3) || 0)
  const shouldAskFollowUp = answerScore.needsFollowUp && followUpCount < maxFollowUps
  const playerMessages = [...transcript, { speaker: 'user', text: userAnswer }]
  const turn = await evaluateInterviewAnswer({
    journalistName: interview?.journalistName,
    newspaperName: interview?.newspaperName,
    currentQuestion,
    userAnswer,
    transcript: playerMessages,
    allowCounter: shouldAskFollowUp,
    forceCounter: shouldAskFollowUp,
    t,
  })

  if (shouldAskFollowUp && !turn.counterQuestion) {
    throw new Error('Required follow-up question was unavailable')
  }

  const nextMetrics = {
    score: (Number(metrics.score) || 0) + answerScore.score,
    professionalism: (Number(metrics.professionalism) || 0) + answerScore.professionalism,
    hype: (Number(metrics.hype) || 0) + answerScore.hype,
    controversy: (Number(metrics.controversy) || 0) + answerScore.controversy,
    relevance: (Number(metrics.relevance) || 0) + answerScore.relevance,
    clarity: (Number(metrics.clarity) || 0) + answerScore.clarity,
    answerCount: (Number(metrics.answerCount) || 0) + 1,
  }
  const committedMessages = shouldAskFollowUp
    ? [
        ...playerMessages,
        { speaker: 'ai', text: turn.reply },
        { speaker: 'ai', text: turn.counterQuestion },
      ]
    : [...playerMessages, { speaker: 'ai', text: turn.reply }]

  return {
    answerScore,
    turn,
    nextMetrics,
    committedMessages,
    shouldAskFollowUp,
  }
}
