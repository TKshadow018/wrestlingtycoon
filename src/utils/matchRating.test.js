import { describe, expect, it } from 'vitest'
import { buildSimulatedMatchPlan, rateMatch, sanitizeRatingBreakdown } from './matchRating'
import { normalizeMatchPlan } from '../data/matchPlanning'

const wrestlers = [
  { employeeId: 'a', skill: 85, stamina: 90 },
  { employeeId: 'b', skill: 80, stamina: 85 },
]
const moments = (actions) => actions.map((actionType, index) => ({
  momentId: `m${index}`, actionType, actorId: index % 2 ? 'b' : 'a',
  targetId: index % 2 ? 'a' : 'b', atMinute: index * 2 + 1, propId: actionType === 'usesProp' ? 'chair' : null,
}))
const plan = {
  matchLengthMinutes: 10, winnerEmployeeId: 'a', finishType: 'pin', riskLevel: 'balanced',
  props: [], plannedMoments: moments(['technicalExchange', 'dominateStrikes', 'highFlyingSequence', 'comeback', 'nearFall']),
}
const rate = (overrides = {}, extra = {}) => rateMatch({ wrestlers, plan: { ...plan, ...overrides }, ...extra })
const factors = ['performerCapability', 'eventExecution', 'matchStructure', 'varietyAndPacing', 'finishCoherence', 'riskManagement']

