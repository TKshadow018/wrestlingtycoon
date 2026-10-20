// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../../i18n'
import MatchResultsModule from './MatchResultsModule'

vi.mock('../../../store/useGameStore', () => ({
  useGameStore: (select) => select({
    calendar: { startDateIso: '2026-06-01' },
    events: { eventLog: [{
      id: 'show', eventName: 'Health show', day: 1,
      segments: [{
        segmentType: 'match', winnerName: 'Alpha', matchRating: 8,
        participants: ['Alpha'], staminaLossById: { a: 70 },
        injuries: [{ employeeId: 'a', occurredDay: 1, returnDay: 8 }],
        participantDetails: [{ employeeId: 'a', name: 'Alpha', role: 'wrestler' }],
      }, {
        segmentType: 'titleMatch', cancelled: true, cancellationReason: 'injury',
        matchRating: null, participants: [],
      }],
    }, {
      id: 'weekly', eventId: 'regular-weekly-event', eventType: 'regularWeekly',
      eventName: '', day: 2, segments: [],
    }] },
  }),
}))
afterEach(cleanup)

it('counts only played matches and retains injury and cancellation explanations in history', () => {
  render(<MatchResultsModule />)
  expect(screen.getByText('1 match(es)')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Health show/ }))
  expect(screen.getByText('Match cancelled')).toBeTruthy()
  expect(screen.getByText(/Alpha is injured.*7 days/)).toBeTruthy()
})

it('labels a regular weekly event by type when its display name is empty', () => {
  render(<MatchResultsModule />)
  expect(screen.getByRole('button', { name: /Weekly Show/ })).toBeTruthy()
})
