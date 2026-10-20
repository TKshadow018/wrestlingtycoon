import { describe, expect, it } from 'vitest'
import { getEmployeeWinRate, sortEmployees } from './employeeSorting'

const employees = [
  {
    name: 'Charlie',
    popularity: 90,
    skill: 70,
    stamina: 60,
    matchStats: { totalWins: 0, totalLosses: 0 },
    salary: 3000,
  },
  {
    name: 'Bravo',
    popularity: 70,
    skill: 90,
    stamina: 80,
    matchStats: { totalWins: 1, totalLosses: 3 },
    salary: 1000,
  },
  {
    name: 'Alpha',
    popularity: 90,
    skill: 60,
    stamina: 40,
    matchStats: { totalWins: 3, totalLosses: 1 },
    contract: { monthlySalary: 2000 },
    salary: 4000,
  },
]

describe('employee sorting', () => {
  it('sorts by popularity, skill, and stamina with stable alphabetical ties', () => {
    expect(sortEmployees(employees, 'popularity', 'desc').map(({ name }) => name))
      .toEqual(['Alpha', 'Charlie', 'Bravo'])
    expect(sortEmployees(employees, 'skill', 'desc').map(({ name }) => name))
      .toEqual(['Bravo', 'Charlie', 'Alpha'])
    expect(sortEmployees(employees, 'stamina', 'asc').map(({ name }) => name))
      .toEqual(['Alpha', 'Charlie', 'Bravo'])
  })

  it('treats missing stamina as the full-stamina default used by the roster UI', () => {
    const roster = [{ name: 'Default stamina' }, { name: 'Tired', stamina: 40 }]
    expect(sortEmployees(roster, 'stamina', 'desc').map(({ name }) => name))
      .toEqual(['Default stamina', 'Tired'])
  })

  it('sorts salary using negotiated terms when available and supports either direction', () => {
    const candidates = employees.map((employee) => ({
      ...employee,
      contract: {
        ...employee.contract,
        negotiatedMonthlySalary: employee.name === 'Charlie' ? 500 : undefined,
      },
    }))

    expect(sortEmployees(candidates, 'salary', 'asc').map(({ name }) => name))
      .toEqual(['Charlie', 'Bravo', 'Alpha'])
    expect(sortEmployees(candidates, 'salary', 'desc').map(({ name }) => name))
      .toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('sorts roster employees by their contract salary', () => {
    expect(sortEmployees(employees, 'fee', 'asc').map(({ name }) => name))
      .toEqual(['Bravo', 'Alpha', 'Charlie'])
  })

  it('calculates win rate from decided matches and treats a wrestler with no record as zero', () => {
    expect(getEmployeeWinRate(employees[0])).toBe(0)
    expect(getEmployeeWinRate(employees[1])).toBe(25)
    expect(getEmployeeWinRate(employees[2])).toBe(75)
    expect(sortEmployees(employees, 'winRate', 'desc').map(({ name }) => name))
      .toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('returns a sorted copy without mutating the source list', () => {
    const original = [...employees]
    expect(sortEmployees(employees, 'skill', 'desc')).not.toBe(employees)
    expect(employees).toEqual(original)
  })
})
