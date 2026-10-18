import { describe, expect, it } from 'vitest'
import {
  calculateDynamicTicketPrice,
  calculateTicketGateRevenue,
  countEarlierSameWeekRegularEvents,
  getPreviousMonthCompanyRating,
  getRivalPerformanceRanking,
} from './dynamicTicketPricing'

const neutralInput = {
  eventType: 'regularWeekly',
  eventDay: 61,
  eventLog: [],
  competitorCompanies: [],
  random: () => 0.5,
}

describe('dynamic ticket pricing', () => {
  it('calculates the previous game-month rating from completed events', () => {
    const result = getPreviousMonthCompanyRating({
      eventDay: 61,
      eventLog: [
        { type: 'success', day: 31, overallRating: 8.8 },
        { type: 'success', day: 60, overallRating: 7.5 },
        { type: 'success', day: 61, overallRating: 10 },
        { type: 'missed', day: 45, overallRating: 9.9 },
      ],
    })

    expect(result).toMatchObject({
      recentAverageRating: 8.15,
      sampleSize: 2,
      ratingCoefficient: 0.15,
    })
  })

  it('ranks the company against comparable rival performance', () => {
    const result = getRivalPerformanceRanking({
      companyRating: 8.6,
      eventDay: 61,
      competitorCompanies: [
        { id: 'rival-first', eventHistory: [{ day: 31, matches: [{ matchRating: 9.1 }] }] },
        { id: 'rival-third', eventHistory: [{ day: 31, matches: [{ matchRating: 8.2 }] }] },
        { id: 'rival-last', eventHistory: [{ day: 31, matches: [{ matchRating: 7.1 }] }] },
      ],
    })

    expect(result).toMatchObject({
      rivalRank: 2,
      rankedCompanyCount: 4,
      rankAdjustment: 0.1,
      rivalAdjustment: expect.any(Number),
    })
    expect(result.comparisons.map(({ id }) => id)).toEqual([
      'rival-first',
      'player',
      'rival-third',
      'rival-last',
    ])
  })

  it('counts only earlier regular weekly events from the same game week', () => {
    expect(countEarlierSameWeekRegularEvents({
      eventType: 'regularWeekly',
      eventDay: 19,
      eventLog: [
        { eventType: 'regularWeekly', scheduledDay: 15 },
        { eventType: 'regularWeekly', day: 18 },
        { eventType: 'ppv', day: 17 },
        { eventType: 'regularWeekly', day: 12 },
        { eventType: 'regularWeekly', day: 20 },
      ],
    })).toBe(2)

    expect(countEarlierSameWeekRegularEvents({
      eventType: 'ppv',
      eventDay: 19,
      eventLog: [{ eventType: 'regularWeekly', day: 18 }],
    })).toBe(0)
  })

  it('keeps recommendations inside the 50% to 150% base-price range for ten base values', () => {
    const baseValues = [1, 2, 5, 10, 20, 25, 45, 65, 100, 999]

    baseValues.forEach((baseTicketPrice) => {
      const result = calculateDynamicTicketPrice({
        ...neutralInput,
        baseTicketPrice,
        eventLog: [
          { type: 'success', day: 1, overallRating: 10 },
          { type: 'success', day: 30, overallRating: 10 },
        ],
        competitorCompanies: [
          { id: 'rival-a', eventHistory: [{ day: 5, matches: [{ matchRating: 1 }] }] },
          { id: 'rival-b', eventHistory: [{ day: 5, matches: [{ matchRating: 1 }] }] },
          { id: 'rival-c', eventHistory: [{ day: 5, matches: [{ matchRating: 1 }] }] },
        ],
        random: () => 1,
      })

      expect(result.recommendedTicketPrice).toBeGreaterThanOrEqual(baseTicketPrice * 0.5)
      expect(result.recommendedTicketPrice).toBeLessThanOrEqual(baseTicketPrice * 1.5)
      expect(result.priceLowerBound).toBe(baseTicketPrice * 0.5)
      expect(result.priceUpperBound).toBe(baseTicketPrice * 1.5)
    })
  })

  it('respects both explicit boundary values for a whole-dollar base price', () => {
    const result = calculateDynamicTicketPrice({
      ...neutralInput,
      baseTicketPrice: 100,
      config: { randomRange: 2 },
      random: () => 0,
    })

    expect(result.priceLowerBound).toBe(50)
    expect(result.priceUpperBound).toBe(150)
    expect(calculateDynamicTicketPrice({
      ...neutralInput,
      baseTicketPrice: 100,
      config: { randomRange: 2 },
      random: () => 0,
    }).recommendedTicketPrice).toBe(50)
    expect(calculateDynamicTicketPrice({
      ...neutralInput,
      baseTicketPrice: 100,
      config: { randomRange: 2 },
      random: () => 1,
    }).recommendedTicketPrice).toBe(150)
  })

  it('applies the repeated regular-weekly penalty only to repeated regular events', () => {
    const repeated = calculateDynamicTicketPrice({
      ...neutralInput,
      baseTicketPrice: 100,
      eventDay: 19,
      eventLog: [
        { eventType: 'regularWeekly', day: 15 },
        { eventType: 'regularWeekly', day: 18 },
      ],
    })
    const premiumEvent = calculateDynamicTicketPrice({
      ...neutralInput,
      baseTicketPrice: 100,
      eventType: 'ppv',
      eventDay: 19,
      eventLog: [
        { eventType: 'regularWeekly', day: 15 },
        { eventType: 'regularWeekly', day: 18 },
      ],
    })

    expect(repeated.sameWeekRegularEventCount).toBe(2)
    expect(repeated.sameWeekPenalty).toBe(-20)
    expect(premiumEvent.sameWeekRegularEventCount).toBe(0)
    expect(premiumEvent.sameWeekPenalty).toBe(0)
  })

  it('uses the dynamic base recommendation as the unique best event-gate price', () => {
    const pricing = calculateDynamicTicketPrice({
      ...neutralInput,
      baseTicketPrice: 100,
    })
    const candidatePrices = [50, 60, 75, 90, 99, 100, 101, 110, 125, 150]
    const gateValues = candidatePrices.map((ticketPrice) => ({
      ticketPrice,
      gate: calculateTicketGateRevenue({
        attendance: 10000,
        selectedTicketPrice: ticketPrice,
        recommendedTicketPrice: pricing.recommendedTicketPrice,
      }),
    }))
    const best = gateValues.reduce((current, candidate) => (
      candidate.gate > current.gate ? candidate : current
    ))

    expect(pricing.recommendedTicketPrice).toBe(100)
    expect(best.ticketPrice).toBe(pricing.recommendedTicketPrice)
    expect(best.gate).toBeGreaterThan(Math.max(...gateValues
      .filter(({ ticketPrice }) => ticketPrice !== pricing.recommendedTicketPrice)
      .map(({ gate }) => gate)))
  })
})
