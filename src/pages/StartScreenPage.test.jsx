// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  startGame: vi.fn(() => ({ ok: true })),
  setAiOptedInAtStart: vi.fn(),
  initializeAiAssistant: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../ai/openRouterManager', () => ({ initializeAiAssistant: mocks.initializeAiAssistant }))
vi.mock('../components/common/LanguageSwitcher', () => ({ default: () => null }))
vi.mock('../store/useGameStore', () => ({
  useGameStore: (selector) => selector({
    startGame: mocks.startGame,
    setAiOptedInAtStart: mocks.setAiOptedInAtStart,
    ai: {
      status: 'error',
      progress: 100,
      progressText: '',
      error: 'onboarding.aiSetupError',
      modelId: 'openrouter/free',
    },
  }),
}))

import StartScreenPage from './StartScreenPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StartScreenPage management profile setup', () => {
  it('starts a game without asking for a management country', () => {
    render(<StartScreenPage />)

    expect(screen.queryByRole('combobox', { name: 'Management Base Country' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    expect(mocks.startGame).toHaveBeenCalledWith({
      playerName: 'Tusar',
      companyName: 'Dhisum Dhisum Wrestling',
    })
  })
})

describe('StartScreenPage AI setup recovery', () => {
  it('offers retry after setup fails and starts model initialization again', async () => {
    mocks.initializeAiAssistant
      .mockRejectedValueOnce(new Error('all candidates failed'))
      .mockResolvedValueOnce({ chat: {} })
    render(<StartScreenPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'Start with AI enabled setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry AI connection' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Retry AI connection' }))
    await waitFor(() => expect(mocks.initializeAiAssistant).toHaveBeenCalledTimes(2))
  })
})
