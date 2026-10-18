import { describe, expect, it } from 'vitest'
import {
  advanceCompetitorStrategies,
  applyCompetitorGimmickCopy,
  createInitialCompetitorCompanies,
  createInitialCompetitorWorld,
  getCompetitorStrategyModifiers,
  normalizeCompetitorHeadlines,
  normalizeCompetitorCompanies,
  normalizeCompetitorWorld,
  simulateWeeklyCompetitorEvents,
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
      nameKey: 'dashboard.competitorIntel.rivals.titanRingFederation',
      aggression: 2,
      strategyId: 'talentAcquisition',
      copiedGimmicks: [],
    })
    expect(normalizeCompetitorCompanies([
      { id: companies[0].id, name: 'Saved Rival', strategyId: 'unknown' },
    ])[0]).not.toHaveProperty('name')
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
      headlineKey: 'dashboard.competitorIntel.news.strategyShift',
      headlineValues: { strategyId: 'counterProgramming' },
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

  it('stores seeded competitor names as locale keys instead of display text', () => {
    const companies = createInitialCompetitorCompanies()

    expect(companies.map(({ nameKey }) => nameKey)).toEqual([
      'dashboard.competitorIntel.rivals.titanRingFederation',
      'dashboard.competitorIntel.rivals.primeGrappleAlliance',
      'dashboard.competitorIntel.rivals.globalSlamNetwork',
    ])
    expect(companies.every(({ name }) => name === undefined)).toBe(true)
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
      sourceWrestlerId: 'wrestler-1',
      sourceWrestlerName: 'Ace',
      copiedDay: 22,
    }])
    expect(copied.newsItem).toMatchObject({
      type: 'gimmickCopy',
      rivalId: companies[0].id,
      copiedArchetypeId: 'technical',
      headlineKey: 'dashboard.competitorIntel.news.gimmickCopied',
      headlineValues: { archetypeId: 'technical', wrestlerName: 'Ace' },
    })
    expect(applyCompetitorGimmickCopy(copied.companies, input).newsItem).toBeNull()
  })

  it('creates a shared 100-wrestler pool and assigns 20–30 wrestlers to each existing rival', () => {
    const { companies, wrestlerPool } = createInitialCompetitorWorld()

    expect(companies.map(({ id }) => id)).toEqual(['comp-1', 'comp-2', 'comp-3'])
    expect(wrestlerPool).toHaveLength(100)
    expect(new Set(wrestlerPool.map(({ employeeId }) => employeeId)).size).toBe(100)
    expect(new Set(wrestlerPool.map(({ countryKey }) => countryKey))).toEqual(new Set([
      'india', 'bangladesh', 'pakistan', 'nepal', 'sriLanka', 'afghanistan',
    ]))

    const assignedIds = companies.flatMap((company) => company.rosterIds)
    expect(new Set(assignedIds).size).toBe(assignedIds.length)
    companies.forEach((company) => {
      const roster = wrestlerPool.filter(({ promotionId }) => promotionId === company.id)
      expect(roster.length).toBeGreaterThanOrEqual(20)
      expect(roster.length).toBeLessThanOrEqual(30)
      expect(new Set(roster.map(({ employeeId }) => employeeId))).toEqual(new Set(company.rosterIds))
      expect(company.champions).toEqual(expect.arrayContaining([
        expect.objectContaining({ titleKey: 'dashboard.competitorIntel.rivalTitles.world' }),
        expect.objectContaining({ titleKey: 'dashboard.competitorIntel.rivalTitles.tagTeam' }),
      ]))
      expect(company.champions.every(({ championIds }) => (
        championIds.every((id) => company.rosterIds.includes(id))
      ))).toBe(true)
    })

    expect(wrestlerPool.filter(({ promotionId }) => !promotionId).length).toBeGreaterThanOrEqual(10)
  })

  it('migrates old saves to the three seeded rivals and one shared pool', () => {
    const legacyCompanies = [
      { id: 'comp-1', name: 'Saved Titan', strategyId: 'audienceExpansion' },
      { id: 'comp-2', name: 'Saved Prime', strategyId: 'talentAcquisition' },
      { id: 'comp-3', name: 'Saved Global', strategyId: 'counterProgramming' },
      { id: 'comp-south-asia', name: 'Obsolete extra promotion' },
    ]
    const migrated = normalizeCompetitorWorld(legacyCompanies, null, 14)

    expect(migrated.companies).toHaveLength(3)
    expect(migrated.companies.map(({ nameKey }) => nameKey)).toEqual([
      'dashboard.competitorIntel.rivals.titanRingFederation',
      'dashboard.competitorIntel.rivals.primeGrappleAlliance',
      'dashboard.competitorIntel.rivals.globalSlamNetwork',
    ])
    expect(migrated.companies.every((company) => !Object.hasOwn(company, 'name'))).toBe(true)
    expect(migrated.companies.map(({ strategyId }) => strategyId)).toEqual([
      'audienceExpansion', 'talentAcquisition', 'counterProgramming',
    ])
    expect(migrated.wrestlerPool).toHaveLength(100)
    expect(migrated.companies.flatMap(({ rosterIds }) => rosterIds).length).toBeGreaterThanOrEqual(60)
  })

  it('simulates all three rival cards at each week boundary and updates title defenses', () => {
    const initial = createInitialCompetitorWorld()
    const beforeWeek = simulateWeeklyCompetitorEvents(
      initial.companies,
      initial.wrestlerPool,
      6,
    )
    expect(beforeWeek.newsItems).toHaveLength(0)
    expect(beforeWeek.companies.every(({ eventsRun }) => eventsRun === 0)).toBe(true)

    const firstWeek = simulateWeeklyCompetitorEvents(
      initial.companies,
      initial.wrestlerPool,
      7,
    )
    expect(firstWeek.newsItems).toHaveLength(3)
    firstWeek.companies.forEach((company) => {
      const roster = firstWeek.wrestlerPool.filter(({ promotionId }) => promotionId === company.id)
      expect(company.eventsRun).toBe(1)
      expect(company.lastEvent).toMatchObject({ day: 7, week: 1 })
      expect(company.lastEvent.matches.length).toBeGreaterThanOrEqual(9)
      expect(company.champions.every(({ lastDefendedDay }) => lastDefendedDay === 7)).toBe(true)
      expect(roster.reduce((total, wrestler) => total + wrestler.wins + wrestler.losses, 0))
        .toBe(company.lastEvent.matches.reduce((total, match) => total + match.participantIds.length, 0))
    })
    expect(firstWeek.newsItems.map(({ rivalId }) => rivalId)).toEqual(['comp-1', 'comp-2', 'comp-3'])

    const secondWeek = simulateWeeklyCompetitorEvents(firstWeek.companies, firstWeek.wrestlerPool, 14)
    expect(secondWeek.newsItems).toHaveLength(3)
    expect(secondWeek.companies.every(({ eventsRun, lastEvent }) => (
      eventsRun === 2 && lastEvent.day === 14 && lastEvent.week === 2
    ))).toBe(true)
  })

  it('sets the next rival card to the next future weekly boundary after save hydration', () => {
    const initial = createInitialCompetitorWorld()
    const firstWeek = simulateWeeklyCompetitorEvents(initial.companies, initial.wrestlerPool, 7)
    const rehydrated = normalizeCompetitorWorld(
      firstWeek.companies,
      firstWeek.wrestlerPool,
      14,
    )

    expect(rehydrated.companies.every(({ nextEventDay }) => nextEventDay === 21)).toBe(true)
  })

  it('changes a rival champion when a dominant challenger wins the weekly title match', () => {
    const initial = createInitialCompetitorWorld()
    const company = initial.companies[0]
    const worldTitle = company.champions.find(({ titleId }) => titleId.endsWith('-world'))
    const challengerId = company.rosterIds.find((id) => (
      id !== worldTitle.championId
      && !company.champions.find(({ titleId }) => titleId.endsWith('-tag-team'))?.championIds.includes(id)
    ))
    const wrestlerPool = initial.wrestlerPool.map((wrestler) => ({
      ...wrestler,
      ...(wrestler.promotionId === company.id ? { popularity: 0, skill: 0 } : {}),
      ...(wrestler.employeeId === challengerId ? { popularity: 100, skill: 100 } : {}),
    }))

    const result = simulateWeeklyCompetitorEvents(initial.companies, wrestlerPool, 7)
    const updatedChampion = result.companies[0].champions.find(({ titleId }) => titleId === worldTitle.titleId)

    expect(updatedChampion.championId).toBe(challengerId)
    expect(result.newsItems[0]).toMatchObject({
      headlineKey: 'dashboard.competitorIntel.news.rivalWeeklyEvent',
      headlineValues: { eventNumber: 1 },
    })
  })

  it('migrates legacy English news text to a neutral localized fallback', () => {
    const [legacy] = normalizeCompetitorHeadlines([{
      id: 'legacy-news',
      type: 'legacyType',
      rivalId: 'comp-1',
      rivalName: 'Titan Ring Federation',
      headline: 'Old hardcoded headline',
      headlineValues: { rivalName: 'Titan Ring Federation' },
      fanImpact: 2,
    }])

    expect(legacy).toMatchObject({
      id: 'legacy-news',
      headlineKey: 'dashboard.competitorIntel.news.legacy',
      headlineValues: {},
      fanImpact: 2,
    })
    expect(legacy).not.toHaveProperty('headline')
    expect(legacy).not.toHaveProperty('rivalName')
    expect(legacy.headlineValues).not.toHaveProperty('rivalName')
  })

  it('keeps only stable identifiers and dynamic names in localized headline values', () => {
    const [headline] = normalizeCompetitorHeadlines([{
      id: 'localized-news',
      rivalId: 'comp-1',
      headlineKey: 'dashboard.competitorIntel.news.strategyShift',
      headlineValues: {
        strategyId: 'counterProgramming',
        strategy: 'Counter-Programming',
        note: 'The rival changed its plans.',
      },
    }])

    expect(headline.headlineValues).toEqual({ strategyId: 'counterProgramming' })
  })
})
