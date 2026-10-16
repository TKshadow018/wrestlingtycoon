export const isAiInterviewEligible = ({
  enabled,
  status,
  isEventStep,
  isBoardMeetingDay,
  hasActiveBoardMeeting,
  isPreparationDay,
  isSetupModalOpen,
  showEventBanner,
  showCustomEventIntro,
  showMegaVideo,
  showEventPrep,
}) => Boolean(
  enabled
  && status === 'ready'
  && !isEventStep
  && !isBoardMeetingDay
  && !hasActiveBoardMeeting
  && !isPreparationDay
  && !isSetupModalOpen
  && !showEventBanner
  && !showCustomEventIntro
  && !showMegaVideo
  && !showEventPrep
)

export const getInterviewFollowUpLimit = (forcedPreShow) => forcedPreShow ? 1 : 3

export const applyInterviewConsequencesOnce = ({ alreadyApplied, apply }) => {
  if (alreadyApplied) return { applied: false, result: null }
  return { applied: true, result: apply() }
}