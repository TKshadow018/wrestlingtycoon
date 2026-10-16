// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import AiInterviewModal from './AiInterviewModal'

afterEach(cleanup)

const interview = {
  journalistName: 'Nina Hart',
  newspaperName: 'Daily Grapple',
  topic: 'match',
  situation: '',
}

const renderInterview = (overrides = {}) => render(
  <AiInterviewModal
    isOpen
    interview={interview}
    messages={[{ speaker: 'ai', text: 'What is your plan for the roster?' }]}
    onSubmitAnswer={vi.fn().mockResolvedValue(true)}
    onSkip={vi.fn()}
    onFinishEarly={vi.fn()}
    onFinishAndContinue={vi.fn()}
    isSubmitting={false}
    isFinished={false}
    error=""
    {...overrides}
  />,
)

describe('AiInterviewModal', () => {
  it('provides an accessible dialog, named answer input, and distinct early-finish action', () => {
    renderInterview()

    expect(screen.getByRole('dialog', { name: 'Media Interview' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish Interview Now' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip Interview and Continue Day' })).toBeTruthy()
  })

  it('preserves an answer when submission fails and clears it after a successful retry', async () => {
    const onSubmitAnswer = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    renderInterview({ onSubmitAnswer })
    const answer = screen.getByRole('textbox')

    fireEvent.change(answer, { target: { value: 'We will develop our roster carefully.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Answer' }))
    await waitFor(() => expect(onSubmitAnswer).toHaveBeenCalledTimes(1))
    expect(answer.value).toBe('We will develop our roster carefully.')

    fireEvent.click(screen.getByRole('button', { name: 'Send Answer' }))
    await waitFor(() => expect(onSubmitAnswer).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(answer.value).toBe(''))
  })

  it('announces journalist turns and retry errors accessibly', () => {
    renderInterview({ error: 'Interview response failed. Your answer is still here; retry or finish the interview.' })

    expect(screen.getByRole('alert').textContent).toContain('Your answer is still here')
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy()
  })

  it('routes the separate finish-early control to its completion handler', () => {
    const onFinishEarly = vi.fn()
    renderInterview({ onFinishEarly })

    fireEvent.click(screen.getByRole('button', { name: 'Finish Interview Now' }))
    expect(onFinishEarly).toHaveBeenCalledTimes(1)
  })

  it('keeps skip distinct from finish early', () => {
    const onSkip = vi.fn()
    const onFinishEarly = vi.fn()
    renderInterview({ onSkip, onFinishEarly })

    fireEvent.click(screen.getByRole('button', { name: 'Skip Interview and Continue Day' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onFinishEarly).not.toHaveBeenCalled()
  })

  it('wraps keyboard tab navigation to keep focus inside the modal', () => {
    renderInterview()
    const answer = screen.getByRole('textbox')
    fireEvent.change(answer, { target: { value: 'We will develop our roster carefully.' } })
    const submit = screen.getByRole('button', { name: 'Send Answer' })
    submit.focus()

    fireEvent.keyDown(submit, { key: 'Tab' })
    expect(document.activeElement).toBe(answer)
  })
})
