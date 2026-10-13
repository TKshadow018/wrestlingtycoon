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
            isWomenOnly: true,
            isActive: true,
            holderEmployeeIds: ['team-a', 2, 'team-b', 'team-c'],
            prestige: 1200,
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
        wrestlerArchetypes: [{
          archetypeId: 'technical',
          name: 'Technical Specialist',
          alignment: 'face',
          style: 'technical',
        }],
        modWrestlers: [{
          personId: 'mod-ace',
          name: 'Ace',
          ring_name: 'The Technician',
          gender: 'male',
          popularity: 88,
          archetypeId: 'technical',
          salary_demand: { monthly_wage: 25000, per_match_salary: 4000, additional_bonus: 5000 },
          wrestling_ability: {
            strength: 75,
            technics: 90,
            high_fly_ability: 60,
            leg_stamina: 80,
            body_stamina: 82,
            head_stamina: 85,
          },
        }],
        modVenues: [{
          id: 'mod-venue',
          name: 'Sky Dome',
          location: 'North City',
          capacity: 18000,
          rentFee: 32000,
          facilities: 4,
          isIndoor: true,
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
          isWomenOnly: true,
          isActive: true,
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
        wrestlerArchetypes: expect.arrayContaining([
          expect.objectContaining({ archetypeId: 'technical', name: 'Technical Specialist' }),
        ]),
        rosterData: [{
          personId: 'mod-ace',
          name: 'Ace',
          role: 'wrestler',
          archetypeId: 'technical',
          popularity: 88,
          salary_demand: expect.objectContaining({ monthly_wage: 25000 }),
        }],
        venues: [{
          id: 'mod-venue',
          name: 'Sky Dome',
          capacity: 18000,
          rentFee: 32000,
          facilities: 4,
        }],
      },
    })
    expect(result.createdAt).toEqual(expect.any(Number))
  })

  it('handles an empty or missing state without inventing module entries', () => {
    expect(buildModDataPackageFromState(null).modules).toMatchObject({
      titles: [],
      sponsorOffers: [],
      eventTemplates: [],
      rosterData: [],
      venues: [],
    })
    expect(buildModDataPackageFromState(null).modules.wrestlerArchetypes)
      .toEqual(expect.arrayContaining([expect.objectContaining({ archetypeId: 'technician' })]))
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
        wrestlerArchetypes: [{ name: '' }],
        rosterData: [{ name: '' }],
        venues: [{ name: '' }],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'titles must be an array.',
      'sponsorOffers has no valid entries.',
      'eventTemplates has no valid entries.',
      'No valid modules found. Include at least one of: titles, sponsorOffers, eventTemplates, wrestlerArchetypes, rosterData, venues.',
    ]))
    expect(result.warnings).toEqual(expect.arrayContaining([
      'wrestlerArchetypes: skipped 1 invalid entries.',
      'rosterData: skipped 1 invalid entries.',
      'venues: skipped 1 invalid entries.',
      'eventTemplates: skipped 1 invalid entries.',
    ]))
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
        wrestlerArchetypes: [
          { archetypeId: 'technical', name: 'Technician', alignment: 'face', style: 'technical' },
          { archetypeId: 'technical', name: 'Duplicate', alignment: 'heel', style: 'powerhouse' },
          { name: '' },
        ],
        rosterData: [
          {
            personId: 'mod-ace',
            name: 'Ace',
            archetypeId: 'technical',
            popularity: 150,
            salary_demand: { monthly_wage: 24000, per_match_salary: 5000, additional_bonus: 8000 },
            wrestling_ability: {
              strength: 90,
              technics: 80,
              high_fly_ability: 70,
              leg_stamina: 85,
              body_stamina: 90,
              head_stamina: 75,
            },
          },
          { personId: 'mod-manager', name: 'Not a wrestler', role: 'manager' },
          { personId: 'mod-ace', name: 'Duplicate Ace', role: 'wrestler' },
        ],
        venues: [
          { id: 'venue-extra', name: 'Extra Arena', capacity: 20000, location: 'Metro', rentFee: 10000, facilities: 5 },
          { id: 'venue-extra', name: 'Duplicate Venue', capacity: 9000, location: 'Elsewhere' },
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
    expect(result.data.modules.wrestlerArchetypes).toHaveLength(1)
    expect(result.data.modules.rosterData).toHaveLength(1)
    expect(result.data.modules.rosterData[0]).toMatchObject({
      role: 'wrestler',
      archetypeId: 'technical',
      popularity: 100,
    })
    expect(result.data.modules.venues).toHaveLength(1)
    expect(result.data.modules.venues[0]).toMatchObject({ capacity: 20000, facilities: 5 })
    expect(result.warnings).toEqual(expect.arrayContaining([
      'titles: skipped 1 invalid entries.',
      'titles: removed 1 duplicate entries by titleId.',
      'sponsorOffers: skipped 1 invalid entries.',
      'sponsorOffers: removed 1 duplicate entries by offerId.',
      'eventTemplates: skipped 1 invalid entries.',
      'eventTemplates: removed 1 duplicate entries by templateKey.',
      'wrestlerArchetypes: skipped 1 invalid entries.',
      'wrestlerArchetypes: removed 1 duplicate entries by archetypeId.',
      'rosterData: skipped 1 invalid entries.',
      'rosterData: removed 1 duplicate entries by personId.',
      'venues: skipped 1 invalid entries.',
      'venues: removed 1 duplicate entries by id.',
    ]))
  })
})
