// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../../i18n'
import EventSetupModal from './EventSetupModal'
import styles from './EventSetupModal.module.scss'

vi.mock('../../../store/useGameStore', () => ({
  useGameStore: (select) => select({
    roster: { titles: [], teams: [], factions: [] },
    events: { eventLog: [] }, calendar: { day: 1, startDateIso: '2026-06-01' },
    progression: { unlocks: {} },
  }),
}))
afterEach(cleanup)

const employees = [
  { employeeId: 'a', role: 'wrestler', name: 'Alpha', stamina: 100, skill: 80, gender: 'male' },
  { employeeId: 'b', role: 'wrestler', name: 'Bravo', stamina: 100, skill: 80, gender: 'male' },
  { employeeId: 'r', role: 'referee', name: 'Referee' },
]

const drop = (zone, employeeId) => fireEvent.drop(zone, { dataTransfer: { getData: () => employeeId } })
const configureSegment = (container, format) => {
  const zones = container.querySelectorAll(`.${styles.dropZone}`)
  drop(zones[0], 'a')
  drop(zones[format === 'tagTeam' ? 1 : 0], 'b')
  drop(zones[format === 'tagTeam' ? 2 : 1], 'r')
}
const openPlanner = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Plan Segment' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start Segment' }))
}
const setup = (totalSegments = 2, onSubmit = vi.fn(), format = 'singles', roster = employees) => {
  const result = render(<EventSetupModal isOpen eventConfig={{ totalSegments, eventName: 'Test' }}
    employees={roster} onClose={vi.fn()} onSubmit={onSubmit} />)
  for (let index = 0; index < totalSegments; index += 1) {
    if (format === 'tagTeam') fireEvent.click(screen.getByRole('button', { name: 'Tag Team' }))
    configureSegment(result.container, format)
    if (index < totalSegments - 1) fireEvent.click(screen.getByRole('button', { name: 'Next segment' }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save & Proceed' }))
  return result
}

describe('execution draft safety', () => {
  it('warns about projected injuries and disables subsequent matches on the same card', () => {
    const submit = vi.fn()
    setup(2, submit, 'singles', employees.map((person) => ({ ...person, stamina: 60 })))
    openPlanner()
    fireEvent.click(screen.getByRole('button', { name: '60 minutes' }))
    fireEvent.click(screen.getByRole('button', { name: 'chaotic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve Match' }))
    expect(screen.getAllByText(/will be injured after this match/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next Match' }))
    expect(screen.getByText('Match cancelled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plan Segment' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Simulate Segment' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Finish Event' }))
    const first = submit.mock.calls[0][0].segments[0]
    expect(Object.values(first.staminaLossById).every((loss) => loss <= 70)).toBe(true)
  })

  it('shows injured wrestlers as unavailable and rejects drag-and-drop assignment', () => {
    const injured = employees.map((person) => person.employeeId === 'a'
      ? { ...person, injury: { type: 'exhaustion', occurredDay: 1, returnDay: 15 } } : person)
    const { container } = render(<EventSetupModal isOpen eventConfig={{ totalSegments: 1 }}
      employees={injured} onClose={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByText(/Injured.*14 days/)).toBeTruthy()
    drop(container.querySelector(`.${styles.dropZone}`), 'a')
    expect(screen.getByText('An injured wrestler is unavailable for matches until their recovery day.')).toBeTruthy()
  })

  it('submits a simulated event profile with the shared rating breakdown', () => {
    const submit = vi.fn()
    setup(1, submit)
    fireEvent.click(screen.getByRole('button', { name: 'Simulate Segment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Segment' }))
    expect(screen.getByRole('region', { name: 'Rating breakdown' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish Event' }))
    const result = submit.mock.calls[0][0].segments[0]
    expect(result).toMatchObject({
      executionMode: 'simulate', ratingBreakdown: { eventExecution: expect.any(Number) },
    })
    expect(result.plannedMoments.length).toBeGreaterThan(0)
    expect(['a', 'b']).toContain(result.winnerEmployeeId)
  })

  it('submits a selected tag-team winner with its timeline rating and finish', () => {
    const submit = vi.fn()
    setup(1, submit, 'tagTeam')
    openPlanner()
    fireEvent.click(screen.getByRole('button', { name: 'Team 2', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'submission' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve Match' }))
    expect(screen.getByRole('region', { name: 'Rating breakdown' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish Event' }))
    expect(submit.mock.calls[0][0].segments[0]).toMatchObject({
      matchType: 'tagTeam', winnerTeamIds: ['b'], winnerEmployeeId: null,
      finishType: 'submission', executionMode: 'play',
      ratingBreakdown: { eventExecution: expect.any(Number) },
    })
  })

  it('restores duration, winner and an intentionally empty timeline across segments and planner reopening', () => {
    setup()
    openPlanner()
    fireEvent.click(screen.getByRole('button', { name: '30 minutes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bravo' }))
    while (screen.queryByRole('button', { name: 'Remove moment 1' })) {
      fireEvent.click(screen.getByRole('button', { name: 'Remove moment 1' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Return to event' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next Match' }))
    openPlanner()
    expect(screen.getByRole('spinbutton', { name: 'Duration in minutes' }).value).toBe('10')
    fireEvent.click(screen.getByRole('button', { name: 'Previous Match' }))
    openPlanner()
    expect(screen.getByRole('spinbutton', { name: 'Duration in minutes' }).value).toBe('30')
    expect(screen.getByRole('button', { name: 'Bravo' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Your timeline is empty')).toBeTruthy()
  })

  it('keeps the execution screen and draft intact when the store rejects a submission', () => {
    const submit = vi.fn(() => ({ ok: false, error: 'matchPlanner.invalidPlan' }))
    setup(1, submit)
    openPlanner()
    fireEvent.click(screen.getByRole('button', { name: '20 minutes' }))
    fireEvent.click(screen.getByRole('button', { name: 'submission' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve Match' }))
    expect(screen.getByRole('region', { name: 'Rating breakdown' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish Event' }))
    expect(submit).toHaveBeenCalledOnce()
    expect(submit.mock.calls[0][0].segments[0]).toMatchObject({
      executionMode: 'play', finishType: 'submission', riskLevel: 'balanced',
      ratingBreakdown: { eventExecution: expect.any(Number) },
    })
    expect(screen.getByText('Complete or correct the highlighted match plan before resolving.')).toBeTruthy()
    openPlanner()
    expect(screen.getByRole('spinbutton', { name: 'Duration in minutes' }).value).toBe('20')
  })

  it('retains drafts when returning to setup without changing the card', () => {
    setup(1)
    openPlanner()
    fireEvent.click(screen.getByRole('button', { name: '45 minutes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save & Proceed' }))
    openPlanner()
    expect(screen.getByRole('spinbutton', { name: 'Duration in minutes' }).value).toBe('45')
  })
})
