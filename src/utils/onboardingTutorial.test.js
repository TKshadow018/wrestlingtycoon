import { describe, expect, it } from 'vitest'
import { getOnboardingTutorialShowProgress, getOnboardingTutorialStage } from './onboardingTutorial'

const challenge = ({
  status = 'active',
  rosterComplete = false,
  successfulEvents = 0,
  stabilizationComplete = false,
} = {}) => ({
  status,
  objectives: {
    rosterBuild: { completed: rosterComplete },
    firstShow: { currentSuccessfulEvents: successfulEvents, targetSuccessfulEvents: 3 },
    stabilize: { completed: stabilizationComplete },
  },
})

describe('guided onboarding tutorial stages', () => {
  it('returns first-show progress from the onboarding objective', () => {
    expect(getOnboardingTutorialShowProgress(challenge({ successfulEvents: 1 }))).toEqual({
      successfulEvents: 1,
      targetSuccessfulEvents: 3,
    })
  })

  it('defaults first-show progress when the objective is missing', () => {
    expect(getOnboardingTutorialShowProgress({ objectives: {} })).toEqual({
      successfulEvents: 0,
      targetSuccessfulEvents: 0,
    })
  })

  it('guides the player to complete event staffing before the opening show', () => {
    expect(getOnboardingTutorialStage(challenge())).toMatchObject({
      id: 'buildRoster',
      step: 1,
      moduleId: 'hireEmployees',
      titleKey: expect.stringContaining('buildRoster'),
      actionKey: expect.stringContaining('openHiring'),
    })
  })

  it.each([
    [0, 'openingShow', 2, 'manageEvents'],
    [1, 'secondShow', 3, 'manageEvents'],
    [2, 'finalShow', 4, 'manageEvents'],
    [3, 'stabilizePromotion', 5, 'manageFinances'],
  ])('moves to %s after %i successful show(s)', (successfulEvents, id, step, moduleId) => {
    expect(getOnboardingTutorialStage(challenge({
      rosterComplete: true,
      successfulEvents,
    }))).toMatchObject({ id, step, moduleId })
  })

  it('guides cash-flow stabilization after the three tutorial shows', () => {
    expect(getOnboardingTutorialStage(challenge({
      rosterComplete: true,
      successfulEvents: 3,
    }))).toMatchObject({
      id: 'stabilizePromotion',
      step: 5,
      moduleId: 'manageFinances',
    })
  })

  it('marks completed and failed challenge runs as terminal tutorial stages', () => {
    expect(getOnboardingTutorialStage(challenge({ status: 'completed' })).id).toBe('completed')
    expect(getOnboardingTutorialStage(challenge({ status: 'failed' })).id).toBe('failed')
  })
})
