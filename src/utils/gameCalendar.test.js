import { describe, expect, it } from 'vitest'
import {
  getGameDateFromDay,
  getGameDayDifference,
  normalizeGameDate,
  parseGameDate,
  resolveGameCalendarStartDate,
  toGameDateIso,
} from './gameCalendar'

describe('game calendar dates', () => {
  it('normalizes one-digit month and day values without changing the date', () => {
    expect(normalizeGameDate('2026-1-30')).toBe('2026-01-30')
    expect(normalizeGameDate('2026-01-30')).toBe('2026-01-30')
  })

  it('rejects invalid dates rather than allowing JavaScript date overflow', () => {
    expect(parseGameDate('2026-2-30')).toBeNull()
    expect(() => normalizeGameDate('2026-2-30')).toThrow('Use YYYY-MM-DD')
  })

  it('uses the configured date as Game Day 1', () => {
    expect(toGameDateIso(getGameDateFromDay('2026-1-30', 1))).toBe('2026-01-30')
    expect(toGameDateIso(getGameDateFromDay('2026-1-30', 2))).toBe('2026-01-31')
  })

  it('continues from the configured start date without shifting the day counter', () => {
    const startDate = normalizeGameDate('2026-1-30')
    const dayThirtyOne = getGameDateFromDay(startDate, 31)

    expect(toGameDateIso(dayThirtyOne)).toBe('2026-03-01')
    expect(getGameDayDifference(parseGameDate(startDate), dayThirtyOne) + 1).toBe(31)
  })

  it('prefers the configured start date when restoring a saved game', () => {
    expect(resolveGameCalendarStartDate({
      configuredStartDateIso: '2026-1-30',
      persistedStartDateIso: '2025-11-02',
      fallbackStartDateIso: '2026-10-11',
    })).toBe('2026-01-30')
  })

  it('retains the saved start date when no configured date is provided', () => {
    expect(resolveGameCalendarStartDate({
      configuredStartDateIso: '',
      persistedStartDateIso: '2025-11-02',
      fallbackStartDateIso: '2026-10-11',
    })).toBe('2025-11-02')
  })

  it('repairs an invalid saved date with the initial-state start date', () => {
    expect(resolveGameCalendarStartDate({
      configuredStartDateIso: '',
      persistedStartDateIso: '2026-2-30',
      fallbackStartDateIso: '2026-1-30',
    })).toBe('2026-01-30')
  })

  it('calculates whole calendar-day differences across daylight-saving transitions', () => {
    const fromDate = new Date(2026, 2, 7)
    const toDate = new Date(2026, 2, 9)
    expect(getGameDayDifference(fromDate, toDate)).toBe(2)
  })
})
