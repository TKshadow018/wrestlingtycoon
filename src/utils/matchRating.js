import {
  MATCH_MOMENT_ACTIONS,
  MATCH_PLAN_DIAGNOSTIC_CODES,
  MATCH_RATING_WEIGHTS,
  normalizeMatchPlan,
} from '../data/matchPlanning'

export const MATCH_RATING_DIAGNOSTIC_CODES = [
  ...MATCH_PLAN_DIAGNOSTIC_CODES,
  'clusteredMoments', 'weakFinish', 'excessiveRisk', 'missingPerformers',
]

const DIAGNOSTIC_CODES = new Set(MATCH_RATING_DIAGNOSTIC_CODES)
const ACTIONS = new Map(MATCH_MOMENT_ACTIONS.map((action) => [action.id, action]))
const FACTORS = Object.keys(MATCH_RATING_WEIGHTS)
const clamp = (value, min = 0, max = 10) => Math.max(min, Math.min(max, value))
const round = (value) => Math.round(value * 100) / 100
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
const attribute = (value, fallback = 0) => {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : fallback
}

export const sanitizeRatingBreakdown = (raw) => {
  const source = record(raw)
  if (![...FACTORS, 'contextAdjustment'].every((key) => typeof source[key] === 'number' && Number.isFinite(source[key]))) {
    return null
  }
  return {
    ...Object.fromEntries(FACTORS.map((key) => [key, round(clamp(source[key]))])),
    contextAdjustment: round(clamp(source.contextAdjustment, -0.5, 0.5)),
    warnings: [...new Set((Array.isArray(source.warnings) ? source.warnings : [])
      .filter((code) => typeof code === 'string' && DIAGNOSTIC_CODES.has(code)))],
  }
}

const performerScore = (wrestler, action) => {
  const source = record(wrestler)
  const skill = attribute(source.skill)
  const abilityKey = { technical: 'technics', aerial: 'high_fly_ability', striking: 'strength', brawl: 'strength', prop: 'strength' }[action?.category]
  const ability = record(source.wrestling_ability)[abilityKey]
  const relevantSkill = ability === undefined ? skill : skill * 0.75 + attribute(ability) * 0.25
  return (relevantSkill * 0.75 + attribute(source.stamina, 100) * 0.25) / 10
}

const scoreStructure = (moments, length) => {
  if (!moments.length) return 0
  const opening = moments.findIndex((moment) => ACTIONS.get(moment.actionType).pacingRole === 'opening' && moment.atMinute / length <= 0.35)
  const escalation = moments.findIndex((moment, index) => index > opening
    && ACTIONS.get(moment.actionType).pacingRole === 'escalation'
    && moment.atMinute / length >= 0.2)
  const turningPoint = moments.some((moment) => ['comeback', 'nearFall'].includes(moment.actionType) && moment.atMinute / length >= 0.5)
  const close = moments.at(-1)
  const closingSupport = ['finishSupport', 'turningPoint'].includes(ACTIONS.get(close.actionType).pacingRole) && close.atMinute / length >= 0.7
  const rising = moments.slice(1).filter((moment, index) => ACTIONS.get(moment.actionType).intensity >= ACTIONS.get(moments[index].actionType).intensity).length
  return (opening >= 0 ? 2 : 0) + (escalation >= 0 ? 2 : 0) + (turningPoint ? 2 : 0)
    + (closingSupport ? 2 : 0) + (moments.length > 1 ? 2 * rising / (moments.length - 1) : 0)
}

const scorePacing = (moments, length, warnings) => {
  if (!moments.length) return 0
  const count = moments.length
  const variety = new Set(moments.map(({ actionType }) => actionType)).size / count
  const categories = new Set(moments.map(({ actionType }) => ACTIONS.get(actionType).category)).size
  const coverage = (moments.at(-1).atMinute - moments[0].atMinute + 1) / length
  const gaps = moments.slice(1).map((moment, index) => moment.atMinute - moments[index].atMinute)
  const clustered = gaps.filter((gap) => gap === 0).length / Math.max(1, gaps.length)
  if (clustered > 0.25) warnings.push('clusteredMoments')
  const spacing = gaps.length
    ? average(gaps.map((gap) => clamp(1 - Math.abs(gap - length / count) / (length / count), 0, 1)))
    : 0.5
  return variety * 4 + Math.min(2, categories * 0.5) + coverage * 2 + spacing * 2
    - (1 - variety) * 2 - clustered * 3
}

