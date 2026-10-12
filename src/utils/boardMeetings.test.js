import { describe, expect, it } from 'vitest'
import { getBoardMeetingSchedule } from './boardMeetings'
import { getGameDateFromDay } from './gameCalendar'

describe('monthly board meeting schedule', () => {
  it('schedules a meeting on the first day of each available month', () => {
    const meetings = getBoardMeetingSchedule({
      startDateIso: '2026-06-01',
      throughDate: new Date(2026, 7, 31),
    })

    expect(meetings.map((meeting) => meeting.specificDate)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ])
    expect(meetings.every((meeting) => meeting.isNonWrestling)).toBe(true)
  })

  it('moves a meeting to the next empty day after weekly and custom events', () => {
    const meetings = getBoardMeetingSchedule({
      startDateIso: '2026-05-01',
      customEvents: [{ specificDate: '2026-05-02' }],
      throughDate: new Date(2026, 4, 31),
    })

    expect(meetings[0].specificDate).toBe('2026-05-03')
  })

  it('avoids dates reserved by annual recurring events', () => {
    const meetings = getBoardMeetingSchedule({
      startDateIso: '2026-12-01',
      customEvents: [{
        specificDate: '2025-12-01',
        isRecurringAnnually: true,
      }],
      throughDate: new Date(2026, 11, 31),
    })

    expect(meetings[0].specificDate).toBe('2026-12-02')
  })

  it('does not schedule a meeting earlier than the game start date', () => {
    const meetings = getBoardMeetingSchedule({
      startDateIso: '2026-06-15',
      throughDate: new Date(2026, 6, 31),
    })

    expect(meetings.map((meeting) => meeting.specificDate)).toEqual(['2026-07-01'])
  })

  it('uses a one-digit configured month as the actual local calendar date', () => {
    const meetings = getBoardMeetingSchedule({
      startDateIso: '2026-1-30',
      throughDate: getGameDateFromDay('2026-1-30', 5),
    })

    expect(meetings[0].specificDate).toBe('2026-02-01')
  })

  it('keeps shifted monthly meetings in order when one spills into the following month', () => {
    const customEvents = Array.from({ length: 32 }, (_, index) => {
      const date = new Date(2026, 0, 1 + index)
      const specificDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
      return { specificDate }
    })
    const meetings = getBoardMeetingSchedule({
      startDateIso: '2026-01-01',
      customEvents,
      throughDate: new Date(2026, 1, 28),
    })

    expect(meetings.map((meeting) => meeting.specificDate)).toEqual([
      '2026-02-02',
      '2026-02-03',
    ])
  })
})
