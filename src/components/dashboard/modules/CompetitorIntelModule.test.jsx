import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import '../../../i18n'

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
      }],
    },
  },
  version: 0,
}))

await import('../../../store/useGameStore')
const { default: CompetitorIntelModule } = await import('./CompetitorIntelModule')

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('CompetitorIntelModule', () => {
  it('shows persistent rival profiles and current strategies before the first news headline', () => {
    const html = renderToStaticMarkup(createElement(CompetitorIntelModule))
    expect(html).toContain('Rival Promotion Profiles')
    expect(html).toContain('Titan Ring Federation')
    expect(html).toContain('Talent Acquisition')
    expect(html).toContain('Rivals have not made a newsworthy move yet.')
  })

  it('renders the matching logo for each rival profile', () => {
    const html = renderToStaticMarkup(createElement(CompetitorIntelModule))

    expect(html).toContain('src="/Company/Rivals/titan.jpeg"')
    expect(html).toContain('src="/Company/Rivals/prime.jpeg"')
    expect(html).toContain('src="/Company/Rivals/global.jpeg"')
  })
})
