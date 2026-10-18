// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../i18n'
import HudBar from './HudBar'

afterEach(() => {
  cleanup()
})

describe('HudBar management profile summary', () => {
  it('does not display a home country', () => {
    render(
      <HudBar
        snapshot={{
          day: 1,
          week: 1,
          isEventDay: false,
          boardMeetingToday: false,
          cash: 500000,
          fans: 1000,
          prestige: 10,
          startDateIso: '2026-01-01',
          ownerName: 'Test Owner',
          generalManagerName: 'Test Manager',
          homeCountry: 'Japan',
        }}
      />,
    )

    expect(screen.queryByText('Home Country')).toBeNull()
    expect(screen.queryByText('Japan')).toBeNull()
  })
})