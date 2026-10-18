import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import {
  localizeCompetitorArchetype,
  localizeCompetitorHeadline,
  localizeCompetitorName,
} from './competitorNews'

const t = i18n.t.bind(i18n)

describe('competitor news localization', () => {
  it('localizes seeded names from stable IDs or known locale keys', () => {
    expect(localizeCompetitorName({ id: 'comp-1' }, t))
      .toBe(i18n.t('dashboard.competitorIntel.rivals.titanRingFederation'))
    expect(localizeCompetitorName({
      nameKey: 'dashboard.competitorIntel.rivals.primeGrappleAlliance',
    }, t)).toBe(i18n.t('dashboard.competitorIntel.rivals.primeGrappleAlliance'))
    expect(localizeCompetitorName({
      rivalNameKey: 'dashboard.competitorIntel.rivals.primeGrappleAlliance',
    }, t)).toBe(i18n.t('dashboard.competitorIntel.rivals.primeGrappleAlliance'))
    expect(localizeCompetitorName({ id: 'missing-rival' }, t))
      .toBe(i18n.t('dashboard.competitorIntel.rivals.unknown'))
  })

  it('localizes known headline values and uses a neutral fallback for unknown keys', () => {
    expect(localizeCompetitorHeadline({
      rivalId: 'comp-3',
      headlineKey: 'dashboard.competitorIntel.news.strategyShift',
      headlineValues: { strategyId: 'audienceExpansion' },
    }, t)).toBe(i18n.t('dashboard.competitorIntel.news.strategyShift', {
      rivalName: i18n.t('dashboard.competitorIntel.rivals.globalSlamNetwork'),
      strategy: i18n.t('dashboard.competitorIntel.strategies.audienceExpansion'),
    }))

    expect(localizeCompetitorHeadline({
      rivalId: 'comp-1',
      headlineKey: 'dashboard.competitorIntel.news.rivalWeeklyEvent',
      headlineValues: { eventNumber: 3, matchCount: 10 },
    }, t)).toBe(i18n.t('dashboard.competitorIntel.news.rivalWeeklyEvent', {
      rivalName: i18n.t('dashboard.competitorIntel.rivals.titanRingFederation'),
      eventName: i18n.t('dashboard.competitorIntel.rivalEventName', { number: 3 }),
      count: 10,
    }))

    expect(localizeCompetitorHeadline({
      rivalId: 'comp-2',
      headlineKey: 'dashboard.competitorIntel.news.gimmickCopied',
      headlineValues: { archetypeId: 'technician', wrestlerName: 'Ace' },
    }, t)).toBe(i18n.t('dashboard.competitorIntel.news.gimmickCopied', {
      rivalName: i18n.t('dashboard.competitorIntel.rivals.primeGrappleAlliance'),
      archetype: i18n.t('dashboard.competitorIntel.archetypes.technician'),
      wrestlerName: 'Ace',
    }))

    expect(localizeCompetitorHeadline({ headlineKey: 'unrecognized' }, t))
      .toBe(i18n.t('dashboard.competitorIntel.news.legacy'))
  })

  it('localizes known and unknown archetypes', () => {
    expect(localizeCompetitorArchetype('technician', t))
      .toBe(i18n.t('dashboard.competitorIntel.archetypes.technician'))
    expect(localizeCompetitorArchetype('unrecognized', t))
      .toBe(i18n.t('dashboard.competitorIntel.archetypes.unknown'))
  })
})