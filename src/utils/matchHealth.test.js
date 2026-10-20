import { describe, expect, it } from 'vitest'
import {
  applyMatchHealth, calculateMatchStaminaLoss, isInjured, normalizeInjury,
  recoverWrestlerHealth, MAX_MATCH_STAMINA_LOSS, INJURY_STAMINA_THRESHOLD,
} from './matchHealth'

const wrestlers = [
  { employeeId: 'a', role: 'wrestler', stamina: 100 },
  { employeeId: 'b', role: 'wrestler', stamina: 100 },
  { employeeId: 'c', role: 'wrestler', stamina: 100 },
]
const moment = (actionType, propId = null) => ({
  momentId: 'one', actionType, propId, actorId: 'a', targetId: 'b', atMinute: 5,
})
const plan = (moments = [], props = []) => ({
  matchLengthMinutes: 10, riskLevel: 'balanced', plannedMoments: moments, props,
})

describe('match stamina and injury rules', () => {
  it('charges by actual action intensity, participation, duration and risk', () => {
    const technical = calculateMatchStaminaLoss({ wrestlers, plan: plan([moment('technicalExchange')]) })
    const aerial = calculateMatchStaminaLoss({ wrestlers, plan: plan([moment('highFlyingSequence')]) })
    expect(aerial.a).toBeGreaterThan(technical.a)
    expect(aerial.b).toBeGreaterThan(technical.b)
    expect(aerial.c).toBe(technical.c)
    expect(aerial.a).toBeGreaterThan(aerial.c)
    expect(calculateMatchStaminaLoss({ wrestlers, plan: { ...plan(), matchLengthMinutes: 60, riskLevel: 'chaotic' } }).a)
      .toBeGreaterThan(calculateMatchStaminaLoss({ wrestlers, plan: plan() }).a)
  })

  it('charges only valid used props, including their impact on the target', () => {
    const unused = calculateMatchStaminaLoss({ wrestlers, plan: plan([], ['chair']) })
    expect(unused).toEqual(calculateMatchStaminaLoss({ wrestlers, plan: plan() }))
    const chair = calculateMatchStaminaLoss({ wrestlers, plan: plan([moment('usesProp', 'chair')], ['chair']) })
    const table = calculateMatchStaminaLoss({ wrestlers, plan: plan([moment('usesProp', 'table')], ['table']) })
    expect(chair.a).toBeGreaterThan(unused.a)
    expect(chair.b).toBeGreaterThan(unused.b)
    expect(table.b).toBeGreaterThan(chair.b)
    expect(calculateMatchStaminaLoss({ wrestlers, plan: plan([moment('usesProp', 'chair')]) }))
      .toEqual(unused)
  })

  it('never costs more than 70 per wrestler per match, even for external overrides', () => {
    expect(MAX_MATCH_STAMINA_LOSS).toBe(70)
    const longPlan = { ...plan(Array.from({ length: 100 }, (_, i) => ({ ...moment('usesProp', 'ladder'), momentId: `${i}` })), ['ladder']), matchLengthMinutes: 60, riskLevel: 'chaotic' }
    const costs = calculateMatchStaminaLoss({ wrestlers, plan: longPlan })
    expect(costs.a).toBe(70)
    expect(costs.b).toBe(70)
    const result = applyMatchHealth({ wrestlers, plan: longPlan, day: 10, staminaLossById: { a: 999, b: -1, c: Infinity }, random: () => 0 })
    expect(result.staminaLossById.a).toBe(70)
    expect(Object.values(result.staminaLossById).every((loss) => loss >= 0 && loss <= 70)).toBe(true)
    expect(result.wrestlers.every((person) => person.stamina >= 0)).toBe(true)
  })

  it('injures strictly below 20 and draws inclusive recovery lengths of 7 through 90 days', () => {
    expect(INJURY_STAMINA_THRESHOLD).toBe(20)
    const source = [{ ...wrestlers[0], stamina: 40 }, { ...wrestlers[1], stamina: 40 }]
    const minimum = applyMatchHealth({ wrestlers: source, plan: plan(), day: 5, staminaLossById: { a: 21, b: 20 }, random: () => 0 })
    expect(minimum.wrestlers[0]).toMatchObject({ stamina: 19, injury: { type: 'exhaustion', occurredDay: 5, returnDay: 12 } })
    expect(minimum.wrestlers[1].injury).toBeNull()
    expect(minimum.injuries).toEqual([{ employeeId: 'a', type: 'exhaustion', occurredDay: 5, returnDay: 12 }])
    const maximum = applyMatchHealth({ wrestlers: source, plan: plan(), day: 5, staminaLossById: { a: 70 }, random: () => 1 })
    expect(maximum.wrestlers[0].injury.returnDay).toBe(95)
  })

  it('reduces injury duration by the medical department modifier without removing injury risk', () => {
    const source = [{ ...wrestlers[0], stamina: 40 }]
    const untreated = applyMatchHealth({
      wrestlers: source, plan: plan(), day: 5, staminaLossById: { a: 21 }, random: () => 0.5,
    })
    const treated = applyMatchHealth({
      wrestlers: source,
      plan: plan(),
      day: 5,
      staminaLossById: { a: 21 },
      medicalInjuryDurationReduction: 0.1,
      random: () => 0.5,
    })

    expect(treated.injuries).toHaveLength(1)
    expect(treated.injuries[0].returnDay).toBeLessThan(untreated.injuries[0].returnDay)
    expect(treated.injuries[0].returnDay).toBeGreaterThan(5 + 7)
  })

  it('keeps injured wrestlers unavailable despite regenerated stamina and recovers on the exact return day', () => {
    const person = { ...wrestlers[0], injury: { type: 'exhaustion', occurredDay: 1, returnDay: 8 } }
    expect(isInjured(person, 7)).toBe(true)
    expect(isInjured(person, 8)).toBe(false)
    expect(recoverWrestlerHealth(person, 7).injury).toEqual(person.injury)
    expect(recoverWrestlerHealth(person, 8).injury).toBeNull()
    expect(recoverWrestlerHealth({ ...person, stamina: 10 }, 7).stamina).toBe(20)
    expect(recoverWrestlerHealth({ role: 'referee' }, 8)).toEqual({ role: 'referee' })
  })

  it('normalizes persisted backstage injuries to their supported 14–60 day range', () => {
    expect(normalizeInjury({
      type: 'backstage',
      reasonId: 'sprainedWrist',
      occurredDay: 10,
      returnDay: 11,
    })).toEqual({
      type: 'backstage',
      reasonId: 'sprainedWrist',
      occurredDay: 10,
      returnDay: 24,
    })
    expect(normalizeInjury({
      type: 'backstage',
      reasonId: 'sprainedWrist',
      occurredDay: 10,
      returnDay: 100,
    }).returnDay).toBe(70)
    expect(normalizeInjury({
      type: 'backstage',
      reasonId: 'unknown',
      occurredDay: 10,
      returnDay: 20,
    })).toBeNull()
  })

  it('sanitizes legacy injury state and handles empty or malformed plans safely', () => {
    expect(normalizeInjury(null)).toBeNull()
    expect(normalizeInjury({ type: 'other', occurredDay: 1, returnDay: 10 })).toBeNull()
    expect(normalizeInjury({ type: 'exhaustion', occurredDay: 1, returnDay: 1000 }))
      .toEqual({ type: 'exhaustion', occurredDay: 1, returnDay: 91 })
    expect(normalizeInjury({ type: 'exhaustion', occurredDay: NaN, returnDay: 8 })).toBeNull()
    expect(normalizeInjury({ type: 'exhaustion', occurredDay: 5, returnDay: 3 })).toBeNull()
    expect(calculateMatchStaminaLoss()).toEqual({})
    expect(calculateMatchStaminaLoss({ wrestlers, plan: null }).a).toBeGreaterThan(0)
    expect(applyMatchHealth({ wrestlers: [], day: 1 }).injuries).toEqual([])
  })
})
