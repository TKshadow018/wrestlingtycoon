import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_MEMBERS } from '../data/board'
import { GAME_CONFIG } from '../config/gameConfig'
import { SPONSOR_TYPE_CONFIG } from '../data/sponsorOffers'
import { buildBoardMeetingAgendaPool } from '../utils/boardMeetingAgendas'

const testStorage = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => testStorage.get(key) ?? null,
  setItem: (key, value) => testStorage.set(key, String(value)),
  removeItem: (key) => testStorage.delete(key),
  clear: () => testStorage.clear(),
})

const { useGameStore } = await import('./useGameStore')

const startDateIso = '2026-06-01'

const startSimulation = () => {
  useGameStore.getState().resetGame()
  const result = useGameStore.getState().startGame({
    playerName: 'Board Test Manager',
    companyName: 'Board Test Promotion',
  })
  if (!result.ok) {
    throw new Error('Unable to start board meeting test game')
  }

  useGameStore.setState((state) => ({
    calendar: {
      ...state.calendar,
      day: 1,
      week: 1,
      startDateIso,
      isEventDay: false,
    },
    events: {
      ...state.events,
      customEvents: [],
      bookedEvent: {
        eventId: 'regular-weekly-event',
        type: 'regularWeekly',
        name: 'Weekly TV Show',
        maxMatches: 5,
        scheduledDay: 5,
      },
    },
  }))
}

