const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const getInitialPoints = (wrestler) => {
  const popularity = Number(wrestler?.popularity || 0)
  return Math.round(popularity * 10)
}

const buildMatchKey = (entry, participantIds) => {
  const day = Number(entry?.day || 0)
  const eventName = entry?.eventName || ''
  const segmentType = entry?.segmentType || ''
  const matchType = entry?.matchType || ''
  const winnerEmployeeId = entry?.winnerEmployeeId || ''
  const winnerTeamIds = Array.isArray(entry?.winnerTeamIds) ? [...entry.winnerTeamIds].sort().join(',') : ''
  return `${day}|${eventName}|${segmentType}|${matchType}|${participantIds.join(',')}|${winnerEmployeeId}|${winnerTeamIds}`
}

export const collectUniqueMatches = (wrestlers) => {
  const unique = new Map()

  wrestlers.forEach((wrestler) => {
    const history = Array.isArray(wrestler?.matchStats?.matchHistory)
      ? wrestler.matchStats.matchHistory
      : []

    history.forEach((entry) => {
      if (!MATCH_SEGMENT_TYPES.has(entry?.segmentType)) {
        return
      }

      const participants = (Array.isArray(entry?.participantDetails) ? entry.participantDetails : [])
        .filter((participant) => participant?.role === 'wrestler' && participant?.employeeId)
      const participantIds = participants.map((participant) => participant.employeeId).sort()

      if (participantIds.length < 2) {
        return
      }

      const key = buildMatchKey(entry, participantIds)
      if (unique.has(key)) {
        return
      }

      const winnerTeamIds = Array.isArray(entry?.winnerTeamIds)
        ? entry.winnerTeamIds.filter(Boolean)
        : []
      const winnerIds = winnerTeamIds.length > 0
        ? winnerTeamIds
        : (entry?.winnerEmployeeId ? [entry.winnerEmployeeId] : [])

      unique.set(key, {
        day: Number(entry?.day || 0),
        participants,
        participantIds,
        winnerIds,
      })
    })
  })

  return [...unique.values()].sort((a, b) => a.day - b.day)
}

export const calculateRanking = (wrestlers) => {
  const activeWrestlers = (wrestlers || []).filter((employee) => employee?.role === 'wrestler')
  if (activeWrestlers.length === 0) {
    return []
  }

  const pointsById = new Map()
  const recordById = new Map()

  activeWrestlers.forEach((wrestler) => {
    const basePoints = getInitialPoints(wrestler)
    pointsById.set(wrestler.employeeId, basePoints)
    recordById.set(wrestler.employeeId, {
      wins: 0,
      losses: 0,
      matches: 0,
      pointDelta: 0,
    })
  })

  const initialSorted = [...activeWrestlers]
    .sort((a, b) => {
      const pointDiff = (pointsById.get(b.employeeId) || 0) - (pointsById.get(a.employeeId) || 0)
      if (pointDiff !== 0) return pointDiff
      return a.name.localeCompare(b.name)
    })
  const initialRankById = new Map(initialSorted.map((wrestler, index) => [wrestler.employeeId, index + 1]))

  const uniqueMatches = collectUniqueMatches(activeWrestlers)

  uniqueMatches.forEach((match) => {
    const participants = match.participantIds.filter((id) => pointsById.has(id))
    if (participants.length < 2) {
      return
    }

    const winners = new Set((match.winnerIds || []).filter((id) => participants.includes(id)))
    const losers = participants.filter((id) => !winners.has(id))

    participants.forEach((id) => {
      const record = recordById.get(id)
      if (record) {
        record.matches += 1
      }
    })

    if (winners.size === 0 || losers.length === 0) {
      return
    }

    winners.forEach((winnerId) => {
      const record = recordById.get(winnerId)
      if (record) {
        record.wins += 1
      }
    })

    losers.forEach((loserId) => {
      const record = recordById.get(loserId)
      if (record) {
        record.losses += 1
      }
    })

    const deltaById = new Map()

    winners.forEach((winnerId) => {
      losers.forEach((loserId) => {
        const winnerPoints = pointsById.get(winnerId) || 0
        const loserPoints = pointsById.get(loserId) || 0
        const upsetFactor = (loserPoints - winnerPoints) * 0.04
        const gain = clamp(6 + upsetFactor, 3, 24)
        const loss = clamp(gain * 0.7, 2, 18)

        deltaById.set(winnerId, (deltaById.get(winnerId) || 0) + gain)
        deltaById.set(loserId, (deltaById.get(loserId) || 0) - loss)
      })
    })

    deltaById.forEach((delta, wrestlerId) => {
      pointsById.set(wrestlerId, Math.max(0, (pointsById.get(wrestlerId) || 0) + delta))
      const record = recordById.get(wrestlerId)
      if (record) {
        record.pointDelta += delta
      }
    })
  })

  const ranked = activeWrestlers
    .map((wrestler) => {
      const points = pointsById.get(wrestler.employeeId) || 0
      const record = recordById.get(wrestler.employeeId) || {
        wins: 0,
        losses: 0,
        matches: 0,
        pointDelta: 0,
      }

      return {
        ...wrestler,
        rankPoints: Math.round(points),
        ...record,
      }
    })
    .sort((a, b) => {
      if (b.rankPoints !== a.rankPoints) {
        return b.rankPoints - a.rankPoints
      }
      if ((b.popularity || 0) !== (a.popularity || 0)) {
        return (b.popularity || 0) - (a.popularity || 0)
      }
      return a.name.localeCompare(b.name)
    })
    .map((wrestler, index) => {
      const initialRank = initialRankById.get(wrestler.employeeId) || index + 1
      return {
        ...wrestler,
        rank: index + 1,
        rankDelta: initialRank - (index + 1),
      }
    })

  return ranked
}