const scoreFinish = (plan, moments, warnings) => {
  const last = moments.at(-1)
  let coherence = 0
  if (last) {
    const action = last.actionType
    if (plan.finishType === 'submission') coherence = action === 'technicalExchange' ? 9 : 4
    else if (plan.finishType === 'countout') coherence = action === 'outsideRingBrawl' ? 9 : 2
    else if (plan.finishType === 'dq') coherence = ['usesProp', 'refereeDistraction'].includes(action) ? 9 : 2
    else coherence = action === 'nearFall' ? 9 : action === 'comeback' ? 6 : 3
    coherence *= 0.5 + 0.5 * last.atMinute / plan.matchLengthMinutes
  }
  if (coherence < 5) warnings.push('weakFinish')
  return coherence
}

export const rateMatch = (input = {}) => {
  const { wrestlers, plan: rawPlan, segmentType, matchType, matchStipulation } = record(input)
  const performers = [...new Map((Array.isArray(wrestlers) ? wrestlers : [])
    .filter((wrestler) => typeof wrestler?.employeeId === 'string' && wrestler.employeeId.trim())
    .map((wrestler) => [wrestler.employeeId.trim(), wrestler])).values()]
  const source = record(rawPlan)
  const normalized = normalizeMatchPlan({
    ...source,
    segmentType: segmentType ?? source.segmentType,
    matchType: matchType ?? source.matchType,
    wrestlerIds: performers.map(({ employeeId }) => employeeId.trim()),
  })
  const { plan, errors } = normalized
  const warnings = [...normalized.warnings, ...errors, ...normalized.adjustments].map(({ code }) => code)
  if (performers.length < 2) warnings.push('missingPerformers')
  const byId = new Map(performers.map((wrestler) => [wrestler.employeeId.trim(), wrestler]))
  // Repaired legacy values remain usable by callers, but invalid authored events earn no execution credit.
  const invalidMomentIds = new Set(errors.filter(({ momentId }) => momentId).map(({ momentId }) => momentId))
  const moments = plan.plannedMoments.filter(({ momentId }) => !invalidMomentIds.has(momentId))
  const length = plan.matchLengthMinutes || 10
  const stamina = average(performers.map((wrestler) => attribute(wrestler.stamina, 100)))
  const capability = average(performers.map((wrestler) => performerScore(wrestler)))
  const execution = average(moments.map((moment) => {
    const action = ACTIONS.get(moment.actionType)
    const actor = byId.get(moment.actorId)
    const target = byId.get(moment.targetId) || actor
    return performerScore(actor, action) * 0.7 + performerScore(target, action) * 0.3
      + action.intensity * (attribute(actor.skill) / 100 - 0.5)
      - action.risk * (1 - attribute(actor.stamina, 100) / 100) * 3
  }))
  const invalidShare = invalidMomentIds.size / Math.max(1, plan.plannedMoments.length + errors.filter(({ code }) => code === 'invalidActor').length)
  const durationDemand = Math.max(0, length - 15) / 45
  const averageRisk = average(moments.map(({ actionType }) => ACTIONS.get(actionType).risk))
  const riskMultiplier = { balanced: 1, risky: 1.35, chaotic: 1.8 }[plan.riskLevel] || 1
  const propCount = moments.filter(({ propId }) => propId).length
  const riskManagement = moments.length
    ? 10 - averageRisk * riskMultiplier * (1 - stamina / 100) * 8
      - propCount / moments.length * 2 - Math.max(0, propCount - 2) * 0.8
      - durationDemand * (1 - stamina / 100) * 3
    : 0
  if ((riskManagement < 5 && moments.length) || averageRisk * riskMultiplier > 0.9) warnings.push('excessiveRisk')
  const actualSegmentType = segmentType ?? source.segmentType
  const actualMatchType = matchType ?? source.matchType
  const actualStipulation = matchStipulation ?? source.matchStipulation
  const incompatibleFinish = (['noDisqualification', 'hardcore', 'tlc', 'extremeRules', 'hellInACell', 'noHoldsBarred'].includes(actualStipulation) && plan.finishType === 'dq')
    || (actualStipulation === 'submission' && plan.finishType !== 'submission')
  if (incompatibleFinish) warnings.push('weakFinish')
  const contextAdjustment = (actualSegmentType === 'titleMatch' ? 0.3 : actualSegmentType === 'mainEvent' ? 0.2 : 0)
    + (actualMatchType === 'tagTeam' ? 0.1 : 0)
    + (['hardcore', 'ladder', 'tlc', 'steelCage'].includes(actualStipulation) && moments.length ? 0.1 : 0)
    - (incompatibleFinish ? 0.3 : 0)
  const ratingBreakdown = sanitizeRatingBreakdown({
    performerCapability: capability,
    eventExecution: execution * Math.max(0, 1 - invalidShare) - durationDemand,
    matchStructure: scoreStructure(moments, length),
    varietyAndPacing: scorePacing(moments, length, warnings),
    finishCoherence: scoreFinish(plan, moments, warnings),
    riskManagement,
    contextAdjustment,
    warnings,
  })
  const weighted = FACTORS.reduce((sum, key) => sum + ratingBreakdown[key] * MATCH_RATING_WEIGHTS[key], 0)
  return {
    matchRating: Math.round(clamp(weighted + ratingBreakdown.contextAdjustment, 1, 10) * 10) / 10,
    ratingBreakdown,
  }
}

