export const DEFAULT_MATCH_LENGTH_MINUTES = 10
export const MIN_MATCH_LENGTH_MINUTES = 1
export const MAX_MATCH_LENGTH_MINUTES = 60
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
  { id: 'dominateStrikes', labelKey: 'dashboard.events.setup.execution.momentActions.dominateStrikes' },
  { id: 'dominateKicks', labelKey: 'dashboard.events.setup.execution.momentActions.dominateKicks' },
  { id: 'outsideRingBrawl', labelKey: 'dashboard.events.setup.execution.momentActions.outsideRingBrawl' },
  { id: 'technicalExchange', labelKey: 'dashboard.events.setup.execution.momentActions.technicalExchange' },
  { id: 'highFlyingSequence', labelKey: 'dashboard.events.setup.execution.momentActions.highFlyingSequence' },
  { id: 'nearFall', labelKey: 'dashboard.events.setup.execution.momentActions.nearFall' },
  { id: 'comeback', labelKey: 'dashboard.events.setup.execution.momentActions.comeback' },
  { id: 'refereeDistraction', labelKey: 'dashboard.events.setup.execution.momentActions.refereeDistraction' },
  { id: 'usesProp', labelKey: 'dashboard.events.setup.execution.momentActions.usesProp' },
]

const MATCH_PROP_IDS = new Set(MATCH_PROP_OPTIONS.map(({ id }) => id))
const MATCH_MOMENT_ACTION_IDS = new Set(MATCH_MOMENT_ACTIONS.map(({ id }) => id))

export const clampMatchLengthMinutes = (value) => {
  const numeric = Number(value)
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

export const normalizePlannedMoments = ({ moments = [], wrestlerIds = [], props = [], matchLengthMinutes } = {}) => {
  const validWrestlerIds = normalizeIdList(wrestlerIds)
  const validWrestlerIdSet = new Set(validWrestlerIds)
  const length = clampMatchLengthMinutes(matchLengthMinutes)
  const selectedProps = normalizeIdList(props).filter((propId) => MATCH_PROP_IDS.has(propId))
  const selectedPropSet = new Set(selectedProps)
  const plannedMoments = (Array.isArray(moments) ? moments : [])
    .map((moment, index) => {
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
      const requestedMinute = Number(moment?.atMinute)
      const atMinute = Number.isFinite(requestedMinute)
        ? Math.max(1, Math.min(length, Math.round(requestedMinute)))
        : Math.min(length, index + 1)

      if (!actorId) {
        return null
      }

      return {
        momentId: typeof moment?.momentId === 'string' && moment.momentId.trim()
          ? moment.momentId.trim()
          : `moment-${index + 1}`,
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
