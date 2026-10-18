export const COMPETITOR_HEADLINE_KEYS = new Set([
  'dashboard.competitorIntel.news.talentSigning',
  'dashboard.competitorIntel.news.pressureSuccess',
  'dashboard.competitorIntel.news.pressureFailure',
  'dashboard.competitorIntel.news.gimmickPressure',
  'dashboard.competitorIntel.news.audienceExpansion',
  'dashboard.competitorIntel.news.employeePoached',
  'dashboard.competitorIntel.news.rivalEvent',
  'dashboard.competitorIntel.news.rivalWeeklyEvent',
  'dashboard.competitorIntel.news.strategyShift',
  'dashboard.competitorIntel.news.gimmickCopied',
  'dashboard.competitorIntel.news.legacy',
])

export const COMPETITOR_RIVAL_NAME_KEYS = new Set([
  'dashboard.competitorIntel.rivals.titanRingFederation',
  'dashboard.competitorIntel.rivals.primeGrappleAlliance',
  'dashboard.competitorIntel.rivals.globalSlamNetwork',
])

const RIVAL_NAME_KEYS_BY_ID = {
  'comp-1': 'dashboard.competitorIntel.rivals.titanRingFederation',
  'comp-2': 'dashboard.competitorIntel.rivals.primeGrappleAlliance',
  'comp-3': 'dashboard.competitorIntel.rivals.globalSlamNetwork',
}

export const localizeCompetitorName = (competitor, t) => {
  const nameKey = COMPETITOR_RIVAL_NAME_KEYS.has(competitor?.nameKey)
    ? competitor.nameKey
    : COMPETITOR_RIVAL_NAME_KEYS.has(competitor?.rivalNameKey)
      ? competitor.rivalNameKey
      : RIVAL_NAME_KEYS_BY_ID[competitor?.id] || RIVAL_NAME_KEYS_BY_ID[competitor?.rivalId]

  return t(nameKey || 'dashboard.competitorIntel.rivals.unknown')
}

export const localizeCompetitorHeadline = (item, t) => {
  const headlineKey = COMPETITOR_HEADLINE_KEYS.has(item?.headlineKey)
    ? item.headlineKey
    : 'dashboard.competitorIntel.news.legacy'
  const values = {
    ...(item?.headlineValues || {}),
    rivalName: localizeCompetitorName(item, t),
  }

  if (values.strategyId) {
    values.strategy = t(`dashboard.competitorIntel.strategies.${values.strategyId}`)
  }

  if (values.archetypeId) {
    values.archetype = t(`dashboard.competitorIntel.archetypes.${values.archetypeId}`, {
      defaultValue: t('dashboard.competitorIntel.archetypes.unknown'),
    })
  }

  if (values.eventNumber != null) {
    values.eventName = t('dashboard.competitorIntel.rivalEventName', { number: values.eventNumber })
  }

  if (values.matchCount != null) {
    values.count = values.matchCount
  }

  return t(headlineKey, values)
}

export const localizeCompetitorArchetype = (archetypeId, t) => t(
  `dashboard.competitorIntel.archetypes.${archetypeId}`,
  { defaultValue: t('dashboard.competitorIntel.archetypes.unknown') },
)
