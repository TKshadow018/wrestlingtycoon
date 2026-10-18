import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  setAiInitializationStarted: vi.fn(),
  setAiReady: vi.fn(),
  setAiError: vi.fn(),
}))

vi.mock('../store/useGameStore', () => ({
  useGameStore: {
    getState: () => ({
      setAiInitializationStarted: mocks.setAiInitializationStarted,
      setAiReady: mocks.setAiReady,
      setAiError: mocks.setAiError,
    }),
  },
}))

const responseWith = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
})

let manager

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key')
  vi.stubEnv('VITE_OPENROUTER_MODEL', 'openrouter/free')
  vi.stubGlobal('fetch', mocks.fetch)
  manager = await import('./openRouterManager')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OpenRouter AI manager', () => {
  it('initializes a configured client without downloading a browser model', async () => {
    const client = await manager.initializeAiAssistant()

    expect(client).toBe(manager.getAiCompletionClient())
    expect(manager.getAiModelId()).toBe('openrouter/free')
    expect(mocks.setAiInitializationStarted).toHaveBeenCalledWith({ modelId: 'openrouter/free' })
    expect(mocks.setAiReady).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('shares an in-flight initialization promise', async () => {
    const firstRequest = manager.initializeAiAssistant()
    const secondRequest = manager.initializeAiAssistant()

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      manager.getAiCompletionClient(),
      manager.getAiCompletionClient(),
    ])
    expect(mocks.setAiInitializationStarted).toHaveBeenCalledTimes(1)
    expect(mocks.setAiReady).toHaveBeenCalledTimes(1)
  })

  it('sends OpenAI-compatible requests with the configured API key and free model', async () => {
    const completion = {
      choices: [{ message: { content: '{"reply":"Ready."}' } }],
    }
    mocks.fetch.mockResolvedValueOnce(responseWith(completion))
    const client = await manager.initializeAiAssistant()

    await expect(client.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.65,
      max_tokens: 240,
    })).resolves.toEqual(completion)

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: '******',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0.65,
          max_tokens: 240,
        }),
      }),
    )
  })

  it('rejects initialization when the API key is missing and reports a localized error key', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '')
    vi.resetModules()
    manager = await import('./openRouterManager')

    await expect(manager.initializeAiAssistant()).rejects.toMatchObject({
      code: 'missing-api-key',
    })
    expect(mocks.setAiError).toHaveBeenCalledWith('onboarding.aiMissingApiKey')
  })

  it('classifies transient OpenRouter failures as recoverable but rejects authentication failures', async () => {
    expect(manager.isRecoverableAiError({ status: 429 })).toBe(true)
    expect(manager.isRecoverableAiError({ status: 503 })).toBe(true)
    expect(manager.isRecoverableAiError(new TypeError('Failed to fetch'))).toBe(true)
    expect(manager.isRecoverableAiError({ status: 401 })).toBe(false)
  })

  it('reports OpenRouter response errors with their status and can recover the client', async () => {
    mocks.fetch.mockResolvedValueOnce(responseWith({ error: { message: 'Rate limited' } }, 429))
    const client = await manager.initializeAiAssistant()

    await expect(client.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
    })).rejects.toMatchObject({
      message: 'Rate limited',
      status: 429,
    })

    const recoveredClient = await manager.recoverAiClientFromRuntimeError(new Error('HTTP 503'))
    expect(recoveredClient).not.toBe(client)
    expect(mocks.setAiReady).toHaveBeenCalledTimes(2)
  })
})
