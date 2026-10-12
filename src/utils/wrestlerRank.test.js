import { describe, expect, it } from 'vitest'
import { calculateRanking, calculateTeamRanking, collectUniqueMatches, getInitialPoints } from './wrestlerRank'

const match = (overrides = {}) => ({
  day: 4,
  eventName: 'Weekly Showcase',
  segmentType: 'match',
  matchType: 'Singles',
  participantDetails: [
    { role: 'wrestler', employeeId: 'alpha' },
    { role: 'wrestler', employeeId: 'bravo' },
    { role: 'manager', employeeId: 'manager-1' },
  ],
  winnerEmployeeId: 'alpha',
  ...overrides,
})

const wrestler = (employeeId, name, popularity, gender = 'male', matchHistory = []) => ({
  employeeId,
  name,
  role: 'wrestler',
  gender,
  popularity,
  matchStats: { matchHistory },
})

describe('wrestler rankings', () => {
  it('converts popularity to initial ranking points', () => {
    expect(getInitialPoints({ popularity: 43.25 })).toBe(433)
    expect(getInitialPoints(null)).toBe(0)
  })

  it('collects valid matches once and supports singles and team winner ids', () => {
    const first = match()
    const second = match({ day: 8, winnerEmployeeId: '', winnerTeamIds: ['bravo', 'alpha'] })
    const ignoredSegment = match({ segmentType: 'promo' })
    const oneParticipant = match({
      day: 10,
      participantDetails: [{ role: 'wrestler', employeeId: 'alpha' }],
    })

    const matches = collectUniqueMatches([
      wrestler('alpha', 'Alpha', 20, 'male', [first, second, ignoredSegment, oneParticipant]),
      wrestler('bravo', 'Bravo', 30, 'male', [first]),
    ])

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({ day: 4, winnerIds: ['alpha'] })
    expect(matches[1]).toMatchObject({ day: 8, winnerIds: ['bravo', 'alpha'] })
    expect(matches[0].participantIds).toEqual(['alpha', 'bravo'])
  })

  it('ranks wrestlers from match results while filtering unrelated wrestlers and external participants', () => {
    const alpha = wrestler('alpha', 'Alpha', 10, 'male', [match()])
    const bravo = wrestler('bravo', 'Bravo', 30, 'male', [match()])
    const outsider = wrestler('outsider', 'Outsider', 90, 'male', [
      match({
        day: 9,
        participantDetails: [
          { role: 'wrestler', employeeId: 'outsider' },
          { role: 'wrestler', employeeId: 'not-rostered' },
        ],
        winnerEmployeeId: 'outsider',
      }),
    ])

    const ranked = calculateRanking([
      alpha,
      bravo,
      outsider,
      { employeeId: 'staff', name: 'Staff', role: 'staff', popularity: 100 },
    ])

    expect(ranked).toHaveLength(3)
    expect(ranked.find((entry) => entry.employeeId === 'alpha')).toMatchObject({
      wins: 1,
      losses: 0,
      matches: 1,
    })
    expect(ranked.find((entry) => entry.employeeId === 'bravo')).toMatchObject({
      wins: 0,
      losses: 1,
      matches: 1,
    })
    expect(ranked.find((entry) => entry.employeeId === 'outsider')).toMatchObject({
      employeeId: 'outsider',
      wins: 0,
      losses: 0,
      matches: 0,
    })
    expect(calculateRanking([{ role: 'staff' }])).toEqual([])
  })

  it('records matches with no recognized winner without changing win/loss totals', () => {
    const noWinner = match({ winnerEmployeeId: 'not-present' })
    const ranked = calculateRanking([
      wrestler('alpha', 'Alpha', 10, 'male', [noWinner]),
      wrestler('bravo', 'Bravo', 10, 'male', [noWinner]),
    ])

    expect(ranked.map(({ matches, wins, losses }) => ({ matches, wins, losses }))).toEqual([
      { matches: 1, wins: 0, losses: 0 },
      { matches: 1, wins: 0, losses: 0 },
    ])
  })

  it('ranks mixed and gender-specific teams within the requested division', () => {
    const employees = [
      wrestler('m1', 'Male One', 80, 'male'),
      wrestler('m2', 'Male Two', 60, 'male'),
      wrestler('f1', 'Female One', 75, 'female'),
      wrestler('f2', 'Female Two', 55, 'female'),
    ]
    const teams = [
      { teamId: 'mixed', name: 'Mixed Team', memberIds: ['m1', 'f1'] },
      { teamId: 'male', name: 'Male Team', memberIds: ['m1', 'm2'] },
      { teamId: 'female', name: 'Female Team', memberIds: ['f1', 'f2'] },
      { teamId: 'empty', name: 'Empty Team', memberIds: [] },
      { teamId: 'unknown', name: 'Unknown Team', memberIds: ['nobody'] },
    ]

    const maleTeams = calculateTeamRanking({ teams, employees })
    const femaleTeams = calculateTeamRanking({ teams, employees, division: 'female' })

    expect(maleTeams.map((team) => team.teamId)).toEqual(['mixed', 'male'])
    expect(maleTeams.find((team) => team.teamId === 'mixed').isMixed).toBe(true)
    expect(femaleTeams.map((team) => team.teamId)).toEqual(['mixed', 'female'])
    expect(femaleTeams.find((team) => team.teamId === 'mixed').teamRankPoints).toBe(750)
    expect(calculateTeamRanking({ teams, employees: [] })).toEqual([])
    expect(calculateTeamRanking({ teams: [], employees })).toEqual([])
  })
})
