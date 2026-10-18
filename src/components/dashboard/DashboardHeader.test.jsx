// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'

vi.mock('../common/SaveLoadControls', () => ({
  default: () => <div data-testid="save-load-controls">Save and load controls</div>,
}))

vi.mock('../common/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher">Language switcher</div>,
}))

import DashboardHeader from './DashboardHeader'

afterEach(() => {
  cleanup()
})

const createProps = () => ({
  profile: {
    playerName: 'Tusar',
    companyName: 'Dhisum Dhisum Wrestling',
  },
  onboardingSummary: { status: 'active' },
  onOpenChallenge: vi.fn(),
  saveLoadProps: {},
  aiStatusMessage: '',
  aiEnabled: false,
})

describe('DashboardHeader responsive navigation', () => {
  it('keeps the identity and all desktop actions in one header container', () => {
    render(<DashboardHeader {...createProps()} />)

    const header = screen.getByRole('banner')
    const identity = screen.getByTestId('dashboard-header-identity')
    const actions = screen.getByTestId('dashboard-header-actions')

    expect(header.getAttribute('data-layout')).toBe('single-line')
    expect(identity.contains(screen.getByText('Welcome back, Tusar'))).toBe(true)
    expect(identity.contains(screen.getByText('Promotion: Dhisum Dhisum Wrestling'))).toBe(true)
    expect(header.contains(screen.getByText('Welcome back, Tusar'))).toBe(true)
    expect(header.contains(screen.getByText('Promotion: Dhisum Dhisum Wrestling'))).toBe(true)
    expect(actions.contains(screen.getByTestId('save-load-controls'))).toBe(true)
    expect(actions.contains(screen.getByTestId('language-switcher'))).toBe(true)
    expect(actions.contains(screen.getByRole('button', { name: 'Challenges' }))).toBe(true)
    expect(actions.getAttribute('data-menu-open')).toBe('false')
  })

  it('opens and closes the compact actions menu from the mobile trigger', () => {
    render(<DashboardHeader {...createProps()} />)

    const menuButton = screen.getByRole('button', { name: 'Open dashboard menu' })
    const actions = screen.getByTestId('dashboard-header-actions')

    expect(menuButton.getAttribute('aria-expanded')).toBe('false')
    expect(actions.getAttribute('data-menu-open')).toBe('false')

    fireEvent.click(menuButton)
    expect(menuButton.getAttribute('aria-expanded')).toBe('true')
    expect(menuButton.getAttribute('aria-label')).toBe('Close dashboard menu')
    expect(actions.getAttribute('data-menu-open')).toBe('true')

    fireEvent.click(menuButton)
    expect(menuButton.getAttribute('aria-expanded')).toBe('false')
    expect(actions.getAttribute('data-menu-open')).toBe('false')
  })
})
