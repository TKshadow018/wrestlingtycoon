import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import '../../i18n'
import OnboardingTutorialGuide from './OnboardingTutorialGuide'

describe('OnboardingTutorialGuide', () => {
  it('shows the current step and a dashboard action for an active stage', () => {
    const onOpenModule = vi.fn()
    const html = renderToStaticMarkup(createElement(OnboardingTutorialGuide, {
      tutorial: {
        id: 'secondShow',
        step: 3,
        totalSteps: 5,
        moduleId: 'manageEvents',
        titleKey: 'dashboard.onboardingChallenge.tutorial.secondShow.title',
        bodyKey: 'dashboard.onboardingChallenge.tutorial.secondShow.body',
        actionKey: 'dashboard.onboardingChallenge.tutorial.openEvents',
        successfulEvents: 1,
        targetSuccessfulEvents: 3,
      },
      onOpenModule,
    }))

    expect(html).toContain('Guided Rescue Tutorial')
    expect(html).toContain('Step 3 of 5')
    expect(html).toContain('Build on the first crowd reaction')
    expect(html).toContain('Open Event Planning')
  })

  it('provides a completion state after the challenge is resolved', () => {
    const html = renderToStaticMarkup(createElement(OnboardingTutorialGuide, {
      tutorial: { id: 'completed', step: 5, totalSteps: 5 },
      onOpenModule: () => {},
    }))
    expect(html).toContain('Rescue tutorial complete')
  })
})
