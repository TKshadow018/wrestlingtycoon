import { describe, expect, it } from 'vitest'
import { getEventDisplayName, getEventTypeKey, isRegularWeeklyEvent } from './eventDisplay'

const translate = (key) => ({
  'dashboard.eventTypes.regularWeekly': 'Regular Weekly',
  'dashboard.eventTypes.unknown': 'Unknown Event',
  'dashboard.employees.unknownEvent': 'Unknown Event',
}[key] || key)

describe('event display labels', () => {
  it('recognizes regular weekly events by stable ID or stored type fields', () => {
    expect(isRegularWeeklyEvent({ eventId: 'regular-weekly-event' })).toBe(true)
    expect(isRegularWeeklyEvent({ eventType: 'regularWeekly' })).toBe(true)
    expect(getEventTypeKey({ eventId: 'regular-weekly-event' })).toBe('regularWeekly')
    expect(getEventTypeKey({ type: 'success', eventType: 'ppv' })).toBe('ppv')
  })

  it('labels a blank-name weekly event from its event type', () => {
    expect(getEventDisplayName({ eventId: 'regular-weekly-event', eventName: '' }, translate))
      .toBe('Regular Weekly')
  })

  it('recovers legacy blank-name match history from its saved event log day', () => {
    expect(getEventDisplayName(
      { day: 14, eventName: '' },
      translate,
      [{ day: 14, eventId: 'regular-weekly-event' }],
      'dashboard.employees.unknownEvent',
    )).toBe('Regular Weekly')
  })

  it('recovers older match history from the game calendar when its event-log entry expired', () => {
    expect(getEventDisplayName(
      { day: 5, eventName: '' },
      translate,
      [],
      'dashboard.employees.unknownEvent',
      '2026-06-01',
    )).toBe('Regular Weekly')
  })

  it('preserves named custom events and retains the fallback for genuinely unknown events', () => {
    expect(getEventDisplayName({ eventType: 'ppv', eventName: 'Summer Finale' }, translate))
      .toBe('Summer Finale')
    expect(getEventDisplayName({}, translate)).toBe('Unknown Event')
  })
})
