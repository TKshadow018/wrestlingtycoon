import { describe, expect, it } from 'vitest'
import { selectHeaderSnapshot } from './selectors'

describe('selectHeaderSnapshot', () => {
  it('selects the current calendar, cash, and audience values for the header', () => {
    expect(selectHeaderSnapshot({
      calendar: { day: 12, week: 2, isEventDay: true },
      finances: { cash: 72500 },
      stats: { fans: 8400, prestige: 63 },
      unrelated: 'ignored',
    })).toEqual({
      day: 12,
      week: 2,
      isEventDay: true,
      cash: 72500,
      fans: 8400,
      prestige: 63,
    })
  })
})