export const calculateTeamRanking = ({ teams = [], employees = [], division = 'male' } = {}) => {
  const wrestlerEmployees = (employees || []).filter((employee) => employee?.role === 'wrestler')
  if (!Array.isArray(teams) || teams.length === 0 || wrestlerEmployees.length === 0) {
    return []
  }

  const maleRanked = calculateRanking(wrestlerEmployees.filter((employee) => employee?.gender === 'male'))
  const femaleRanked = calculateRanking(wrestlerEmployees.filter((employee) => employee?.gender === 'female'))
  const maleById = new Map(maleRanked.map((employee) => [employee.employeeId, employee]))
  const femaleById = new Map(femaleRanked.map((employee) => [employee.employeeId, employee]))
  const employeeById = new Map(wrestlerEmployees.map((employee) => [employee.employeeId, employee]))
  const normalizedDivision = division === 'female' ? 'female' : 'male'

  const rankedTeams = (teams || [])
    .map((team) => {
      const members = (team?.memberIds || [])
        .map((id) => employeeById.get(id))
        .filter(Boolean)

      if (members.length === 0) {
        return null
      }

      const hasMale = members.some((member) => member.gender === 'male')
      const hasFemale = members.some((member) => member.gender === 'female')
      const isMixed = hasMale && hasFemale
      const shouldInclude = normalizedDivision === 'male' ? hasMale : hasFemale

      if (!shouldInclude) {
        return null
      }

      const pointsSource = normalizedDivision === 'male' ? maleById : femaleById
      const divisionMembers = members.filter((member) => member.gender === normalizedDivision)
      const scoringMembers = divisionMembers.length > 0 ? divisionMembers : members
      const points = scoringMembers.map((member) => Number(pointsSource.get(member.employeeId)?.rankPoints || 0))
      const averagePoints = points.length > 0
        ? points.reduce((sum, value) => sum + value, 0) / points.length
        : 0

      return {
        ...team,
        isMixed,
        memberEmployees: members,
        teamRankPoints: Math.round(averagePoints),
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.teamRankPoints !== left.teamRankPoints) {
        return right.teamRankPoints - left.teamRankPoints
      }
      return (left.name || '').localeCompare(right.name || '')
    })
    .map((team, index) => ({
      ...team,
      teamRank: index + 1,
    }))

  return rankedTeams
}
