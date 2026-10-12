import { describe, expect, it } from 'vitest'
import {
  normalizeFactions,
  resolveFactionStorylines,
  updateBackstageChemistry,
} from './backstageDynamics'

const employees = [
  { employeeId: 'wrestler-a', name: 'Ace', role: 'wrestler' },
  { employeeId: 'wrestler-b', name: 'Blaze', role: 'wrestler' },
  { employeeId: 'manager-a', name: 'Coach', role: 'manager' },
  { employeeId: 'manager-b', name: 'Mouthpiece', role: 'manager' },
  { employeeId: 'referee', name: 'Ref', role: 'referee' },
  { employeeId: 'announcer', name: 'Call', role: 'announcer' },
  { employeeId: 'staff', name: 'Crew', role: 'staff' },
]

const factions = [
  { factionId: 'aces', name: 'The Aces', memberIds: ['wrestler-a', 'manager-a'] },
  { factionId: 'blazes', name: 'Blaze Club', memberIds: ['wrestler-b', 'manager-b'] },
]

describe('faction membership and rivalry stories', () => {
  it('normalizes factions to unique wrestler/manager members and drops invalid groups', () => {
    expect(normalizeFactions([
      { factionId: 'first', name: ' First ', memberIds: ['wrestler-a', 'manager-a', 'referee'] },
      { factionId: 'second', name: 'Second', memberIds: ['wrestler-a', 'wrestler-b'] },
      { factionId: 'empty', name: 'No eligible members', memberIds: ['staff'] },
      { factionId: 'nameless', name: '', memberIds: ['manager-b', 'wrestler-b'] },
    ], employees)).toEqual([
      { factionId: 'first', name: 'First', memberIds: ['wrestler-a', 'manager-a'] },
      { factionId: 'second', name: 'Second', memberIds: ['wrestler-b'] },
    ])
  })

  it('builds faction rivalries from promos and stronger interference story beats', () => {
    const result = resolveFactionStorylines({
      factions,
      employees,
      day: 12,
      segments: [
        { segmentType: 'promo', storyBeat: 'factionPromo', sourceFactionId: 'aces', targetFactionId: 'blazes' },
        { segmentType: 'promo', storyBeat: 'interference', sourceFactionId: 'aces', targetFactionId: 'blazes' },
      ],
    })

    expect(result.factionRivalries).toEqual([
      expect.objectContaining({
        factionIds: ['aces', 'blazes'],
        factionNames: ['The Aces', 'Blaze Club'],
        heat: 17,
        lastAction: 'interference',
        lastEventDay: 12,
      }),
    ])
    expect(result.rivalryHeatScore).toBeGreaterThan(17)
    expect(result.fanImpact).toBeGreaterThan(0)
    expect(result.storyOutcomes.map(({ action }) => action)).toEqual(['factionPromo', 'interference'])
  })

  it('reduces backstage chemistry when one faction interferes with a rival faction', () => {
    const result = updateBackstageChemistry({
      factions,
      employees,
      segments: [{
        segmentType: 'promo',
        storyBeat: 'interference',
        sourceFactionId: 'aces',
        targetFactionId: 'blazes',
        participantIds: ['wrestler-a', 'wrestler-b'],
      }],
    })

    expect(result.chemistry['wrestler-a::wrestler-b']).toBe(-3)
  })

  it('moves a betrayer to the target faction and records a one-time betrayal', () => {
    const result = resolveFactionStorylines({
      factions,
      employees,
      day: 20,
      segments: [{
        segmentType: 'promo',
        storyBeat: 'betrayal',
        sourceFactionId: 'aces',
        targetFactionId: 'blazes',
        betrayerId: 'manager-a',
      }, {
        segmentType: 'mainEvent',
        participantIds: ['manager-a', 'wrestler-a'],
      }],
    })

    expect(result.factions.find((faction) => faction.factionId === 'aces').memberIds)
      .toEqual(['wrestler-a'])
    expect(result.factions.find((faction) => faction.factionId === 'blazes').memberIds)
      .toContain('manager-a')
    expect(result.storyOutcomes[0]).toMatchObject({
      action: 'betrayal',
      betrayedEmployeeId: 'manager-a',
      heatGain: 15,
    })
    expect(result.factionRivalries[0].heat).toBe(15)
  })

  it('decays inactive faction heat and retains rivalry records with a minimum heat', () => {
    const result = resolveFactionStorylines({
      factions,
      employees,
      day: 21,
      factionRivalries: [{
        factionIds: ['blazes', 'aces'],
        factionNames: ['old name', 'old name'],
        heat: 5,
        lastEventDay: 10,
        lastAction: 'factionPromo',
      }],
      segments: [],
    })

    expect(result.factionRivalries[0]).toMatchObject({
      factionIds: ['aces', 'blazes'],
      heat: 4,
    })
  })
})

describe('backstage chemistry', () => {
  it('improves chemistry for faction allies booked together and applies it to match quality', () => {
    const result = updateBackstageChemistry({
      chemistry: {},
      factions,
      employees,
      segments: [{
        segmentType: 'mainEvent',
        matchType: 'tagTeam',
        team1Ids: ['wrestler-a', 'manager-a'],
        team2Ids: ['wrestler-b', 'manager-b'],
        participantIds: ['wrestler-a', 'manager-a', 'wrestler-b', 'manager-b'],
      }],
    })

    expect(result.chemistry['manager-a::wrestler-a']).toBe(3)
    expect(result.chemistry['manager-b::wrestler-b']).toBe(3)
    expect(result.chemistry['manager-a::wrestler-b']).toBe(-2)
    expect(result.segments[0].chemistryRatingAdjustment).toBe(0)
  })

  it('reduces chemistry and tracked morale for betrayal and interference conflicts', () => {
    const result = updateBackstageChemistry({
      chemistry: {
        'manager-a::wrestler-a': 35,
        'manager-a::wrestler-b': 35,
        'manager-b::wrestler-b': 35,
      },
      factions,
      employees,
      segments: [{
        segmentType: 'promo',
        participantIds: ['manager-a', 'wrestler-b'],
        storyBeat: 'betrayal',
        sourceFactionId: 'aces',
        targetFactionId: 'blazes',
        betrayerId: 'manager-a',
      }, {
        segmentType: 'mainEvent',
        participantIds: ['manager-a', 'wrestler-a'],
      }],
    })

    expect(result.chemistry['manager-a::wrestler-a']).toBe(11)
    expect(result.chemistry['manager-a::wrestler-b']).toBe(35)
    expect(result.employeeHappinessDeltas['wrestler-a']).toBe(-1)
    expect(result.segments[1].chemistryRatingAdjustment).toBeCloseTo(0.2)
  })

  it('lets managers, referees, announcers, and staff improve event chemistry', () => {
    const result = updateBackstageChemistry({
      chemistry: {},
      factions,
      employees,
      segments: [{
        segmentType: 'promo',
        participantIds: ['manager-a', 'referee', 'announcer', 'staff'],
      }],
    })

    expect(result.chemistry['announcer::manager-a']).toBe(1)
    expect(result.chemistry['manager-a::referee']).toBe(1)
    expect(result.chemistry['announcer::staff']).toBe(1)
    expect(result.segments[0].chemistryRatingAdjustment).toBe(0)
  })
})
