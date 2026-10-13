const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])
const RECENT_EVENT_WINDOW = 3
const MIN_CURRENT_MATCHES = 3
const MIN_DOMINANT_SHARE = 0.6
const MIN_REPEATED_EVENTS = 2

const getMatchFormat = (segment) => {
  if (!MATCH_SEGMENT_TYPES.has(segment?.segmentType)) {
    return null
  }

  const format = String(segment?.matchStipulation || segment?.matchType || '').trim().toLowerCase()
  return format || null
}

const countFormats = (segments) => {
  const counts = new Map()
  let matchCount = 0

  ;(Array.isArray(segments) ? segments : []).forEach((segment) => {
    const format = getMatchFormat(segment)
    if (!format) {
      return
    }
    matchCount += 1
    counts.set(format, (counts.get(format) || 0) + 1)
  })

  return { counts, matchCount }
}

export const buildEventPostmortemRecommendations = ({ segments = [], recentEvents = [] } = {}) => {
  const current = countFormats(segments)
  if (current.matchCount < MIN_CURRENT_MATCHES) {
    return []
  }

  const dominant = [...current.counts.entries()]
    .sort((left, right) => right[1] - left[1])[0]
  if (!dominant || dominant[1] / current.matchCount < MIN_DOMINANT_SHARE) {
    return []
  }

  const [format, dominantCount] = dominant
  const relevantEvents = (Array.isArray(recentEvents) ? recentEvents : [])
    .filter((event) => event?.type === 'success' && Array.isArray(event.segments))
    .slice(-RECENT_EVENT_WINDOW)
  const repeatedEvents = relevantEvents.filter((event) => (
    countFormats(event.segments).counts.has(format)
  )).length

  if (repeatedEvents < MIN_REPEATED_EVENTS) {
    return []
  }

  return [{
    id: 'repeatedMatchType',
    format,
    currentSharePercent: Math.round((dominantCount / current.matchCount) * 100),
    currentMatchCount: current.matchCount,
    repeatedEvents,
    titleKey: 'dashboard.eventResults.recommendations.repeatedMatchType.title',
    messageKey: 'dashboard.eventResults.recommendations.repeatedMatchType.message',
    actionKey: 'dashboard.eventResults.recommendations.repeatedMatchType.action',
  }]
}
