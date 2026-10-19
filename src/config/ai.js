export const DEFAULT_OPENROUTER_MODEL = 'openrouter/free'

export const getOpenRouterApiKey = () => String(import.meta.env.VITE_OPENROUTER_API_KEY || '').trim()

export const getOpenRouterModel = () => {
  const configuredModel = String(import.meta.env.VITE_OPENROUTER_MODEL || '').trim()
  return configuredModel || DEFAULT_OPENROUTER_MODEL
}
