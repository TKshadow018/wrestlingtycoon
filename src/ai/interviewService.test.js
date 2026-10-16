import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aiRuntime = vi.hoisted(() => ({
  getAiModelEngine: vi.fn(),
  getAiModelId: vi.fn(),
  isRecoverableAiError: vi.fn(),
  recoverAiModelFromRuntimeError: vi.fn(),
  startAiModelDownload: vi.fn(),
}))

vi.mock('./webllmManager', () => aiRuntime)

import {
  buildInterviewTurnResult,
  createInterviewScenario,
  evaluateInterviewAnswer,
  scoreInterviewAnswer,
} from './interviewService'
import i18n from '../i18n'
import { applyInterviewConsequencesOnce } from '../utils/interviewFlow'

const completionWith = (content) => ({
  choices: [{ message: { content } }],
})

const makeEngine = (responses) => {
  const create = vi.fn()
  responses.forEach((response) => {
    if (response instanceof Error) {
      create.mockRejectedValueOnce(response)
    } else {
      create.mockResolvedValueOnce(completionWith(response))
    }
  })
  const engine = { chat: { completions: { create } } }
  aiRuntime.getAiModelEngine.mockReturnValue(engine)
  aiRuntime.getAiModelId.mockReturnValue('test-model')
  return { engine, create }
}

