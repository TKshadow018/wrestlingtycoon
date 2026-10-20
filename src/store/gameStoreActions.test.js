import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CONFIG } from '../config/gameConfig'
import { calculateMatchStaminaLoss } from '../utils/matchHealth'
import {
  getNextWrestlerGoalUnlock,
  getWrestlerPrestigeRequirement,
} from '../utils/wrestlerUnlocks'

const testStorage = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => testStorage.get(key) ?? null,
  setItem: (key, value) => testStorage.set(key, String(value)),
  removeItem: (key) => testStorage.delete(key),
  clear: () => testStorage.clear(),
})

it('starts a three-show guided rescue challenge with roster and finance stages', () => {
  const challenge = useGameStore.getState().onboardingChallenge

  expect(challenge).toMatchObject({
    tutorialVersion: 2,
    tutorialStageId: 'buildRoster',
    deadlineDay: 21,
    objectives: {
      rosterBuild: {
        targetWrestlers: 12,
        targetStaff: 1,
        targetReferees: 1,
        targetAnnouncers: 1,
      },
      firstShow: { targetSuccessfulEvents: 3 },
    },
  })
})

const { useGameStore } = await import('./useGameStore')

const startGame = () => useGameStore.getState().startGame({
  playerName: 'Test Promoter',
  companyName: 'Test Wrestling',
})

const hireCandidate = (role, predicate = () => true) => {
  const state = useGameStore.getState()
  const candidate = state.market.employeeCandidates.find(
    (employee) => employee.role === role
      && predicate(employee)
      && getWrestlerPrestigeRequirement(
        employee,
        state.stats.prestige,
        state.progression.unlockedWrestlerIds,
      ) === null,
  )
  expect(candidate, `Expected an available ${role} candidate`).toBeDefined()
  const result = useGameStore.getState().hireEmployee(candidate.candidateId, { skipNegotiation: true })
  expect(result.ok).toBe(true)
  return useGameStore.getState().roster.employees.find(
    (employee) => employee.personId === candidate.id,
  )
}

const setOffers = (offers) => {
  useGameStore.setState((state) => ({
    market: { ...state.market, sponsorOffers: offers },
  }))
}

const makeOffer = (overrides = {}) => ({
  offerId: 'test-offer',
  sponsorId: 'test-sponsor',
  name: 'Test Sponsor',
  sponsorType: 'digital',
  reputation: 60,
  marketRegion: 'Global',
  brandFit: 'Lifestyle',
  tier: 1,
  dailyPayout: 100,
  signingBonus: 250,
  eventMultiplier: 0.05,
  fanBoost: 5,
  trust: 60,
  contractWeeks: 8,
  ...overrides,
})

beforeEach(() => {
  testStorage.clear()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  useGameStore.getState().resetGame()
  expect(startGame().ok).toBe(true)
  useGameStore.setState((state) => ({
    calendar: {
      ...state.calendar,
      day: 1,
      week: 1,
      startDateIso: '2026-06-01',
      isEventDay: false,
    },
    events: {
      ...state.events,
      customEvents: [],
      bookedEvent: null,
      eventPreparation: null,
    },
  }))
})

