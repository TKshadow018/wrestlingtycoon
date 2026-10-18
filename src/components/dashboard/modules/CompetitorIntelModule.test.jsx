// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'

const localStorageMock = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => localStorageMock.get(key) ?? null,
  setItem: (key, value) => localStorageMock.set(key, String(value)),
  removeItem: (key) => localStorageMock.delete(key),
  clear: () => localStorageMock.clear(),
})
localStorageMock.set('wrestling-tycoon-save-v1', JSON.stringify({
  state: {
    events: {
      competitorHeadlines: [],
      competitorCompanies: [{
        id: 'rival-one',
        name: 'The Rival Promotion',
        aggression: 1,
        strategyId: 'counterProgramming',
        nextStrategyDay: 30,
        copiedGimmicks: [{
          archetypeId: 'technical',
          archetypeName: 'Technical Specialist',
          sourceWrestlerId: 'wrestler-1',
          sourceWrestlerName: 'The Star',
          copiedDay: 8,
        }],
      }, {
        id: 'comp-south-asia',
        nameKey: 'dashboard.competitorIntel.rivals.southAsianWrestlingLeague',
        regionKey: 'southAsia',
        aggression: 1,
        strategyId: 'talentAcquisition',
        nextStrategyDay: 36,
        nextEventDay: 42,
        roster: [{
          employeeId: 'comp-south-asia-wrestler-1',
          name: 'Aminul Ali',
          countryKey: 'bangladesh',
          role: 'wrestler',
          popularity: 74,
          skill: 80,
          wins: 2,
          losses: 0,
        }],
        champions: [{
          titleId: 'south-asian-heavyweight',
          titleKey: 'dashboard.competitorIntel.rivalTitles.southAsianHeavyweight',
          championId: 'comp-south-asia-wrestler-1',
          championNames: ['Aminul Ali'],
          defenses: 2,
        }],
        eventHistory: [],
      }],
    },
  },
  version: 0,
}))

const { useGameStore } = await import('../../../store/useGameStore')
const { default: CompetitorIntelModule } = await import('./CompetitorIntelModule')

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
})

describe('CompetitorIntelModule', () => {
  it('shows persistent rival profiles and current strategies before the first news headline', () => {
    const html = renderToStaticMarkup(createElement(CompetitorIntelModule))
    expect(html).toContain('Rival Promotion Profiles')
    expect(html).toContain(i18n.t('dashboard.competitorIntel.rivals.titanRingFederation'))
    expect(html).toContain('Talent Acquisition')
    expect(html).toContain('Rivals have not made a newsworthy move yet.')
  })

  it('renders the matching logo for each rival profile', () => {
    const html = renderToStaticMarkup(createElement(CompetitorIntelModule))

    expect(html).toContain('src="/Company/Rivals/titan.jpeg"')
    expect(html).toContain('src="/Company/Rivals/prime.jpeg"')
    expect(html).toContain('src="/Company/Rivals/global.jpeg"')
  })

  it('shows an existing rival roster from the shared pool, champions, and weekly card', () => {
    const competitor = useGameStore.getState().events.competitorCompanies
      .find(({ id }) => id === 'comp-1')
    const wrestlerPool = useGameStore.getState().events.competitorWrestlerPool
    const featuredWrestlers = wrestlerPool.filter(({ employeeId }) => (
      competitor.rosterIds.includes(employeeId)
    )).slice(0, 2)
    const champion = competitor.champions[0]
    const lastEvent = {
      day: 7,
      week: 1,
      eventNumber: 1,
      matchCount: 1,
      matches: [{
        matchNumber: 1,
        matchType: 'singles',
        titleId: champion.titleId,
        titleKey: champion.titleKey,
        participantIds: featuredWrestlers.map(({ employeeId }) => employeeId),
        participantNames: featuredWrestlers.map(({ name }) => name),
        winnerIds: [champion.championId],
        winnerId: champion.championId,
        winnerNames: champion.championNames,
      }],
      championChanges: [],
    }
    useGameStore.setState((state) => ({
      events: {
        ...state.events,
        competitorCompanies: state.events.competitorCompanies.map((company) => (
          company.id === competitor.id ? { ...company, lastEvent } : company
        )),
      },
    }))
    expect(useGameStore.getState().events.competitorCompanies
      .find(({ id }) => id === competitor.id).lastEvent.eventNumber)
      .toBe(lastEvent.eventNumber)

    const { container } = render(createElement(CompetitorIntelModule))
    const text = container.textContent
    const featuredWrestler = featuredWrestlers[0]
    const championNames = champion.championIds.map((id) => (
      wrestlerPool.find((wrestler) => wrestler.employeeId === id).name
    ))

    expect(text).toContain(i18n.t('dashboard.competitorIntel.rivals.titanRingFederation'))
    expect(text).not.toContain('South Asian Wrestling League')
    expect(championNames.every((name) => text.includes(name))).toBe(true)
    expect(text).toContain(i18n.t(`dashboard.competitorIntel.countries.${featuredWrestler.countryKey}`))
    expect(text).toContain(i18n.t('dashboard.competitorIntel.nextRivalEvent', {
      day: competitor.nextEventDay,
    }))
    expect(text).toContain(i18n.t('dashboard.competitorIntel.nextStrategyShift', {
      day: competitor.nextStrategyDay,
    }))
    expect(text).toContain(i18n.t('dashboard.competitorIntel.rivalEventName', { number: 1 }))
    expect(text).toContain(i18n.t(champion.titleKey))
    expect(text).toContain(i18n.t('dashboard.competitorIntel.latestRivalEvent'))
  })

  it('renders competitor news from localized headline keys and values', () => {
    useGameStore.setState((state) => ({
      events: {
        ...state.events,
        competitorHeadlines: [{
          id: 'strategy-headline',
          day: 2,
          type: 'strategyShift',
          rivalId: 'comp-1',
          strategyId: 'talentAcquisition',
          headlineKey: 'dashboard.competitorIntel.news.strategyShift',
          headlineValues: { strategyId: 'talentAcquisition' },
          fanImpact: 0,
          prestigeImpact: 0,
        }],
      },
    }))

    const { container } = render(createElement(CompetitorIntelModule))

    const expectedHeadline = i18n.t('dashboard.competitorIntel.news.strategyShift', {
      rivalName: i18n.t('dashboard.competitorIntel.rivals.titanRingFederation'),
      strategy: i18n.t('dashboard.competitorIntel.strategies.talentAcquisition'),
    })
    expect(container.textContent).toContain(expectedHeadline)
  })
})
