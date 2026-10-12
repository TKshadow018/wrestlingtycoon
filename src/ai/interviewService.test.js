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
  createInterviewScenario,
  evaluateInterviewAnswer,
  scoreInterviewAnswer,
} from './interviewService'

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
    })

    expect(scenario.situation).toBe('')
    expect(scenario.questions[0]).toBe('You recently signed Rookie. What was your strategy behind hiring him?')
    expect(scenario.journalistName).toBeTruthy()
    expect(scenario.newspaperName).toBeTruthy()
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
      forceCounter: false,
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

  it('falls back to acceptance when a forced counter question cannot be produced', async () => {
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
    })).resolves.toMatchObject({ decision: 'accept', counterQuestion: '' })
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

  it('returns a safe error reply for non-recoverable completion errors', async () => {
    makeEngine([new Error('offline')])

    await expect(evaluateInterviewAnswer({
      journalistName: 'Reporter',
      newspaperName: 'Daily Grapple',
      currentQuestion: 'What is next?',
      userAnswer: 'We will continue.',
      allowCounter: true,
      forceCounter: false,
    })).resolves.toEqual({
      decision: 'accept',
      reply: 'Understood. Thanks for the answer.',
      counterQuestion: '',
    })
  })
})

describe('scoreInterviewAnswer', () => {
  it('penalizes empty answers and combines detail, confidence, hostility, and controversy signals', () => {
    expect(scoreInterviewAnswer({ userAnswer: '  ', decision: 'accept' })).toEqual({
      score: -2,
      professionalism: -6,
      hype: -2,
      controversy: 4,
      detailLevel: 0,
      confidence: 0,
    })

    const score = scoreInterviewAnswer({
      userAnswer: 'We will definitely plan the roster because fans deserve a title. This strategy will prove our match budget works and shock everyone with chaos.',
      decision: 'counter',
    })
    expect(score.score).toBeGreaterThan(0)
    expect(score.professionalism).toBeGreaterThan(0)
    expect(score.hype).toBeGreaterThan(0)
    expect(score.controversy).toBeGreaterThan(0)
    expect(score.detailLevel).toBeGreaterThan(0)
    expect(score.confidence).toBe(1)
  })

  it('penalizes short, vague, and hostile answers and caps extreme scores', () => {
    const shortAnswer = scoreInterviewAnswer({ userAnswer: 'No comment, idiot.', decision: 'counter' })
    expect(shortAnswer.score).toBeLessThan(0)
    expect(shortAnswer.professionalism).toBeLessThan(0)
    expect(shortAnswer.controversy).toBeGreaterThan(0)

    const longAnswer = scoreInterviewAnswer({
      userAnswer: `${'We will win. '.repeat(30)} Our plan will prove it.`,
      decision: 'accept',
    })
    expect(longAnswer.score).toBeLessThanOrEqual(8)
  })
})
