// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../../i18n'
import { useGameStore } from '../../../store/useGameStore'
import ManageTitlesModule from './ManageTitlesModule'

const baseState = useGameStore.getState()

describe('ManageTitlesModule holder history', () => {
  afterEach(() => {
    cleanup()
    useGameStore.setState(baseState)
  })

  it('shows the number of successful defenses for each previous holder', () => {
    useGameStore.setState((state) => ({
      ...state,
      roster: {
        ...state.roster,
        employees: [],
        titles: [{
          titleId: 'world-title',
          name: 'World Championship',
          image: '/titles/world.png',
          division: 'singles',
          isActive: true,
          holderEmployeeId: null,
          holderHistory: [{
            holderEmployeeIds: ['former-champion'],
            holders: [{
              employeeId: 'former-champion',
              name: 'Former Champion',
              gender: 'male',
              imageUrl: null,
            }],
            daysHeld: 42,
            defenses: 3,
          }, {
            holderEmployeeIds: ['legacy-champion'],
            holders: [{
              employeeId: 'legacy-champion',
              name: 'Legacy Champion',
              gender: 'male',
              imageUrl: null,
            }],
            daysHeld: 15,
          }],
        }],
      },
    }))

    render(<ManageTitlesModule />)
    fireEvent.click(screen.getByRole('button', { name: 'Holder History' }))

    expect(screen.getByText('Days held: 42')).toBeTruthy()
    expect(screen.getByText('Successful defenses: 3')).toBeTruthy()
    expect(screen.getByText('Successful defenses: Not recorded')).toBeTruthy()
  })
})
