import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import EventCustomIntroScreen from './EventCustomIntroScreen'
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
      eventPreparation: null,
      unlocks: unlockedContent,
      onSave: () => {},
      onCancel: () => {},
    }))

    expect(html).toContain('Surma Elite Stadium')
    expect(html).not.toContain('Chattogram Champions Arena')
    expect(html).toContain('value="hometownBuzz"')
    expect(html).not.toContain('value="nationalSpotlight"')
    expect(html).toContain('value="championship"')
    expect(html).not.toContain('value="retro"')
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
})
