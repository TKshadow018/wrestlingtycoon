import { afterAll, describe, expect, it, vi } from 'vitest'

const persistedSave = {
  state: {
    gameStatus: { hasStarted: true },
    profile: {
      playerName: 'Legacy Player',
      homeCountry: 'Japan',
    },
    calendar: {
      day: 14,
      week: 2,
      startDateIso: '2026-01-01',
    },
    finances: { cash: 300000 },
    stats: { fans: 1200, prestige: 12 },
    onboardingChallenge: {
      challengeId: 'legacy-tutorial',
      status: 'active',
      active: true,
      startDay: 1,
      deadlineDay: 21,
      baselineFans: 1000,
      baselineCash: 500000,
      objectives: {
        rosterBuild: {
          targetWrestlers: 2,
          targetStaff: 1,
          currentWrestlers: 1,
          currentStaff: 1,
          completed: false,
        },
        firstShow: {
          targetSuccessfulEvents: 1,
          currentSuccessfulEvents: 1,
          completed: true,
        },
        stabilize: {
          targetFanGain: 350,
          targetOperatingCashFlow: 0,
          currentFanGain: 200,
          currentOperatingCashFlow: -1000,
          completed: false,
        },
      },
    },
    market: {
      wrestlerArchetypes: [{
        archetypeId: 'technical',
        name: 'Imported Technical Ace',
        alignment: 'face',
        style: 'technical',
      }],
      modWrestlers: [{
        id: 'mod-persisted',
        personId: 'mod-persisted',
        name: 'Mod Persisted',
        role: 'wrestler',
        archetypeId: 'technical',
        gender: 'male',
        popularity: 70,
        salary_demand: { monthly_wage: 5000, per_match_salary: 500, additional_bonus: 1000 },
        wrestling_ability: {
          strength: 60,
          technics: 80,
          high_fly_ability: 55,
          leg_stamina: 65,
          body_stamina: 70,
          head_stamina: 75,
        },
      }],
      modVenues: [{
        id: 'mod-legacy-venue',
        name: 'Mod Legacy Arena',
        location: 'Old Town',
        capacity: 5000,
        facilities: 2,
      }],
    },
    roster: {
      employees: [
        {
          employeeId: 'persisted-wrestler',
          personId: 'person-wrestler',
          name: 'Persisted Wrestler',
          gender: 'male',
          role: 'wrestler',
          popularity: 50,
          skill: 55,
          contract: {
            monthlySalary: 1000,
            perMatchSalary: 100,
            signingBonus: 0,
            startDay: 1,
            durationDays: 360,
            endDay: 361,
          },
          matchStats: { totalMatches: 0, totalWins: 0, totalLosses: 0, matchHistory: [] },
        },
        {
          employeeId: 'persisted-manager',
          personId: 'person-manager',
          name: 'Persisted Manager',
          gender: 'male',
          role: 'manager',
          popularity: 20,
          skill: 40,
          contract: {
            monthlySalary: 800,
            perMatchSalary: 0,
            signingBonus: 0,
            startDay: 1,
            durationDays: 360,
            endDay: 361,
          },
        },
      ],
      factions: [{
        factionId: 'persisted-faction',
        name: 'Persisted Faction',
        memberIds: ['persisted-wrestler', 'persisted-manager'],
      }],
      backstageChemistry: {
        'persisted-manager::persisted-wrestler': 24,
        'persisted-manager::missing-member': -30,
      },
    },
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
        venueId: 'mod-legacy-venue',
        promotedWrestlerIds: ['wrestler-1', 'wrestler-2'],
      },
      factionRivalries: [{
        factionIds: ['persisted-faction', 'removed-faction'],
        factionNames: ['Persisted Faction', 'Removed Faction'],
        heat: 44,
        lastEventDay: 10,
        lastAction: 'interference',
      }],
      competitorCompanies: [{
        id: 'comp-1',
        name: 'Saved Federation',
        aggression: 1.2,
        strategyId: 'audienceExpansion',
        nextStrategyDay: 30,
        copiedGimmicks: [{
          archetypeId: 'technical',
          archetypeName: 'The Technician',
          sourceWrestlerId: 'persisted-wrestler',
          sourceWrestlerName: 'Persisted Wrestler',
          copiedDay: 10,
        }],
      }],
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

    expect(state.profile).not.toHaveProperty('homeCountry')
    expect(state.market.wrestlerArchetypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ archetypeId: 'technical', name: 'Imported Technical Ace' }),
    ]))
    expect(state.market.employeeCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateId: 'mod-candidate-mod-persisted', archetypeId: 'technical' }),
    ]))
    expect(state.progression.unlocks.venues).toContain('venue-001')
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
      venueId: 'mod-legacy-venue',
      promotedWrestlerIds: ['wrestler-1', 'wrestler-2'],
      promoStyleId: 'spotlight',
      presentationId: 'classic',
    })
    expect(state.roster.factions).toEqual([{
      factionId: 'persisted-faction',
      name: 'Persisted Faction',
      memberIds: ['persisted-wrestler', 'persisted-manager'],
    }])
    expect(state.roster.backstageChemistry).toEqual({
      'persisted-manager::persisted-wrestler': 24,
    })
    expect(state.events.factionRivalries).toEqual([])
    expect(state.events.competitorCompanies[0]).toMatchObject({
      id: 'comp-1',
      nameKey: 'dashboard.competitorIntel.rivals.titanRingFederation',
      strategyId: 'audienceExpansion',
      copiedGimmicks: [expect.objectContaining({ archetypeId: 'technical' })],
    })
    expect(state.events.competitorCompanies[0]).not.toHaveProperty('name')
    expect(state.events.competitorCompanies.map(({ id }) => id)).toEqual([
      'comp-1', 'comp-2', 'comp-3',
    ])
    expect(state.events.competitorWrestlerPool).toHaveLength(100)
    expect(new Set(state.events.competitorCompanies.flatMap(({ rosterIds }) => rosterIds)).size)
      .toBe(state.events.competitorCompanies.reduce((total, { rosterIds }) => total + rosterIds.length, 0))
    state.events.competitorCompanies.forEach((competitor) => {
      expect(competitor).not.toHaveProperty('name')
      expect(competitor.rosterIds.length).toBeGreaterThanOrEqual(20)
      expect(competitor.rosterIds.length).toBeLessThanOrEqual(30)
      expect(competitor.champions).toEqual(expect.arrayContaining([
        expect.objectContaining({ titleKey: 'dashboard.competitorIntel.rivalTitles.world' }),
        expect.objectContaining({ titleKey: 'dashboard.competitorIntel.rivalTitles.tagTeam' }),
      ]))
    })
    expect(state.onboardingChallenge).toMatchObject({
      tutorialVersion: 2,
      tutorialStageId: 'buildRoster',
      objectives: {
        rosterBuild: {
          targetWrestlers: 12,
          targetStaff: 1,
          targetReferees: 1,
          targetAnnouncers: 1,
          completed: false,
        },
        firstShow: { targetSuccessfulEvents: 3, currentSuccessfulEvents: 1 },
      },
    })
  })
})
