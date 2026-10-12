import { describe, expect, it } from 'vitest'
import {
  CAREER_ARC_UNLOCK_CATALOGS,
  DEFAULT_CAREER_ARC_UNLOCKS,
  applyCareerArcUnlocks,
  getNextCareerArcUnlocks,
  getUnlockedCareerArcItems,
  normalizeCareerArcUnlocks,
} from './careerArcUnlocks'

describe('career arc unlock catalog', () => {
  it('starts new promotions with a small usable set in every reward category', () => {
    expect(DEFAULT_CAREER_ARC_UNLOCKS).toMatchObject({
      venues: expect.arrayContaining(['venue-001']),
      promoStyles: ['spotlight'],
      promoSegments: ['standardPromo'],
      presentations: ['classic'],
    })
    expect(getUnlockedCareerArcItems('venues', DEFAULT_CAREER_ARC_UNLOCKS))
      .toHaveLength(DEFAULT_CAREER_ARC_UNLOCKS.venues.length)
    expect(getUnlockedCareerArcItems('promoSegments', DEFAULT_CAREER_ARC_UNLOCKS))
      .toMatchObject([{ id: 'standardPromo' }])
  })

  it('offers the next unique venue, featured-match campaign, promo segment, and presentation', () => {
    const rewards = getNextCareerArcUnlocks(DEFAULT_CAREER_ARC_UNLOCKS)

    expect(rewards.map(({ category }) => category)).toEqual([
      'venues',
      'promoStyles',
      'promoSegments',
      'presentations',
    ])
    expect(rewards.map(({ id }) => id)).toEqual([
      'venue-006',
      'hometownBuzz',
      'contractSigning',
      'championship',
    ])
  })

  it('normalizes old save data and preserves an already selected legacy venue', () => {
    const unlocks = normalizeCareerArcUnlocks({
      venues: ['venue-001', 'venue-001', 'not-a-venue'],
      promoStyles: ['spotlight', 'unknown'],
      promoSegments: ['standardPromo'],
      presentations: [],
    }, { legacyVenueId: 'venue-008' })

    expect(unlocks).toMatchObject({
      venues: expect.arrayContaining(['venue-001', 'venue-008']),
      promoStyles: ['spotlight'],
      promoSegments: ['standardPromo'],
      presentations: ['classic'],
    })
    expect(unlocks.venues).toHaveLength(6)
  })

  it('applies earned rewards idempotently and ignores unknown reward IDs', () => {
    const earned = getNextCareerArcUnlocks(DEFAULT_CAREER_ARC_UNLOCKS)
    const once = applyCareerArcUnlocks(DEFAULT_CAREER_ARC_UNLOCKS, [
      ...earned,
      { category: 'venues', id: 'missing-venue' },
      { category: 'unknown', id: 'anything' },
    ])

    expect(applyCareerArcUnlocks(once, earned)).toEqual(once)
    for (const reward of earned) {
      expect(once[reward.category]).toContain(reward.id)
    }
    expect(once.venues).not.toContain('missing-venue')
  })

  it('defines actual event bonuses and presentation themes for unlockable content', () => {
    expect(CAREER_ARC_UNLOCK_CATALOGS.promoStyles.find((item) => item.id === 'hometownBuzz'))
      .toMatchObject({ matchRatingBonus: 0.1 })
    expect(CAREER_ARC_UNLOCK_CATALOGS.promoSegments.find((item) => item.id === 'contractSigning'))
      .toMatchObject({ incomeBonus: expect.any(Number), fanBonus: expect.any(Number) })
    expect(CAREER_ARC_UNLOCK_CATALOGS.presentations.find((item) => item.id === 'championship'))
      .toMatchObject({ themeClass: expect.any(String) })
  })
})
