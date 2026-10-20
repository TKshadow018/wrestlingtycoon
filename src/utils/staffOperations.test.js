import { describe, expect, it } from 'vitest'
import {
  getSegmentStaffEffects,
  getStaffDepartmentEffects,
  normalizeStaffDepartment,
} from './staffOperations'

describe('staff department effects', () => {
  it('normalizes supported departments and leaves legacy or invalid assignments unassigned', () => {
    expect(normalizeStaffDepartment('production')).toBe('production')
    expect(normalizeStaffDepartment('medical')).toBe('medical')
    expect(normalizeStaffDepartment('talentRelations')).toBe('talentRelations')
    expect(normalizeStaffDepartment('logistics')).toBe('logistics')
    expect(normalizeStaffDepartment('unknown')).toBeNull()
    expect(normalizeStaffDepartment(null)).toBeNull()
  })

  it('derives capped operating benefits from assigned general staff only', () => {
    const staff = [
      { employeeId: 'production-a', role: 'staff', staffDepartment: 'production', staffAbility: { technical_skill: 100 } },
      { employeeId: 'production-b', role: 'staff', staffDepartment: 'production', staffAbility: { technical_skill: 100 } },
      { employeeId: 'medical', role: 'staff', staffDepartment: 'medical', staffAbility: { technical_skill: 100 } },
      { employeeId: 'talent', role: 'staff', staffDepartment: 'talentRelations', staffAbility: { teamwork: 100 } },
      { employeeId: 'logistics', role: 'staff', staffDepartment: 'logistics', staffAbility: { reliability: 100 } },
      { employeeId: 'unassigned', role: 'staff', staffAbility: { technical_skill: 100, reliability: 100 } },
      { employeeId: 'wrong-role', role: 'manager', staffDepartment: 'production', staffAbility: { technical_skill: 100 } },
    ]

    expect(getStaffDepartmentEffects(staff)).toEqual({
      productionCostReduction: 0.1,
      medicalInjuryDurationReduction: 0.1,
      talentRelationsCoverage: 2,
      logisticsOperatingCostReduction: 0.05,
    })
  })
})

describe('booked support employee effects', () => {
  const employees = [
    { employeeId: 'wrestler', role: 'wrestler', managerId: 'manager' },
    {
      employeeId: 'manager',
      role: 'manager',
      managementAbility: { charisma: 100, promo_skill: 100 },
    },
    {
      employeeId: 'referee',
      role: 'referee',
      officiatingAbility: {
        rule_knowledge: 100, decision_speed: 100, positioning: 100, composure: 100,
      },
    },
    {
      employeeId: 'announcer',
      role: 'announcer',
      broadcastAbility: {
        voice_quality: 100, hype_delivery: 100, diction: 100, ring_knowledge: 100,
      },
    },
  ]

  it('rewards only a manager booked with their assigned wrestler in a promo or interview', () => {
    expect(getSegmentStaffEffects({
      segmentType: 'promo',
      wrestlerIds: ['wrestler', 'manager'],
      participantIds: ['wrestler', 'manager'],
    }, employees)).toMatchObject({
      ratingAdjustment: 0,
      fanImpact: 2,
      contributions: [{ role: 'manager', employeeId: 'manager', fanImpact: 2 }],
    })

    expect(getSegmentStaffEffects({
      segmentType: 'promo',
      wrestlerIds: ['wrestler'],
      participantIds: ['wrestler'],
    }, employees).fanImpact).toBe(0)
    expect(getSegmentStaffEffects({
      segmentType: 'match',
      wrestlerIds: ['wrestler', 'manager'],
      participantIds: ['wrestler', 'manager'],
    }, employees).fanImpact).toBe(0)
  })

  it('uses selected referee and announcer quality without changing the match outcome', () => {
    expect(getSegmentStaffEffects({
      segmentType: 'mainEvent',
      refereeId: 'referee',
      announcerId: 'announcer',
      wrestlerIds: ['wrestler'],
      participantIds: ['wrestler', 'referee', 'announcer'],
    }, employees)).toMatchObject({
      ratingAdjustment: 0.45,
      fanImpact: 2,
      contributions: [
        { role: 'referee', employeeId: 'referee', ratingAdjustment: 0.25 },
        { role: 'announcer', employeeId: 'announcer', ratingAdjustment: 0.2, fanImpact: 2 },
      ],
    })
  })

  it('caps and reports actual fan contributions when several support employees appear', () => {
    const wrestlersAndManagers = Array.from({ length: 3 }, (_, index) => [
      { employeeId: `wrestler-${index}`, role: 'wrestler', managerId: `manager-${index}` },
      {
        employeeId: `manager-${index}`,
        role: 'manager',
        managementAbility: { charisma: 100, promo_skill: 100 },
      },
    ]).flat()
    const effects = getSegmentStaffEffects({
      segmentType: 'promo',
      announcerId: 'announcer',
      participantIds: ['announcer', ...wrestlersAndManagers.map((employee) => employee.employeeId)],
    }, [...wrestlersAndManagers, ...employees.filter((employee) => employee.employeeId === 'announcer')])

    expect(effects.fanImpact).toBe(4)
    expect(effects.contributions.reduce((sum, contribution) => sum + contribution.fanImpact, 0))
      .toBe(effects.fanImpact)
  })
})
