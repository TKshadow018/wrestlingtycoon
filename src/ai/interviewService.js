import {
  getAiModelEngine,
  getAiModelId,
  isRecoverableAiError,
  recoverAiModelFromRuntimeError,
  startAiModelDownload,
} from './webllmManager'
import { JOURNALISTS, NEWSPAPERS, QUESTION_TEMPLATES } from './interviewData'
import {
  BRIDGE_SYSTEM_PROMPT_LINES,
  COUNTER_QUESTION_SYSTEM_PROMPT_LINES,
  EVALUATE_SYSTEM_PROMPT_LINES,
  BRIDGE_USER_INSTRUCTION,
  FALLBACK_BRIDGE_REPLY,
  FALLBACK_ACCEPT_REPLY,
  FALLBACK_ERROR_REPLY,
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

const generateFollowUpBridgeReply = async ({ journalistName, newspaperName, userAnswer, counterQuestion, transcript }) => {
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

  return FALLBACK_BRIDGE_REPLY
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

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5)

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

const buildDynamicQuestions = (context = {}) => {
  const facts = buildFactsFromContext(context)
  const mandatoryQuestion = `You recently signed ${facts.latestHire}. What was your strategy behind hiring him?`

  const hydrated = QUESTION_TEMPLATES.map((template) => hydrateTemplate(template, facts).trim())
  const cleaned = hydrated.filter(Boolean)
  const unique = [...new Set(cleaned)]
  const withoutMandatory = unique.filter((question) => question !== mandatoryQuestion)

  const totalQuestions = 3 + Math.floor(Math.random() * 3)
  const sampled = shuffle(withoutMandatory).slice(0, Math.max(0, totalQuestions - 1))

  return [mandatoryQuestion, ...sampled].slice(0, totalQuestions)
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

export const createInterviewScenario = async (context) => {
  const journalistName = pickRandom(JOURNALISTS)
  const newspaperName = pickRandom(NEWSPAPERS)
  const firstQuestion = buildDynamicQuestions(context)[0]

  return {
    journalistName,
    newspaperName,
    situation: '',
    questions: [firstQuestion || 'What is your top priority for your promotion right now?'],
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
    let decision = parsed?.decision === 'counter' && allowCounter ? 'counter' : 'accept'
    let reply = typeof parsed?.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : FALLBACK_ACCEPT_REPLY
    let counterQuestion = typeof parsed?.counterQuestion === 'string' ? parsed.counterQuestion.trim() : ''

    if (forceCounter && allowCounter) {
      decision = 'counter'
    }

    // Normalize imperfect model output: sometimes it places follow-up in reply while marking accept.
    if (allowCounter && decision === 'accept' && !counterQuestion && looksLikeQuestion(reply)) {
      decision = 'counter'
      counterQuestion = reply
      reply = await generateFollowUpBridgeReply({
        journalistName,
        newspaperName,
        userAnswer,
        counterQuestion,
        transcript,
      })
    }

    if (allowCounter && decision === 'counter' && !counterQuestion && looksLikeQuestion(reply)) {
      counterQuestion = reply
      reply = await generateFollowUpBridgeReply({
        journalistName,
        newspaperName,
        userAnswer,
        counterQuestion,
        transcript,
      })
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
        decision = 'accept'
      }
    }

    return {
      decision,
      reply,
      counterQuestion,
    }
  } catch {
    return {
      decision: 'accept',
      reply: FALLBACK_ERROR_REPLY,
      counterQuestion: '',
    }
  }
}
