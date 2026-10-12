const FACTION_MEMBER_ROLES = new Set(['wrestler', 'manager'])
const TRACKED_HAPPINESS_ROLES = new Set(['wrestler', 'staff'])
const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])
const STORY_BEATS = new Set(['factionPromo', 'interference', 'betrayal'])
export const FACTION_STORY_BEATS = [...STORY_BEATS]

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const buildBackstagePairKey = (leftId, rightId) => (
  [leftId, rightId].sort().join('::')
)

export const normalizeFactions = (factions = [], employees = []) => {
  if (!Array.isArray(factions)) {
    return []
  }

  const employeesById = new Map(
    (employees || [])
      .filter((employee) => FACTION_MEMBER_ROLES.has(employee?.role))
      .map((employee) => [employee.employeeId, employee]),
  )
  const assignedMemberIds = new Set()

  return factions
    .map((faction) => {
      const factionId = typeof faction?.factionId === 'string' ? faction.factionId.trim() : ''
      const name = typeof faction?.name === 'string' ? faction.name.trim() : ''
      if (!factionId || !name || !Array.isArray(faction?.memberIds)) {
        return null
      }

      const memberIds = [...new Set(faction.memberIds)].filter((memberId) => {
        if (!employeesById.has(memberId) || assignedMemberIds.has(memberId)) {
          return false
        }
        assignedMemberIds.add(memberId)
        return true
      })

      return memberIds.length > 0 ? { factionId, name, memberIds } : null
    })
    .filter(Boolean)
}

export const normalizeFactionRivalries = (rivalries, factions) => {
  if (!Array.isArray(rivalries)) {
    return []
  }

  const factionsById = new Map(factions.map((faction) => [faction.factionId, faction]))
  const normalizedByKey = new Map()

  rivalries.forEach((rivalry) => {
    const factionIds = Array.isArray(rivalry?.factionIds)
      ? [...new Set(rivalry.factionIds.filter((id) => typeof id === 'string'))].sort()
      : []
    if (
      factionIds.length !== 2
      || factionIds[0] === factionIds[1]
      || !factionsById.has(factionIds[0])
      || !factionsById.has(factionIds[1])
    ) {
      return
    }

    const pairKey = factionIds.join('::')
    const heat = clamp(Math.round(Number(rivalry?.heat) || 0), 0, 100)
    if (heat === 0) {
      return
    }

    normalizedByKey.set(pairKey, {
      pairKey,
      factionIds,
      factionNames: factionIds.map((id) => factionsById.get(id).name),
      heat,
      lastEventDay: Number.isInteger(Number(rivalry?.lastEventDay))
        ? Number(rivalry.lastEventDay)
        : null,
      lastAction: typeof rivalry?.lastAction === 'string' ? rivalry.lastAction : null,
    })
  })

  return [...normalizedByKey.values()]
}

const STORY_BEAT_EFFECTS = {
  factionPromo: { heatGain: 5, fanImpact: 8 },
  interference: { heatGain: 12, fanImpact: 18 },
  betrayal: { heatGain: 15, fanImpact: 15 },
}