export const buildSimulatedMatchPlan = (input = {}) => {
  const source = record(input)
  const { random = Math.random, ...fields } = source
  const initial = normalizeMatchPlan(fields).plan
  const ids = [...new Set((Array.isArray(fields.wrestlerIds) ? fields.wrestlerIds : [])
    .filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))]
  const sample = () => {
    const value = typeof random === 'function' ? random() : 0.5
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 0.999999) : 0.5
  }
  const pick = (values) => values[Math.floor(sample() * values.length)]
  const count = Math.max(4, Math.min(10, Math.ceil(initial.matchLengthMinutes / 5) + 2))
  const escalation = ['dominateStrikes', 'dominateKicks', 'outsideRingBrawl', 'highFlyingSequence']
  if (initial.props.length) escalation.push('usesProp')
  const plannedMoments = ids.length < 2 ? [] : Array.from({ length: count }, (_, index) => {
    const actorId = pick(ids)
    const targetId = pick(ids.filter((id) => id !== actorId))
    let actionType = index === 0 ? 'technicalExchange' : pick(escalation)
    if (index === count - 2) actionType = 'comeback'
    if (index === count - 1) {
      actionType = { pin: 'nearFall', submission: 'technicalExchange', countout: 'outsideRingBrawl', dq: 'refereeDistraction' }[initial.finishType] || 'nearFall'
    }
    return {
      momentId: `simulated-${index + 1}`, actionType, actorId, targetId,
      propId: actionType === 'usesProp' ? pick(initial.props) : null,
      atMinute: index === count - 1 ? initial.matchLengthMinutes
        : Math.round((index + 0.4 + sample() * 0.4) / count * initial.matchLengthMinutes),
    }
  })
  return normalizeMatchPlan({
    ...fields, ...initial, plannedMoments,
    winnerEmployeeId: initial.winnerEmployeeId || (fields.matchType === 'tagTeam' ? null : ids.length >= 2 ? pick(ids) : null),
    winnerTeamIds: initial.winnerTeamIds.length || fields.matchType !== 'tagTeam'
      ? initial.winnerTeamIds : pick([fields.team1Ids, fields.team2Ids]),
  }).plan
}
