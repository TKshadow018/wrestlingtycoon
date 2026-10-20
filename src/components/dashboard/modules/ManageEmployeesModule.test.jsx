// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../../i18n'
import ManageEmployeesModule from './ManageEmployeesModule'

const mocks = vi.hoisted(() => {
  const actions = {
    setStaffDepartment: vi.fn(() => ({ ok: true, department: 'medical' })),
    unused: vi.fn(),
  }

  return {
    actions,
    state: {
      roster: {
        employees: [{
          employeeId: 'staff-1',
          name: 'Stage Manager',
          role: 'staff',
          gender: 'male',
          dob: '1990-01-01',
          skill: 80,
          tier: 'Solid',
          popularity: 50,
          happiness: 50,
          staffDepartment: 'production',
          staffAbility: { technical_skill: 100 },
          contract: { monthlySalary: 1000, perMatchSalary: 100, signingBonus: 0, endDay: 30 },
          matchStats: { totalMatches: 0, totalWins: 0, totalLosses: 0, matchHistory: [] },
        }],
        titles: [],
        teams: [],
        factions: [],
        backstageChemistry: {},
      },
      market: { wrestlerArchetypes: [] },
      events: {
        factionRivalries: [],
        eventLog: [],
        backstageInjury: { daysUntilNext: 90, pending: null },
      },
      finances: { cash: 50000 },
      calendar: { day: 1, startDateIso: '2026-06-01' },
      actions,
    },
  }
})

vi.mock('../../../store/useGameStore', () => ({
  useGameStore: (select) => select({
    ...mocks.state,
    fireEmployee: mocks.actions.unused,
    setEmployeeManager: mocks.actions.unused,
    setStaffDepartment: mocks.actions.setStaffDepartment,
    giveEmployeeBonus: mocks.actions.unused,
    resolveEmployeeMoraleDemand: mocks.actions.unused,
    createTeam: mocks.actions.unused,
    updateTeam: mocks.actions.unused,
    deleteTeam: mocks.actions.unused,
    createFaction: mocks.actions.unused,
    updateFaction: mocks.actions.unused,
    deleteFaction: mocks.actions.unused,
  }),
}))

afterEach(() => {
  cleanup()
  mocks.actions.setStaffDepartment.mockClear()
})

it('shows the current department effect and saves a changed staff assignment', () => {
  render(<ManageEmployeesModule />)

  const departmentSelect = screen.getByRole('combobox', { name: 'Department for Stage Manager' })
  expect(screen.getByText('Reduces event production cost by 5%.')).toBeTruthy()
  fireEvent.change(departmentSelect, { target: { value: 'medical' } })

  expect(mocks.actions.setStaffDepartment).toHaveBeenCalledWith('staff-1', 'medical')
})

it('shows the days remaining until the next backstage injury check', () => {
  mocks.state.events.backstageInjury.daysUntilNext = 72
  render(<ManageEmployeesModule />)

  expect(screen.getByText('Next backstage injury check in 72 days.')).toBeTruthy()
})
