import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import EventCustomIntroScreen from './EventCustomIntroScreen'
import EventResultsScreen from './EventResultsScreen'
import EventPreparationScreen from './EventPreparationScreen'
import MatchRatingBreakdown from './MatchRatingBreakdown'
import {
  applyCareerArcUnlocks,
  DEFAULT_CAREER_ARC_UNLOCKS,
} from '../../data/careerArcUnlocks'

const unlockedContent = applyCareerArcUnlocks(DEFAULT_CAREER_ARC_UNLOCKS, [
  { category: 'venues', id: 'venue-006' },
  { category: 'promoStyles', id: 'hometownBuzz' },
  { category: 'presentations', id: 'championship' },
])

describe('career arc event-preparation unlocks', () => {
  it('uses the regular weekly label when an event result has only the stable event ID', () => {
    const html = renderToStaticMarkup(createElement(EventResultsScreen, {
      outcome: {
        eventId: 'regular-weekly-event',
        eventName: '',
        segments: [],
      },
      onContinue: () => {},
    }))

    expect(html).toContain('Weekly Show')
    expect(html).not.toContain('Unknown Event')
  })

  it('uses the event type rather than the success status for custom event results', () => {
    const html = renderToStaticMarkup(createElement(EventResultsScreen, {
      outcome: {
        type: 'success',
        eventType: 'ppv',
        eventName: 'Season Finale',
        segments: [],
      },
      onContinue: () => {},
    }))

    expect(html).toContain('Pay-Per-View')
    expect(html).toContain('Season Finale')
    expect(html).not.toContain('Unknown Event')
  })

  it('shows injury recovery details and cancellations without presenting a cancelled match as played', () => {
    const html = renderToStaticMarkup(createElement(EventResultsScreen, {
      outcome: { segments: [{
        segmentType: 'match', matchRating: 8,
        participantDetails: [{ employeeId: 'a', name: 'Alpha', role: 'wrestler' }],
        staminaLossById: { a: 70 },
        injuries: [{ employeeId: 'a', type: 'exhaustion', occurredDay: 1, returnDay: 8 }],
      }, {
        segmentType: 'titleMatch', cancelled: true, cancellationReason: 'injury',
        matchRating: null, participantDetails: [],
      }] },
      onContinue: () => {},
    }))
    expect(html).toContain('Alpha is injured')
    expect(html).toContain('7 days')
    expect(html).toContain('Match cancelled')
    expect(html).toContain('70')
  })

  it('ignores malformed rating breakdowns and unrecognized result diagnostics', () => {
    expect(renderToStaticMarkup(createElement(MatchRatingBreakdown, {
      breakdown: { eventExecution: Infinity }, planWarnings: null,
    }))).toBe('')
    const html = renderToStaticMarkup(createElement(MatchRatingBreakdown, {
      breakdown: {
        performerCapability: 8, eventExecution: 7, matchStructure: 6,
        varietyAndPacing: 5, finishCoherence: 8, riskManagement: 7,
        contextAdjustment: 0, warnings: [],
      },
      planWarnings: [{ code: 'unknown-diagnostic' }],
    }))
    expect(html).not.toContain('unknown-diagnostic')
  })

  it('explains match ratings and distinguishes selected props from used props', () => {
    const html = renderToStaticMarkup(createElement(EventResultsScreen, {
      outcome: {
        segments: [{
          segmentType: 'match', matchRating: 7.5, props: ['chair', 'table'],
          participantDetails: [{ employeeId: 'a', role: 'wrestler', name: 'Alpha' }, { employeeId: 'b', role: 'wrestler', name: 'Bravo' }],
          plannedMoments: [{ momentId: 'one', actionType: 'usesProp', actorId: 'a', targetId: 'b', propId: 'chair', atMinute: 2 }],
          ratingBreakdown: {
            performerCapability: 8, eventExecution: 7, matchStructure: 6,
            varietyAndPacing: 5, finishCoherence: 8, riskManagement: 7, contextAdjustment: 0,
            warnings: [],
          },
        }],
      },
      onContinue: () => {},
    }))
    expect(html).toContain('Rating breakdown')
    expect(html).toContain('Event execution')
    expect(html).toContain('Selected props')
    expect(html).toContain('Used props')
    expect(html).toContain('with Chair')
  })

  it('offers unlocked venues, featured-match campaigns, and presentation options only', () => {
    const html = renderToStaticMarkup(createElement(EventPreparationScreen, {
      event: { eventId: 'ppv-1', type: 'ppv', name: 'Season Finale' },
      employees: [],
      titles: [],
      sponsors: [],
      ticketFees: { ppv: 45 },
      ticketPricingRecommendation: {
        recommendedTicketPrice: 50,
        priceLowerBound: 22.5,
        priceUpperBound: 67.5,
      },
      eventPreparation: null,
      unlocks: unlockedContent,
      modVenues: [{
        id: 'mod-venue',
        name: 'Modded Arena',
        location: 'North City',
        capacity: 12000,
        facilities: 4,
      }],
      onSave: () => {},
      onCancel: () => {},
    }))

    expect(html).toContain('Surma Elite Stadium')
    expect(html).toContain('Modded Arena')
    expect(html).not.toContain('Chattogram Champions Arena')
    expect(html).toContain('value="hometownBuzz"')
    expect(html).not.toContain('value="nationalSpotlight"')
    expect(html).toContain('value="championship"')
    expect(html).not.toContain('value="retro"')
    expect(html).toContain('Recommended ticket price: $50')
    expect(html).toContain('Safe pricing range: $22.5–$67.5')
  })

  it('applies the selected presentation theme to the event intro', () => {
    const html = renderToStaticMarkup(createElement(EventCustomIntroScreen, {
      event: { name: 'Season Finale', imageUrl: '/events/finale.png' },
      presentationId: 'championship',
      onComplete: () => {},
    }))

    expect(html).toContain('data-presentation="championship"')
    expect(html).toMatch(/presentationChampionship/)
  })

  it('shows the faction promo beat and betrayal in event results', () => {
    const html = renderToStaticMarkup(createElement(EventResultsScreen, {
      outcome: {
        eventName: 'Season Finale',
        eventType: 'ppv',
        hype: 80,
        overallRating: 8,
        income: 10000,
        expenses: 5000,
        fanDelta: 25,
        prestigeDelta: 2,
        segments: [],
        factionStories: [
          {
            action: 'factionPromo',
            sourceFactionName: 'The Aces',
            targetFactionName: 'Blaze Club',
            heatGain: 5,
            fanImpact: 8,
          },
          {
            action: 'betrayal',
            sourceFactionName: 'The Aces',
            targetFactionName: 'Blaze Club',
            betrayedEmployeeName: 'Coach',
            heatGain: 15,
            fanImpact: 15,
          },
        ],
        postmortem: {
          recommendations: [{
            id: 'repeatedMatchType',
            format: 'singles',
            currentSharePercent: 75,
            recentShows: 2,
            titleKey: 'dashboard.eventResults.recommendations.repeatedMatchType.title',
            messageKey: 'dashboard.eventResults.recommendations.repeatedMatchType.message',
            actionKey: 'dashboard.eventResults.recommendations.repeatedMatchType.action',
          }],
          fanFactors: [],
          prestigeFactors: [],
          moneyFactors: [],
        },
      },
      onContinue: () => {},
    }))

    expect(html).toContain('Faction Storylines')
    expect(html).toContain('The Aces called out Blaze Club')
    expect(html).toContain('Coach betrayed The Aces for Blaze Club')
    expect(html).toContain('Actionable Recommendations')
    expect(html).toContain('75%')
    expect(html).toContain('Mix in a different stipulation')
  })
})
