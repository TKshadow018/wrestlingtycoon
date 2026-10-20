import { describe, expect, it } from 'vitest'
import {
  BACKSTAGE_INJURY_REASONS,
  advanceBackstageInjury,
  createBackstageInjuryState,
  normalizeBackstageInjuryState,
} from './backstageInjury'

describe('backstage injury scheduling', () => {
  it('starts with a 90-day timer and decrements once per game day', () => {
    const result = advanceBackstageInjury({
      state: createBackstageInjuryState(),
      employees: [],
      day: 1,
      random: () => 0.5,
    })

    expect(result.state).toMatchObject({ daysUntilNext: 89, pending: null })
    expect(result.employees).toEqual([])
  })

  it('assigns a random reason and 14–60 day injury to one eligible wrestler', () => {
    const employees = [
      { employeeId: 'injured', role: 'wrestler', injury: { type: 'exhaustion', occurredDay: 1, returnDay: 20 } },
      { employeeId: 'staff', role: 'staff', injury: null },
      { employeeId: 'healthy', name: 'Healthy Wrestler', role: 'wrestler', injury: null },
    ]
    const result = advanceBackstageInjury({
      state: { daysUntilNext: 1, pending: null },
      employees,
      day: 10,
      random: () => 0.5,
    })

    expect(BACKSTAGE_INJURY_REASONS).toHaveLength(20)
    expect(new Set(BACKSTAGE_INJURY_REASONS).size).toBe(20)
    expect(result.state.daysUntilNext).toBeGreaterThanOrEqual(60)
    expect(result.state.daysUntilNext).toBeLessThanOrEqual(120)
    expect(result.state.pending).toMatchObject({
      employeeId: 'healthy',
      employeeName: 'Healthy Wrestler',
      reasonId: expect.stringMatching(/^[a-zA-Z]+$/),
      occurredDay: 10,
      returnDay: expect.any(Number),
    })
    expect(result.state.pending.returnDay - result.state.pending.occurredDay)
      .toBeGreaterThanOrEqual(14)
    expect(result.state.pending.returnDay - result.state.pending.occurredDay)
      .toBeLessThanOrEqual(60)
    expect(result.employees[2].injury).toMatchObject({
      type: 'backstage',
      reasonId: result.state.pending.reasonId,
      occurredDay: 10,
      returnDay: result.state.pending.returnDay,
    })
  })

  it('uses both endpoints of the injury-duration and repeat-interval ranges', () => {
    const wrestler = { employeeId: 'healthy', name: 'Healthy Wrestler', role: 'wrestler', injury: null }
    const minimum = advanceBackstageInjury({
      state: { daysUntilNext: 0, pending: null },
      employees: [wrestler],
      day: 10,
      random: () => 0,
    })
    const maximum = advanceBackstageInjury({
      state: { daysUntilNext: 0, pending: null },
      employees: [wrestler],
      day: 10,
      random: () => 1,
    })

    expect(minimum.state.pending.returnDay - minimum.state.pending.occurredDay).toBe(14)
    expect(minimum.state.daysUntilNext).toBe(60)
    expect(maximum.state.pending.returnDay - maximum.state.pending.occurredDay).toBe(60)
    expect(maximum.state.daysUntilNext).toBe(120)
  })

  it('triggers the first incident on the 90th completed game day', () => {
    let state = createBackstageInjuryState()
    let employees = [{
      employeeId: 'healthy',
      name: 'Healthy Wrestler',
      role: 'wrestler',
      injury: null,
    }]

    for (let day = 1; day < 90; day += 1) {
      const result = advanceBackstageInjury({ state, employees, day, random: () => 0.5 })
      state = result.state
      employees = result.employees
      expect(state.pending).toBeNull()
    }

    const result = advanceBackstageInjury({ state, employees, day: 90, random: () => 0.5 })
    expect(result.state.pending.occurredDay).toBe(90)
  })

  it('keeps the due timer at zero until an eligible wrestler is available', () => {
    const result = advanceBackstageInjury({
      state: { daysUntilNext: 0, pending: null },
      employees: [
        { employeeId: 'injured', role: 'wrestler', injury: { type: 'exhaustion', occurredDay: 1, returnDay: 20 } },
      ],
      day: 10,
      random: () => 0.5,
    })

    expect(result.state).toEqual({ daysUntilNext: 0, pending: null })
    expect(result.injury).toBeNull()
  })

  it('normalizes older and malformed persisted scheduling state', () => {
    expect(normalizeBackstageInjuryState(undefined)).toEqual({
      daysUntilNext: 90,
      pending: null,
    })
    expect(normalizeBackstageInjuryState({
      daysUntilNext: -3,
      pending: { reasonId: 'not-a-reason' },
    })).toEqual({ daysUntilNext: 0, pending: null })
  })
})