afterEach(() => {
  useGameStore.getState().resetGame()
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('game store action coverage', () => {
  it('starts the backstage injury timer at 90 days, opens the injury event, and persists it', async () => {
    expect(useGameStore.getState().events.backstageInjury).toEqual({
      daysUntilNext: 90,
      pending: null,
    })

    hireCandidate('wrestler')
    useGameStore.getState().proceedTimeline()
    expect(useGameStore.getState().events.backstageInjury.daysUntilNext).toBe(89)

    useGameStore.setState((state) => ({
      events: {
        ...state.events,
        backstageInjury: { daysUntilNext: 1, pending: null },
      },
    }))
    const injuredBefore = useGameStore.getState().roster.employees
      .filter((employee) => employee.role === 'wrestler' && employee.injury?.type === 'backstage')
      .length
    useGameStore.getState().proceedTimeline()

    const { events, roster, calendar } = useGameStore.getState()
    const backstageInjury = events.backstageInjury.pending
    expect(backstageInjury).toMatchObject({
      employeeId: expect.any(String),
      employeeName: expect.any(String),
      reasonId: expect.any(String),
      occurredDay: 2,
      returnDay: expect.any(Number),
    })
    expect(backstageInjury.returnDay - backstageInjury.occurredDay)
      .toBeGreaterThanOrEqual(14)
    expect(backstageInjury.returnDay - backstageInjury.occurredDay)
      .toBeLessThanOrEqual(60)
    expect(events.backstageInjury.daysUntilNext).toBeGreaterThanOrEqual(60)
    expect(events.backstageInjury.daysUntilNext).toBeLessThanOrEqual(120)
    expect(roster.employees.filter((employee) => employee.role === 'wrestler' && employee.injury?.type === 'backstage'))
      .toHaveLength(injuredBefore + 1)
    expect(calendar.day).toBe(3)
    const savedSnapshot = testStorage.get('wrestling-tycoon-save-v1')
    expect(JSON.parse(savedSnapshot).state.events.backstageInjury).toEqual(events.backstageInjury)
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().events.backstageInjury).toEqual(events.backstageInjury)
    expect(useGameStore.getState().proceedTimeline()).toMatchObject({
      ok: false,
      error: 'backstageInjury.pending',
    })
    useGameStore.getState().dismissBackstageInjury()
    expect(useGameStore.getState().events.backstageInjury.pending).toBeNull()
  })

  const preparePlannerEvent = () => {
    const first = hireCandidate('wrestler')
    const second = hireCandidate('wrestler')
    useGameStore.setState((state) => ({
      events: {
        ...state.events,
        customEvents: [{
          eventId: 'planner-show', type: 'ppv', name: 'Planner show',
          scheduledDay: 1, scheduledWeek: 1, maxMatches: 2, isSystem: false,
        }],
      },
    }))
    return {
      segmentType: 'match', matchType: 'singles',
      wrestlerIds: [first.employeeId, second.employeeId],
      winnerEmployeeId: first.employeeId,
      matchLengthMinutes: 10, finishType: 'pin', riskLevel: 'balanced',
      executionMode: 'play',
      plannedMoments: [{
        momentId: 'opening', actionType: 'technicalExchange',
        actorId: first.employeeId, targetId: second.employeeId, atMinute: 1,
      }, {
        momentId: 'ending', actionType: 'nearFall',
        actorId: second.employeeId, targetId: first.employeeId, atMinute: 9,
      }],
    }
  }

  it('rejects invalid authored plans atomically without advancing the day or losing input', () => {
    const segment = preparePlannerEvent()
    segment.plannedMoments[0].targetId = segment.plannedMoments[0].actorId
    const before = useGameStore.getState()
    const result = before.proceedTimeline({ segments: [segment] })
    expect(result).toMatchObject({ ok: false, error: 'matchPlanner.invalidPlan' })
    expect(useGameStore.getState()).toBe(before)
    expect(segment.plannedMoments[0].targetId).toBe(segment.plannedMoments[0].actorId)
  })

  it('persists event-based rating factors and plan metadata into outcomes and save data', () => {
    const segment = preparePlannerEvent()
    expect(useGameStore.getState().proceedTimeline({ segments: [segment] })).toMatchObject({ ok: true })
    const outcome = useGameStore.getState().events.lastOutcome.segments[0]
    expect(outcome).toMatchObject({
      executionMode: 'play', finishType: 'pin', riskLevel: 'balanced',
      winnerEmployeeId: segment.winnerEmployeeId,
      ratingBreakdown: { eventExecution: expect.any(Number), varietyAndPacing: expect.any(Number) },
    })
    expect(outcome.matchRating).toBeGreaterThanOrEqual(1)
    expect(outcome.matchRating).toBeLessThanOrEqual(10)
    const saved = JSON.parse(testStorage.get('wrestling-tycoon-save-v1')).state
    expect(saved.events.lastOutcome.segments[0].ratingBreakdown).toEqual(outcome.ratingBreakdown)
  })

  it('assigns valid departments to general staff and persists the assignment', () => {
    const staff = hireCandidate('staff')

    expect(useGameStore.getState().setStaffDepartment(staff.employeeId, 'production'))
      .toEqual({ ok: true, department: 'production' })
    expect(useGameStore.getState().roster.employees.find(
      (employee) => employee.employeeId === staff.employeeId,
    ).staffDepartment).toBe('production')
    expect(useGameStore.getState().setStaffDepartment(staff.employeeId, 'invalid'))
      .toMatchObject({ ok: false, reason: 'invalidDepartment' })

    const saved = JSON.parse(testStorage.get('wrestling-tycoon-save-v1')).state
    expect(saved.roster.employees.find((employee) => employee.employeeId === staff.employeeId).staffDepartment)
      .toBe('production')
  })

  it('applies selected referee and announcer skill to event presentation results', () => {
    const segment = preparePlannerEvent()
    const referee = hireCandidate('referee')
    const announcer = hireCandidate('announcer')
    segment.refereeId = referee.employeeId
    segment.announcerId = announcer.employeeId
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: state.roster.employees.map((employee) => {
          if (employee.employeeId === referee.employeeId) {
            return {
              ...employee,
              officiatingAbility: {
                rule_knowledge: 100, decision_speed: 100, positioning: 100, composure: 100,
              },
            }
          }
          if (employee.employeeId === announcer.employeeId) {
            return {
              ...employee,
              broadcastAbility: {
                voice_quality: 100, hype_delivery: 100, diction: 100, ring_knowledge: 100,
              },
            }
          }
          return employee
        }),
      },
    }))

    expect(useGameStore.getState().proceedTimeline({ segments: [segment] })).toMatchObject({ ok: true })
    const result = useGameStore.getState().events.lastOutcome.segments[0]
    expect(result).toMatchObject({
      staffRatingAdjustment: expect.any(Number),
      staffFanImpact: expect.any(Number),
      staffContributions: expect.arrayContaining([
        expect.objectContaining({ role: 'referee', employeeId: referee.employeeId }),
        expect.objectContaining({ role: 'announcer', employeeId: announcer.employeeId }),
      ]),
    })
    expect(result.staffRatingAdjustment).toBeGreaterThan(0)
    expect(result.staffFanImpact).toBeGreaterThan(0)
  })

  it('rewards a manager only when booked with their assigned wrestler in a promo', () => {
    const match = preparePlannerEvent()
    const wrestlerId = match.wrestlerIds[0]
    const manager = hireCandidate('manager')
    useGameStore.getState().setEmployeeManager(wrestlerId, manager.employeeId)
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: state.roster.employees.map((employee) => employee.employeeId === manager.employeeId
          ? { ...employee, managementAbility: { charisma: 100, promo_skill: 100 } }
          : employee),
      },
    }))

    expect(useGameStore.getState().proceedTimeline({
      segments: [{
        segmentType: 'promo',
        wrestlerIds: [wrestlerId, manager.employeeId],
      }],
    })).toMatchObject({ ok: true })
    const result = useGameStore.getState().events.lastOutcome.segments[0]
    expect(result.staffContributions).toEqual([
      expect.objectContaining({
        role: 'manager',
        employeeId: manager.employeeId,
        fanImpact: 2,
      }),
    ])
    expect(result.staffFanImpact).toBe(2)
    expect(useGameStore.getState().finances.ledger.some(
      (entry) => entry.category === 'staffPayroll' && entry.amount > 0,
    )).toBe(true)
  })

  it('applies staff department assignments to event costs, injury recovery, and wrestler morale', () => {
    const segment = preparePlannerEvent()
    const [firstId, secondId] = segment.wrestlerIds
    const staffByDepartment = Object.fromEntries(
      ['production', 'medical', 'talentRelations', 'logistics'].map((department) => {
        const staff = hireCandidate('staff')
        expect(useGameStore.getState().setStaffDepartment(staff.employeeId, department).ok).toBe(true)
        return [department, staff]
      }),
    )
    segment.executionMode = null
    segment.matchRating = 8
    segment.staminaLossById = { [firstId]: 21 }

    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: state.roster.employees.map((employee) => {
          if (employee.employeeId === firstId) {
            return { ...employee, stamina: 30, happiness: 50 }
          }
          if (employee.employeeId === secondId) {
            return { ...employee, happiness: 50 }
          }
          const department = Object.keys(staffByDepartment)
            .find((key) => staffByDepartment[key].employeeId === employee.employeeId)
          if (department === 'production' || department === 'medical') {
            return { ...employee, staffAbility: { ...employee.staffAbility, technical_skill: 100 } }
          }
          if (department === 'talentRelations') {
            return { ...employee, staffAbility: { ...employee.staffAbility, teamwork: 100 } }
          }
          if (department === 'logistics') {
            return { ...employee, staffAbility: { ...employee.staffAbility, reliability: 100 } }
          }
          return employee
        }),
      },
    }))

    const beforeState = useGameStore.getState()
    const expectedOperatingCost = Math.round(
      Math.round(
        GAME_CONFIG.economy.expense.operatingBase
        + beforeState.stats.prestige * GAME_CONFIG.economy.expense.operatingPrestigeMultiplier,
      ) * 0.95,
    )
    expect(beforeState.proceedTimeline({ segments: [segment] })).toMatchObject({ ok: true })

    const afterState = useGameStore.getState()
    expect(afterState.events.lastOutcome.expenseBreakdown).toMatchObject({
      eventCost: Math.round(GAME_CONFIG.eventCost.ppv * 0.95),
      operatingCost: expectedOperatingCost,
    })
    expect(afterState.events.lastOutcome.segments[0].injuries[0].returnDay).toBe(45)
    expect(afterState.roster.employees.find((employee) => employee.employeeId === firstId).happiness).toBe(52)
    expect(afterState.roster.employees.find((employee) => employee.employeeId === secondId).happiness).toBe(49)
  })

  it('stores stable event identity with wrestler match history for regular weekly shows', () => {
    const segment = preparePlannerEvent()
    useGameStore.setState((state) => ({
      calendar: { ...state.calendar, day: 5, week: 1, isEventDay: true },
      events: { ...state.events, customEvents: [] },
    }))

    expect(useGameStore.getState().proceedTimeline({ segments: [segment] })).toMatchObject({ ok: true })

    const employee = useGameStore.getState().roster.employees.find(
      (entry) => entry.employeeId === segment.wrestlerIds[0],
    )
    expect(employee.matchStats.matchHistory.at(-1)).toMatchObject({
      eventId: 'regular-weekly-event',
      eventType: 'regularWeekly',
    })
  })

  it('handles malformed authored participant lists without throwing or advancing', () => {
    const segment = preparePlannerEvent()
    segment.wrestlerIds = { invalid: true }
    expect(useGameStore.getState().proceedTimeline({ segments: [segment] }))
      .toMatchObject({ ok: false, error: 'matchPlanner.invalidPlan' })
    expect(useGameStore.getState().calendar.day).toBe(1)
  })

  it('validates supplied finish and winner fields even without authored moments', () => {
    const segment = preparePlannerEvent()
    delete segment.executionMode
    delete segment.plannedMoments
    segment.finishType = 'unsupported'
    segment.winnerEmployeeId = 'not-in-match'
    expect(useGameStore.getState().proceedTimeline({ segments: [segment] }))
      .toMatchObject({ ok: false, error: 'matchPlanner.invalidPlan' })
    expect(useGameStore.getState().calendar.day).toBe(1)
  })

  it('caps imported stamina losses at 70, persists injuries and cancels later matches without match credit', async () => {
    const segment = preparePlannerEvent()
    delete segment.executionMode
    segment.matchRating = 8
    segment.staminaLossById = Object.fromEntries(segment.wrestlerIds.map((id) => [id, 999]))
    useGameStore.setState((state) => ({
      roster: { ...state.roster, employees: state.roster.employees.map((person) => (
        segment.wrestlerIds.includes(person.employeeId) ? { ...person, stamina: 60 } : person
      )) },
    }))
    expect(useGameStore.getState().proceedTimeline({ segments: [segment, { ...segment }] })).toEqual({ ok: true })
    const state = useGameStore.getState()
    const [played, cancelled] = state.events.lastOutcome.segments
    expect(played.staminaLossById).toEqual(Object.fromEntries(segment.wrestlerIds.map((id) => [id, 70])))
    expect(played.injuries).toHaveLength(2)
    expect(cancelled).toMatchObject({ cancelled: true, cancellationReason: 'injury', matchRating: null })
    for (const id of segment.wrestlerIds) {
      const person = state.roster.employees.find((entry) => entry.employeeId === id)
      expect(person.stamina).toBe(0)
      expect(person.injury.returnDay - person.injury.occurredDay).toBeGreaterThanOrEqual(7)
      expect(person.injury.returnDay - person.injury.occurredDay).toBeLessThanOrEqual(90)
      expect(person.matchStats.totalMatches).toBe(1)
    }
    const persisted = JSON.parse(testStorage.get('wrestling-tycoon-save-v1')).state
    expect(persisted.roster.employees.find((person) => person.employeeId === segment.wrestlerIds[0]).injury)
      .toEqual(state.roster.employees.find((person) => person.employeeId === segment.wrestlerIds[0]).injury)
    const saved = testStorage.get('wrestling-tycoon-save-v1')
    useGameStore.getState().resetGame()
    testStorage.set('wrestling-tycoon-save-v1', saved)
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().roster.employees.find((person) => person.employeeId === segment.wrestlerIds[0]).injury)
      .toEqual(state.roster.employees.find((person) => person.employeeId === segment.wrestlerIds[0]).injury)
  })

  it('recomputes new authored stamina costs from events instead of trusting supplied losses', () => {
    const segment = preparePlannerEvent()
    segment.staminaLossById = Object.fromEntries(segment.wrestlerIds.map((id) => [id, 0]))
    const wrestlers = useGameStore.getState().roster.employees.filter((person) => segment.wrestlerIds.includes(person.employeeId))
    const expected = calculateMatchStaminaLoss({ wrestlers, plan: segment })
    useGameStore.getState().proceedTimeline({ segments: [segment] })
    expect(useGameStore.getState().events.lastOutcome.segments[0].staminaLossById).toEqual(expected)
  })
  it('blocks booking an injured wrestler until the return day without removing them from the roster', () => {
    const segment = preparePlannerEvent()
    const injuredId = segment.wrestlerIds[0]
    useGameStore.setState((state) => ({
      roster: { ...state.roster, employees: state.roster.employees.map((person) => person.employeeId === injuredId
        ? { ...person, stamina: 100, injury: { type: 'exhaustion', occurredDay: 1, returnDay: 8 } } : person) },
    }))
    expect(useGameStore.getState().proceedTimeline({ segments: [segment] }))
      .toMatchObject({ ok: false, error: 'matchHealth.unavailable' })
    useGameStore.getState().proceedTimeline()
    expect(useGameStore.getState().roster.employees.find((person) => person.employeeId === injuredId).injury.returnDay).toBe(8)
    useGameStore.setState((state) => ({ calendar: { ...state.calendar, day: 7 } }))
    useGameStore.getState().proceedTimeline()
    expect(useGameStore.getState().roster.employees.find((person) => person.employeeId === injuredId).injury).toBeNull()
  })

  it('applies the 70-point limit per match rather than to the whole event', () => {
    const segment = preparePlannerEvent()
    delete segment.executionMode
    segment.staminaLossById = Object.fromEntries(segment.wrestlerIds.map((id) => [id, 40]))
    useGameStore.getState().proceedTimeline({ segments: [segment, { ...segment }] })
    const state = useGameStore.getState()
    expect(state.events.lastOutcome.segments.every((match) => !match.cancelled)).toBe(true)
    for (const id of segment.wrestlerIds) {
      expect(state.roster.employees.find((person) => person.employeeId === id))
        .toMatchObject({ stamina: 20, injury: null, matchStats: { totalMatches: 2 } })
    }
  })

  it('generates rated simulated moments for legacy segments with a null rating', () => {
    const segment = preparePlannerEvent()
    delete segment.executionMode
    delete segment.plannedMoments
    segment.matchRating = null
    useGameStore.getState().proceedTimeline({ segments: [segment] })
    const outcome = useGameStore.getState().events.lastOutcome.segments[0]
    expect(outcome.ratingBreakdown).toMatchObject({ eventExecution: expect.any(Number) })
    expect(outcome.plannedMoments.length).toBeGreaterThan(0)
    expect(outcome.winnerEmployeeId).toBe(segment.winnerEmployeeId)
  })

  it('preserves complete authored tag-team winners and safe adjustment diagnostics', () => {
    const segment = preparePlannerEvent()
    segment.matchType = 'tagTeam'
    segment.team1Ids = [segment.wrestlerIds[0]]
    segment.team2Ids = [segment.wrestlerIds[1]]
    segment.winnerEmployeeId = null
    segment.winnerTeamIds = segment.team2Ids
    segment.planWarnings = [{ code: 'minuteAdjusted', secret: 'not retained' }, { code: 'unknown' }]
    useGameStore.getState().proceedTimeline({ segments: [segment] })
    const outcome = useGameStore.getState().events.lastOutcome.segments[0]
    expect(outcome).toMatchObject({
      winnerTeamIds: segment.team2Ids, winnerEmployeeId: null,
      ratingBreakdown: { finishCoherence: expect.any(Number) },
    })
    expect(outcome.planWarnings).toContainEqual({ code: 'minuteAdjusted' })
    expect(outcome.planWarnings).not.toContainEqual({ code: 'unknown' })
    expect(outcome.planWarnings.every((entry) => !Object.hasOwn(entry, 'secret'))).toBe(true)
  })

  it('omits home-country metadata from new games and persisted state', () => {
    const state = useGameStore.getState()
    const persistedState = JSON.parse(testStorage.get('wrestling-tycoon-save-v1')).state

    expect(state.profile).not.toHaveProperty('homeCountry')
    expect(persistedState.profile).not.toHaveProperty('homeCountry')
  })

  it('creates a rivalry from a selected new pairing only when interview heat rises', () => {
    const featuredWrestler = hireCandidate('wrestler')
    const rivalWrestler = hireCandidate('wrestler')
    const pairKey = [featuredWrestler.employeeId, rivalWrestler.employeeId].sort().join('::')

    expect(useGameStore.getState().events.rivalries.some((rivalry) => rivalry.pairKey === pairKey)).toBe(false)
    const impact = useGameStore.getState().applyInterviewConsequences({
      metrics: { score: 8, professionalism: 0, hype: 0, controversy: 8, answerCount: 1 },
      featuredWrestlerId: featuredWrestler.employeeId,
      rivalWrestlerId: rivalWrestler.employeeId,
    })

    expect(impact.rivalryHeatDelta).toBeGreaterThan(0)
    expect(useGameStore.getState().events.rivalries.find((rivalry) => rivalry.pairKey === pairKey)?.heat)
      .toBe(impact.rivalryHeatDelta)
  })

  it('starts with basic unlocks and grants a new unlock bundle when a career arc completes', () => {
    const progression = useGameStore.getState().progression
    expect(progression.unlocks).toMatchObject({
      venues: expect.arrayContaining(['venue-001']),
      promoStyles: ['spotlight'],
      promoSegments: ['standardPromo'],
      presentations: ['classic'],
    })

    const currentArc = progression.currentArc
    const earnedUnlocks = currentArc.reward.unlockables
    expect(earnedUnlocks.map(({ category }) => category)).toEqual([
      'venues',
      'promoStyles',
      'promoSegments',
      'presentations',
    ])

    useGameStore.setState((state) => ({
      progression: {
        ...state.progression,
        currentArc: {
          ...currentArc,
          goals: { fanGain: -1000000, prestigeGain: -1000000, cashGain: -1000000 },
        },
      },
    }))
    useGameStore.getState().proceedTimeline()

    const nextProgression = useGameStore.getState().progression
    expect(nextProgression.history[0]).toMatchObject({
      status: 'completed',
      reward: { unlockables: earnedUnlocks },
    })
    for (const unlock of earnedUnlocks) {
      expect(nextProgression.unlocks[unlock.category]).toContain(unlock.id)
    }
    expect(nextProgression.currentArc.reward.unlockables).not.toEqual(earnedUnlocks)
  })

  it('persists the next popularity-gated wrestler unlocked when a career arc completes', async () => {
    const before = useGameStore.getState()
    const lockedWrestler = before.market.employeeCandidates.find(
      (candidate) => candidate.role === 'wrestler' && candidate.wrestlerUnlockTier > 0,
    )
    expect(lockedWrestler).toBeDefined()
    const expectedUnlockId = getNextWrestlerGoalUnlock(
      before.market.employeeCandidates,
      before.stats.prestige,
      before.progression.unlockedWrestlerIds,
    )

    useGameStore.setState((state) => ({
      progression: {
        ...state.progression,
        currentArc: {
          ...state.progression.currentArc,
          goals: { fanGain: -1000000, prestigeGain: -1000000, cashGain: -1000000 },
        },
      },
    }))
    useGameStore.getState().proceedTimeline()

    const saved = testStorage.get('wrestling-tycoon-save-v1')
    useGameStore.getState().resetGame()
    testStorage.set('wrestling-tycoon-save-v1', saved)
    await useGameStore.persist.rehydrate()

    expect(useGameStore.getState().progression.unlockedWrestlerIds)
      .toContain(expectedUnlockId)
    const goalUnlockedWrestler = useGameStore.getState().market.employeeCandidates.find(
      (candidate) => candidate.id === expectedUnlockId,
    )
    expect(useGameStore.getState().hireEmployee(goalUnlockedWrestler.candidateId, { skipNegotiation: true }).ok)
      .toBe(true)
  })

  it('blocks locked superstar hiring until prestige or a goal unlock qualifies them', () => {
    const lockedWrestler = useGameStore.getState().market.employeeCandidates.find(
      (candidate) => candidate.role === 'wrestler' && candidate.wrestlerUnlockTier === 4,
    )
    expect(lockedWrestler).toBeDefined()
    expect(useGameStore.getState().hireEmployee(lockedWrestler.candidateId, { skipNegotiation: true }))
      .toMatchObject({ ok: false, reason: 'prestigeLocked', prestigeRequired: 1500 })
    expect(useGameStore.getState().negotiateEmployeeContract(lockedWrestler.candidateId, {}))
      .toMatchObject({ ok: false, accepted: false, reason: 'prestigeLocked', prestigeRequired: 1500 })

    useGameStore.setState((state) => ({
      stats: { ...state.stats, prestige: 1500 },
    }))
    expect(useGameStore.getState().hireEmployee(lockedWrestler.candidateId, { skipNegotiation: true }).ok)
      .toBe(true)
  })

  it('saves permanent dismissal of the completed Rescue tutorial', async () => {
    useGameStore.setState((state) => ({
      onboardingChallenge: { ...state.onboardingChallenge, status: 'completed', active: false },
    }))
    expect(useGameStore.getState().dismissOnboardingTutorial()).toEqual({ ok: true })
    expect(useGameStore.getState().onboardingChallenge.tutorialDismissed).toBe(true)

    const saved = testStorage.get('wrestling-tycoon-save-v1')
    useGameStore.getState().resetGame()
    testStorage.set('wrestling-tycoon-save-v1', saved)
    await useGameStore.persist.rehydrate()
    expect(useGameStore.getState().onboardingChallenge.tutorialDismissed).toBe(true)
  })

  it('counts only successful weekly TV events toward the three-show tutorial', () => {
    useGameStore.setState((state) => ({
      onboardingChallenge: {
        ...state.onboardingChallenge,
        objectives: {
          ...state.onboardingChallenge.objectives,
          rosterBuild: { ...state.onboardingChallenge.objectives.rosterBuild, completed: true },
          firstShow: {
            ...state.onboardingChallenge.objectives.firstShow,
            currentSuccessfulEvents: 0,
            targetSuccessfulEvents: 3,
          },
        },
      },
      events: {
        ...state.events,
        customEvents: [{
          eventId: 'tutorial-ppv',
          type: 'ppv',
          name: 'Tutorial PPV',
          scheduledDay: 5,
          scheduledWeek: 1,
          specificDate: '2026-06-05',
          maxMatches: 7,
          isSystem: false,
        }],
      },
    }))

    for (let day = 1; day < 5; day += 1) {
      useGameStore.getState().proceedTimeline()
    }
    expect(useGameStore.getState().calendar.day).toBe(5)
    useGameStore.getState().proceedTimeline({ totalSegments: 1, segments: [] })
    expect(useGameStore.getState().onboardingChallenge.objectives.firstShow.currentSuccessfulEvents).toBe(0)

    while (useGameStore.getState().calendar.day < 12) {
      const isFriday = [12].includes(useGameStore.getState().calendar.day)
      useGameStore.getState().proceedTimeline(isFriday ? { totalSegments: 1, segments: [] } : null)
    }
    expect(useGameStore.getState().calendar.day).toBe(12)
    useGameStore.getState().proceedTimeline({ totalSegments: 1, segments: [] })
    expect(useGameStore.getState().onboardingChallenge.objectives.firstShow.currentSuccessfulEvents).toBe(1)
  })

  it('validates game startup and keeps AI initialization, consent, and interview state consistent', () => {
    expect(useGameStore.getState().startGame({ playerName: ' ', companyName: 'Promotion' }))
      .toEqual({ ok: false })
    expect(useGameStore.getState().startGame({ playerName: 'Player', companyName: '' }))
      .toEqual({ ok: false })

    useGameStore.getState().setActiveModule('manageSponsors')
    useGameStore.getState().setAiOptedInAtStart(true)
    useGameStore.getState().setAiInitializationStarted()
    expect(useGameStore.getState().ai.status).toBe('initializing')
    expect(useGameStore.getState().ai.modelId).toBe('openrouter/free')

    useGameStore.getState().setAiInitializationProgress({ progress: 40, text: 'Connecting' })
    expect(useGameStore.getState().ai).toMatchObject({
      progress: 40,
      progressText: 'Connecting',
    })
    useGameStore.getState().setAiReady()
    useGameStore.getState().setAiInitializationProgress({ progress: 20, text: 'ignored after ready' })
    expect(useGameStore.getState().ai).toMatchObject({
      status: 'ready',
      progress: 100,
      progressText: '',
    })
    useGameStore.getState().setAiError('')
    expect(useGameStore.getState().ai.error).toBe('onboarding.aiSetupError')
    useGameStore.getState().enableAi()
    useGameStore.getState().closeAiEnableModal()
    expect(useGameStore.getState().ai).toMatchObject({
      enabled: true,
      showEnableModal: false,
    })

    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        sponsors: [
          makeOffer({ sponsorId: 'tech', brandFit: 'Tech', trust: 48 }),
          makeOffer({ sponsorId: 'combat', brandFit: 'Combat', trust: 51 }),
          makeOffer({ sponsorId: 'other', brandFit: 'Other', trust: 53 }),
        ],
      },
    }))
    const oldFans = useGameStore.getState().stats.fans
    const featuredWrestler = hireCandidate('wrestler')
    const rivalWrestler = hireCandidate('wrestler')
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: state.roster.employees.map((employee) => (
          employee.employeeId === featuredWrestler.employeeId
            ? { ...employee, heelFaceMeter: 50 }
            : employee
        )),
      },
      events: {
        ...state.events,
        rivalries: [{
          pairKey: [featuredWrestler.employeeId, rivalWrestler.employeeId].sort().join('::'),
          wrestlerIds: [featuredWrestler.employeeId, rivalWrestler.employeeId],
          wrestlerNames: [featuredWrestler.name, rivalWrestler.name],
          heat: 20,
          lastEventDay: 1,
          lastSegmentType: 'match',
          lastRating: 7,
        }],
      },
    }))
    const impact = useGameStore.getState().applyInterviewConsequences({
      metrics: { score: 6, professionalism: 4, hype: 5, controversy: 2, answerCount: 3 },
      forcedPreShow: true,
      featuredWrestlerId: featuredWrestler.employeeId,
      rivalWrestlerId: rivalWrestler.employeeId,
    })
    expect(impact.fansDelta).toBeGreaterThan(0)
    expect(useGameStore.getState().stats.fans).toBe(oldFans + impact.fansDelta)
    expect(useGameStore.getState().ai.lastInterviewImpact.answerCount).toBe(3)
    expect(impact.alignmentDelta).toBe(-1)
    expect(impact.rivalryHeatDelta).toBe(1)
    expect(impact.rivalryNames).toEqual([featuredWrestler.name, rivalWrestler.name])
    expect(useGameStore.getState().roster.employees.find(
      (employee) => employee.employeeId === featuredWrestler.employeeId,
    ).heelFaceMeter).toBe(49)
    expect(useGameStore.getState().events.rivalries[0].heat).toBe(21)
    expect(useGameStore.getState().ai.lastInterviewImpact.alignmentTargetName).toBe(featuredWrestler.name)
    expect(useGameStore.getState().finances.ledger.at(-1).category).toBe('dailyClose')
  })

  it('applies valid mod packages, returns validation errors, and refreshes each market', () => {
    expect(useGameStore.getState().applyModDataPackage({ modules: {} }).ok).toBe(false)

    const imported = useGameStore.getState().applyModDataPackage({
      modules: {
        titles: [{
          titleId: 'mod-title',
          name: 'Imported Championship',
          division: 'singles',
          isWomenOnly: true,
          isActive: false,
          prestige: 375,
        }],
        sponsorOffers: [{ offerId: 'mod-offer', name: 'Imported Sponsor', sponsorType: 'media' }],
        eventTemplates: [{ eventId: 'mod-event', name: 'Imported Show' }],
        wrestlerArchetypes: [{
          archetypeId: 'technical',
          name: 'Technical Specialist',
          alignment: 'face',
          style: 'technical',
        }],
        rosterData: [{
          personId: 'mod-ace',
          name: 'Mod Ace',
          archetypeId: 'technical',
          popularity: 85,
          salary_demand: { monthly_wage: 20000, per_match_salary: 3000, additional_bonus: 4000 },
          wrestling_ability: {
            strength: 80,
            technics: 90,
            high_fly_ability: 65,
            leg_stamina: 75,
            body_stamina: 85,
            head_stamina: 80,
          },
        }],
        venues: [{
          id: 'mod-venue',
          name: 'North Arena',
          location: 'North City',
          capacity: 19000,
          rentFee: 24000,
          facilities: 4,
          isIndoor: true,
        }],
      },
    })
    expect(imported).toMatchObject({ ok: true })
    expect(useGameStore.getState().roster.titles.find((title) => title.titleId === 'mod-title'))
      .toMatchObject({
        isWomenOnly: true,
        isActive: false,
        prestige: 375,
      })
    expect(useGameStore.getState().market.sponsorOffers[0].offerId).toBe('mod-offer')
    expect(useGameStore.getState().market.eventTemplates[0].eventId).toBe('mod-event')
    expect(useGameStore.getState().market.wrestlerArchetypes.some(
      (archetype) => archetype.archetypeId === 'technical',
    )).toBe(true)
    expect(useGameStore.getState().market.modVenues[0]).toMatchObject({
      id: 'mod-venue',
      name: 'North Arena',
    })
    const modCandidate = useGameStore.getState().market.employeeCandidates.find(
      (candidate) => candidate.personId === 'mod-ace',
    )
    expect(modCandidate).toMatchObject({
      candidateId: 'mod-candidate-mod-ace',
      archetypeId: 'technical',
    })
    useGameStore.setState((state) => ({
      stats: { ...state.stats, prestige: 1500 },
    }))
    expect(useGameStore.getState().hireEmployee(modCandidate.candidateId, { skipNegotiation: true }).ok)
      .toBe(true)
    expect(useGameStore.getState().roster.employees.at(-1).archetypeId).toBe('technical')
    expect(useGameStore.getState().market.employeeCandidates.some((candidate) => candidate.personId === 'mod-ace'))
      .toBe(false)

    const oldCandidates = useGameStore.getState().market.employeeCandidates
    const oldTemplates = useGameStore.getState().market.eventTemplates
    useGameStore.getState().rerollEmployeeMarket()
    useGameStore.getState().rerollEventTemplates()
    expect(useGameStore.getState().market.employeeCandidates).not.toBe(oldCandidates)
    expect(useGameStore.getState().market.eventTemplates).not.toBe(oldTemplates)

    useGameStore.setState((state) => ({
      market: { ...state.market, sponsorOffersLastRerolledDay: 1 },
    }))
    const gatedOffers = useGameStore.getState().market.sponsorOffers
    useGameStore.getState().rerollSponsorOffers()
    expect(useGameStore.getState().market.sponsorOffers).toBe(gatedOffers)

    useGameStore.setState((state) => ({
      market: { ...state.market, sponsorOffersLastRerolledDay: null },
    }))
    useGameStore.getState().rerollSponsorOffers()
    expect(useGameStore.getState().market.sponsorOffersLastRerolledDay).toBe(1)
  })

  it('enforces sponsor prerequisites and signs eligible offers into the active roster', () => {
    const highTierOffer = makeOffer({ offerId: 'high-tier', tier: 6 })
    const eventOffer = makeOffer({ offerId: 'event-offer', sponsorType: 'eventMain' })
    const digitalOffer = makeOffer({ offerId: 'digital-offer' })
    setOffers([highTierOffer, eventOffer, digitalOffer])

    expect(useGameStore.getState().signSponsor('missing')).toMatchObject({ ok: false, reason: 'notFound' })
    expect(useGameStore.getState().signSponsor('high-tier'))
      .toMatchObject({ ok: false, reason: 'needsTrackRecord' })
    expect(useGameStore.getState().signSponsor('event-offer'))
      .toMatchObject({ ok: false, reason: 'eventBookingRequired' })

    expect(useGameStore.getState().signSponsor('digital-offer')).toEqual({ ok: true })
    expect(useGameStore.getState().roster.sponsors[0]).toMatchObject({
      sponsorId: 'test-sponsor',
      eventScoped: false,
      remainingDays: 56,
    })
    expect(useGameStore.getState().finances.ledger.at(-1)).toMatchObject({
      category: 'sponsorSigning',
      amount: 250,
    })

    setOffers([makeOffer({ offerId: 'slot-check' })])
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        sponsors: Array.from({ length: 5 }, (_, index) => makeOffer({
          sponsorId: `existing-${index}`,
          sponsorType: 'digital',
        })),
      },
    }))
    expect(useGameStore.getState().signSponsor('slot-check'))
      .toMatchObject({ ok: false, reason: 'slotFull' })
  })

  it('creates, updates, validates, and deletes scheduled custom events with accounting', () => {
    const create = useGameStore.getState().createCustomEvent
    expect(create({
      type: 'ppv',
      name: ' ',
      scheduledWeek: 3,
      maxMatches: 9,
    })).toMatchObject({ ok: false, error: 'dashboard.events.validation.eventNameRequired' })
    expect(create({
      type: 'regularWeekly',
      name: 'Unsupported',
      scheduledWeek: 3,
      maxMatches: 5,
    })).toMatchObject({ ok: false, error: 'dashboard.events.validation.unsupportedType' })

    const created = create({
      type: 'houseShow',
      name: 'Spring House Show',
      scheduledWeek: 3,
      specificDate: '2026-06-15',
      maxMatches: 8,
    })
    expect(created.ok).toBe(true)
    let event = useGameStore.getState().events.customEvents.find((item) => item.name === 'Spring House Show')
    expect(event).toMatchObject({
      type: 'houseShow',
      maxMatches: 3,
      specificDate: '2026-06-15',
      scheduledDay: 15,
    })

    const update = useGameStore.getState().updateCustomEvent
    expect(update(event.eventId, {
      type: 'ppv',
      name: '',
      scheduledWeek: 4,
      maxMatches: 7,
    })).toMatchObject({ ok: false, error: 'dashboard.events.validation.eventNameRequired' })
    expect(update('not-found', {
      type: 'ppv',
      name: 'Missing',
      scheduledWeek: 4,
      maxMatches: 7,
    })).toMatchObject({ ok: false, error: 'dashboard.events.validation.eventNotFound' })

    expect(update(event.eventId, {
      type: 'ppv',
      name: 'Summer PPV',
      scheduledWeek: 5,
      specificDate: '2026-07-01',
      maxMatches: 9,
    })).toEqual({ ok: true })
    event = useGameStore.getState().events.customEvents.find((item) => item.eventId === event.eventId)
    expect(event).toMatchObject({
      type: 'ppv',
      name: 'Summer PPV',
      maxMatches: 7,
      specificDate: '2026-07-01',
    })
    expect(useGameStore.getState().finances.ledger.at(-1)).toMatchObject({
      category: 'eventBooking',
      amount: 15000,
    })

    const cashBeforeDelete = useGameStore.getState().finances.cash
    useGameStore.getState().deleteCustomEvent(event.eventId)
    expect(useGameStore.getState().events.customEvents).toHaveLength(0)
    expect(useGameStore.getState().finances.cash).toBeGreaterThan(cashBeforeDelete)
    useGameStore.getState().deleteCustomEvent('already-deleted')
  })

  it('negotiates employee terms, hires candidates, assigns managers, and handles hiring locks', () => {
    const state = useGameStore.getState()
    const candidate = state.market.employeeCandidates.find(
      (employee) => employee.role === 'wrestler'
        && employee.contract.monthlySalary > 0
        && getWrestlerPrestigeRequirement(
          employee,
          state.stats.prestige,
          state.progression.unlockedWrestlerIds,
        ) === null,
    )
    expect(candidate).toBeDefined()
    expect(state.hireEmployee('missing-candidate')).toMatchObject({ ok: false, reason: 'notFound' })
    expect(state.hireEmployee(candidate.candidateId)).toMatchObject({ ok: false, reason: 'offerNotAccepted' })

    const weakOffer = state.negotiateEmployeeContract(candidate.candidateId, {
      monthlySalary: 0,
      perMatchSalary: 0,
      signingBonus: 0,
      contractLengthMonths: 0,
      benefits: {},
    })
    expect(weakOffer).toMatchObject({ ok: true, accepted: false })

    const accepted = useGameStore.getState().negotiateEmployeeContract(candidate.candidateId, {
      monthlySalary: candidate.contract.monthlySalary,
      perMatchSalary: candidate.contract.perMatchSalary,
      signingBonus: candidate.contract.signingBonus,
      contractLengthMonths: 14,
      adjustPercent: 0,
      benefits: { healthCare: true, travel: true, accommodation: true },
    })
    expect(accepted).toMatchObject({ ok: true, accepted: true })
    expect(useGameStore.getState().negotiateEmployeeContract(candidate.candidateId, {}))
      .toMatchObject({ ok: false, reason: 'locked' })

    useGameStore.setState((current) => ({
      market: {
        ...current.market,
        hiringLocks: { [candidate.id]: current.calendar.day + 2 },
      },
    }))
    expect(useGameStore.getState().hireEmployee(candidate.candidateId))
      .toMatchObject({ ok: false, reason: 'lockedUntil' })
    useGameStore.setState((current) => ({
      market: { ...current.market, hiringLocks: {} },
    }))
    expect(useGameStore.getState().hireEmployee(candidate.candidateId).ok).toBe(true)

    const wrestler = useGameStore.getState().roster.employees.find((employee) => employee.personId === candidate.id)
    expect(wrestler.contract.contractLengthMonths).toBe(14)

    const manager = hireCandidate('manager')
    const secondWrestler = hireCandidate('wrestler')
    useGameStore.getState().setEmployeeManager(secondWrestler.employeeId, manager.employeeId)
    expect(useGameStore.getState().roster.employees.find(
      (employee) => employee.employeeId === secondWrestler.employeeId,
    ).managerId).toBe(manager.employeeId)
    useGameStore.getState().setEmployeeManager(secondWrestler.employeeId, 'invalid-manager')
    useGameStore.getState().setEmployeeManager(secondWrestler.employeeId, null)
    expect(useGameStore.getState().roster.employees.find(
      (employee) => employee.employeeId === secondWrestler.employeeId,
    ).managerId).toBeNull()
  })

  it('handles employee bonuses, morale demands, termination, and fee settings', () => {
    const wrestler = hireCandidate('wrestler')
    const staff = hireCandidate('staff')
    const manager = hireCandidate('manager')

    expect(useGameStore.getState().giveEmployeeBonus(wrestler.employeeId, 0))
      .toMatchObject({ ok: false, reason: 'invalidAmount' })
    expect(useGameStore.getState().giveEmployeeBonus('missing', 100))
      .toMatchObject({ ok: false, reason: 'notFound' })
    expect(useGameStore.getState().giveEmployeeBonus(manager.employeeId, 100))
      .toMatchObject({ ok: false, reason: 'ineligibleRole' })
    expect(useGameStore.getState().giveEmployeeBonus(wrestler.employeeId, 100)).toMatchObject({ ok: true })

    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: state.roster.employees.map((employee) => employee.employeeId === staff.employeeId
          ? {
              ...employee,
              activeMoraleDemand: { demandType: 'salaryRaise', requestedAmount: 500 },
            }
          : employee),
      },
    }))
    expect(useGameStore.getState().resolveEmployeeMoraleDemand('missing', 'approve'))
      .toMatchObject({ ok: false, reason: 'notFound' })
    expect(useGameStore.getState().resolveEmployeeMoraleDemand(wrestler.employeeId, 'approve'))
      .toMatchObject({ ok: false, reason: 'noDemand' })
    expect(useGameStore.getState().resolveEmployeeMoraleDemand(staff.employeeId, 'approve'))
      .toMatchObject({ ok: true, decision: 'approve', demandType: 'salaryRaise' })

    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: state.roster.employees.map((employee) => employee.employeeId === wrestler.employeeId
          ? {
              ...employee,
              activeMoraleDemand: { demandType: 'titleShot', requestedAmount: 0 },
            }
          : employee),
      },
    }))
    expect(useGameStore.getState().resolveEmployeeMoraleDemand(wrestler.employeeId, 'approve'))
      .toMatchObject({ ok: true, demandType: 'titleShot' })
    expect(useGameStore.getState().roster.employees.find(
      (employee) => employee.employeeId === wrestler.employeeId,
    ).promisedTitleShotByDay).toBeGreaterThan(1)

    useGameStore.getState().setSubscriptionFee(Number.NaN)
    useGameStore.getState().setSubscriptionFee(-50)
    expect(useGameStore.getState().finances.subscriptionFee).toBe(2)
    useGameStore.getState().setSubscriptionFee(100)
    expect(useGameStore.getState().finances.subscriptionFee).toBe(50)
    useGameStore.getState().setEventTicketFee('unknown', 100)
    useGameStore.getState().setEventTicketFee('ppv', -1)
    useGameStore.getState().setEventTicketFee('ppv', 0)
    expect(useGameStore.getState().finances.ticketFees.ppv).toBe(0)
    useGameStore.getState().setEventTicketFee('ppv', 32.6)
    expect(useGameStore.getState().finances.ticketFees.ppv).toBe(33)

    const ticketPricingRecommendation = useGameStore.getState().getTicketPricingRecommendation({
      eventType: 'ppv',
      eventDay: 61,
    })
    expect(ticketPricingRecommendation).toMatchObject({
      baseTicketPrice: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
      recommendedTicketPrice: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
    })

    useGameStore.getState().setEventPreparation({
      eventId: 'event-prep',
      venueId: 'venue-001',
      promotedWrestlerIds: ['a', 1, 'b'],
      promoStyleId: 'spotlight',
      presentationId: 'classic',
    })
    expect(useGameStore.getState().events.eventPreparation).toEqual({
      eventId: 'event-prep',
      venueId: 'venue-001',
      promotedWrestlerIds: ['a', 'b'],
      promoStyleId: 'spotlight',
      presentationId: 'classic',
    })

    useGameStore.getState().setEventPreparation({
      eventId: 'event-prep',
      venueId: 'venue-006',
      promotedWrestlerIds: [],
      promoStyleId: 'hometownBuzz',
      presentationId: 'championship',
    })
    expect(useGameStore.getState().events.eventPreparation).toMatchObject({
      venueId: null,
      promoStyleId: 'spotlight',
      presentationId: 'classic',
    })
    useGameStore.getState().setEventPreparation(null)
    expect(useGameStore.getState().events.eventPreparation).toBeNull()

    useGameStore.getState().fireEmployee(wrestler.employeeId)
    expect(useGameStore.getState().roster.employees.some(
      (employee) => employee.employeeId === wrestler.employeeId,
    )).toBe(false)
    useGameStore.getState().fireEmployee('missing')
  })

  it('persists competitor strategy shifts as visible daily news', () => {
    const companies = useGameStore.getState().events.competitorCompanies
    expect(companies).toHaveLength(3)
    useGameStore.setState((state) => ({
      events: {
        ...state.events,
        competitorCompanies: state.events.competitorCompanies.map((company, index) => (
          index === 0
            ? { ...company, strategyId: 'talentAcquisition', nextStrategyDay: 2 }
            : company
        )),
      },
    }))

    useGameStore.getState().proceedTimeline()
    const state = useGameStore.getState()
    expect(state.events.competitorCompanies[0].strategyId).toBe('counterProgramming')
    expect(state.events.competitorHeadlines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'strategyShift',
        rivalId: companies[0].id,
        strategyId: 'counterProgramming',
        day: 2,
        headlineKey: 'dashboard.competitorIntel.news.strategyShift',
        headlineValues: { strategyId: 'counterProgramming' },
      }),
    ]))
  })

  it('runs weekly cards for all three rivals and persists updated pool and champions', () => {
    const initialState = useGameStore.getState()
    expect(initialState.events.competitorCompanies.map(({ id }) => id)).toEqual([
      'comp-1', 'comp-2', 'comp-3',
    ])
    expect(initialState.events.competitorWrestlerPool).toHaveLength(100)
    useGameStore.setState((state) => ({
      calendar: {
        ...state.calendar,
        day: 6,
      },
    }))
    useGameStore.getState().proceedTimeline()

    const state = useGameStore.getState()
    expect(state.calendar.day).toBe(7)
    expect(state.events.competitorCompanies).toHaveLength(3)
    state.events.competitorCompanies.forEach((competitor) => {
      expect(competitor.eventsRun).toBe(1)
      expect(competitor.lastEvent).toMatchObject({ day: 7, week: 1 })
      expect(competitor.champions).toHaveLength(2)
      expect(competitor.champions.every(({ lastDefendedDay }) => lastDefendedDay === 7)).toBe(true)
    })
    expect(state.events.competitorHeadlines.filter(({ type }) => type === 'rivalWeeklyEvent'))
      .toHaveLength(3)
    expect(state.events.competitorHeadlines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'rivalWeeklyEvent',
        rivalId: 'comp-1',
        day: 7,
      }),
    ]))

    const persistedEvents = JSON.parse(testStorage.get('wrestling-tycoon-save-v1')).state.events
    expect(persistedEvents.competitorWrestlerPool).toHaveLength(100)
    expect(persistedEvents.competitorCompanies[0].lastEvent.day).toBe(7)
  })

  it('activates titles, validates team membership, and updates or removes teams', () => {
    const first = hireCandidate('wrestler')
    const second = hireCandidate('wrestler')
    const title = useGameStore.getState().roster.titles[0]

    useGameStore.getState().setTitleActive(title.titleId, false)
    expect(useGameStore.getState().roster.titles.find((item) => item.titleId === title.titleId).isActive).toBe(false)
    useGameStore.getState().setTitleActive('missing-title', true)

    const createTeam = useGameStore.getState().createTeam
    expect(createTeam({ name: ' ', memberIds: [first.employeeId, second.employeeId] }))
      .toMatchObject({ ok: false, error: 'teamNameRequired' })
    expect(createTeam({ name: 'Too Small', memberIds: [first.employeeId] }))
      .toMatchObject({ ok: false, error: 'teamMemberCount' })
    expect(createTeam({ name: 'Unknown', memberIds: [first.employeeId, 'missing'] }))
      .toMatchObject({ ok: false, error: 'teamMemberCount' })

    expect(createTeam({
      name: 'The Testers',
      memberIds: [first.employeeId, second.employeeId, first.employeeId],
    })).toEqual({ ok: true })
    const team = useGameStore.getState().roster.teams[0]
    expect(team.memberIds).toHaveLength(2)
    expect(createTeam({ name: 'Duplicate', memberIds: [second.employeeId, first.employeeId] }))
      .toMatchObject({ ok: false, error: 'teamAlreadyExists' })

    const updateTeam = useGameStore.getState().updateTeam
    expect(updateTeam(team.teamId, { name: ' ', memberIds: team.memberIds }))
      .toMatchObject({ ok: false, error: 'teamNameRequired' })
    expect(updateTeam('missing-team', { name: 'Missing', memberIds: team.memberIds }))
      .toMatchObject({ ok: false, error: 'teamNotFound' })
    expect(updateTeam(team.teamId, { name: 'Updated Team', memberIds: team.memberIds }))
      .toEqual({ ok: true })
    expect(useGameStore.getState().roster.teams[0].name).toBe('Updated Team')
    useGameStore.getState().deleteTeam(team.teamId)
    expect(useGameStore.getState().roster.teams).toHaveLength(0)

    const prestige = useGameStore.getState().stats.prestige
    useGameStore.getState().skipEvent()
    expect(useGameStore.getState().stats.prestige).toBeLessThanOrEqual(prestige)
  })

  it('creates, edits, validates, and deletes factions containing wrestlers and managers', () => {
    const firstWrestler = hireCandidate('wrestler')
    const secondWrestler = hireCandidate('wrestler')
    const firstManager = hireCandidate('manager')
    const createFaction = useGameStore.getState().createFaction

    expect(createFaction({ name: ' ', memberIds: [firstWrestler.employeeId, firstManager.employeeId] }))
      .toMatchObject({ ok: false, reason: 'nameRequired' })
    expect(createFaction({ name: 'Solo', memberIds: [firstWrestler.employeeId] }))
      .toMatchObject({ ok: false, reason: 'memberCount' })
    expect(createFaction({ name: 'Unknown', memberIds: [firstWrestler.employeeId, 'unknown'] }))
      .toMatchObject({ ok: false, reason: 'invalidMember' })
    expect(createFaction({
      name: 'The First Order',
      memberIds: [firstWrestler.employeeId, firstManager.employeeId],
    })).toMatchObject({ ok: true })

    const firstFaction = useGameStore.getState().roster.factions[0]
    expect(firstFaction).toMatchObject({
      name: 'The First Order',
      memberIds: [firstWrestler.employeeId, firstManager.employeeId],
    })
    expect(createFaction({ name: 'Shared Member', memberIds: [firstWrestler.employeeId, secondWrestler.employeeId] }))
      .toMatchObject({ ok: false, reason: 'memberAssigned' })

    expect(useGameStore.getState().updateFaction(firstFaction.factionId, {
      name: 'The New Order',
      memberIds: [firstWrestler.employeeId, secondWrestler.employeeId],
    })).toMatchObject({ ok: true })
    expect(useGameStore.getState().roster.factions[0]).toMatchObject({
      name: 'The New Order',
      memberIds: [firstWrestler.employeeId, secondWrestler.employeeId],
    })
    expect(useGameStore.getState().deleteFaction(firstFaction.factionId)).toEqual({ ok: true })
    expect(useGameStore.getState().roster.factions).toHaveLength(0)

    expect(createFaction({
      name: 'Last Faction',
      memberIds: [firstWrestler.employeeId, firstManager.employeeId],
    }).ok).toBe(true)
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        backstageChemistry: {
          [`${firstWrestler.employeeId}::${firstManager.employeeId}`]: 40,
        },
      },
    }))
    useGameStore.getState().fireEmployee(firstManager.employeeId)
    expect(useGameStore.getState().roster.factions[0].memberIds).toContain(firstWrestler.employeeId)
    expect(useGameStore.getState().roster.factions[0].memberIds).not.toContain(firstManager.employeeId)
    expect(useGameStore.getState().roster.backstageChemistry).toEqual({})
  })

  it('runs a custom event card through audience, match, title, rivalry, staff, and sponsor accounting', () => {
    const wrestlers = Array.from({ length: 4 }, () => hireCandidate('wrestler'))
    const referee = hireCandidate('referee')
    const announcer = hireCandidate('announcer')
    const staff = hireCandidate('staff')
    const firstManager = hireCandidate('manager')
    const secondManager = hireCandidate('manager')
    const [first, second, third, fourth] = wrestlers
    const title = useGameStore.getState().roster.titles.find((item) => item.division === 'singles')

    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        titles: state.roster.titles.map((item) => item.titleId === title.titleId
          ? { ...item, isActive: true, holderEmployeeId: first.employeeId }
          : item),
        sponsors: [
          makeOffer({ offerId: 'event-sponsor', sponsorId: 'event-sponsor', sponsorType: 'eventMain' }),
          makeOffer({ offerId: 'daily-sponsor', sponsorId: 'daily-sponsor', sponsorType: 'digital' }),
        ],
        factions: [
          {
            factionId: 'faction-aces',
            name: 'The Aces',
            memberIds: [first.employeeId, second.employeeId, firstManager.employeeId],
          },
          {
            factionId: 'faction-blazes',
            name: 'Blaze Club',
            memberIds: [third.employeeId, fourth.employeeId, secondManager.employeeId],
          },
        ],
        backstageChemistry: Object.fromEntries(
          [
            [first.employeeId, second.employeeId],
            [first.employeeId, referee.employeeId],
            [first.employeeId, announcer.employeeId],
            [second.employeeId, referee.employeeId],
            [second.employeeId, announcer.employeeId],
            [referee.employeeId, announcer.employeeId],
          ].map((pair) => [pair.sort().join('::'), 100]),
        ),
      },
      events: {
        ...state.events,
        eventLog: [
          {
            type: 'success',
            segments: Array.from({ length: 3 }, () => ({
              segmentType: 'match',
              matchStipulation: 'singles',
            })),
          },
          {
            type: 'success',
            segments: Array.from({ length: 3 }, () => ({
              segmentType: 'mainEvent',
              matchStipulation: 'singles',
            })),
          },
        ],
        customEvents: [{
          eventId: 'test-ppv',
          type: 'ppv',
          name: 'Test Pay Per View',
          scheduledDay: 1,
          scheduledWeek: 1,
          specificDate: '2026-06-01',
          maxMatches: 8,
          isRecurringAnnually: false,
          isSystem: false,
        }],
        bookedEvent: {
          eventId: 'test-ppv',
          type: 'ppv',
          name: 'Test Pay Per View',
          scheduledDay: 1,
          maxMatches: 8,
        },
        eventPreparation: {
          eventId: 'test-ppv',
          venueId: 'venue-006',
          promotedWrestlerIds: [first.employeeId, second.employeeId],
          promoStyleId: 'hometownBuzz',
          presentationId: 'championship',
        },
      },
      progression: {
        ...state.progression,
        unlocks: {
          ...state.progression.unlocks,
          venues: [...state.progression.unlocks.venues, 'venue-006'],
          promoStyles: [...state.progression.unlocks.promoStyles, 'hometownBuzz'],
          promoSegments: [...state.progression.unlocks.promoSegments, 'contractSigning'],
          presentations: [...state.progression.unlocks.presentations, 'championship'],
        },
      },
    }))

    useGameStore.getState().proceedTimeline({
      totalSegments: 8,
      segments: [
        {
          segmentType: 'titleMatch',
          titleId: title.titleId,
          wrestlerIds: [first.employeeId, second.employeeId],
          winnerEmployeeId: second.employeeId,
          matchLengthMinutes: 45,
          props: ['chair', 'table'],
          plannedMoments: [
            {
              momentId: 'opening-beat',
              actionType: 'dominateKicks',
              actorId: first.employeeId,
              targetId: second.employeeId,
              atMinute: 12,
            },
          ],
          matchRating: 8.5,
          staminaLossById: { [first.employeeId]: 20, [second.employeeId]: 25, unknown: 5 },
          refereeId: referee.employeeId,
          announcerId: announcer.employeeId,
        },
        {
          segmentType: 'mainEvent',
          wrestlerIds: [second.employeeId, third.employeeId],
          winnerEmployeeId: second.employeeId,
          refereeId: referee.employeeId,
          announcerId: announcer.employeeId,
        },
        {
          segmentType: 'match',
          wrestlerIds: [first.employeeId, fourth.employeeId],
          winnerEmployeeId: fourth.employeeId,
          matchRating: 7.5,
          refereeId: referee.employeeId,
          announcerId: announcer.employeeId,
        },
        {
          segmentType: 'match',
          matchType: 'tagTeam',
          team1Ids: [first.employeeId, second.employeeId],
          team2Ids: [third.employeeId, fourth.employeeId],
          winnerTeamIds: [first.employeeId, second.employeeId],
          matchRating: 9,
          refereeId: referee.employeeId,
          announcerId: announcer.employeeId,
        },
        {
          segmentType: 'interview',
          wrestlerIds: [third.employeeId],
          interviewPopularityChanges: [
            { employeeId: third.employeeId, delta: 4.4 },
            { employeeId: 'unknown', delta: 10 },
          ],
        },
        {
          segmentType: 'promo',
          wrestlerIds: [first.employeeId, third.employeeId],
          promoSegmentId: 'contractSigning',
          storyBeat: 'factionPromo',
          sourceFactionId: 'faction-aces',
          targetFactionId: 'faction-blazes',
        },
        {
          segmentType: 'promo',
          wrestlerIds: [second.employeeId, fourth.employeeId],
          promoSegmentId: 'contractSigning',
          storyBeat: 'interference',
          sourceFactionId: 'faction-aces',
          targetFactionId: 'faction-blazes',
        },
        {
          segmentType: 'promo',
          wrestlerIds: [first.employeeId, second.employeeId, firstManager.employeeId],
          promoSegmentId: 'contractSigning',
          storyBeat: 'betrayal',
          sourceFactionId: 'faction-aces',
          targetFactionId: 'faction-blazes',
          betrayerId: firstManager.employeeId,
        },
      ],
    })

    let state = useGameStore.getState()
    expect(state.events.lastOutcome).toBeTruthy()
    expect(state.events.lastOutcome).toMatchObject({
      venueId: 'venue-006',
      promoStyleId: 'hometownBuzz',
      presentationId: 'championship',
    })
    expect(state.events.lastOutcome.segments).toHaveLength(8)
    expect(state.events.lastOutcome.audienceSegments).toHaveLength(4)
    const localizedOutcomeLabels = [
      ...state.events.lastOutcome.postmortem.fanFactors,
      ...state.events.lastOutcome.postmortem.prestigeFactors,
      ...state.events.lastOutcome.postmortem.moneyFactors,
      ...state.events.lastOutcome.audienceSegments,
    ]
    expect(localizedOutcomeLabels.every((entry) => (
      typeof entry.labelKey === 'string' && !Object.hasOwn(entry, 'label')
    ))).toBe(true)
    expect(state.events.lastOutcome.sponsorTrustReactions).toHaveLength(2)
    expect(state.events.lastOutcome.rivalryHighlights.length).toBeGreaterThan(0)
    expect(state.events.lastOutcome.factionStories.map((story) => story.action)).toEqual([
      'factionPromo',
      'interference',
      'betrayal',
    ])
    expect(state.events.factionRivalries).toEqual([
      expect.objectContaining({
        factionIds: ['faction-aces', 'faction-blazes'],
        heat: 32,
      }),
    ])
    expect(state.roster.factions.find((faction) => faction.factionId === 'faction-aces').memberIds)
      .not.toContain(firstManager.employeeId)
    expect(state.roster.factions.find((faction) => faction.factionId === 'faction-blazes').memberIds)
      .toContain(firstManager.employeeId)
    expect(state.events.lastOutcome.postmortem.fanFactors.find((factor) => factor.key === 'cardVariety').value)
      .toBe(90)
    expect(state.events.lastOutcome.segments.find((segment) => segment.segmentType === 'titleMatch')
      .promoRatingAdjustment).toBeCloseTo(0.6)
    expect(state.events.lastOutcome.segments.find((segment) => segment.segmentType === 'titleMatch'))
      .toMatchObject({
        chemistryRatingAdjustment: 0.5,
        staffRatingAdjustment: 0.1,
        matchRating: 9.7,
      })
    expect(state.events.lastOutcome.segments.find((segment) => segment.segmentType === 'titleMatch'))
      .toMatchObject({
        matchLengthMinutes: 45,
        props: ['chair', 'table'],
        plannedMoments: [expect.objectContaining({
          actionType: 'dominateKicks',
          actorId: first.employeeId,
          targetId: second.employeeId,
          atMinute: 12,
        })],
      })
    expect(state.events.lastOutcome.segments.find((segment) => segment.segmentType === 'promo')
      .promoSegmentId).toBe('contractSigning')
    expect(state.roster.backstageChemistry).toHaveProperty(
      [first.employeeId, firstManager.employeeId].sort().join('::'),
    )
    expect(state.roster.employees.find((employee) => employee.employeeId === first.employeeId).happiness)
      .toBeLessThan(50)
    expect(state.events.lastOutcome.postmortem.moneyFactors.length).toBeGreaterThan(0)
    expect(state.events.lastOutcome.postmortem.recommendations).toEqual([
      expect.objectContaining({
        id: 'repeatedMatchType',
        format: 'singles',
        repeatedEvents: 2,
      }),
    ])
    expect(state.roster.employees.find((employee) => employee.employeeId === second.employeeId)
      .matchStats.totalWins).toBeGreaterThan(0)
    expect(state.roster.employees.find((employee) => employee.employeeId === first.employeeId)
      .matchStats.totalLosses).toBeGreaterThan(0)
    expect(state.roster.titles.find((item) => item.titleId === title.titleId).holderEmployeeId)
      .toBe(second.employeeId)
    expect(state.roster.teams.some((team) => team.autoReason === 'tagTitleWin')).toBe(false)
    expect(state.events.rivalries.length).toBeGreaterThan(0)
    expect(state.events.eventPreparation).toBeNull()
    expect(state.roster.sponsors.some((sponsor) => sponsor.sponsorId === 'event-sponsor')).toBe(false)
    expect(state.finances.ledger.some((entry) => entry.category === 'matchPayroll')).toBe(true)
    expect(state.finances.ledger.some((entry) => entry.category === 'staffPayroll')).toBe(true)
    expect(state.history.timeline.at(-1).eventOutcomeType).toBeTruthy()
    const eventGateBreakdown = state.events.lastOutcome.eventGateBreakdown
    expect(eventGateBreakdown).toMatchObject({
      eventId: 'test-ppv',
      eventName: expect.stringContaining('Test Pay Per View'),
      eventType: 'ppv',
      attendance: state.events.lastOutcome.audience,
      ticketPrice: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
      total: state.events.lastOutcome.incomeBreakdown.eventGate,
    })
    expect(eventGateBreakdown.attendanceCalculation).toMatchObject({
      minAudience: expect.any(Number),
      maxAudience: expect.any(Number),
      fanFactor: expect.any(Number),
      prestigeFactor: expect.any(Number),
      fansWeight: expect.any(Number),
      prestigeWeight: expect.any(Number),
      crowdFactor: expect.any(Number),
    })
    expect(eventGateBreakdown.attendance).toBe(Math.round(Math.max(
      eventGateBreakdown.attendanceCalculation.minAudience,
      Math.min(
        eventGateBreakdown.attendanceCalculation.maxAudience,
        eventGateBreakdown.attendanceCalculation.minAudience
          + (eventGateBreakdown.attendanceCalculation.maxAudience - eventGateBreakdown.attendanceCalculation.minAudience)
            * eventGateBreakdown.attendanceCalculation.audienceNorm
            * eventGateBreakdown.attendanceCalculation.crowdFactor,
      ),
    )))
    expect(eventGateBreakdown).toMatchObject({
      baseAttendance: eventGateBreakdown.attendance,
      priceDemandFactor: 1,
      selectedTicketPrice: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
      ticketPricingRecommendation: expect.objectContaining({
        baseTicketPrice: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
        recommendedTicketPrice: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
      }),
    })
    expect(eventGateBreakdown.sponsorBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ sponsorId: 'event-sponsor', scope: 'event', trustFactor: expect.any(Number) }),
      expect.objectContaining({ sponsorId: 'daily-sponsor', scope: 'recurring', trustFactor: expect.any(Number) }),
    ]))
    expect(eventGateBreakdown.segmentBonuses).toHaveLength(8)
    expect(eventGateBreakdown.segmentBonuses.reduce((sum, segment) => sum + segment.totalIncome, 0))
      .toBe(eventGateBreakdown.segmentBonusTotal)
    expect(eventGateBreakdown.audienceSegments).toHaveLength(4)
    expect(eventGateBreakdown.ticketRevenue + eventGateBreakdown.sponsorBoostAmount)
      .toBe(eventGateBreakdown.baseGateRevenue)
    expect(eventGateBreakdown.sponsorBreakdown.reduce((sum, sponsor) => sum + sponsor.gateBoostAmount, 0))
      .toBe(eventGateBreakdown.sponsorBoostAmount)
    expect(
      eventGateBreakdown.baseGateRevenue
      + eventGateBreakdown.boardBonusAmount
      + eventGateBreakdown.segmentBonusTotal
      + eventGateBreakdown.audienceSpendAdjustment,
    ).toBe(eventGateBreakdown.total)
    expect(state.history.timeline.at(-1).eventGateBreakdown).toEqual(eventGateBreakdown)
    expect(state.events.eventLog.at(-1).eventGateBreakdown).toEqual(eventGateBreakdown)

    useGameStore.setState((current) => ({
      events: {
        ...current.events,
        customEvents: [{
          eventId: 'missed-promo-event',
          type: 'houseShow',
          name: 'Follow-up House Show',
          scheduledDay: current.calendar.day,
          scheduledWeek: current.calendar.week,
          maxMatches: 3,
          specificDate: '2026-06-02',
          isSystem: false,
        }],
        eventPreparation: {
          eventId: 'missed-promo-event',
          promotedWrestlerIds: [first.employeeId, 'not-booked'],
        },
      },
    }))
    useGameStore.getState().proceedTimeline({
      totalSegments: 1,
      segments: [{
        segmentType: 'match',
        wrestlerIds: [first.employeeId, second.employeeId],
        winnerEmployeeId: first.employeeId,
        matchRating: 9,
      }],
    })
    state = useGameStore.getState()
    expect(state.events.lastOutcome.segments[0].promoRatingAdjustmentType).toBe('penalty')
    expect(state.events.lastOutcome.segments[0].promoRatingAdjustmentRule).toBe('missedPromotedMatch')
    expect(state.roster.employees.some((employee) => employee.employeeId === staff.employeeId)).toBe(true)
  })

  it('increments a title reign defense count when the champion retains in a title match', () => {
    const champion = hireCandidate('wrestler')
    const challenger = hireCandidate('wrestler')
    const title = useGameStore.getState().roster.titles.find((item) => item.division === 'singles')
    const event = {
      eventId: 'title-defense-test',
      type: 'ppv',
      name: 'Title Defense Test',
      scheduledDay: 1,
      maxMatches: 1,
    }

    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        titles: state.roster.titles.map((item) => item.titleId === title.titleId
          ? {
              ...item,
              isActive: true,
              holderEmployeeId: champion.employeeId,
              holderEmployeeIds: [],
              currentHolderStartDay: 1,
              currentHolderDefenses: 0,
              holderHistory: [],
            }
          : item),
      },
      events: {
        ...state.events,
        customEvents: [event],
        bookedEvent: event,
        eventPreparation: null,
      },
    }))

    useGameStore.getState().proceedTimeline({
      totalSegments: 1,
      segments: [{
        segmentType: 'titleMatch',
        titleId: title.titleId,
        wrestlerIds: [champion.employeeId, challenger.employeeId],
        winnerEmployeeId: champion.employeeId,
        matchLengthMinutes: 15,
      }],
    })

    expect(useGameStore.getState().roster.titles.find((item) => item.titleId === title.titleId)
      .currentHolderDefenses).toBe(1)

    const titleChangeEvent = {
      ...event,
      eventId: 'title-change-test',
      name: 'Title Change Test',
      scheduledDay: useGameStore.getState().calendar.day,
    }
    useGameStore.setState((state) => ({
      events: {
        ...state.events,
        customEvents: [titleChangeEvent],
        bookedEvent: titleChangeEvent,
      },
    }))
    useGameStore.getState().proceedTimeline({
      totalSegments: 1,
      segments: [{
        segmentType: 'titleMatch',
        titleId: title.titleId,
        wrestlerIds: [champion.employeeId, challenger.employeeId],
        winnerEmployeeId: challenger.employeeId,
        matchLengthMinutes: 15,
      }],
    })

    expect(useGameStore.getState().roster.titles.find((item) => item.titleId === title.titleId)
      .holderHistory.at(-1).defenses).toBe(1)
  })

  it('opens board meetings only when the game is active and on a scheduled date', () => {
    useGameStore.getState().resetGame()
    expect(useGameStore.getState().openBoardMeeting())
      .toMatchObject({ ok: false, reason: 'gameNotActive' })
    expect(startGame().ok).toBe(true)
    useGameStore.setState((state) => ({
      calendar: { ...state.calendar, startDateIso: '2026-06-02' },
    }))
    expect(useGameStore.getState().openBoardMeeting())
      .toMatchObject({ ok: false, reason: 'notMeetingDay' })
    useGameStore.setState((state) => ({
      calendar: { ...state.calendar, startDateIso: '2026-06-01' },
    }))
    const opening = useGameStore.getState().openBoardMeeting()
    expect(opening.ok).toBe(true)
    expect(useGameStore.getState().openBoardMeeting()).toEqual({
      ok: true,
      meeting: opening.meeting,
    })
  })
})