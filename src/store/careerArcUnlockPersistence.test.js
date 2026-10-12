import { afterAll, describe, expect, it, vi } from 'vitest'

const persistedSave = {
  state: {
    gameStatus: { hasStarted: true },
    calendar: {
      day: 14,
      week: 2,
      startDateIso: '2026-01-01',
    },
    finances: { cash: 300000 },
    stats: { fans: 1200, prestige: 12 },
    progression: {
      currentArc: {
        arcId: 'legacy-arc',
        templateKey: 'audienceSurge',
        status: 'active',
        startDay: 1,
        endDay: 56,
        startSnapshot: { fans: 1000, prestige: 10, cash: 500000 },
        goals: { fanGain: 1000, prestigeGain: 5, cashGain: 10000 },
        reward: { cash: 60000, prestige: 2, sponsorTrust: 3 },
        progress: { fanGain: 0, prestigeGain: 0, cashGain: 0 },
      },
      history: [],
    },
    events: {
      customEvents: [],
      eventPreparation: {
        eventId: 'legacy-ppv',
        venueId: 'venue-011',
        promotedWrestlerIds: ['wrestler-1', 'wrestler-2'],
      },
    },
  },
  version: 0,
}

const testStorage = new Map([
  ['wrestling-tycoon-save-v1', JSON.stringify(persistedSave)],
])

vi.stubGlobal('localStorage', {
  getItem: (key) => testStorage.get(key) ?? null,
  setItem: (key, value) => testStorage.set(key, String(value)),
  removeItem: (key) => testStorage.delete(key),
  clear: () => testStorage.clear(),
})

const { useGameStore } = await import('./useGameStore')

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('career arc unlock save migration', () => {
  it('preserves a legacy selected venue and supplies default unlocks and rewards', () => {
    const state = useGameStore.getState()

    expect(state.progression.unlocks.venues).toContain('venue-011')
    expect(state.progression.unlocks.promoStyles).toContain('spotlight')
    expect(state.progression.unlocks.promoSegments).toContain('standardPromo')
    expect(state.progression.unlocks.presentations).toContain('classic')
    expect(state.progression.currentArc).toMatchObject({
      arcId: 'legacy-arc',
      reward: {
        unlockables: expect.arrayContaining([
          expect.objectContaining({ category: 'venues' }),
          expect.objectContaining({ category: 'promoStyles' }),
          expect.objectContaining({ category: 'promoSegments' }),
          expect.objectContaining({ category: 'presentations' }),
        ]),
      },
    })
    expect(state.events.eventPreparation).toEqual({
      eventId: 'legacy-ppv',
      venueId: 'venue-011',
      promotedWrestlerIds: ['wrestler-1', 'wrestler-2'],
      promoStyleId: 'spotlight',
      presentationId: 'classic',
    })
  })
})
