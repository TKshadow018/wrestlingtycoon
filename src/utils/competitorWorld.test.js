import { describe, expect, it } from 'vitest'
import {
  advanceCompetitorStrategies,
  applyCompetitorGimmickCopy,
  createInitialCompetitorCompanies,
  getCompetitorStrategyModifiers,
  normalizeCompetitorCompanies,
} from './competitorWorld'

describe('persistent competitor company world', () => {
  it('creates and restores stable competitor profiles with a valid long-term strategy', () => {
    const companies = createInitialCompetitorCompanies()
    expect(companies).toHaveLength(3)
    expect(companies.map(({ strategyId }) => strategyId)).toEqual([
      'talentAcquisition',
      'counterProgramming',
      'audienceExpansion',
    ])

    expect(normalizeCompetitorCompanies([
      { id: companies[0].id, name: 'Saved Rival', aggression: 8, strategyId: 'unknown' },
      { id: 'invalid', name: '', strategyId: 'talentAcquisition' },
    ])[0]).toMatchObject({
      id: companies[0].id,
      name: 'Saved Rival',
      aggression: 2,
      strategyId: 'talentAcquisition',
      copiedGimmicks: [],
    })
  })

  it('advances competitor strategies on their scheduled cycle and emits a news item', () => {
    const companies = createInitialCompetitorCompanies()
    const early = advanceCompetitorStrategies(companies, 14)
    const switched = advanceCompetitorStrategies(companies, 15)

    expect(early.companies[0].strategyId).toBe('talentAcquisition')
    expect(switched.companies[0].strategyId).toBe('counterProgramming')
    expect(switched.newsItems[0]).toMatchObject({
      rivalId: companies[0].id,
      strategyId: 'counterProgramming',
      type: 'strategyShift',
    })
  })

  it('makes each long-term strategy change competitor actions', () => {
    expect(getCompetitorStrategyModifiers('talentAcquisition')).toMatchObject({
      candidateSigningChance: 0.5,
      counterProgramMultiplier: 1,
    })
    expect(getCompetitorStrategyModifiers('counterProgramming').counterProgramMultiplier)
      .toBeGreaterThan(1)
    expect(getCompetitorStrategyModifiers('audienceExpansion').audiencePressure).toBeGreaterThan(0)
    expect(getCompetitorStrategyModifiers('talentAcquisition', 3).gimmickCopyPressure).toBe(6)
  })

  it('copies a wrestler archetype once per rival and records the source gimmick', () => {
    const companies = createInitialCompetitorCompanies()
    const input = {
      competitorId: companies[0].id,
      archetype: { archetypeId: 'technical', name: 'The Technician' },
      wrestler: { employeeId: 'wrestler-1', name: 'Ace' },
      day: 22,
    }
    const copied = applyCompetitorGimmickCopy(companies, input)

    expect(copied.companies[0].copiedGimmicks).toEqual([{
      archetypeId: 'technical',
      archetypeName: 'The Technician',
      sourceWrestlerId: 'wrestler-1',
      sourceWrestlerName: 'Ace',
      copiedDay: 22,
    }])
    expect(copied.newsItem).toMatchObject({
      type: 'gimmickCopy',
      rivalId: companies[0].id,
      copiedArchetypeId: 'technical',
    })
    expect(applyCompetitorGimmickCopy(copied.companies, input).newsItem).toBeNull()
  })
})
