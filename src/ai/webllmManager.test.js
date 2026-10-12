import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  CreateMLCEngine: vi.fn(),
  setAiDownloadStarted: vi.fn(),
  setAiDownloadProgress: vi.fn(),
  setAiDownloadReady: vi.fn(),
  setAiDownloadError: vi.fn(),
}))

vi.mock('@mlc-ai/web-llm', () => ({ CreateMLCEngine: mocks.CreateMLCEngine }))
vi.mock('../store/useGameStore', () => ({
  useGameStore: {
    getState: () => ({
      setAiDownloadStarted: mocks.setAiDownloadStarted,
      setAiDownloadProgress: mocks.setAiDownloadProgress,
      setAiDownloadReady: mocks.setAiDownloadReady,
      setAiDownloadError: mocks.setAiDownloadError,
    }),
  },
}))

let manager

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  manager = await import('./webllmManager')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WebLLM model manager', () => {
  it('classifies GPU and memory failures as recoverable', () => {
    expect(manager.isRecoverableAiError(new Error('GPU device was lost'))).toBe(true)
    expect(manager.isRecoverableAiError('DXGI_ERROR_DEVICE_REMOVED')).toBe(true)
    expect(manager.isRecoverableAiError('insufficient memory')).toBe(true)
    expect(manager.isRecoverableAiError('network timeout')).toBe(false)
    expect(manager.isRecoverableAiError(null)).toBe(false)
  })

  it('starts the preferred model, reports normalized progress, and reuses the ready engine', async () => {
    const engine = { chat: {} }
    mocks.CreateMLCEngine.mockImplementation(async (_modelId, options) => {
      options.initProgressCallback({ progress: 0.456, text: 'Downloading' })
      options.initProgressCallback({ progress: 140, text: 42 })
      return engine
    })

    await expect(manager.startAiModelDownload()).resolves.toBe(engine)
    expect(manager.getAiModelEngine()).toBe(engine)
    expect(manager.getAiModelId()).toBe(manager.AI_MODEL_ID)
    expect(mocks.setAiDownloadStarted).toHaveBeenCalledWith({ modelId: manager.AI_MODEL_ID })
    expect(mocks.setAiDownloadProgress).toHaveBeenNthCalledWith(1, {
      progress: 46,
      text: 'Downloading',
    })
    expect(mocks.setAiDownloadProgress).toHaveBeenNthCalledWith(2, { progress: 100, text: '' })
    expect(mocks.setAiDownloadReady).toHaveBeenCalledTimes(1)
    await expect(manager.startAiModelDownload()).resolves.toBe(engine)
    expect(mocks.CreateMLCEngine).toHaveBeenCalledTimes(1)
    expect(mocks.setAiDownloadReady).toHaveBeenCalledTimes(2)
  })

  it('shares an in-flight download promise between callers', async () => {
    let finishDownload
    const engine = { chat: {} }
    mocks.CreateMLCEngine.mockReturnValue(new Promise((resolve) => {
      finishDownload = resolve
    }))

    const firstRequest = manager.startAiModelDownload()
    const secondRequest = manager.startAiModelDownload()

    expect(mocks.CreateMLCEngine).toHaveBeenCalledTimes(1)
    finishDownload(engine)
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([engine, engine])
  })

  it('tries the next configured model after a download failure', async () => {
    const engine = { chat: {} }
    mocks.CreateMLCEngine
      .mockRejectedValueOnce(new Error('model unsupported'))
      .mockResolvedValueOnce(engine)

    await expect(manager.startAiModelDownload()).resolves.toBe(engine)
    expect(mocks.CreateMLCEngine.mock.calls.map(([modelId]) => modelId)).toEqual([
      manager.AI_MODEL_ID,
      'gemma3-1b-it-q4f16_1-MLC',
    ])
    expect(manager.getAiModelId()).toBe('gemma3-1b-it-q4f16_1-MLC')
  })

  it('reports and throws the last failure when every model download fails', async () => {
    const finalError = new Error('all engines failed')
    mocks.CreateMLCEngine
      .mockRejectedValueOnce(new Error('first failed'))
      .mockRejectedValueOnce(new Error('second failed'))
      .mockRejectedValueOnce(finalError)

    await expect(manager.startAiModelDownload()).rejects.toBe(finalError)
    expect(mocks.setAiDownloadError).toHaveBeenCalledWith(expect.stringContaining('all engines failed'))
    expect(mocks.setAiDownloadError).toHaveBeenCalledWith(expect.stringContaining('Llama-3.2-1B-Instruct-q4f16_1-MLC'))
  })

  it('rotates to the next model when recovering and rethrows non-recoverable errors', async () => {
    const engine = { chat: {} }
    mocks.CreateMLCEngine.mockResolvedValue(engine)

    await expect(manager.recoverAiModelFromRuntimeError(new Error('GPU device lost'))).resolves.toBe(engine)
    expect(manager.getAiModelId()).toBe('gemma3-1b-it-q4f16_1-MLC')

    const networkError = new Error('network error')
    await expect(manager.recoverAiModelFromRuntimeError(networkError)).rejects.toBe(networkError)
    expect(mocks.CreateMLCEngine).toHaveBeenCalledTimes(1)
  })
})
