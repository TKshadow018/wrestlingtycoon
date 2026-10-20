// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../../../i18n'
import MatchPlanner from './MatchPlanner'
import { MATCH_MOMENT_ACTIONS, MATCH_PLAN_DIAGNOSTIC_CODES, MAX_PLANNED_MOMENTS } from '../../../data/matchPlanning'
import locale from '../../../i18n/locales/en.json'

afterEach(cleanup)

const wrestlers = [
  { employeeId: 'a', name: 'Alpha' },
  { employeeId: 'b', name: 'Bravo' },
]
const moment = { momentId: 'opening', actionType: 'technicalExchange', actorId: 'a', targetId: 'b', atMinute: 15, propId: null }
const segment = { segmentType: 'match', matchType: 'singles', wrestlerIds: ['a', 'b'] }

function Harness({ initial = {}, onResolve = vi.fn(), onBack = vi.fn() }) {
  const [choice, setChoice] = useState({
    matchLengthMinutes: 20, props: [], plannedMoments: [moment],
    winnerEmployeeId: 'a', winnerTeam: 'team1', finishType: 'pin', riskLevel: 'balanced',
    ...initial,
  })
  return <MatchPlanner segment={segment} wrestlers={wrestlers} choice={choice} onChange={setChoice} onResolve={() => onResolve(choice)} onBack={onBack} />
}

describe('match timeline planner', () => {
  it('localizes every catalog category and shared diagnostic code', () => {
    for (const code of MATCH_PLAN_DIAGNOSTIC_CODES) {
      expect(locale.matchPlanner.diagnostics[code], code).toEqual(expect.any(String))
    }
    for (const action of MATCH_MOMENT_ACTIONS) {
      expect(locale.matchPlanner.categories[action.category], action.category).toEqual(expect.any(String))
    }
  })

  it('renders an accessible timeline, duplicates with unique IDs, removes and adds moments', () => {
    const onResolve = vi.fn()
    render(<Harness onResolve={onResolve} />)
    expect(screen.getByRole('heading', { name: 'Match timeline' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate moment 1' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve Match' }))
    const duplicated = onResolve.mock.calls[0][0].plannedMoments
    expect(new Set(duplicated.map((entry) => entry.momentId)).size).toBe(2)
    expect(duplicated[0].momentId).toBe('opening')
    expect(duplicated[1]).toMatchObject({ ...moment, momentId: expect.any(String) })
    fireEvent.click(screen.getByRole('button', { name: 'Remove moment 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove moment 1' }))
    expect(screen.getByText('Your timeline is empty')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add first moment' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('enforces the moment limit for both adding and duplicating', () => {
    render(<Harness initial={{
      plannedMoments: Array.from({ length: MAX_PLANNED_MOMENTS }, (_, index) => ({ ...moment, momentId: `moment-${index}` })),
    }} />)
    expect(screen.getByRole('button', { name: 'Add moment' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Duplicate moment 1' }).disabled).toBe(true)
    expect(screen.getAllByRole('article')).toHaveLength(MAX_PLANNED_MOMENTS)
  })

  it('clamps times without deleting moments and announces the adjustment', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '10 minutes' }))
    expect(screen.getByRole('spinbutton', { name: 'Minute' }).value).toBe('10')
    expect(screen.getByRole('status').textContent).toContain('moved')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
    expect(screen.getByRole('spinbutton', { name: 'Minute' }).value).toBe('5')
  })

  it('shows only selected props and blocks incomplete prop actions until corrected', () => {
    const onResolve = vi.fn()
    render(<Harness onResolve={onResolve} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'What happens' }), { target: { value: 'usesProp' } })
    const propSelect = screen.getByRole('combobox', { name: 'Prop' })
    expect(within(propSelect).queryByRole('option', { name: 'Chair' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resolve Match' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chair' }))
    fireEvent.change(propSelect, { target: { value: 'chair' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resolve Match' }))
    expect(onResolve).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chair' }))
    expect(propSelect.value).toBe('')
    expect(screen.getByRole('button', { name: 'Resolve Match' }).disabled).toBe(true)
  })

  it('preserves the draft when returning and exposes inline required-field errors', () => {
    const onBack = vi.fn()
    render(<Harness onBack={onBack} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Actor' }), { target: { value: '' } })
    expect(screen.getByRole('combobox', { name: 'Actor' }).getAttribute('aria-invalid')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Return to event' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