describe('event-based match rating', () => {
  it('is deterministic and exposes finite bounded explainable factors', () => {
    const result = rate()
    expect(result).toEqual(rate())
    expect(result.matchRating).toBeGreaterThanOrEqual(1)
    expect(result.matchRating).toBeLessThanOrEqual(10)
    for (const key of factors) {
      expect(result.ratingBreakdown[key]).toBeGreaterThanOrEqual(0)
      expect(result.ratingBreakdown[key]).toBeLessThanOrEqual(10)
    }
    expect(Math.abs(result.ratingBreakdown.contextAdjustment)).toBeLessThanOrEqual(0.5)
    expect(sanitizeRatingBreakdown(result.ratingBreakdown)).toEqual(result.ratingBreakdown)
  })

  it('rewards a well ordered opening, escalation and finish rather than a reversed sequence', () => {
    const reversed = rate({ plannedMoments: moments(['nearFall', 'comeback', 'highFlyingSequence', 'dominateStrikes', 'technicalExchange']) })
    expect(rate().matchRating).toBeGreaterThan(reversed.matchRating)
    expect(rate().ratingBreakdown.matchStructure).toBeGreaterThan(reversed.ratingBreakdown.matchStructure)
    expect(rate().ratingBreakdown.finishCoherence).toBeGreaterThan(reversed.ratingBreakdown.finishCoherence)
  })

  it('penalizes repetition and clustering, not just the number of moments', () => {
    const repeated = rate({ plannedMoments: moments(Array(5).fill('dominateStrikes')) })
    expect(rate().matchRating).toBeGreaterThan(repeated.matchRating)
    expect(repeated.ratingBreakdown.warnings).toContain('repeatedActions')
    const clustered = rate({ plannedMoments: plan.plannedMoments.map((moment) => ({ ...moment, atMinute: 1 })) })
    expect(clustered.ratingBreakdown.varietyAndPacing).toBeLessThan(rate().ratingBreakdown.varietyAndPacing)
    expect(clustered.ratingBreakdown.warnings).toContain('clusteredMoments')
  })

  it('never awards points for unused props and evaluates actual prop usage', () => {
    const unused = rate({ props: ['chair', 'table'] })
    expect(unused.matchRating).toBe(rate().matchRating)
    expect(unused.ratingBreakdown.warnings).toContain('unusedProps')
    const used = rate({ props: ['chair'], plannedMoments: moments(['technicalExchange', 'dominateStrikes', 'usesProp', 'comeback', 'nearFall']) }, { matchStipulation: 'noDisqualification' })
    expect(used.ratingBreakdown.riskManagement).toBeLessThan(unused.ratingBreakdown.riskManagement)
    const invalid = rate({ plannedMoments: moments(['usesProp']) })
    expect(invalid.ratingBreakdown.warnings).toContain('propRequired')
    expect(invalid.matchRating).toBeLessThan(used.matchRating)
  })

  it('does not reward winner selection, but checks valid winners and finish coherence', () => {
    expect(rate({ winnerEmployeeId: 'b' }).matchRating).toBe(rate().matchRating)
    expect(rate({ winnerEmployeeId: 'missing' }).ratingBreakdown.warnings).toContain('invalidWinner')
    expect(rate({ winnerEmployeeId: null }).ratingBreakdown.warnings).toContain('missingWinner')
    const submission = rate({ finishType: 'submission' })
    const technicalClose = rate({ finishType: 'submission', plannedMoments: moments(['dominateStrikes', 'comeback', 'technicalExchange']) })
    expect(technicalClose.ratingBreakdown.finishCoherence).toBeGreaterThan(submission.ratingBreakdown.finishCoherence)
    expect(rate({ finishType: 'dq', props: ['chair'], plannedMoments: moments(['outsideRingBrawl', 'refereeDistraction', 'usesProp']) }).ratingBreakdown.finishCoherence).toBeGreaterThan(5)
    expect(rate({ finishType: 'countout', plannedMoments: moments(['outsideRingBrawl']).map((moment) => ({ ...moment, atMinute: 10 })) }).ratingBreakdown.finishCoherence).toBeGreaterThan(5)
  })

  it('accounts for stamina, duration demands and excessive unsafe action use', () => {
    const tired = rate({}, { wrestlers: wrestlers.map((wrestler) => ({ ...wrestler, stamina: 5 })) })
    expect(tired.matchRating).toBeLessThan(rate().matchRating)
    expect(rate({ matchLengthMinutes: 60 }).matchRating).toBeLessThan(rate().matchRating)
    const unsafe = rate({ props: ['chair'], riskLevel: 'chaotic', plannedMoments: moments(Array(5).fill('usesProp')) })
    expect(unsafe.ratingBreakdown.riskManagement).toBeLessThan(rate().ratingBreakdown.riskManagement)
    expect(unsafe.ratingBreakdown.warnings).toContain('excessiveRisk')
    const empty = rate({ plannedMoments: [] })
    expect(empty.matchRating).toBeLessThan(rate().matchRating)
    expect(empty.ratingBreakdown.warnings).toContain('emptyPlan')
  })

  it('bounds context adjustments and ignores unknown context values', () => {
    expect(rate({}, { segmentType: 'titleMatch', matchType: 'tagTeam', matchStipulation: 'ladder' }).ratingBreakdown.contextAdjustment).toBeLessThanOrEqual(0.5)
    expect(rate({}, { segmentType: 'mainEvent' }).ratingBreakdown.contextAdjustment).toBeGreaterThan(0)
    expect(rate({}, { matchStipulation: 'invented' }).matchRating).toBe(rate().matchRating)
    expect(rate({ finishType: 'dq' }, { matchStipulation: 'noDisqualification' }).ratingBreakdown.contextAdjustment).toBeLessThan(0)
    expect(rate({}, { matchStipulation: 'submission' }).ratingBreakdown.contextAdjustment).toBeLessThan(0)
  })

  it('rates normalized tag plans without losing team validation context', () => {
    const tag = normalizeMatchPlan({
      ...plan, wrestlerIds: ['a', 'b', 'c', 'd'], matchType: 'tagTeam',
      team1Ids: ['a', 'c'], team2Ids: ['b', 'd'], winnerTeamIds: ['a', 'c'],
    }).plan
    const result = rateMatch({ wrestlers: [...wrestlers, { employeeId: 'c', skill: 75 }, { employeeId: 'd', skill: 75 }], plan: tag })
    expect(result.ratingBreakdown.warnings).not.toContain('invalidWinnerTeam')
  })

  it('uses relevant wrestler ability only when present', () => {
    const lowTechnical = rate({}, {
      wrestlers: wrestlers.map((wrestler) => ({ ...wrestler, wrestling_ability: { technics: 5 } })),
    })
    expect(lowTechnical.ratingBreakdown.eventExecution).toBeLessThan(rate().ratingBreakdown.eventExecution)
    expect(rate({ plannedMoments: moments(['comeback', 'refereeDistraction', 'nearFall']) }).matchRating).toBeGreaterThanOrEqual(1)
  })

  it('handles malformed and extreme plans/performers without exceptions or nonfinite results', () => {
    for (const args of [undefined, null, {}, { wrestlers: null, plan: null }, { wrestlers: [null, {}, { employeeId: 'a', skill: Infinity, stamina: -999 }], plan: { plannedMoments: [null], matchLengthMinutes: Infinity } }, { wrestlers: [{ employeeId: 'a', skill: Symbol('bad') }], plan: 'bad' }]) {
      const result = rateMatch(args)
      expect(Number.isFinite(result.matchRating)).toBe(true)
      expect(result.matchRating).toBeGreaterThanOrEqual(1)
      expect(result.matchRating).toBeLessThanOrEqual(10)
      expect(sanitizeRatingBreakdown(result.ratingBreakdown)).not.toBeNull()
    }
    expect(rateMatch().ratingBreakdown.warnings).toContain('missingPerformers')
    expect(rateMatch({ wrestlers: {}, plan: {} }).ratingBreakdown.warnings).toContain('missingPerformers')
  })
})

