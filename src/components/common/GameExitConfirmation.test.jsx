// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom'
import '../../i18n'
import GameExitConfirmation from './GameExitConfirmation'

const dispatchPopState = () => {
  fireEvent(window, new PopStateEvent('popstate', { state: window.history.state }))
}

beforeEach(() => {
  window.history.replaceState({ idx: 1 }, '', '/')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function CurrentPath() {
  const { pathname } = useLocation()
  return <output data-testid="current-path">{pathname}</output>
}

const renderConfirmation = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <GameExitConfirmation />
    <CurrentPath />
  </MemoryRouter>,
)

describe('GameExitConfirmation', () => {
  it('asks before browser back and lets the player stay in the game', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    renderConfirmation()

    expect(screen.queryByRole('dialog')).toBeNull()
    dispatchPopState()

    expect(screen.getByRole('dialog', { name: 'Leave the game?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pushState).toHaveBeenCalledTimes(2)
    expect(go).not.toHaveBeenCalled()
  })

  it('leaves the game only after the player confirms', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    renderConfirmation()
    dispatchPopState()

    fireEvent.click(screen.getByRole('button', { name: 'Leave game' }))

    expect(go).toHaveBeenCalledWith(-2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('returns to the start screen when no previous app history entry exists', () => {
    window.history.replaceState({ idx: 0 }, '', '/')
    renderConfirmation()
    dispatchPopState()

    fireEvent.click(screen.getByRole('button', { name: 'Leave game' }))

    expect(screen.getByTestId('current-path').textContent).toBe('/')
  })

  it('keeps BrowserRouter on the dashboard while showing the back confirmation', () => {
    window.history.replaceState({ idx: 1, key: 'dashboard' }, '', '/dashboard')
    render(
      <BrowserRouter>
        <GameExitConfirmation />
        <CurrentPath />
      </BrowserRouter>,
    )
    dispatchPopState()

    expect(screen.getByTestId('current-path').textContent).toBe('/dashboard')
    expect(screen.getByRole('dialog', { name: 'Leave the game?' })).toBeTruthy()
  })

  it('intercepts a real browser Back and leaves only after confirmation', async () => {
    window.history.replaceState({ idx: 0 }, '', '/')
    window.history.pushState({ idx: 1, key: 'dashboard' }, '', '/dashboard')
    render(
      <BrowserRouter>
        <GameExitConfirmation />
        <CurrentPath />
      </BrowserRouter>,
    )

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    })

    expect(window.location.pathname).toBe('/dashboard')
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Leave the game?' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Leave game' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.getByTestId('current-path').textContent).toBe('/')
  })
})
