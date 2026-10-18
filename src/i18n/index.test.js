import { describe, expect, it } from 'vitest'
import i18n, { AVAILABLE_LANGUAGES } from './index'

describe('internationalization setup', () => {
  it('loads the English resources and initializes the i18n instance', () => {
    expect(AVAILABLE_LANGUAGES).toContain('en')
    expect(AVAILABLE_LANGUAGES.length).toBeGreaterThan(0)
    expect(i18n.language).toBe('en')
    expect(i18n.getResourceBundle('en', 'translation')).toEqual(expect.any(Object))
    expect(i18n.t('dashboard.ai.interviewQuestions.match.0', { latestMatchParticipants: 'Ace vs Blaze' }))
      .toContain('Ace vs Blaze')
    expect(i18n.t('dashboard.ai.interviewRubricSummary', {
      relevance: 2,
      clarity: 1,
      professionalism: 3,
      hype: 1,
      controversy: 0,
    })).toContain('relevance 2')
  })
})
