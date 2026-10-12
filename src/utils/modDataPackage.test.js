import { describe, expect, it } from 'vitest'
import { buildModDataPackageFromState, validateModDataPackage } from './modDataPackage'

describe('mod data packages', () => {
  it('builds a package from state and normalizes title, sponsor, and event data', () => {
    const result = buildModDataPackageFromState({
      roster: {
        titles: [
          {
            name: '  Tag Team Championship ',
            division: 'doubles',
            holderEmployeeIds: ['team-a', 2, 'team-b', 'team-c'],
            prestige: 1200,
            isActive: true,
          },
          { titleId: 'empty-title', name: ' ' },
        ],
      },
      market: {
        sponsorOffers: [{
          sponsorId: 'sponsor-a',
          name: 'Sponsor A',
          sponsorType: 'unsupported',
          tier: 99,
          dailyPayout: -10,
          trust: 150,
          contractWeeks: 0,
        }],
        eventTemplates: [{
          eventId: 'event-a',
          name: '  Grand Slam ',
          productionScale: 0,
          popularityWeight: 8,
          setupCost: -2,
          hype: 110,
          risk: -5,
        }],
      },
    })

    expect(result).toMatchObject({
      type: 'wrestling-tycoon-mod-package',
      version: 1,
      modules: {
        titles: [{
          titleId: 'mod-title-1',
          name: 'Tag Team Championship',
          division: 'doubles',
          holderEmployeeId: 'team-a',
          holderEmployeeIds: ['team-a', 'team-b'],
          prestige: 1000,
        }],
        sponsorOffers: [{
          sponsorId: 'sponsor-a',
          name: 'Sponsor A',
          sponsorType: 'digital',
          tier: 7,
          dailyPayout: 0,
          trust: 100,
          contractWeeks: 1,
        }],
        eventTemplates: [{
          eventId: 'event-a',
          name: 'Grand Slam',
          productionScale: 1,
          popularityWeight: 5,
          setupCost: 0,
          hype: 100,
          risk: 0,
        }],
      },
    })
    expect(result.createdAt).toEqual(expect.any(Number))
  })

  it('handles an empty or missing state without inventing module entries', () => {
    expect(buildModDataPackageFromState(null).modules).toEqual({
      titles: [],
      sponsorOffers: [],
      eventTemplates: [],
    })
  })

  it('rejects non-object payloads and missing module objects', () => {
    expect(validateModDataPackage(null)).toMatchObject({
      ok: false,
      errors: ['Package must be a JSON object.'],
      data: null,
    })
    expect(validateModDataPackage({ type: 'wrong' })).toMatchObject({
      ok: false,
      errors: ['Package must include a modules object.'],
      data: null,
    })
  })

  it('reports invalid module shapes and packages with no valid entries', () => {
    const result = validateModDataPackage({
      modules: {
        titles: {},
        sponsorOffers: [],
        eventTemplates: [{ name: '' }],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'titles must be an array.',
      'sponsorOffers has no valid entries.',
      'eventTemplates has no valid entries.',
      'No valid modules found. Include at least one of: titles, sponsorOffers, eventTemplates.',
    ]))
    expect(result.warnings).toContain('eventTemplates: skipped 1 invalid entries.')
  })

  it('normalizes valid module entries, warns about skipped and duplicate entries, and omits invalid names', () => {
    const result = validateModDataPackage({
      modules: {
        titles: [
          { titleId: 'title-1', name: ' World Title ', division: 'invalid', prestige: 'bad' },
          { titleId: 'title-1', name: 'Duplicate Title' },
          { name: '' },
        ],
        sponsorOffers: [
          { offerId: 'offer-1', sponsorId: 'sponsor-1', name: 'Offer', sponsorType: 'title', eventMultiplier: 9 },
          { offerId: 'offer-1', sponsorId: 'sponsor-2', name: 'Duplicate Offer' },
          { name: '' },
        ],
        eventTemplates: [
          { eventId: 'event-1', name: 'Show', templateKey: 'shared-key', risk: 'invalid' },
          { eventId: 'event-2', name: 'Duplicate Show', templateKey: 'shared-key' },
          { name: '' },
        ],
      },
    })

    expect(result.ok).toBe(true)
    expect(result.data.modules.titles).toHaveLength(1)
    expect(result.data.modules.titles[0]).toMatchObject({
      division: 'singles',
      image: '/Belt/world.png',
      prestige: 50,
      holderEmployeeId: null,
      holderEmployeeIds: [],
    })
    expect(result.data.modules.sponsorOffers[0].eventMultiplier).toBe(3)
    expect(result.data.modules.eventTemplates[0].risk).toBe(20)
    expect(result.warnings).toEqual(expect.arrayContaining([
      'titles: skipped 1 invalid entries.',
      'titles: removed 1 duplicate entries by titleId.',
      'sponsorOffers: skipped 1 invalid entries.',
      'sponsorOffers: removed 1 duplicate entries by offerId.',
      'eventTemplates: skipped 1 invalid entries.',
      'eventTemplates: removed 1 duplicate entries by templateKey.',
    ]))
  })
})