export const resolveFactionStorylines = ({
  factions: factionInput = [],
  factionRivalries: rivalryInput = [],
  employees = [],
  segments = [],
  day,
}) => {
  const factions = normalizeFactions(factionInput, employees)
  const factionsById = new Map(factions.map((faction) => [faction.factionId, faction]))
  const rivalriesByKey = new Map(
    normalizeFactionRivalries(rivalryInput, factions)
      .map((rivalry) => [rivalry.pairKey, { ...rivalry, heat: Math.max(0, rivalry.heat - 1) }]),
  )
  const storyOutcomes = []
  let rivalryHeatScore = 0
  let fanImpact = 0

  ;(Array.isArray(segments) ? segments : []).forEach((segment) => {
    const action = segment?.storyBeat
    if (segment?.segmentType !== 'promo' || !STORY_BEAT_EFFECTS[action]) {
      return
    }

    const sourceFaction = factionsById.get(segment.sourceFactionId)
    const targetFaction = factionsById.get(segment.targetFactionId)
    if (!sourceFaction || !targetFaction || sourceFaction.factionId === targetFaction.factionId) {
      return
    }

    let betrayedEmployeeId = null
    if (action === 'betrayal') {
      if (!sourceFaction.memberIds.includes(segment.betrayerId)) {
        return
      }
      if (targetFaction.memberIds.includes(segment.betrayerId)) {
        return
      }

      betrayedEmployeeId = segment.betrayerId
      sourceFaction.memberIds = sourceFaction.memberIds.filter((id) => id !== betrayedEmployeeId)
      targetFaction.memberIds.push(betrayedEmployeeId)
    }

    const { heatGain, fanImpact: storyFanImpact } = STORY_BEAT_EFFECTS[action]
    const factionIds = [sourceFaction.factionId, targetFaction.factionId].sort()
    const pairKey = factionIds.join('::')
    const existing = rivalriesByKey.get(pairKey) || {
      pairKey,
      factionIds,
      factionNames: factionIds.map((id) => factionsById.get(id).name),
      heat: 0,
      lastEventDay: null,
      lastAction: null,
    }
    const nextHeat = Math.min(100, existing.heat + heatGain)
    rivalriesByKey.set(pairKey, {
      ...existing,
      factionNames: factionIds.map((id) => factionsById.get(id).name),
      heat: nextHeat,
      lastEventDay: day,
      lastAction: action,
    })

    rivalryHeatScore += heatGain + Math.round(nextHeat / 10)
    fanImpact += storyFanImpact
    storyOutcomes.push({
      action,
      sourceFactionId: sourceFaction.factionId,
      sourceFactionName: sourceFaction.name,
      targetFactionId: targetFaction.factionId,
      targetFactionName: targetFaction.name,
      betrayedEmployeeId,
      betrayedEmployeeName: betrayedEmployeeId
        ? employees.find((employee) => employee.employeeId === betrayedEmployeeId)?.name || betrayedEmployeeId
        : null,
      heatGain,
      resultingHeat: nextHeat,
      fanImpact: storyFanImpact,
    })
  })

  const nextFactionRivalries = [...rivalriesByKey.values()]
    .filter((rivalry) => rivalry.heat > 0)
    .sort((left, right) => right.heat - left.heat)
    .slice(0, 80)

  return {
    factions: factions.filter((faction) => faction.memberIds.length > 0),
    factionRivalries: nextFactionRivalries,
    storyOutcomes,
    rivalryHeatScore,
    fanImpact,
  }
}

export const normalizeBackstageChemistry = (chemistry, employees = []) => {
  const employeesById = new Map((employees || []).map((employee) => [employee.employeeId, employee]))
  if (!chemistry || typeof chemistry !== 'object' || Array.isArray(chemistry)) {
    return {}
  }

  return Object.entries(chemistry).reduce((normalized, [pairKey, value]) => {
    const ids = pairKey.split('::')
    const numericValue = Number(value)
    if (
      ids.length !== 2
      || !employeesById.has(ids[0])
      || !employeesById.has(ids[1])
      || !Number.isFinite(numericValue)
    ) {
      return normalized
    }

    normalized[buildBackstagePairKey(ids[0], ids[1])] = clamp(Math.round(numericValue), -100, 100)
    return normalized
  }, {})
}

const addPairDelta = (deltas, leftId, rightId, amount) => {
  if (!leftId || !rightId || leftId === rightId || amount === 0) {
    return
  }

  const pairKey = buildBackstagePairKey(leftId, rightId)
  deltas.set(pairKey, (deltas.get(pairKey) || 0) + amount)
}

const getFactionForMember = (factionsByMemberId, employeeId) => factionsByMemberId.get(employeeId) || null

const getSegmentChemistryAdjustment = (segment, chemistry, employeesById) => {
  if (!MATCH_SEGMENT_TYPES.has(segment?.segmentType)) {
    return 0
  }

  const participants = [...new Set((segment.participantIds || []).filter((id) => employeesById.has(id)))]
  const ratings = []
  for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < participants.length; rightIndex += 1) {
      ratings.push(chemistry[buildBackstagePairKey(participants[leftIndex], participants[rightIndex])] || 0)
    }
  }

  if (ratings.length === 0) {
    return 0
  }

  const averageChemistry = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
  return Number(clamp(averageChemistry / 200, -0.5, 0.5).toFixed(1))
}