beforeEach(() => {
  vi.clearAllMocks()
  aiRuntime.isRecoverableAiError.mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('interview scenarios and answers', () => {
  it('creates a deterministic scenario with a personalized mandatory question', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const scenario = await createInterviewScenario({
      newestEmployees: ['Rookie'],
      companyName: 'North Star Wrestling',
      upcomingEvent: 'Summer Clash',
      cash: 12345,
      fans: 4321,
      prestige: 67,
      day: 5,
      week: 1,
      featuredWrestlerName: 'Rising Star',
      rivalWrestlerName: 'The Champion',
    })

    expect(scenario.situation).toContain('Rising Star')
    expect(scenario.situation).toContain('The Champion')
    expect(scenario.questions[0]).toContain('Rising Star')
    expect(scenario.questions[0]).toContain('The Champion')
    expect(scenario.journalistName).toBeTruthy()
    expect(scenario.newspaperName).toBeTruthy()

    const standardScenario = await createInterviewScenario({ newestEmployees: ['Rookie'] })
    expect(standardScenario.situation).toBe('')
    expect(standardScenario.topic).toBe('hire')
    expect(standardScenario.questions[0]).toContain('Rookie')
  })

  it('chooses a question topic supported by the available game context', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const scenario = await createInterviewScenario({
      recentMatches: [{ participants: ['Ace', 'Blaze'], winner: 'Ace', rating: 8.5 }],
    }, { t: (...args) => i18n.t(...args) })

    expect(scenario.topic).toBe('match')
    expect(scenario.questions[0]).toContain('Ace vs Blaze')
  })

  it('uses a localized generic question if no contextual topic is available', async () => {
    const scenario = await createInterviewScenario({}, {
      t: (key) => key === 'dashboard.ai.genericQuestion' ? 'What matters most today?' : key,
    })

    expect(scenario).toMatchObject({
      topic: 'general',
      questions: ['What matters most today?'],
    })
  })

  it('accepts valid JSON and supports text-part completion responses', async () => {
    const { create } = makeEngine([
      [{ text: '  {"decision":"accept","reply":"A clear plan."}' }, { text: ' ' }],
    ])

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What is the plan?',
      userAnswer: 'We have a plan.',
      transcript: [],
      allowCounter: false,
      forceCounter: false,
    })).resolves.toEqual({
      decision: 'accept',
      reply: 'A clear plan.',
      counterQuestion: '',
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      temperature: 0.65,
      max_tokens: 240,
    }))
  })

  it('uses the safe acceptance reply when model output is malformed or incomplete', async () => {
    makeEngine(['not JSON'])
    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What is the plan?',
      userAnswer: 'We will see.',
      allowCounter: false,
      forceCounter: false,
    })).resolves.toMatchObject({
      decision: 'accept',
      reply: 'Thanks for the clarification.',
      counterQuestion: '',
    })
  })

  it('turns a question-shaped reply into a counter-question and generates a short bridge', async () => {
    const { create } = makeEngine([
      '{"decision":"accept","reply":"What is your next step?"}',
      '{"reply":"That gives us a clearer picture."}',
    ])

    const result = await evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'How will you grow?',
      userAnswer: 'We will grow carefully.',
      transcript: [{ role: 'player', content: 'Recent answer' }],
      allowCounter: true,
      forceCounter: true,
    })

    expect(result).toEqual({
      decision: 'counter',
      reply: 'That gives us a clearer picture.',
      counterQuestion: 'What is your next step?',
    })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('repairs incomplete counter output with a generated follow-up question', async () => {
    const { create } = makeEngine([
      '{"decision":"counter","reply":"We need more detail.","counterQuestion":""}',
      '{"counterQuestion":"What is the next step"}',
    ])

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What are your goals?',
      userAnswer: 'We have some goals.',
      allowCounter: true,
      forceCounter: true,
    })).resolves.toEqual({
      decision: 'counter',
      reply: 'We need more detail.',
      counterQuestion: 'What is the next step?',
    })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('does not let model decisions force follow-ups when the deterministic rubric says the answer is clear', async () => {
    makeEngine(['{"decision":"counter","reply":"Please clarify?","counterQuestion":"Why?"}'])

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What is your plan?',
      userAnswer: 'We will develop our roster by pairing newcomers with experienced coaches.',
      allowCounter: true,
      forceCounter: false,
    })).resolves.toEqual({
      decision: 'accept',
      reply: 'Thanks for the clarification.',
      counterQuestion: '',
    })
  })

  it('rejects the turn when a required counter question cannot be produced', async () => {
    makeEngine([
      '{"decision":"counter","reply":"Please be specific.","counterQuestion":""}',
      'invalid question response',
    ])

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What is your goal?',
      userAnswer: 'We are working on it.',
      allowCounter: true,
      forceCounter: true,
    })).rejects.toThrow('follow-up question')
  })

  it('retries once after a recoverable runtime failure and returns the model answer', async () => {
    const runtimeError = new Error('GPU device was lost')
    const { create } = makeEngine([runtimeError, '{"decision":"accept","reply":"Ready."}'])
    aiRuntime.isRecoverableAiError.mockReturnValue(true)

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'Are you ready?',
      userAnswer: 'Yes.',
      allowCounter: false,
      forceCounter: false,
    })).resolves.toMatchObject({ decision: 'accept', reply: 'Ready.' })
    expect(aiRuntime.recoverAiModelFromRuntimeError).toHaveBeenCalledWith(runtimeError)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('rejects non-recoverable completion errors so the player can retry', async () => {
    makeEngine([new Error('offline')])

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What is next?',
      userAnswer: 'We will continue.',
      allowCounter: true,
      forceCounter: false,
    })).rejects.toThrow('offline')
  })

  it('does not commit transcript or metrics on failure and commits one answer on retry', async () => {
    const transcript = [{ speaker: 'ai', text: 'What is the plan for your roster?' }]
    const startingMetrics = {
      score: 0,
      professionalism: 0,
      hype: 0,
      controversy: 0,
      relevance: 0,
      clarity: 0,
      answerCount: 0,
    }
    const interview = {
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      followUpCount: 0,
      maxFollowUps: 0,
    }
    makeEngine([new Error('offline'), '{"decision":"accept","reply":"That is a clear direction."}'])

    await expect(buildInterviewTurnResult({
      interview,
      currentQuestion: transcript[0].text,
      userAnswer: 'We will train our roster together.',
      transcript,
      metrics: startingMetrics,
    })).rejects.toThrow('offline')
    expect(transcript).toHaveLength(1)
    expect(startingMetrics.answerCount).toBe(0)

    const retry = await buildInterviewTurnResult({
      interview,
      currentQuestion: transcript[0].text,
      userAnswer: 'We will train our roster together.',
      transcript,
      metrics: startingMetrics,
    })

    expect(retry.nextMetrics.answerCount).toBe(1)
    expect(retry.committedMessages.filter((entry) => entry.speaker === 'user')).toHaveLength(1)
    expect(retry.committedMessages).toHaveLength(3)

    const applyEffects = vi.fn()
    applyInterviewConsequencesOnce({ alreadyApplied: false, apply: applyEffects })
    applyInterviewConsequencesOnce({ alreadyApplied: true, apply: applyEffects })
    expect(applyEffects).toHaveBeenCalledTimes(1)
  })
})

