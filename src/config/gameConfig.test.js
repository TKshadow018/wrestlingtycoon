import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const loadGameConfig = async () => {
  vi.resetModules()
  return import('./gameConfig')
}

describe('game configuration', () => {
  it('uses safe defaults for unset or invalid numeric and boolean values', async () => {
    vi.stubEnv('VITE_GAME_STARTING_CASH', 'invalid')
    vi.stubEnv('VITE_ALLOW_LEGENDS', 'sometimes')
    const { GAME_CONFIG, GAME_DAYS_PER_MONTH, MANAGEMENT_MODULES } = await loadGameConfig()

    expect(GAME_CONFIG.startingCash).toBe(500000)
    expect(GAME_CONFIG.allowLegends).toBe(false)
    expect(GAME_CONFIG.version).toBe('0.1.0')
    expect(GAME_DAYS_PER_MONTH).toBe(30)
    expect(MANAGEMENT_MODULES.map(({ id }) => id)).toContain('manageEmployees')
  })

  it('parses numeric settings and supported boolean strings from the environment', async () => {
    vi.stubEnv('VITE_GAME_VERSION', '2.1.0')
    vi.stubEnv('VITE_GAME_START_DATE', '2026-1-30')
    vi.stubEnv('VITE_GAME_STARTING_CASH', '125000')
    vi.stubEnv('VITE_GAME_STARTING_FANS', '4321')
    vi.stubEnv('VITE_ALLOW_LEGENDS', ' YES ')
    vi.stubEnv('VITE_EVENT_CYCLE_DAYS', 'off')
    const { GAME_CONFIG } = await loadGameConfig()

    expect(GAME_CONFIG).toMatchObject({
      version: '2.1.0',
      startDateIso: '2026-01-30',
      startingCash: 125000,
      startingFans: 4321,
      allowLegends: true,
      eventCycleDays: 7,
    })
  })

  it('accepts boolean false values and numeric zero', async () => {
    vi.stubEnv('VITE_ALLOW_LEGENDS', '0')
    vi.stubEnv('VITE_GAME_STARTING_CASH', '0')
    const { GAME_CONFIG } = await loadGameConfig()

    expect(GAME_CONFIG.allowLegends).toBe(false)
    expect(GAME_CONFIG.startingCash).toBe(0)
  })
})
