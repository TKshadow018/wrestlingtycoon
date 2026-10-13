const STRATEGY_ORDER = ['talentAcquisition', 'counterProgramming', 'audienceExpansion']

const COMPETITOR_SEEDS = [
  { id: 'comp-1', name: 'Titan Ring Federation', aggression: 1.1, strategyId: 'talentAcquisition' },
  { id: 'comp-2', name: 'Prime Grapple Alliance', aggression: 0.95, strategyId: 'counterProgramming' },
  { id: 'comp-3', name: 'Global Slam Network', aggression: 1.05, strategyId: 'audienceExpansion' },
]

export const COMPETITOR_STRATEGY_CATALOG = [
  {
    id: 'talentAcquisition',
    name: 'Talent Acquisition',
    candidateSigningChance: 0.5,
    counterProgramMultiplier: 1,
    audiencePressure: 0,
  },
  {
    id: 'counterProgramming',
    name: 'Counter-Programming',
    candidateSigningChance: 0.2,
    counterProgramMultiplier: 1.35,
    audiencePressure: 0,
  },
  {
    id: 'audienceExpansion',
    name: 'Audience Expansion',
    candidateSigningChance: 0.3,
    counterProgramMultiplier: 1,
    audiencePressure: 7,
  },
]

const VALID_STRATEGY_IDS = new Set(COMPETITOR_STRATEGY_CATALOG.map(({ id }) => id))

const toCopiedGimmick = (gimmick) => {
  const archetypeId = String(gimmick?.archetypeId || '').trim()
  const archetypeName = String(gimmick?.archetypeName || '').trim()
  const sourceWrestlerId = String(gimmick?.sourceWrestlerId || '').trim()
  if (!archetypeId || !archetypeName || !sourceWrestlerId) {
    return null
  }

  return {
    archetypeId,
    archetypeName,
    sourceWrestlerId,
    sourceWrestlerName: String(gimmick?.sourceWrestlerName || sourceWrestlerId),
    copiedDay: Math.max(1, Math.round(Number(gimmick?.copiedDay) || 1)),
  }
}

export const createInitialCompetitorCompanies = () => COMPETITOR_SEEDS.map((company, index) => ({
  ...company,
  nextStrategyDay: 15 + (index * 7),
  copiedGimmicks: [],
  lastStrategyChangeDay: null,
}))

export const normalizeCompetitorCompanies = (companies) => {
  const savedById = new Map(
    (Array.isArray(companies) ? companies : [])
      .filter((company) => typeof company?.id === 'string')
      .map((company) => [company.id, company]),
  )

  return COMPETITOR_SEEDS.map((seed, index) => {
    const saved = savedById.get(seed.id) || {}
    const strategyId = VALID_STRATEGY_IDS.has(saved.strategyId) ? saved.strategyId : seed.strategyId
    return {
      ...seed,
      name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : seed.name,
      aggression: Math.max(0.5, Math.min(2, Number(saved.aggression) || seed.aggression)),
      strategyId,
      nextStrategyDay: Math.max(
        1,
        Math.round(Number(saved.nextStrategyDay) || (15 + index * 7)),
      ),
      lastStrategyChangeDay: Number.isInteger(Number(saved.lastStrategyChangeDay))
        ? Number(saved.lastStrategyChangeDay)
        : null,
      copiedGimmicks: (Array.isArray(saved.copiedGimmicks) ? saved.copiedGimmicks : [])
        .map(toCopiedGimmick)
        .filter(Boolean),
    }
  })
}

export const getCompetitorStrategyModifiers = (strategyId, copiedGimmickCount = 0) => {
  const strategy = COMPETITOR_STRATEGY_CATALOG.find((item) => item.id === strategyId)
    || COMPETITOR_STRATEGY_CATALOG[0]
  return {
    ...strategy,
    gimmickCopyPressure: Math.min(8, Math.max(0, Math.round(Number(copiedGimmickCount) || 0)) * 2),
  }
}

export const advanceCompetitorStrategies = (companies, day) => {
  if (!Number.isInteger(day) || day < 1) {
    throw new Error('A valid game day is required to advance competitor strategies')
  }

  const newsItems = []
  const nextCompanies = normalizeCompetitorCompanies(companies).map((company) => {
    if (day < company.nextStrategyDay) {
      return company
    }

    const currentIndex = Math.max(0, STRATEGY_ORDER.indexOf(company.strategyId))
    const strategyId = STRATEGY_ORDER[(currentIndex + 1) % STRATEGY_ORDER.length]
    const nextStrategyDay = company.nextStrategyDay + 28
    newsItems.push({
      rivalId: company.id,
      rivalName: company.name,
      day,
      type: 'strategyShift',
      strategyId,
      headline: `${company.name} shifted its long-term focus to ${strategyId}.`,
      fanImpact: 0,
      prestigeImpact: 0,
    })

    return {
      ...company,
      strategyId,
      lastStrategyChangeDay: day,
      nextStrategyDay,
    }
  })

  return { companies: nextCompanies, newsItems }
}

export const applyCompetitorGimmickCopy = (companies, {
  competitorId,
  archetype,
  wrestler,
  day,
} = {}) => {
  const normalized = normalizeCompetitorCompanies(companies)
  const competitor = normalized.find((company) => company.id === competitorId)
  const archetypeId = String(archetype?.archetypeId || '').trim()
  const archetypeName = String(archetype?.name || '').trim()
  const sourceWrestlerId = String(wrestler?.employeeId || '').trim()

  if (!competitor || !archetypeId || !archetypeName || !sourceWrestlerId) {
    return { companies: normalized, newsItem: null }
  }
  if (competitor.copiedGimmicks.some((entry) => entry.archetypeId === archetypeId)) {
    return { companies: normalized, newsItem: null }
  }

  const copiedGimmick = {
    archetypeId,
    archetypeName,
    sourceWrestlerId,
    sourceWrestlerName: String(wrestler.name || sourceWrestlerId),
    copiedDay: day,
  }
  const nextCompanies = normalized.map((company) => (
    company.id === competitorId
      ? { ...company, copiedGimmicks: [...company.copiedGimmicks, copiedGimmick] }
      : company
  ))

  return {
    companies: nextCompanies,
    newsItem: {
      rivalId: competitor.id,
      rivalName: competitor.name,
      day,
      type: 'gimmickCopy',
      copiedArchetypeId: archetypeId,
      copiedArchetypeName: archetypeName,
      sourceWrestlerId,
      sourceWrestlerName: String(wrestler.name || sourceWrestlerId),
      fanImpact: 0,
      prestigeImpact: 0,
      headline: `${competitor.name} copied ${archetypeName} from ${wrestler.name || sourceWrestlerId}.`,
    },
  }
}
