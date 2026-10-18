import { getOpenRouterApiKey, getOpenRouterModel } from '../config/ai'
import { useGameStore } from '../store/useGameStore'

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_MODEL_ID = getOpenRouterModel()

let client = null
let initializationPromise = null

const createAiError = (message, code, status) => {
  const error = new Error(message)
  error.code = code
  if (status !== undefined) {
    error.status = status
  }
  return error
}

const getAppUrl = () => (
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'
)

const parseResponseBody = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const createCompletionClient = () => ({
  chat: {
    completions: {
      create: async ({
        model = OPENROUTER_MODEL_ID,
        messages = [],
        ...options
      } = {}) => {
        const apiKey = getOpenRouterApiKey()
        if (!apiKey) {
          throw createAiError('OpenRouter API key is not configured.', 'missing-api-key')
        }

        const response = await fetch(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'HTTP-Referer': getAppUrl(),
            'X-Title': 'Wrestling Tycoon',
          },
          body: JSON.stringify({
            model,
            messages,
            ...options,
          }),
        })
        const responseBody = await parseResponseBody(response)

        if (!response.ok) {
          throw createAiError(
            responseBody?.error?.message || `OpenRouter request failed with status ${response.status}.`,
            'request-failed',
            response.status,
          )
        }

        return responseBody
      },
    },
  },
})

const setInitializationError = (error) => {
  const errorKey = error?.code === 'missing-api-key'
    ? 'onboarding.aiMissingApiKey'
    : 'onboarding.aiSetupError'
  useGameStore.getState().setAiError(errorKey)
}

const clearClient = () => {
  client = null
  initializationPromise = null
}

export const isRecoverableAiError = (error) => {
  const status = Number(error?.status)
  const message = String(error?.message || '').toLowerCase()

  return (
    [408, 409, 425, 429].includes(status)
    || status >= 500
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
  )
}

export const initializeAiAssistant = async () => {
  if (client) {
    useGameStore.getState().setAiReady()
    return client
  }

  if (initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    useGameStore.getState().setAiInitializationStarted({ modelId: OPENROUTER_MODEL_ID })
    if (!getOpenRouterApiKey()) {
      throw createAiError('OpenRouter API key is not configured.', 'missing-api-key')
    }

    const initializedClient = createCompletionClient()
    client = initializedClient
    useGameStore.getState().setAiReady()
    return initializedClient
  })()
    .catch((error) => {
      setInitializationError(error)
      throw error
    })
    .finally(() => {
      initializationPromise = null
    })

  return initializationPromise
}

export const recoverAiClientFromRuntimeError = async (error) => {
  if (!isRecoverableAiError(error)) {
    throw error
  }

  clearClient()
  return initializeAiAssistant()
}

export const getAiCompletionClient = () => client
export const getAiModelId = () => OPENROUTER_MODEL_ID
