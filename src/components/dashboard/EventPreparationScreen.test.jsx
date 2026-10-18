import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import EventCustomIntroScreen from './EventCustomIntroScreen'
import EventResultsScreen from './EventResultsScreen'
import EventPreparationScreen from './EventPreparationScreen'
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
