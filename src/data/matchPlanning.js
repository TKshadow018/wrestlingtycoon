export const DEFAULT_MATCH_LENGTH_MINUTES = 10
export const MIN_MATCH_LENGTH_MINUTES = 1
export const MAX_MATCH_LENGTH_MINUTES = 60
export const MAX_PLANNED_MOMENTS = 60
export const MATCH_DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60]
export const MATCH_FINISH_TYPES = ['pin', 'submission', 'countout', 'dq']
export const MATCH_RISK_LEVELS = ['balanced', 'risky', 'chaotic']
export const MATCH_ACTION_CATEGORIES = ['striking', 'brawl', 'technical', 'aerial', 'drama', 'prop']
export const MATCH_RATING_WEIGHTS = {
  performerCapability: 0.2,
  eventExecution: 0.25,
  matchStructure: 0.2,
  varietyAndPacing: 0.15,
  finishCoherence: 0.1,
  riskManagement: 0.1,
}
export const MATCH_PLAN_DIAGNOSTIC_CODES = [
  'invalidDuration', 'invalidProps', 'invalidMoments', 'momentsTruncated',
  'momentIdReassigned', 'minuteAdjusted', 'invalidActor', 'invalidTarget',
  'targetRequired', 'invalidAction', 'invalidProp', 'propRequired',
  'invalidWinner', 'invalidWinnerTeam', 'invalidFinishType', 'invalidRiskLevel',
  'nonMatchDataCleared', 'emptyPlan', 'missingEscalation', 'missingTurningPoint',
  'repeatedActions', 'unusedProps', 'missingWinner',
]
export const MATCH_LENGTH_OPTIONS = Array.from(
  { length: MAX_MATCH_LENGTH_MINUTES - MIN_MATCH_LENGTH_MINUTES + 1 },
  (_, index) => index + MIN_MATCH_LENGTH_MINUTES,
)

export const MATCH_PROP_OPTIONS = [
  { id: 'chair', labelKey: 'dashboard.events.setup.execution.props.chair' },
  { id: 'table', labelKey: 'dashboard.events.setup.execution.props.table' },
  { id: 'ladder', labelKey: 'dashboard.events.setup.execution.props.ladder' },
  { id: 'kendoStick', labelKey: 'dashboard.events.setup.execution.props.kendoStick' },
  { id: 'steelSteps', labelKey: 'dashboard.events.setup.execution.props.steelSteps' },
  { id: 'announceTable', labelKey: 'dashboard.events.setup.execution.props.announceTable' },
]

export const MATCH_MOMENT_ACTIONS = [
  { id: 'dominateStrikes', labelKey: 'dashboard.events.setup.execution.momentActions.dominateStrikes', category: 'striking', targetRequired: true, propRequired: false, propAllowed: false, intensity: 0.45, risk: 0.15, pacingRole: 'escalation' },
  { id: 'dominateKicks', labelKey: 'dashboard.events.setup.execution.momentActions.dominateKicks', category: 'striking', targetRequired: true, propRequired: false, propAllowed: false, intensity: 0.55, risk: 0.2, pacingRole: 'escalation' },
  { id: 'outsideRingBrawl', labelKey: 'dashboard.events.setup.execution.momentActions.outsideRingBrawl', category: 'brawl', targetRequired: true, propRequired: false, propAllowed: false, intensity: 0.7, risk: 0.55, pacingRole: 'escalation' },
  { id: 'technicalExchange', labelKey: 'dashboard.events.setup.execution.momentActions.technicalExchange', category: 'technical', targetRequired: true, propRequired: false, propAllowed: false, intensity: 0.25, risk: 0.1, pacingRole: 'opening' },
  { id: 'highFlyingSequence', labelKey: 'dashboard.events.setup.execution.momentActions.highFlyingSequence', category: 'aerial', targetRequired: true, propRequired: false, propAllowed: false, intensity: 0.85, risk: 0.75, pacingRole: 'escalation' },
  { id: 'nearFall', labelKey: 'dashboard.events.setup.execution.momentActions.nearFall', category: 'drama', targetRequired: true, propRequired: false, propAllowed: false, intensity: 0.9, risk: 0.2, pacingRole: 'finishSupport' },
  { id: 'comeback', labelKey: 'dashboard.events.setup.execution.momentActions.comeback', category: 'drama', targetRequired: false, propRequired: false, propAllowed: false, intensity: 0.75, risk: 0.3, pacingRole: 'turningPoint' },
  { id: 'refereeDistraction', labelKey: 'dashboard.events.setup.execution.momentActions.refereeDistraction', category: 'drama', targetRequired: false, propRequired: false, propAllowed: false, intensity: 0.35, risk: 0.25, pacingRole: 'turningPoint' },
  { id: 'usesProp', labelKey: 'dashboard.events.setup.execution.momentActions.usesProp', category: 'prop', targetRequired: true, propRequired: true, propAllowed: true, intensity: 0.9, risk: 0.85, pacingRole: 'escalation' },
]

