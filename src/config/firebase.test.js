import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initializeApp = vi.hoisted(() => vi.fn(() => ({ name: 'test-firebase-app' })))

vi.mock('firebase/app', () => ({ initializeApp }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

beforeEach(() => {
  initializeApp.mockClear()
})

const loadFirebaseConfig = async () => {
  vi.resetModules()
  return import('./firebase')
}

describe('Firebase configuration', () => {
  it('initializes Firebase and reports a complete required configuration', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.example')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project')
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app-id')

    const { default: app, isFirebaseConfigured } = await loadFirebaseConfig()

    expect(isFirebaseConfigured).toBe(true)
    expect(app).toEqual({ name: 'test-firebase-app' })
    expect(initializeApp).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-api-key',
      authDomain: 'test.example',
      projectId: 'test-project',
      appId: 'test-app-id',
    }))
  })

  it('reports missing or whitespace-only required configuration without preventing initialization', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', ' ')
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.example')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project')
    vi.stubEnv('VITE_FIREBASE_APP_ID', '')

    const { isFirebaseConfigured } = await loadFirebaseConfig()

    expect(isFirebaseConfigured).toBe(false)
    expect(initializeApp).toHaveBeenCalledTimes(1)
  })
})