describe('scoreInterviewAnswer', () => {
  it('penalizes empty answers with a stable, complete rubric result', () => {
    expect(scoreInterviewAnswer({ userAnswer: '  ', currentQuestion: 'What is your plan?' })).toEqual({
      score: -2,
      professionalism: -6,
      hype: -2,
      controversy: 4,
      detailLevel: 0,
      confidence: 0,
      relevance: 0,
      clarity: 0,
      contradictory: false,
      needsFollowUp: true,
    })
  })

  it('rewards concise relevant answers and does not award negated or stuffed keywords', () => {
    const relevant = scoreInterviewAnswer({
      currentQuestion: 'How will the roster improve match quality?',
      userAnswer: 'We will train the roster together to improve match quality.',
    })
    const negated = scoreInterviewAnswer({
      currentQuestion: 'How will the roster improve match quality?',
      userAnswer: 'We will not cause chaos or destroy our roster.',
    })
    const stuffed = scoreInterviewAnswer({
      currentQuestion: 'How will the roster improve match quality?',
      userAnswer: 'Chaos shock destroy blood controversy chaos shock destroy blood controversy.',
    })

    expect(relevant.relevance).toBeGreaterThan(negated.relevance)
    expect(relevant.score).toBeGreaterThan(stuffed.score)
    expect(negated.controversy).toBeLessThan(stuffed.controversy)
    expect(relevant.needsFollowUp).toBe(false)
  })

  it('recognizes word-order paraphrases and still flags short relevant answers for a probe', () => {
    const direct = scoreInterviewAnswer({
      currentQuestion: 'How will the roster improve match quality?',
      userAnswer: 'We will improve our roster by practicing together for better matches.',
    })
    const paraphrased = scoreInterviewAnswer({
      currentQuestion: 'How will the roster improve match quality?',
      userAnswer: 'Matches will improve by developing our roster through regular practice.',
    })
    const shortRelevant = scoreInterviewAnswer({
      currentQuestion: 'How will the roster improve match quality?',
      userAnswer: 'Train the roster.',
    })

    expect(direct.relevance).toBeGreaterThan(0)
    expect(paraphrased.relevance).toBeGreaterThan(0)
    expect(shortRelevant.relevance).toBeGreaterThan(0)
    expect(shortRelevant.needsFollowUp).toBe(true)
  })

  it('identifies short irrelevant or hostile answers for a follow-up and caps scores', () => {
    const shortAnswer = scoreInterviewAnswer({
      currentQuestion: 'What is the plan for your roster?',
      userAnswer: 'No comment, idiot.',
    })
    expect(shortAnswer.score).toBeLessThan(0)
    expect(shortAnswer.professionalism).toBeLessThan(0)
    expect(shortAnswer.controversy).toBeGreaterThan(0)

    const longAnswer = scoreInterviewAnswer({
      userAnswer: `${'We will win. '.repeat(30)} Our plan will prove it.`,
      currentQuestion: 'How will your promotion respond to community criticism?',
    })
    expect(longAnswer.score).toBeLessThanOrEqual(8)
    expect(longAnswer.needsFollowUp).toBe(true)
  })

  it('probes explicitly conflicting claims but not consistent claims', () => {
    const question = 'What is your plan for the roster?'
    const contradictory = scoreInterviewAnswer({
      currentQuestion: question,
      userAnswer: 'We will cut the roster. We will not cut the roster.',
    })
    const consistent = scoreInterviewAnswer({
      currentQuestion: question,
      userAnswer: 'We will not cut the roster. We will support the roster.',
    })

    expect(contradictory.needsFollowUp).toBe(true)
    expect(contradictory.contradictory).toBe(true)
    expect(consistent.needsFollowUp).toBe(false)
    expect(consistent.contradictory).toBe(false)

    const corrected = scoreInterviewAnswer({
      currentQuestion: question,
      userAnswer: 'We will cut the roster. Correction: we will not cut the roster.',
    })
    expect(corrected.contradictory).toBe(false)
  })

  it('accepts an answer after the pre-show follow-up limit is reached', async () => {
    const interview = {
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      followUpCount: 1,
      maxFollowUps: 1,
    }
    makeEngine(['{"reply":"Thanks for clarifying.","counterQuestion":""}'])

    const result = await buildInterviewTurnResult({
      interview,
      currentQuestion: 'What is your plan for the roster?',
      userAnswer: 'No comment.',
    })

    expect(result.shouldAskFollowUp).toBe(false)
    expect(result.turn.counterQuestion).toBe('')
  })
})
