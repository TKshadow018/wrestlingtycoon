import { describe, expect, it } from 'vitest'
import { buildEventPostmortemRecommendations } from './eventPostmortemRecommendations'

const eventWithMatches = (format, count = 3) => ({
  type: 'success',
  segments: Array.from({ length: count }, () => ({
    segmentType: 'match',
    matchStipulation: format,
  })),
})

describe('event postmortem recommendations', () => {
  it('recommends rotating a format that dominates the current and recent event cards', () => {
    const recommendations = buildEventPostmortemRecommendations({
      segments: [
        ...Array.from({ length: 3 }, () => ({ segmentType: 'match', matchStipulation: 'singles' })),
        { segmentType: 'promo' },
      ],
      recentEvents: [
        eventWithMatches('singles'),
        eventWithMatches('singles'),
        eventWithMatches('cage'),
      ],
    })

    expect(recommendations).toEqual([
      expect.objectContaining({
        id: 'repeatedMatchType',
        format: 'singles',
        repeatedEvents: 2,
        titleKey: 'dashboard.eventResults.recommendations.repeatedMatchType.title',
      }),
    ])
  })

  it('does not flag a format with fewer than three current matches or only one recent event', () => {
    expect(buildEventPostmortemRecommendations({
      segments: [
        { segmentType: 'match', matchStipulation: 'singles' },
        { segmentType: 'match', matchStipulation: 'singles' },
      ],
      recentEvents: [eventWithMatches('singles'), eventWithMatches('singles')],
    })).toEqual([])

    expect(buildEventPostmortemRecommendations({
      segments: Array.from({ length: 3 }, () => ({ segmentType: 'match', matchStipulation: 'singles' })),
      recentEvents: [eventWithMatches('singles')],
    })).toEqual([])
  })

  it('keeps the card varied when match formats are balanced across recent shows', () => {
    expect(buildEventPostmortemRecommendations({
      segments: [
        { segmentType: 'match', matchStipulation: 'singles' },
        { segmentType: 'match', matchStipulation: 'tag-team' },
        { segmentType: 'match', matchStipulation: 'cage' },
      ],
      recentEvents: [
        eventWithMatches('singles'),
        eventWithMatches('tag-team'),
        eventWithMatches('cage'),
      ],
    })).toEqual([])
  })
})
