// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../i18n'
import InterviewFocusModal from './InterviewFocusModal'

afterEach(cleanup)

describe('InterviewFocusModal keyboard accessibility', () => {
  it('names the dialog and traps keyboard focus through focus selection', () => {
    render(
      <InterviewFocusModal
        isOpen
        wrestlers={[
          { employeeId: 'ace', name: 'Ace', popularity: 90 },
          { employeeId: 'blaze', name: 'Blaze', popularity: 80 },
        ]}
        onStart={() => {}}
        onCancel={() => {}}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Choose the Interview Focus' })
    const featured = screen.getByRole('combobox', { name: 'Featured Wrestler' })
    const start = screen.getByRole('button', { name: 'Start Interview' })

    expect(document.activeElement).toBe(featured)
    start.focus()
    fireEvent.keyDown(start, { key: 'Tab' })
    expect(document.activeElement).toBe(featured)
    featured.focus()
    fireEvent.keyDown(featured, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(start)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