describe('board meeting store integration', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    startSimulation()
  })

  afterEach(() => {
    useGameStore.getState().resetGame()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('opens a three-topic meeting on its scheduled day without advancing game time', () => {
    const result = useGameStore.getState().openBoardMeeting()
    const state = useGameStore.getState()

    expect(result.ok).toBe(true)
    expect(state.calendar.day).toBe(1)
    expect(state.boardMeeting.lastMeetingDay).toBe(1)
    expect(state.boardMeeting.activeMeeting.agendas).toHaveLength(3)
    expect(new Set(state.boardMeeting.activeMeeting.agendas.map((agenda) => agenda.id)).size).toBe(3)
    expect(state.boardMeeting.activeMeeting.agendas.every(
      (agenda) => BOARD_MEMBERS.some((member) => member.person_name === agenda.presenter?.person_name),
    )).toBe(true)
    expect(state.boardMeeting.activeMeeting.agendas.every(
      (agenda) => agenda.presenter?.person_name !== state.profile.generalManagerName,
    )).toBe(true)
    expect(state.boardMeeting.activeMeeting.financeReport.operatingNet).toBe(0)
  })

  it('includes the January election and records the player ballot and elected officers', () => {
    useGameStore.setState((state) => ({
      calendar: {
        ...state.calendar,
        day: 1,
        week: 1,
        startDateIso: '2026-01-01',
      },
      events: {
        ...state.events,
        customEvents: [],
      },
    }))
    const opening = useGameStore.getState().openBoardMeeting()
    const electionAgenda = opening.meeting.agendas.find((agenda) => agenda.id === 'boardElection')

    expect(electionAgenda).toBeDefined()
    expect(opening.meeting.agendas).toHaveLength(3)
    expect(opening.meeting.agendas.at(-1).id).toBe('boardElection')

    const firstAgenda = opening.meeting.agendas[0]
    expect(useGameStore.getState().resolveBoardAgenda({
      agendaId: firstAgenda.id,
      choiceId: firstAgenda.choices.find((choice) => !choice.requiresVote).id,
    }).ok).toBe(true)

    expect(useGameStore.getState().resolveBoardAgenda({
      agendaId: electionAgenda.id,
      choiceId: 'castBoardElectionVote',
      candidateId: BOARD_MEMBERS[0].person_name,
    })).toMatchObject({ ok: false, reason: 'agendaOutOfOrder' })

    const activeMeeting = useGameStore.getState().boardMeeting.activeMeeting
    const secondAgendaItem = activeMeeting.agendas[activeMeeting.currentAgendaIndex]
    expect(useGameStore.getState().resolveBoardAgenda({
      agendaId: secondAgendaItem.id,
      choiceId: secondAgendaItem.choices.find((choice) => !choice.requiresVote).id,
    }).ok).toBe(true)
    expect(useGameStore.getState().resolveBoardAgenda({
      agendaId: electionAgenda.id,
      choiceId: 'castBoardElectionVote',
      candidateId: BOARD_MEMBERS[0].person_name,
    })).toMatchObject({ ok: true, passed: true })

    let state = useGameStore.getState()
    expect(state.boardMeeting.activeMeeting.status).toBe('electionResult')
    expect(state.boardMeeting.activeMeeting.currentAgendaIndex).toBe(2)
    const decision = state.boardMeeting.activeMeeting.decisions[0]
    const electionDecision = state.boardMeeting.activeMeeting.decisions.at(-1)
    expect(electionDecision.electionResult.userVote).toBe(BOARD_MEMBERS[0].person_name)
    expect(Object.keys(electionDecision.electionResult.votes)).toHaveLength(BOARD_MEMBERS.length)
    expect(Object.keys(electionDecision.electionResult.votes)).not.toContain(state.profile.playerName)
    expect(electionDecision.electionResult.rankedCandidates[0].votes)
      .toBeGreaterThanOrEqual(electionDecision.electionResult.rankedCandidates[1].votes)
    expect(state.boardMeeting.boardPresidentName).toBe(electionDecision.electionResult.president.person_name)
    expect(state.boardMeeting.boardVicePresidentName).toBe(electionDecision.electionResult.vicePresident.person_name)
    expect(state.boardMeeting.boardPresidentName).not.toBe(state.profile.playerName)
    expect(state.boardMeeting.boardVicePresidentName).not.toBe(state.profile.playerName)

    expect(useGameStore.getState().acknowledgeBoardElectionResult()).toMatchObject({
      ok: true,
      currentAgendaIndex: 3,
      status: 'readyToClose',
    })
    state = useGameStore.getState()
    expect(state.boardMeeting.activeMeeting.status).toBe('readyToClose')
  })

  it('does not allow a Board Meeting to be opened on a non-meeting day', () => {
    useGameStore.setState((state) => ({
      calendar: {
        ...state.calendar,
        startDateIso: '2026-06-02',
      },
    }))

    expect(useGameStore.getState().openBoardMeeting()).toMatchObject({
      ok: false,
      reason: 'notMeetingDay',
    })
  })

  it('resolves all three decisions, records minutes, and finishes the meeting once', () => {
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)

    for (let index = 0; index < 3; index += 1) {
      const activeMeeting = useGameStore.getState().boardMeeting.activeMeeting
      const agenda = activeMeeting.agendas[activeMeeting.currentAgendaIndex]
      const noVoteChoice = agenda.choices.find((choice) => !choice.requiresVote)
      expect(noVoteChoice).toBeDefined()
      expect(useGameStore.getState().resolveBoardAgenda({
        agendaId: agenda.id,
        choiceId: noVoteChoice.id,
      }).ok).toBe(true)
    }

    const finishResult = useGameStore.getState().finishBoardMeeting()
    const finalState = useGameStore.getState()
    expect(finishResult.ok).toBe(true)
    expect(finalState.boardMeeting.activeMeeting).toBeNull()
    expect(finalState.boardMeeting.meetingHistory).toHaveLength(1)
    expect(finalState.boardMeeting.meetingHistory[0].decisions).toHaveLength(3)
    expect(finalState.calendar.day).toBe(1)
  })

  it('signs a board-proposed sponsor after a passing shareholder vote', () => {
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    const state = useGameStore.getState()
    const sponsorOffer = state.market.sponsorOffers.find(
      (offer) => !SPONSOR_TYPE_CONFIG[offer.sponsorType]?.eventScoped,
    )
    expect(sponsorOffer).toBeDefined()

    const sponsorAgenda = buildBoardMeetingAgendaPool({
      financialIsNegative: false,
      financialReport: state.boardMeeting.activeMeeting.financeReport,
      boardMembers: BOARD_MEMBERS,
      sponsorOffer,
      upcomingEvent: state.events.bookedEvent,
      lastOutcome: state.events.lastOutcome,
      titleChange: null,
      wrestlerPush: null,
    }).find((agenda) => agenda.id === 'sponsorReview')

    useGameStore.setState((currentState) => ({
      boardMeeting: {
        ...currentState.boardMeeting,
        activeMeeting: {
          ...currentState.boardMeeting.activeMeeting,
          agendas: [sponsorAgenda],
          currentAgendaIndex: 0,
          status: 'inProgress',
        },
      },
    }))

    const result = useGameStore.getState().resolveBoardAgenda({
      agendaId: 'sponsorReview',
      choiceId: 'acceptSponsorProposal',
    })
    const finalState = useGameStore.getState()

    expect(result.ok).toBe(true)
    expect(result.passed).toBe(true)
    expect(finalState.roster.sponsors.some((sponsor) => sponsor.sponsorId === sponsorOffer.sponsorId)).toBe(true)
    expect(finalState.boardMeeting.relation).toBeGreaterThan(60)
  })

  it('increases Board Relation penalties for repeated rejection of the same proposer', () => {
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    const state = useGameStore.getState()
    const sponsorOffer = state.market.sponsorOffers.find(
      (offer) => !SPONSOR_TYPE_CONFIG[offer.sponsorType]?.eventScoped,
    )
    const sponsorAgenda = buildBoardMeetingAgendaPool({
      financialIsNegative: false,
      financialReport: state.boardMeeting.activeMeeting.financeReport,
      boardMembers: BOARD_MEMBERS,
      sponsorOffer,
      activeSponsors: state.roster.sponsors,
      upcomingEvent: state.events.bookedEvent,
      lastOutcome: state.events.lastOutcome,
      titleChange: null,
      wrestlerPush: null,
    }).find((agenda) => agenda.id === 'sponsorReview')
    const proposerName = sponsorAgenda.proposer.person_name

    useGameStore.setState((currentState) => ({
      boardMeeting: {
        ...currentState.boardMeeting,
        rejectionCounts: { [proposerName]: 1 },
        activeMeeting: {
          ...currentState.boardMeeting.activeMeeting,
          agendas: [sponsorAgenda],
          currentAgendaIndex: 0,
          status: 'inProgress',
        },
      },
    }))

    const result = useGameStore.getState().resolveBoardAgenda({
      agendaId: sponsorAgenda.id,
      choiceId: 'rejectSponsorProposal',
    })

    expect(result.relationDelta).toBe(-7)
    expect(useGameStore.getState().boardMeeting.rejectionCounts[proposerName]).toBe(2)
  })

  it('applies an approved champion change to the active title', () => {
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: [{
          employeeId: 'board-wrestler-1',
          role: 'wrestler',
          name: 'Board Pick',
          popularity: 90,
          gender: 'male',
          contract: { startDay: 1, endDay: 361, monthlySalary: 1000 },
        }],
        titles: [{
          ...state.roster.titles[0],
          titleId: 'board-test-title',
          name: 'Board Test Championship',
          isActive: true,
          division: 'singles',
          holderEmployeeId: 'former-champion',
          holderEmployeeIds: [],
          currentHolderStartDay: 1,
          holderHistory: [],
        }],
      },
    }))
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    const state = useGameStore.getState()
    const championAgenda = buildBoardMeetingAgendaPool({
      financialIsNegative: false,
      financialReport: state.boardMeeting.activeMeeting.financeReport,
      boardMembers: BOARD_MEMBERS,
      sponsorOffer: state.market.sponsorOffers[0],
      upcomingEvent: state.events.bookedEvent,
      lastOutcome: state.events.lastOutcome,
      titleChange: {
        titleId: 'board-test-title',
        titleName: 'Board Test Championship',
        targetEmployeeId: 'board-wrestler-1',
        targetName: 'Board Pick',
      },
      wrestlerPush: { employeeId: 'board-wrestler-1', name: 'Board Pick' },
    }).find((agenda) => agenda.id === 'championChange')

    useGameStore.setState((currentState) => ({
      boardMeeting: {
        ...currentState.boardMeeting,
        activeMeeting: {
          ...currentState.boardMeeting.activeMeeting,
          agendas: [championAgenda],
          currentAgendaIndex: 0,
          status: 'inProgress',
        },
      },
    }))

    const result = useGameStore.getState().resolveBoardAgenda({
      agendaId: 'championChange',
      choiceId: 'approveChampionChange',
    })
    const title = useGameStore.getState().roster.titles.find((entry) => entry.titleId === 'board-test-title')

    expect(result.ok).toBe(true)
    expect(result.passed).toBe(true)
    expect(title.holderEmployeeId).toBe('board-wrestler-1')
    expect(title.holderHistory[0].holders[0].name).toBe('former-champion')
  })

  it('does not propose a male-only title to a woman', () => {
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: [{
          employeeId: 'board-woman-1',
          role: 'wrestler',
          name: 'Board Woman',
          popularity: 95,
          gender: 'female',
          contract: { startDay: 1, endDay: 361, monthlySalary: 1000 },
        }],
        titles: [{
          ...state.roster.titles[0],
          titleId: 'male-only-board-title',
          name: 'Male Only Board Championship',
          isActive: true,
          isWomenOnly: false,
          division: 'singles',
          holderEmployeeId: 'current-male-champion',
          holderEmployeeIds: [],
        }],
      },
    }))

    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    expect(useGameStore.getState().boardMeeting.activeMeeting.agendas.map((agenda) => agenda.id))
      .not.toContain('championChange')
  })

  it('rejects a gender-ineligible champion change before applying it', () => {
    useGameStore.setState((state) => ({
      roster: {
        ...state.roster,
        employees: [{
          employeeId: 'board-woman-1',
          role: 'wrestler',
          name: 'Board Woman',
          popularity: 95,
          gender: 'female',
          contract: { startDay: 1, endDay: 361, monthlySalary: 1000 },
        }],
        titles: [{
          ...state.roster.titles[0],
          titleId: 'male-only-board-title',
          name: 'Male Only Board Championship',
          isActive: true,
          isWomenOnly: false,
          division: 'singles',
          holderEmployeeId: 'current-male-champion',
          holderEmployeeIds: [],
        }],
      },
    }))
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    const state = useGameStore.getState()
    const championAgenda = buildBoardMeetingAgendaPool({
      financialIsNegative: false,
      financialReport: state.boardMeeting.activeMeeting.financeReport,
      boardMembers: BOARD_MEMBERS,
      sponsorOffer: null,
      upcomingEvent: state.events.bookedEvent,
      lastOutcome: state.events.lastOutcome,
      titleChange: {
        titleId: 'male-only-board-title',
        titleName: 'Male Only Board Championship',
        targetEmployeeId: 'board-woman-1',
        targetName: 'Board Woman',
      },
      wrestlerPush: null,
    }).find((agenda) => agenda.id === 'championChange')

    useGameStore.setState((currentState) => ({
      boardMeeting: {
        ...currentState.boardMeeting,
        activeMeeting: {
          ...currentState.boardMeeting.activeMeeting,
          agendas: [championAgenda],
          currentAgendaIndex: 0,
          status: 'inProgress',
        },
      },
    }))

    const result = useGameStore.getState().resolveBoardAgenda({
      agendaId: 'championChange',
      choiceId: 'approveChampionChange',
    })
    const title = useGameStore.getState().roster.titles.find(
      (entry) => entry.titleId === 'male-only-board-title',
    )

    expect(result).toMatchObject({ ok: false, reason: 'ineligibleChampion' })
    expect(title.holderEmployeeId).toBe('current-male-champion')
  })

  it('applies approved marketing spending and records its financial effect', () => {
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    const state = useGameStore.getState()
    const investmentAgenda = buildBoardMeetingAgendaPool({
      financialIsNegative: false,
      financialReport: state.boardMeeting.activeMeeting.financeReport,
      boardMembers: BOARD_MEMBERS,
      sponsorOffer: state.market.sponsorOffers[0],
      upcomingEvent: state.events.bookedEvent,
      lastOutcome: state.events.lastOutcome,
      titleChange: null,
      wrestlerPush: null,
    }).find((agenda) => agenda.id === 'investmentProposal')
    const previousCash = state.finances.cash
    const previousFans = state.stats.fans

    useGameStore.setState((currentState) => ({
      boardMeeting: {
        ...currentState.boardMeeting,
        activeMeeting: {
          ...currentState.boardMeeting.activeMeeting,
          agendas: [investmentAgenda],
          currentAgendaIndex: 0,
          status: 'inProgress',
        },
      },
    }))

    const result = useGameStore.getState().resolveBoardAgenda({
      agendaId: 'investmentProposal',
      choiceId: 'approveMarketingInvestment',
    })
    const finalState = useGameStore.getState()

    expect(result).toMatchObject({ ok: true, passed: true })
    expect(finalState.finances.cash).toBe(previousCash - 10000)
    expect(finalState.stats.fans).toBe(previousFans + 300)
    expect(finalState.finances.ledger.at(-1).category).toBe('boardDecision')
    expect(finalState.boardMeeting.relation).toBe(64)
  })

  it('applies a negative-month cost-control motion to subsequent daily operating costs', () => {
    useGameStore.setState((state) => ({
      calendar: { ...state.calendar, day: 31, week: 5 },
      boardMeeting: {
        ...state.boardMeeting,
        lastMeetingDay: 1,
      },
      history: {
        timeline: Array.from({ length: 30 }, (_, index) => ({
          day: index + 2,
          delta: -100,
          totalIncome: 0,
          totalExpenses: 100,
          expenseBreakdown: {},
        })),
      },
    }))
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    const state = useGameStore.getState()
    const financeAgenda = state.boardMeeting.activeMeeting.agendas.find(
      (agenda) => agenda.id === 'financialReview',
    )
    expect(financeAgenda).toBeDefined()

    expect(useGameStore.getState().resolveBoardAgenda({
      agendaId: financeAgenda.id,
      choiceId: 'enactCostControls',
    })).toMatchObject({ ok: true, passed: true })

    for (let index = 1; index < 3; index += 1) {
      const activeMeeting = useGameStore.getState().boardMeeting.activeMeeting
      const agenda = activeMeeting.agendas[activeMeeting.currentAgendaIndex]
      const choice = agenda.choices.find((entry) => !entry.requiresVote)
      expect(useGameStore.getState().resolveBoardAgenda({
        agendaId: agenda.id,
        choiceId: choice.id,
      }).ok).toBe(true)
    }
    expect(useGameStore.getState().finishBoardMeeting().ok).toBe(true)

    const beforeAdvance = useGameStore.getState()
    const expectedOperatingCost = Math.max(
      0,
      Math.round(
        GAME_CONFIG.economy.expense.operatingBase
          + beforeAdvance.stats.prestige * GAME_CONFIG.economy.expense.operatingPrestigeMultiplier,
      ) - 250,
    )
    useGameStore.getState().proceedTimeline()

    expect(useGameStore.getState().history.timeline.at(-1).expenseBreakdown.operatingCost)
      .toBe(expectedOperatingCost)
  })

  it('fires the manager at the end of a meeting when Board Relation is below 10', () => {
    expect(useGameStore.getState().openBoardMeeting().ok).toBe(true)
    useGameStore.setState((state) => ({
      boardMeeting: {
        ...state.boardMeeting,
        relation: 9,
        activeMeeting: {
          ...state.boardMeeting.activeMeeting,
          currentAgendaIndex: state.boardMeeting.activeMeeting.agendas.length,
          status: 'readyToClose',
        },
      },
    }))

    const result = useGameStore.getState().finishBoardMeeting()

    expect(result).toMatchObject({ ok: true, managerDismissed: true, gameOverReason: 'board-relation' })
    expect(useGameStore.getState().gameStatus.isGameOver).toBe(true)
  })

  it('ends the game at the third consecutive negative finance period', () => {
    useGameStore.setState((state) => ({
      calendar: {
        ...state.calendar,
        day: 62,
        week: 9,
      },
      boardMeeting: {
        ...state.boardMeeting,
        lastMeetingDay: 31,
        consecutiveNegativeFinanceMonths: 2,
      },
      history: {
        timeline: [{ day: 62, delta: -1000, totalIncome: 0, totalExpenses: 1000 }],
      },
    }))

    const result = useGameStore.getState().openBoardMeeting()
    const state = useGameStore.getState()

    expect(result).toMatchObject({ ok: true, managerDismissed: true })
    expect(state.gameStatus.isGameOver).toBe(true)
    expect(state.gameStatus.gameOverReason).toBe('three-negative-finance-periods')
    expect(state.boardMeeting.managerDismissed).toBe(true)
    expect(BOARD_MEMBERS).toHaveLength(7)
  })
})
