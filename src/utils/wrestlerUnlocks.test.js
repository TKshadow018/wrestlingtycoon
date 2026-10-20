import { describe, expect, it } from 'vitest'
import {
  WRESTLER_PRESTIGE_UNLOCK_THRESHOLDS,
  annotateWrestlerUnlockTiers,
  getNextWrestlerGoalUnlock,
  getWrestlerPrestigeRequirement,
} from './wrestlerUnlocks'

const wrestlers = [
  { id: 'ace', role: 'wrestler', popularity: 100 },
  { id: 'star', role: 'wrestler', popularity: 90 },
  { id: 'veteran', role: 'wrestler', popularity: 80 },
  { id: 'rising', role: 'wrestler', popularity: 70 },
  { id: 'rookie-a', role: 'wrestler', popularity: 60 },
  { id: 'rookie-b', role: 'wrestler', popularity: 50 },
  { id: 'rookie-c', role: 'wrestler', popularity: 40 },
  { id: 'rookie-d', role: 'wrestler', popularity: 30 },
]

describe('popularity-based wrestler access', () => {
  it('assigns exactly the top half of the pool to four popularity unlock tiers', () => {
    const annotated = annotateWrestlerUnlockTiers(wrestlers)

    expect(Object.fromEntries(annotated.map(({ id, wrestlerUnlockTier }) => [id, wrestlerUnlockTier])))
      .toEqual({
        ace: 4,
        star: 3,
        veteran: 2,
        rising: 1,
        'rookie-a': 0,
        'rookie-b': 0,
        'rookie-c': 0,
        'rookie-d': 0,
      })
  })

  it('uses stable IDs to break equal-popularity ties and ignores non-wrestlers', () => {
    const annotated = annotateWrestlerUnlockTiers([
      { id: 'z-ace', role: 'wrestler', popularity: 90 },
      { id: 'a-ace', role: 'wrestler', popularity: 90 },
      { id: 'staff', role: 'staff', popularity: 100 },
      { id: 'rookie-a', role: 'wrestler', popularity: 60 },
      { id: 'rookie-b', role: 'wrestler', popularity: 50 },
    ])

    expect(annotated.find(({ id }) => id === 'a-ace').wrestlerUnlockTier).toBe(4)
    expect(annotated.find(({ id }) => id === 'z-ace').wrestlerUnlockTier).toBe(2)
    expect(annotated.find(({ id }) => id === 'staff').wrestlerUnlockTier).toBeUndefined()
  })

  it('uses the requested prestige thresholds and respects permanent goal unlocks', () => {
    expect(WRESTLER_PRESTIGE_UNLOCK_THRESHOLDS).toEqual([100, 300, 800, 1500])
    const [ace] = annotateWrestlerUnlockTiers(wrestlers)

    expect(getWrestlerPrestigeRequirement(ace, 1499)).toBe(1500)
    expect(getWrestlerPrestigeRequirement(ace, 1500)).toBeNull()
    expect(getWrestlerPrestigeRequirement(ace, 0, ['ace'])).toBeNull()
  })

  it('goal-unlocks the least popular still-locked wrestler before higher tiers', () => {
    const annotated = annotateWrestlerUnlockTiers(wrestlers)

    expect(getNextWrestlerGoalUnlock(annotated, 10, [])).toBe('rising')
    expect(getNextWrestlerGoalUnlock(annotated, 100, [])).toBe('veteran')
    expect(getNextWrestlerGoalUnlock(annotated, 1500, [])).toBeNull()
    expect(getNextWrestlerGoalUnlock(annotated, 10, ['rising'])).toBe('veteran')
  })
})
