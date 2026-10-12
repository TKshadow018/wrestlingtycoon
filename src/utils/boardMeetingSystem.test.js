import { describe, expect, it } from 'vitest'
import {
  applyBoardRelationChange,
  assignRandomBoardAgendaPresenters,
  createInitialBoardState,
  conductWeightedBoardVote,
  getBoardDismissalChance,
  getRepeatedRejectionPenalty,
  normalizeBoardMeetingState,
  recordBoardFinancialPeriod,
  resolveBoardElection,
  resolveBoardMandates,
  rollBoardDismissal,
  selectBoardAgendas,
  tallyWeightedBoardVote,
} from './boardMeetingSystem'

const agendaPool = [
  { id: 'financialReview', weight: 1 },
  { id: 'sponsorReview', weight: 2 },
  { id: 'eventReview', weight: 2 },
  { id: 'championChange', weight: 1 },
  { id: 'wrestlerPush', weight: 2 },
  { id: 'eventRatingTarget', weight: 2 },
  { id: 'boardElection', weight: 5 },
]

describe('board meeting rules', () => {
  it('starts with a neutral board relationship and empty meeting state', () => {
    expect(createInitialBoardState()).toMatchObject({
      relation: 60,
      consecutiveNegativeFinanceMonths: 0,
      lastMeetingDay: null,
      activeMeeting: null,
      meetingHistory: [],
      pendingMandates: [],
      managerDismissed: false,
    })
  })

  it('initializes the current leadership and migrates missing election fields', () => {
    const initial = createInitialBoardState({
      boardPresidentName: 'Current President',
      boardVicePresidentName: 'Current Vice President',
    })

    expect(initial).toMatchObject({
      boardPresidentName: 'Current President',
      boardVicePresidentName: 'Current Vice President',
      boardElectionHistory: [],
    })
    expect(normalizeBoardMeetingState({}, initial)).toMatchObject({
      boardPresidentName: 'Current President',
      boardVicePresidentName: 'Current Vice President',
    })
  })

  it('assigns an eligible board member to present each agenda and excludes the manager', () => {
    const boardMembers = [
      { person_name: 'Director One', current_role: 'Director' },
      { person_name: 'Player Manager', current_role: 'General Manager' },
      { person_name: 'Director Two', current_role: 'Director' },
    ]
    const agendas = assignRandomBoardAgendaPresenters(
      [{ id: 'agenda-1' }, { id: 'agenda-2' }],
      boardMembers,
      'Player Manager',
      () => 0.99,
    )

    expect(agendas).toHaveLength(2)
    expect(agendas.map((agenda) => agenda.presenter.person_name)).toEqual([
      'Director Two',
      'Director Two',
    ])
    expect(agendas.every((agenda) => agenda.proposer === agenda.presenter)).toBe(true)
  })

  it('elects the two highest-vote board candidates and breaks vote ties by shareholding', () => {
    const candidates = [
      { person_name: 'Chair', current_role: 'Board Chair', company_shareholder_percentage: 25 },
      { person_name: 'Vice Chair', current_role: 'Vice Chair', company_shareholder_percentage: 20 },
      { person_name: 'Audit Chair', current_role: 'Audit Committee Chair', company_shareholder_percentage: 15 },
    ]
    const boardMembers = [
      { person_name: 'Chair' },
      { person_name: 'Vice Chair' },
    ]
    const result = resolveBoardElection({
      candidates,
      boardMembers,
      userChoiceId: 'Audit Chair',
      random: (() => {
        const draws = [0, 0.5]
        return () => draws.shift()
      })(),
    })

    expect(result.userVote).toBe('Audit Chair')
    expect(Object.keys(result.votes)).toHaveLength(2)
    expect(result.rankedCandidates.map((candidate) => candidate.votes)).toEqual([1, 1, 1])
    expect(result.rankedCandidates.slice(0, 2).map((candidate) => candidate.person_name))
      .toEqual(['Chair', 'Vice Chair'])
  })

  it('does not elect the manager and validates the player ballot', () => {
    const candidates = [
      { person_name: 'Chair', company_shareholder_percentage: 25 },
      { person_name: 'Vice Chair', company_shareholder_percentage: 20 },
      { person_name: 'Manager', current_role: 'General Manager', company_shareholder_percentage: 50 },
    ]
    const boardMembers = [
      { person_name: 'Chair' },
      { person_name: 'Vice Chair' },
      { person_name: 'Player Manager', current_role: 'General Manager' },
    ]

    expect(() => resolveBoardElection({
      candidates: candidates.filter((candidate) => candidate.person_name !== 'Manager'),
      boardMembers,
      userChoiceId: 'Manager',
      random: () => 0,
    })).toThrow('not eligible')
    expect(() => resolveBoardElection({
      candidates,
      boardMembers,
      userChoiceId: 'Chair',
      random: () => 0,
    })).toThrow('cannot be a Board election candidate')
  })

  it('normalizes saved relation and collection fields for legacy saves', () => {
    expect(normalizeBoardMeetingState({ relation: 140, pendingMandates: null })).toMatchObject({
      relation: 100,
      consecutiveNegativeFinanceMonths: 0,
      activeMeeting: null,
      meetingHistory: [],
      pendingMandates: [],
      managerDismissed: false,
    })
  })

  it('selects exactly three unique topics and includes financial review when finances are negative', () => {
    const agendas = selectBoardAgendas({
      agendaPool,
      financialIsNegative: true,
      random: () => 0.5,
    })

    expect(agendas).toHaveLength(3)
    expect(new Set(agendas.map((agenda) => agenda.id)).size).toBe(3)
    expect(agendas.some((agenda) => agenda.id === 'financialReview')).toBe(true)
  })

  it('keeps both the January election and negative financial review in the three agendas', () => {
    const agendas = selectBoardAgendas({
      agendaPool,
      financialIsNegative: true,
      requiredAgendaIds: ['boardElection'],
      random: () => 0.5,
    })

    expect(agendas).toHaveLength(3)
    expect(agendas.map((agenda) => agenda.id)).toEqual(expect.arrayContaining([
      'boardElection',
      'financialReview',
    ]))
    expect(agendas.at(-1).id).toBe('boardElection')
  })

  it('does not use a non-actionable financial review as one of the three positive-month topics', () => {
    const agendas = selectBoardAgendas({
      agendaPool,
      financialIsNegative: false,
      random: () => 0,
    })

    expect(agendas).toHaveLength(3)
    expect(agendas.some((agenda) => agenda.id === 'financialReview')).toBe(false)
    expect(new Set(agendas.map((agenda) => agenda.id)).size).toBe(3)
  })

  it('requires three eligible unique topics', () => {
    expect(() => selectBoardAgendas({
      agendaPool: agendaPool.slice(0, 2),
      financialIsNegative: false,
      random: () => 0.5,
    })).toThrow('three unique agenda topics')
  })

  it('resets the finance pressure streak after a non-negative period', () => {
    const firstNegative = recordBoardFinancialPeriod(createInitialBoardState(), {
      day: 30,
      operatingNet: -1,
    })
    const positive = recordBoardFinancialPeriod(firstNegative.boardState, {
      day: 60,
      operatingNet: 0,
    })

    expect(firstNegative.boardState.consecutiveNegativeFinanceMonths).toBe(1)
    expect(positive.boardState.consecutiveNegativeFinanceMonths).toBe(0)
    expect(positive.managerDismissed).toBe(false)
  })

  it('fires the manager after exactly three consecutive negative finance periods', () => {
    let boardState = createInitialBoardState()

    for (const day of [30, 60]) {
      boardState = recordBoardFinancialPeriod(boardState, {
        day,
        operatingNet: -100,
      }).boardState
    }

    const thirdNegative = recordBoardFinancialPeriod(boardState, {
      day: 90,
      operatingNet: -100,
    })

    expect(thirdNegative.managerDismissed).toBe(true)
    expect(thirdNegative.boardState.managerDismissed).toBe(true)
    expect(thirdNegative.boardState.gameOverReason).toBe('three-negative-finance-periods')
  })

  it('does not count the same meeting day twice in the finance streak', () => {
    const firstEvaluation = recordBoardFinancialPeriod(createInitialBoardState(), {
      day: 30,
      operatingNet: -100,
    })
    const duplicateEvaluation = recordBoardFinancialPeriod(firstEvaluation.boardState, {
      day: 30,
      operatingNet: -100,
    })

    expect(duplicateEvaluation.boardState.consecutiveNegativeFinanceMonths).toBe(1)
    expect(duplicateEvaluation.applied).toBe(false)
  })

  it.each([
    [25, 0],
    [24, 0.3],
    [10, 0.3],
    [9, 0.8],
    [0, 0.8],
  ])('uses a %s Relation dismissal band with chance %s', (relation, expectedChance) => {
    expect(getBoardDismissalChance(relation)).toBe(expectedChance)
  })

  it('makes one dismissal roll using the applicable Relation chance', () => {
    expect(rollBoardDismissal({ relation: 24, random: () => 0.29 })).toBe(true)
    expect(rollBoardDismissal({ relation: 24, random: () => 0.3 })).toBe(false)
    expect(rollBoardDismissal({ relation: 9, random: () => 0.79 })).toBe(true)
  })

  it('clamps Board Relation changes to the 0-100 range', () => {
    expect(applyBoardRelationChange({ ...createInitialBoardState(), relation: 98 }, 10).relation).toBe(100)
    expect(applyBoardRelationChange({ ...createInitialBoardState(), relation: 3 }, -10).relation).toBe(0)
  })

  it('increases penalties for repeatedly rejecting the same board member', () => {
    expect([0, 1, 2, 3, 8].map(getRepeatedRejectionPenalty)).toEqual([0, 2, 4, 6, 6])
  })

  it('passes proposals only when yes votes exceed 50 percent of shareholding', () => {
    const members = [
      { person_name: 'Chair', company_shareholder_percentage: 25 },
      { person_name: 'Vice Chair', company_shareholder_percentage: 20 },
      { person_name: 'Audit Chair', company_shareholder_percentage: 15 },
      { person_name: 'Compensation Chair', company_shareholder_percentage: 15 },
      { person_name: 'Director A', company_shareholder_percentage: 10 },
      { person_name: 'Director B', company_shareholder_percentage: 10 },
      { person_name: 'Director C', company_shareholder_percentage: 5 },
    ]

    const passedVote = tallyWeightedBoardVote(members, {
      Chair: true,
      'Vice Chair': true,
      'Audit Chair': true,
      'Compensation Chair': false,
      'Director A': false,
      'Director B': false,
      'Director C': false,
    })
    const tiedVote = tallyWeightedBoardVote(members, {
      Chair: true,
      'Vice Chair': false,
      'Audit Chair': true,
      'Compensation Chair': false,
      'Director A': true,
      'Director B': false,
      'Director C': false,
    })

    expect(passedVote.supportingShare).toBe(60)
    expect(passedVote.passed).toBe(true)
    expect(tiedVote.supportingShare).toBe(50)
    expect(tiedVote.passed).toBe(false)
  })

  it('lets higher Board Relation influence weighted votes without overriding the proposer', () => {
    const members = [
      { person_name: 'Chair', company_shareholder_percentage: 25 },
      { person_name: 'Vice Chair', company_shareholder_percentage: 20 },
      { person_name: 'Audit Chair', company_shareholder_percentage: 15 },
    ]
    const highRelationVote = conductWeightedBoardVote({
      boardMembers: members,
      relation: 80,
      proposerName: 'Chair',
      supportChance: 0.5,
      random: () => 0.6,
    })
    const lowRelationVote = conductWeightedBoardVote({
      boardMembers: members,
      relation: 20,
      proposerName: 'Chair',
      supportChance: 0.5,
      random: () => 0.4,
    })

    expect(highRelationVote.votes.Chair).toBe(true)
    expect(highRelationVote.votes['Vice Chair']).toBe(true)
    expect(lowRelationVote.votes.Chair).toBe(true)
    expect(lowRelationVote.votes['Vice Chair']).toBe(false)
  })

  it('resolves rating and wrestler-push mandates and applies their relation effects', () => {
    const boardState = {
      ...createInitialBoardState(),
      pendingMandates: [
        {
          id: 'rating-1',
          type: 'eventRating',
          eventId: 'ppv-1',
          targetRating: 8,
          deadlineDay: 45,
          successRelationDelta: 6,
          failureRelationDelta: -8,
        },
        {
          id: 'push-1',
          type: 'wrestlerPush',
          employeeId: 'wrestler-1',
          targetAppearances: 1,
          createdDay: 30,
          deadlineDay: 45,
          successRelationDelta: 5,
          failureRelationDelta: -7,
        },
      ],
    }
    const result = resolveBoardMandates(boardState, {
      day: 45,
      eventOutcome: {
        eventId: 'ppv-1',
        overallRating: 8.5,
        segments: [{ participantIds: ['wrestler-1'] }],
      },
    })

    expect(result.outcomes.map((mandate) => mandate.status)).toEqual(['completed', 'completed'])
    expect(result.boardState.pendingMandates).toHaveLength(0)
    expect(result.boardState.relation).toBe(71)
    expect(result.boardState.mandateHistory).toHaveLength(2)
  })

  it('resolves a financial recovery mandate at its due meeting based on operating net', () => {
    const boardState = {
      ...createInitialBoardState(),
      pendingMandates: [{
        id: 'recovery-1',
        type: 'financialRecovery',
        deadlineDay: 60,
        successRelationDelta: 5,
        failureRelationDelta: -8,
      }],
    }
    const result = resolveBoardMandates(boardState, {
      day: 60,
      operatingNet: 100,
    })

    expect(result.boardState.pendingMandates).toHaveLength(0)
    expect(result.outcomes[0].status).toBe('completed')
    expect(result.boardState.relation).toBe(65)
  })
})