export const updateBackstageChemistry = ({
  chemistry: chemistryInput = {},
  factions: factionInput = [],
  employees = [],
  segments = [],
}) => {
  const employeesById = new Map((employees || []).map((employee) => [employee.employeeId, employee]))
  const factions = normalizeFactions(factionInput, employees)
  const factionsByMemberId = new Map()
  factions.forEach((faction) => {
    faction.memberIds.forEach((memberId) => factionsByMemberId.set(memberId, faction))
  })
  const chemistry = normalizeBackstageChemistry(chemistryInput, employees)
  const pairDeltas = new Map()
  const trackedMoraleDeltas = new Map()

  const currentSegmentValues = (Array.isArray(segments) ? segments : []).map((segment) => ({
    ...segment,
    chemistryRatingAdjustment: getSegmentChemistryAdjustment(segment, chemistry, employeesById),
  }))

  currentSegmentValues.forEach((segment) => {
    const action = STORY_BEATS.has(segment.storyBeat) ? segment.storyBeat : null
    if (segment.segmentType === 'promo' && action === 'betrayal') {
      const sourceFaction = factions.find((faction) => faction.factionId === segment.sourceFactionId)
      const targetFaction = factions.find((faction) => faction.factionId === segment.targetFactionId)
      if (
        sourceFaction?.memberIds.includes(segment.betrayerId)
        && targetFaction
        && !targetFaction.memberIds.includes(segment.betrayerId)
      ) {
        sourceFaction.memberIds
          .filter((memberId) => memberId !== segment.betrayerId)
          .forEach((memberId) => {
            addPairDelta(pairDeltas, segment.betrayerId, memberId, -25)
            for (const employeeId of [segment.betrayerId, memberId]) {
              if (TRACKED_HAPPINESS_ROLES.has(employeesById.get(employeeId)?.role)) {
                trackedMoraleDeltas.set(employeeId, (trackedMoraleDeltas.get(employeeId) || 0) - 1)
              }
            }
          })
        sourceFaction.memberIds = sourceFaction.memberIds.filter((id) => id !== segment.betrayerId)
        targetFaction.memberIds.push(segment.betrayerId)
        factionsByMemberId.set(segment.betrayerId, targetFaction)
      }
      return
    }

    const participantIds = [...new Set((segment.participantIds || []).filter((id) => employeesById.has(id)))]
    if (participantIds.length < 2) {
      return
    }

    for (let leftIndex = 0; leftIndex < participantIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < participantIds.length; rightIndex += 1) {
        const leftId = participantIds[leftIndex]
        const rightId = participantIds[rightIndex]
        const left = employeesById.get(leftId)
        const right = employeesById.get(rightId)
        const leftFaction = getFactionForMember(factionsByMemberId, leftId)
        const rightFaction = getFactionForMember(factionsByMemberId, rightId)
        let delta = 0

        if (
          segment.segmentType === 'promo'
          && action === 'interference'
          && leftFaction
          && rightFaction
          && leftFaction.factionId !== rightFaction.factionId
          && [leftFaction.factionId, rightFaction.factionId].includes(segment.sourceFactionId)
          && [leftFaction.factionId, rightFaction.factionId].includes(segment.targetFactionId)
        ) {
          delta = -3
        } else if (leftFaction && rightFaction && leftFaction.factionId === rightFaction.factionId) {
          delta = 3
        } else if (segment.matchType === 'tagTeam') {
          const leftTeam = (segment.team1Ids || []).includes(leftId) ? 'team1'
            : (segment.team2Ids || []).includes(leftId) ? 'team2' : null
          const rightTeam = (segment.team1Ids || []).includes(rightId) ? 'team1'
            : (segment.team2Ids || []).includes(rightId) ? 'team2' : null
          delta = leftTeam && leftTeam === rightTeam ? 3 : (leftTeam && rightTeam ? -2 : 0)
        } else if (
          MATCH_SEGMENT_TYPES.has(segment.segmentType)
          && left.role === 'wrestler'
          && right.role === 'wrestler'
        ) {
          delta = -2
        } else if (
          segment.segmentType === 'promo'
          && action === 'factionPromo'
          && leftFaction
          && rightFaction
          && leftFaction.factionId !== rightFaction.factionId
        ) {
          delta = -1
        } else if (left.role !== 'wrestler' || right.role !== 'wrestler') {
          delta = 1
        }

        addPairDelta(pairDeltas, leftId, rightId, delta)
      }
    }
  })

  pairDeltas.forEach((delta, pairKey) => {
    chemistry[pairKey] = clamp((chemistry[pairKey] || 0) + delta, -100, 100)
    if (delta >= 8) {
      for (const employeeId of pairKey.split('::')) {
        if (TRACKED_HAPPINESS_ROLES.has(employeesById.get(employeeId)?.role)) {
          trackedMoraleDeltas.set(employeeId, (trackedMoraleDeltas.get(employeeId) || 0) + 1)
        }
      }
    }
  })

  Object.keys(chemistry).forEach((pairKey) => {
    if (chemistry[pairKey] === 0) {
      delete chemistry[pairKey]
    }
  })

  return {
    chemistry,
    segments: currentSegmentValues,
    employeeHappinessDeltas: Object.fromEntries(trackedMoraleDeltas),
  }
}
