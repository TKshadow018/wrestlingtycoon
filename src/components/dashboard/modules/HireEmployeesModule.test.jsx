// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../../i18n'
import { useGameStore } from '../../../store/useGameStore'
import HireEmployeesModule from './HireEmployeesModule'

const baseState = useGameStore.getState()
const lockedCandidate = {
  id: 'gated-ace',
  candidateId: 'candidate-gated-ace',
  name: 'Gated Ace',
  role: 'wrestler',
  gender: 'male',
  dob: '1990-01-01',
  popularity: 99,
  skill: 90,
  tier: 'Elite',
  image_url: '',
  signature_moves: ['Signature'],
  finisher_moves: ['Finisher'],
  wrestling_ability: { strength: 90, technics: 90, high_fly_ability: 90 },
  wrestlerUnlockTier: 4,
  salary: 1000,
  signingBonus: 100,
  contract: {
    monthlySalary: 1000,
    perMatchSalary: 100,
    signingBonus: 100,
    negotiatedMonthlySalary: 1000,
    negotiatedPerMatchSalary: 100,
    negotiatedSigningBonus: 100,
  },
}

const sortingCandidates = [
  { name: 'Alpha', popularity: 30, skill: 70, salary: 2000 },
  { name: 'Bravo', popularity: 80, skill: 40, salary: 3000 },
  { name: 'Charlie', popularity: 60, skill: 90, salary: 1000 },
].map((candidate) => ({
  id: candidate.name.toLowerCase(),
  candidateId: `candidate-${candidate.name.toLowerCase()}`,
  ...candidate,
  role: 'staff',
  gender: 'male',
  dob: '1990-01-01',
  tier: 'Available',
  image_url: '',
  staff_department: 'Operations',
  staff_ability: { reliability: 50, technical_skill: 50 },
  signingBonus: 0,
  perMatchSalary: 0,
  contract: {
    monthlySalary: candidate.salary,
    perMatchSalary: 0,
    signingBonus: 0,
    negotiatedMonthlySalary: candidate.salary,
    negotiatedPerMatchSalary: 0,
    negotiatedSigningBonus: 0,
  },
}))

describe('HireEmployeesModule popularity access', () => {
  beforeEach(() => {
    useGameStore.setState((state) => ({
      ...state,
      finances: { ...state.finances, cash: 100000 },
      stats: { ...state.stats, prestige: 10 },
      progression: { ...state.progression, unlockedWrestlerIds: [] },
      market: { ...state.market, employeeCandidates: [lockedCandidate] },
      roster: { ...state.roster, employees: [] },
    }))
  })

  afterEach(() => {
    cleanup()
    useGameStore.setState(baseState)
  })

  it('shows the prestige or career-goal requirement and disables both hiring paths', () => {
    render(<HireEmployeesModule />)

    expect(screen.getByText('Locked: reach company Prestige 1500 or earn a wrestler unlock from a completed Career Arc.'))
      .toBeTruthy()
    expect(screen.getByRole('button', { name: 'Locked (Prestige 1500)' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Negotiate contract' }).disabled).toBe(true)
  })

  it('sorts candidates by salary, popularity, and skill in the selected direction', () => {
    useGameStore.setState((state) => ({
      ...state,
      market: { ...state.market, employeeCandidates: sortingCandidates },
    }))

    render(<HireEmployeesModule />)

    const getCandidateNames = () => screen.getAllByRole('article')
      .map((article) => article.querySelector('h4').textContent)

    expect(getCandidateNames()).toEqual(['Charlie', 'Alpha', 'Bravo'])

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'popularity' } })
    expect(getCandidateNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])

    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'asc' } })
    expect(getCandidateNames()).toEqual(['Alpha', 'Charlie', 'Bravo'])

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'skill' } })
    expect(getCandidateNames()).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })
})
