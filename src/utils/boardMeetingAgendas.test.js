import { describe, expect, it } from 'vitest'
import boardMembers from '../data/people/board.json'
import { buildBoardMeetingAgendaPool } from './boardMeetingAgendas'

const boardContexts = {
  financialReport: { operatingNet: -12500 },
  boardMembers,
  sponsorOffer: { offerId: 'sponsor-offer-1', name: 'North Star Media' },
  upcomingEvent: { eventId: 'ppv-1', name: 'Summer Clash', scheduledDay: 30 },
  lastOutcome: { overallRating: 6.8 },
  titleChange: { titleId: 'world-title', titleName: 'World Championship', targetEmployeeId: 'wrestler-2' },
  wrestlerPush: { employeeId: 'wrestler-1', name: 'Rising Star' },
  pendingMandates: [{ id: 'mandate-1' }],
}

describe('board meeting agenda pool', () => {
  it('includes Financial Review only when the monthly operating result is negative', () => {
    const negativePool = buildBoardMeetingAgendaPool({
      ...boardContexts,
      financialIsNegative: true,
    })
    const positivePool = buildBoardMeetingAgendaPool({
      ...boardContexts,
      financialIsNegative: false,
    })

    expect(negativePool.some((agenda) => agenda.id === 'financialReview')).toBe(true)
    expect(positivePool.some((agenda) => agenda.id === 'financialReview')).toBe(false)
  })

  it('adds a board election only to January meeting agendas', () => {
    const januaryPool = buildBoardMeetingAgendaPool({
      ...boardContexts,
      isJanuary: true,
      financialIsNegative: false,
    })
    const otherMonthPool = buildBoardMeetingAgendaPool({
      ...boardContexts,
      isJanuary: false,
      financialIsNegative: false,
    })
    const election = januaryPool.find((agenda) => agenda.id === 'boardElection')

    expect(election).toBeDefined()
    expect(election.context.candidates).toHaveLength(7)
    expect(election.context.candidates.some((candidate) => candidate.current_role === 'General Manager')).toBe(false)
    expect(otherMonthPool.some((agenda) => agenda.id === 'boardElection')).toBe(false)
  })

  it('includes sponsor, event, champion, push, and rating agenda items when eligible', () => {
    const pool = buildBoardMeetingAgendaPool({
      ...boardContexts,
      financialIsNegative: true,
    })

    expect(pool.map((agenda) => agenda.id)).toEqual(expect.arrayContaining([
      'sponsorReview',
      'eventReview',
      'championChange',
      'wrestlerPush',
      'eventRatingTarget',
      'mandateReview',
      'investmentProposal',
      'competitorResponse',
    ]))
    expect(pool.find((agenda) => agenda.id === 'financialReview').proposer.current_role)
      .toBe('Audit Committee Chair')
    expect(pool.find((agenda) => agenda.id === 'wrestlerPush').proposer.current_role)
      .toBe('Compensation Committee Chair')
  })

  it('omits champion and wrestler agenda items when no eligible roster context exists', () => {
    const pool = buildBoardMeetingAgendaPool({
      financialIsNegative: false,
      financialReport: { operatingNet: 0 },
      boardMembers,
      sponsorOffer: null,
      upcomingEvent: null,
      lastOutcome: null,
      titleChange: null,
      wrestlerPush: null,
    })

    expect(pool.some((agenda) => agenda.id === 'championChange')).toBe(false)
    expect(pool.some((agenda) => agenda.id === 'wrestlerPush')).toBe(false)
    expect(pool).toHaveLength(3)
    expect(pool.some((agenda) => agenda.id === 'promotionStrategy')).toBe(true)
  })

  it('still reviews current sponsors when no new offer is eligible', () => {
    const pool = buildBoardMeetingAgendaPool({
      ...boardContexts,
      sponsorOffer: null,
      activeSponsors: [{ sponsorId: 'active-1', name: 'Current Sponsor', trust: 72 }],
      sponsorToReview: { sponsorId: 'active-1', name: 'Current Sponsor', trust: 72 },
      financialIsNegative: false,
    })

    const sponsorAgenda = pool.find((agenda) => agenda.id === 'sponsorReview')
    expect(sponsorAgenda.context.sponsorOffer).toBeNull()
    expect(sponsorAgenda.context.sponsorToReview.name).toBe('Current Sponsor')
    expect(sponsorAgenda.choices.map((choice) => choice.id)).toEqual([
      'maintainSponsorPortfolio',
      'releaseUnderperformingSponsor',
    ])
  })
})
