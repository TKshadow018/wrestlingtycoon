import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CONFIG } from '../config/gameConfig'

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
  const candidate = useGameStore.getState().market.employeeCandidates.find(
    (employee) => employee.role === role && predicate(employee),
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
      progressText: 'AI ready',
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
      (employee) => employee.role === 'wrestler' && employee.contract.monthlySalary > 0,
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
      .toMatchObject({ chemistryRatingAdjustment: 0.5, matchRating: 9.6 })
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