describe('simulated match plans', () => {
  it('uses only supplied randomness and remains reproducible with a seeded sequence', () => {
    const random = () => {
      let seed = 123
      return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    }
    const first = buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], random: random(), matchLengthMinutes: 20 })
    const second = buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], random: random(), matchLengthMinutes: 20 })
    expect(first).toEqual(second)
    expect(first.plannedMoments.length).toBeGreaterThan(2)
    expect(new Set(first.plannedMoments.map(({ actionType }) => actionType)).size).toBeGreaterThan(2)
    expect(rateMatch({ wrestlers, plan: first })).toEqual(rateMatch({ wrestlers, plan: second }))
    expect(buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], random: () => 0 })).not.toEqual(buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], random: () => 0.99 }))
  })

  it('preserves supplied outcome and props, bounds random values, and ignores authored moments', () => {
    for (const random of [() => -100, () => Infinity, () => NaN, () => 100, null]) {
      const result = buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], matchLengthMinutes: 1000, winnerEmployeeId: 'b', finishType: 'submission', riskLevel: 'risky', props: ['chair'], plannedMoments: [{ actorId: 'missing' }], random })
      expect(result.matchLengthMinutes).toBe(60)
      expect(result.winnerEmployeeId).toBe('b')
      expect(result.finishType).toBe('submission')
      expect(result.props).toEqual(['chair'])
      expect(result.plannedMoments.every(({ atMinute }) => atMinute >= 1 && atMinute <= 60)).toBe(true)
    }
    expect(buildSimulatedMatchPlan({ wrestlerIds: ['a'], random: () => 0 }).plannedMoments).toEqual([])
    expect(buildSimulatedMatchPlan().plannedMoments).toEqual([])
    expect(buildSimulatedMatchPlan(null).plannedMoments).toEqual([])
    expect(buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'] }).plannedMoments.length).toBeGreaterThan(0)
    const tag = buildSimulatedMatchPlan({
      wrestlerIds: ['a', 'b', 'c', 'd'], matchType: 'tagTeam', team1Ids: ['a', 'c'], team2Ids: ['b', 'd'],
      random: () => 0,
    })
    expect(tag.winnerTeamIds).toEqual(['a', 'c'])
    const propPlan = buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], props: ['chair'], random: () => 0.99 })
    expect(propPlan.plannedMoments.some(({ propId }) => propId === 'chair')).toBe(true)
    const dq = buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], finishType: 'dq', random: () => 0 })
    expect(dq.plannedMoments.at(-1).actionType).toBe('refereeDistraction')
    const countout = buildSimulatedMatchPlan({ wrestlerIds: ['a', 'b'], finishType: 'countout', random: () => 0 })
    expect(countout.plannedMoments.at(-1).actionType).toBe('outsideRingBrawl')
  })
})

describe('rating breakdown sanitization', () => {
  it('rejects missing or nonnumeric factors and strips unrecognized fields', () => {
    const valid = rate().ratingBreakdown
    for (const raw of [null, undefined, [], 'bad', {}, { ...valid, eventExecution: NaN }, { ...valid, contextAdjustment: Infinity }, { ...valid, riskManagement: '7' }]) {
      expect(sanitizeRatingBreakdown(raw)).toBeNull()
    }
    const result = sanitizeRatingBreakdown({ ...valid, performerCapability: -5, eventExecution: 999, contextAdjustment: 999, warnings: ['emptyPlan', 'bad', 'emptyPlan', null], secret: true })
    expect(result).toEqual({ ...valid, performerCapability: 0, eventExecution: 10, contextAdjustment: 0.5, warnings: ['emptyPlan'] })
    expect(sanitizeRatingBreakdown({ ...valid, contextAdjustment: -999, warnings: {} }).contextAdjustment).toBe(-0.5)
    expect(sanitizeRatingBreakdown({ ...valid, warnings: {} }).warnings).toEqual([])
  })
})
