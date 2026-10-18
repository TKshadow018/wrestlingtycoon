import { describe, expect, it, vi } from 'vitest'
import {
  applyInterviewConsequencesOnce,
  getInterviewFollowUpLimit,
  isAiInterviewEligible,
} from './interviewFlow'

const eligibleState = {
  enabled: true,
  status: 'ready',
  isEventStep: false,
  isBoardMeetingDay: false,
  hasActiveBoardMeeting: false,
  isPreparationDay: false,
  isSetupModalOpen: false,
  showEventBanner: false,
  showCustomEventIntro: false,
  showMegaVideo: false,
  showEventPrep: false,
}

describe('AI interview flow rules', () => {
  it('offers interviews only when AI is ready and no blocking dashboard flow is active', () => {
    expect(isAiInterviewEligible(eligibleState)).toBe(true)
    for (const blockingFlag of [
      'isEventStep',
      'isBoardMeetingDay',
      'hasActiveBoardMeeting',
      'isPreparationDay',
      'isSetupModalOpen',
      'showEventBanner',
      'showCustomEventIntro',
      'showMegaVideo',
      'showEventPrep',
    ]) {
      expect(isAiInterviewEligible({ ...eligibleState, [blockingFlag]: true }), blockingFlag).toBe(false)
    }
    expect(isAiInterviewEligible({ ...eligibleState, status: 'initializing' })).toBe(false)
    expect(isAiInterviewEligible({ ...eligibleState, enabled: false })).toBe(false)
  })

  it('limits forced pre-show interviews to one probe and normal interviews to three', () => {
    expect(getInterviewFollowUpLimit(true)).toBe(1)
    expect(getInterviewFollowUpLimit(false)).toBe(3)
  })

  it('runs interview consequences only once', () => {
    const apply = vi.fn(() => ({ fansDelta: 5 }))

    expect(applyInterviewConsequencesOnce({ alreadyApplied: false, apply })).toEqual({
      applied: true,
      result: { fansDelta: 5 },
    })
    expect(applyInterviewConsequencesOnce({ alreadyApplied: true, apply })).toEqual({
      applied: false,
      result: null,
    })
    expect(apply).toHaveBeenCalledTimes(1)
  })
})