const MATCH_PROP_IDS = new Set(MATCH_PROP_OPTIONS.map(({ id }) => id))
const MATCH_MOMENT_ACTION_IDS = new Set(MATCH_MOMENT_ACTIONS.map(({ id }) => id))
const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])
const ACTION_BY_ID = new Map(MATCH_MOMENT_ACTIONS.map((action) => [action.id, action]))

const numericValue = (value) => (
  ['number', 'string', 'boolean', 'undefined'].includes(typeof value) || value === null
    ? Number(value)
    : NaN
)
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
const diagnostic = (code, momentId) => momentId === undefined ? { code } : { code, momentId }

export const clampMatchLengthMinutes = (value) => {
  const numeric = numericValue(value)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_MATCH_LENGTH_MINUTES
  }

  return Math.max(
    MIN_MATCH_LENGTH_MINUTES,
    Math.min(MAX_MATCH_LENGTH_MINUTES, Math.round(numeric)),
  )
}

const normalizeIdList = (ids = []) => Array.from(new Set(
  (Array.isArray(ids) ? ids : [])
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim()),
))

const normalizeMomentData = ({ moments = [], wrestlerIds = [], props = [], matchLengthMinutes } = {}) => {
  const errors = []
  const warnings = []
  const adjustments = []
  const validWrestlerIds = normalizeIdList(wrestlerIds)
  const validWrestlerIdSet = new Set(validWrestlerIds)
  const length = clampMatchLengthMinutes(matchLengthMinutes)
  const selectedProps = normalizeIdList(props).filter((propId) => MATCH_PROP_IDS.has(propId))
  const selectedPropSet = new Set(selectedProps)
  if (!Array.isArray(props) || props.length !== selectedProps.length) {
    adjustments.push(diagnostic('invalidProps'))
  }
  if (!Array.isArray(moments)) {
    errors.push(diagnostic('invalidMoments'))
  }
  const boundedMoments = (Array.isArray(moments) ? moments : []).slice(0, MAX_PLANNED_MOMENTS)
  if (Array.isArray(moments) && moments.length > MAX_PLANNED_MOMENTS) {
    warnings.push(diagnostic('momentsTruncated'))
  }
  // Reserve authored IDs before assigning replacements so later valid IDs stay stable.
  const reservedIds = new Set(boundedMoments.map((moment) => (
    typeof moment?.momentId === 'string' ? moment.momentId.trim() : ''
  )).filter(Boolean))
  const usedIds = new Set()
  const plannedMoments = boundedMoments
    .map((moment, index) => {
      let momentId = typeof moment?.momentId === 'string' ? moment.momentId.trim() : ''
      if (!momentId || usedIds.has(momentId)) {
        const base = `moment-${index + 1}`
        momentId = base
        let suffix = 1
        while (reservedIds.has(momentId) || usedIds.has(momentId)) {
          momentId = `${base}-${suffix++}`
        }
        adjustments.push(diagnostic('momentIdReassigned', momentId))
      }
      usedIds.add(momentId)
      const actionType = MATCH_MOMENT_ACTION_IDS.has(moment?.actionType)
        ? moment.actionType
        : MATCH_MOMENT_ACTIONS[0].id
      const actorId = validWrestlerIdSet.has(moment?.actorId) ? moment.actorId : null
      const targetId = validWrestlerIdSet.has(moment?.targetId) && moment.targetId !== actorId
        ? moment.targetId
        : null
      const propId = actionType === 'usesProp' && selectedPropSet.has(moment?.propId)
        ? moment.propId
        : null
      const requestedMinute = numericValue(moment?.atMinute)
      const atMinute = Number.isFinite(requestedMinute)
        ? Math.max(1, Math.min(length, Math.round(requestedMinute)))
        : Math.min(length, index + 1)

      const action = ACTION_BY_ID.get(actionType)
      if (actionType !== moment?.actionType) errors.push(diagnostic('invalidAction', momentId))
      if (atMinute !== requestedMinute) adjustments.push(diagnostic('minuteAdjusted', momentId))
      if (moment?.targetId != null && !targetId) {
        errors.push(diagnostic('invalidTarget', momentId))
        adjustments.push(diagnostic('invalidTarget', momentId))
      }
      if (action.targetRequired && !targetId) errors.push(diagnostic('targetRequired', momentId))
      if (moment?.propId != null && !propId) {
        adjustments.push(diagnostic('invalidProp', momentId))
        if (action.propAllowed) errors.push(diagnostic('invalidProp', momentId))
      }
      if (action.propRequired && !propId) errors.push(diagnostic('propRequired', momentId))
      if (!actorId) {
        errors.push(diagnostic('invalidActor', momentId))
        adjustments.push(diagnostic('invalidActor', momentId))
        return null
      }

      return {
        momentId,
        actionType,
        actorId,
        targetId,
        propId,
        atMinute,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.atMinute - right.atMinute)

  return {
    props: selectedProps,
    plannedMoments,
    errors,
    warnings,
    adjustments,
  }
}

export const normalizePlannedMoments = (options = {}) => {
  const { props, plannedMoments } = normalizeMomentData(record(options))
  return { props, plannedMoments }
}

export const normalizeMatchPlan = (input = {}) => {
  const source = record(input)
  if (source.segmentType != null && !MATCH_SEGMENT_TYPES.has(source.segmentType)) {
    return {
      plan: {
        matchLengthMinutes: null, props: [], plannedMoments: [],
        winnerEmployeeId: null, winnerTeamIds: [], finishType: null, riskLevel: null,
      },
      errors: [], warnings: [], adjustments: [diagnostic('nonMatchDataCleared')],
    }
  }
  const matchLengthMinutes = clampMatchLengthMinutes(source.matchLengthMinutes)
  const { props, plannedMoments, errors, warnings, adjustments } = normalizeMomentData({
    ...source, moments: source.plannedMoments ?? source.moments ?? [], matchLengthMinutes,
  })
  if (source.matchLengthMinutes !== undefined && numericValue(source.matchLengthMinutes) !== matchLengthMinutes) {
    adjustments.push(diagnostic('invalidDuration'))
  }
  const wrestlerIds = normalizeIdList(source.wrestlerIds)
  let winnerEmployeeId = wrestlerIds.includes(source.winnerEmployeeId) ? source.winnerEmployeeId : null
  let winnerTeamIds = normalizeIdList(source.winnerTeamIds)
  if (source.winnerEmployeeId != null && !winnerEmployeeId) errors.push(diagnostic('invalidWinner'))
  if (winnerTeamIds.length || (source.winnerTeamIds != null && (!Array.isArray(source.winnerTeamIds) || source.winnerTeamIds.length))) {
    const teams = [normalizeIdList(source.team1Ids), normalizeIdList(source.team2Ids)]
    const validTeams = teams.every((team) => team.length && team.every((id) => wrestlerIds.includes(id)))
      && teams[0].every((id) => !teams[1].includes(id))
    const matchesTeam = teams.some((team) => team.length === winnerTeamIds.length && team.every((id) => winnerTeamIds.includes(id)))
    if (source.matchType !== 'tagTeam' || !validTeams || !matchesTeam || source.winnerTeamIds.length !== winnerTeamIds.length) {
      errors.push(diagnostic('invalidWinnerTeam'))
      winnerTeamIds = []
    }
  }
  if (source.matchType === 'tagTeam' && winnerEmployeeId && winnerTeamIds.length && !winnerTeamIds.includes(winnerEmployeeId)) {
    errors.push(diagnostic('invalidWinner'))
    winnerEmployeeId = null
  }
  const finishType = MATCH_FINISH_TYPES.includes(source.finishType) ? source.finishType : 'pin'
  const riskLevel = MATCH_RISK_LEVELS.includes(source.riskLevel) ? source.riskLevel : 'balanced'
  if (source.finishType != null && source.finishType !== finishType) errors.push(diagnostic('invalidFinishType'))
  if (source.riskLevel != null && source.riskLevel !== riskLevel) errors.push(diagnostic('invalidRiskLevel'))
  if (!winnerEmployeeId && !winnerTeamIds.length) warnings.push(diagnostic('missingWinner'))
  if (!plannedMoments.length) warnings.push(diagnostic('emptyPlan'))
  else {
    if (!plannedMoments.some(({ actionType }) => ACTION_BY_ID.get(actionType).pacingRole === 'escalation')) warnings.push(diagnostic('missingEscalation'))
    if (!plannedMoments.some(({ actionType }) => ['nearFall', 'comeback'].includes(actionType))) warnings.push(diagnostic('missingTurningPoint'))
    if (new Set(plannedMoments.map(({ actionType }) => actionType)).size / plannedMoments.length < 0.5) warnings.push(diagnostic('repeatedActions'))
  }
  if (props.some((propId) => !plannedMoments.some((moment) => moment.propId === propId))) warnings.push(diagnostic('unusedProps'))
  return {
    plan: {
      matchLengthMinutes, props, plannedMoments, winnerEmployeeId, winnerTeamIds, finishType, riskLevel,
      ...(source.matchType === 'tagTeam' ? {
        matchType: 'tagTeam',
        team1Ids: normalizeIdList(source.team1Ids).filter((id) => wrestlerIds.includes(id)),
        team2Ids: normalizeIdList(source.team2Ids).filter((id) => wrestlerIds.includes(id)),
      } : {}),
    },
    errors, warnings, adjustments,
  }
}

export const buildDefaultPlannedMoments = ({ wrestlerIds = [], matchLengthMinutes } = {}) => {
  const validWrestlerIds = normalizeIdList(wrestlerIds)
  if (validWrestlerIds.length < 2) {
    return []
  }

  const length = clampMatchLengthMinutes(matchLengthMinutes)
  const momentCount = Math.max(2, Math.min(6, Math.ceil(length / 10)))
  const firstWrestlerId = validWrestlerIds[0]
  const secondWrestlerId = validWrestlerIds[1]
  const actionIds = ['dominateStrikes', 'technicalExchange', 'outsideRingBrawl', 'nearFall', 'comeback', 'highFlyingSequence']

  return Array.from({ length: momentCount }, (_, index) => {
    const actionType = actionIds[index % actionIds.length]
    const actorId = index % 2 === 0 ? firstWrestlerId : secondWrestlerId
    const targetId = actorId === firstWrestlerId ? secondWrestlerId : firstWrestlerId

    return {
      momentId: `moment-${index + 1}`,
      actionType,
      actorId,
      targetId,
      propId: null,
      atMinute: Math.min(length, Math.max(1, Math.round(((index + 1) / momentCount) * length))),
    }
  })
}
