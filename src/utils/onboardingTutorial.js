export const ONBOARDING_TUTORIAL_STAGES = [
  {
    id: 'buildRoster',
    moduleId: 'hireEmployees',
    titleKey: 'dashboard.onboardingChallenge.tutorial.buildRoster.title',
    bodyKey: 'dashboard.onboardingChallenge.tutorial.buildRoster.body',
    actionKey: 'dashboard.onboardingChallenge.tutorial.openHiring',
  },
  {
    id: 'openingShow',
    moduleId: 'manageEvents',
    titleKey: 'dashboard.onboardingChallenge.tutorial.openingShow.title',
    bodyKey: 'dashboard.onboardingChallenge.tutorial.openingShow.body',
    actionKey: 'dashboard.onboardingChallenge.tutorial.openEvents',
  },
  {
    id: 'secondShow',
    moduleId: 'manageEvents',
    titleKey: 'dashboard.onboardingChallenge.tutorial.secondShow.title',
    bodyKey: 'dashboard.onboardingChallenge.tutorial.secondShow.body',
    actionKey: 'dashboard.onboardingChallenge.tutorial.openEvents',
  },
  {
    id: 'finalShow',
    moduleId: 'manageEvents',
    titleKey: 'dashboard.onboardingChallenge.tutorial.finalShow.title',
    bodyKey: 'dashboard.onboardingChallenge.tutorial.finalShow.body',
    actionKey: 'dashboard.onboardingChallenge.tutorial.openEvents',
  },
  {
    id: 'stabilizePromotion',
    moduleId: 'manageFinances',
    titleKey: 'dashboard.onboardingChallenge.tutorial.stabilizePromotion.title',
    bodyKey: 'dashboard.onboardingChallenge.tutorial.stabilizePromotion.body',
    actionKey: 'dashboard.onboardingChallenge.tutorial.openFinances',
  },
]

export const getOnboardingTutorialStage = (challenge) => {
  if (!challenge) {
    return null
  }
  if (challenge.status === 'completed') {
    return { id: 'completed', step: ONBOARDING_TUTORIAL_STAGES.length, totalSteps: ONBOARDING_TUTORIAL_STAGES.length }
  }
  if (challenge.status === 'failed') {
    return { id: 'failed', step: ONBOARDING_TUTORIAL_STAGES.length, totalSteps: ONBOARDING_TUTORIAL_STAGES.length }
  }

  const rosterBuild = challenge.objectives?.rosterBuild || {}
  const successfulEvents = Math.max(
    0,
    Number(challenge.objectives?.firstShow?.currentSuccessfulEvents) || 0,
  )
  const stageIndex = !rosterBuild.completed
    ? 0
    : Math.min(successfulEvents + 1, ONBOARDING_TUTORIAL_STAGES.length - 1)
  const stage = ONBOARDING_TUTORIAL_STAGES[stageIndex]

  return {
    ...stage,
    step: stageIndex + 1,
    totalSteps: ONBOARDING_TUTORIAL_STAGES.length,
  }
}
