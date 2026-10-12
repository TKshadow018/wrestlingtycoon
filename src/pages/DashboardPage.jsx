import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FirebaseError } from 'firebase/app'
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore'
import { createInterviewScenario, evaluateInterviewAnswer, scoreInterviewAnswer } from '../ai/interviewService'
import LanguageSwitcher from '../components/common/LanguageSwitcher'
import AiInterviewModal from '../components/dashboard/AiInterviewModal'
import BoardMeetingModal from '../components/dashboard/BoardMeetingModal'
import SaveLoadControls from '../components/common/SaveLoadControls'
import ControlPanel from '../components/dashboard/ControlPanel'
import HudBar from '../components/dashboard/HudBar'
import ModuleNav from '../components/dashboard/ModuleNav'
import ModulePanel from '../components/dashboard/ModulePanel'
import EventBannerScreen from '../components/dashboard/EventBannerScreen'
import EventCustomIntroScreen from '../components/dashboard/EventCustomIntroScreen'
import MegaEventVideoScreen from '../components/dashboard/MegaEventVideoScreen'
import EventPreparationScreen from '../components/dashboard/EventPreparationScreen'
import EventRequirementsOverlay, { checkEventRequirements } from '../components/dashboard/EventRequirementsOverlay'
import EventResultsScreen from '../components/dashboard/EventResultsScreen'
import EventSetupModal from '../components/dashboard/modules/EventSetupModal'
import app, { isFirebaseConfigured } from '../config/firebase'
import { GAME_CONFIG } from '../config/gameConfig'
import { useGameStore } from '../store/useGameStore'
import { getBoardMeetingSchedule } from '../utils/boardMeetings'
import { parseGameDate } from '../utils/gameCalendar'
import { buildModDataPackageFromState, validateModDataPackage } from '../utils/modDataPackage'
import styles from './DashboardPage.module.scss'

const MAIN_SAVE_KEY = 'wrestling-tycoon-save-v1'
const LOCAL_BACKUP_KEY = 'wrestling-tycoon-manual-save-v1'
const AI_INTERVIEW_CHANCE = 0.05
const db = getFirestore(app)

const getFirebaseSaveLoadErrorKey = (error, operation) => {
  const baseKey = operation === 'save'
    ? 'dashboard.saveLoad.errorSaveFirebase'
    : 'dashboard.saveLoad.errorLoadFirebase'

  if (!isFirebaseConfigured) {
    return 'dashboard.saveLoad.firebaseNotConfigured'
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'dashboard.saveLoad.firebaseOffline'
  }

  const message = String(error?.message || '').toLowerCase()
  const code = error instanceof FirebaseError ? error.code : ''

  if (
    message.includes('err_name_not_resolved') ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    code === 'unavailable'
  ) {
    return 'dashboard.saveLoad.firebaseNetworkError'
  }

  if (code === 'permission-denied') {
    return 'dashboard.saveLoad.firebasePermissionDenied'
  }

  return baseKey
}

const createSaveSnapshot = (state) => ({
  gameStatus: state.gameStatus,
  profile: state.profile,
  calendar: state.calendar,
  finances: state.finances,
  roster: state.roster,
  market: state.market,
  events: state.events,
  history: state.history,
  progression: state.progression,
  onboardingChallenge: state.onboardingChallenge,
  boardMeeting: state.boardMeeting,
  stats: state.stats,
  ui: state.ui,
})

const writeLocalBackup = (snapshot) => {
  localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify({
    state: snapshot,
    savedAt: Date.now(),
  }))
}

const writeSnapshotAndReload = (snapshot) => {
  localStorage.setItem(MAIN_SAVE_KEY, JSON.stringify({
    state: snapshot,
    version: 0,
  }))
  window.location.reload()
}

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const parseIsoDateLocal = (isoDateString) => {
  return parseGameDate(isoDateString)
}

const getGameDateFromDay = (startDateIso, day) => {
  const parsedStartDate = parseIsoDateLocal(startDateIso) || toStartOfDay(new Date())
  const gameDate = new Date(parsedStartDate.getFullYear(), parsedStartDate.getMonth(), parsedStartDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return gameDate
}

// Returns the upcoming PPV/megaLive event if today is a preparation trigger day
// PPV: 7 days before; megaLive: 14 days before
const getPreparationEvent = ({ day, customEvents = [] }) => {
  const sorted = [...customEvents].sort((a, b) => a.scheduledDay - b.scheduledDay)
  for (const event of sorted) {
    const daysUntil = event.scheduledDay - day
    if (event.type === 'ppv' && daysUntil === 7) return event
    if (event.type === 'megaLive' && daysUntil === 14) return event
  }
  return null
}

const getPreShowInterviewEvent = ({ day, customEvents = [] }) => {
  const sorted = [...customEvents].sort((a, b) => a.scheduledDay - b.scheduledDay)
  for (const event of sorted) {
    const daysUntil = event.scheduledDay - day
    if ((event.type === 'ppv' || event.type === 'megaLive') && daysUntil === 1) {
      return event
    }
  }

  return null
}

const getTodayEventProjection = ({ day, startDateIso, customEvents = [], sponsors = [] }) => {
  const sortedCustomEvents = [...customEvents].sort((a, b) => {
    if (a.scheduledDay !== b.scheduledDay) {
      return a.scheduledDay - b.scheduledDay
    }
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
  const dueCustomEvent = sortedCustomEvents.find((event) => event.scheduledDay === day) || null
  const gameDate = getGameDateFromDay(startDateIso, day)
  const isFriday = gameDate.getDay() === 5

  const baseEvent = dueCustomEvent
    ? {
        eventId: dueCustomEvent.eventId,
        type: dueCustomEvent.type,
        name: dueCustomEvent.name,
        maxMatches: dueCustomEvent.maxMatches,
        imageUrl: dueCustomEvent.imageUrl || dueCustomEvent.image_url || '',
        isCustomEvent: true,
      }
    : (isFriday
        ? {
            eventId: 'regular-weekly-event',
            type: 'regularWeekly',
            name: 'Weekly TV Show',
            maxMatches: 5,
            imageUrl: '',
            isCustomEvent: false,
          }
        : null)

  if (!baseEvent || !['ppv', 'megaLive', 'oneTime'].includes(baseEvent.type)) {
    return baseEvent
  }

  const eventSponsor = (sponsors || []).find((sponsor) => sponsor?.eventScoped)
  if (!eventSponsor) {
    return baseEvent
  }

  return {
    ...baseEvent,
    name: `${baseEvent.name} - Sponsored by ${eventSponsor.name}`,
  }
}

const computeInterviewImpactPreview = ({ metrics = {}, forcedPreShow = false }) => {
  const score = Number(metrics.score || 0)
  const professionalism = Number(metrics.professionalism || 0)
  const hype = Number(metrics.hype || 0)
  const controversy = Number(metrics.controversy || 0)
  const forcedMultiplier = forcedPreShow ? 1.35 : 1

  return {
    fansDelta: Math.round(((score * 18) + (hype * 4) + (professionalism * 2) - (controversy * 2)) * forcedMultiplier),
    prestigeDelta: Math.round(((score / 2) + (professionalism / 3) + (hype / 4) - (controversy / 4)) * forcedMultiplier),
  }
}

function DashboardPage() {
  const { t } = useTranslation()
  const day = useGameStore((state) => state.calendar.day)
  const week = useGameStore((state) => state.calendar.week)
  const isEventDay = useGameStore((state) => state.calendar.isEventDay)
  const cash = useGameStore((state) => state.finances.cash)
  const fans = useGameStore((state) => state.stats.fans)
  const prestige = useGameStore((state) => state.stats.prestige)
  const profile = useGameStore((state) => state.profile)
  const bookedEvent = useGameStore((state) => state.events.bookedEvent)
  const lastOutcome = useGameStore((state) => state.events.lastOutcome)
  const customEvents = useGameStore((state) => state.events.customEvents)
  const employees = useGameStore((state) => state.roster.employees)
  const sponsors = useGameStore((state) => state.roster.sponsors)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const activeModule = useGameStore((state) => state.ui.activeModule)
  const setActiveModule = useGameStore((state) => state.setActiveModule)
  const proceedTimeline = useGameStore((state) => state.proceedTimeline)
  const boardMeeting = useGameStore((state) => state.boardMeeting)
  const openBoardMeeting = useGameStore((state) => state.openBoardMeeting)
  const resolveBoardAgenda = useGameStore((state) => state.resolveBoardAgenda)
  const acknowledgeBoardElectionResult = useGameStore((state) => state.acknowledgeBoardElectionResult)
  const finishBoardMeeting = useGameStore((state) => state.finishBoardMeeting)
  const gameOverReason = useGameStore((state) => state.gameStatus.gameOverReason)
  const isGameOver = useGameStore((state) => state.gameStatus.isGameOver)
  const skipEvent = useGameStore((state) => state.skipEvent)
  const resetGame = useGameStore((state) => state.resetGame)
  const titles = useGameStore((state) => state.roster.titles)
  const ticketFees = useGameStore((state) => state.finances.ticketFees)
  const eventPreparation = useGameStore((state) => state.events.eventPreparation)
  const careerArcUnlocks = useGameStore((state) => state.progression.unlocks)
  const setEventPreparation = useGameStore((state) => state.setEventPreparation)
  const setEventTicketFee = useGameStore((state) => state.setEventTicketFee)
  const aiStatus = useGameStore((state) => state.ai.status)
  const aiProgress = useGameStore((state) => state.ai.progress)
  const aiProgressText = useGameStore((state) => state.ai.progressText)
  const aiEnabled = useGameStore((state) => state.ai.enabled)
  const aiShowEnableModal = useGameStore((state) => state.ai.showEnableModal)
  const aiOptedInAtStart = useGameStore((state) => state.ai.optedInAtStart)
  const onboardingChallenge = useGameStore((state) => state.onboardingChallenge)
  const applyModDataPackage = useGameStore((state) => state.applyModDataPackage)
  const enableAi = useGameStore((state) => state.enableAi)
  const closeAiEnableModal = useGameStore((state) => state.closeAiEnableModal)
  const applyInterviewConsequences = useGameStore((state) => state.applyInterviewConsequences)
  const [showEventBanner, setShowEventBanner] = useState(false)
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
  const [showRequirementsOverlay, setShowRequirementsOverlay] = useState(false)
  const [pendingEventResult, setPendingEventResult] = useState(null)
  const [showCustomEventIntro, setShowCustomEventIntro] = useState(false)
  const [showMegaVideo, setShowMegaVideo] = useState(false)
  const [showEventPrep, setShowEventPrep] = useState(false)
  const [showChallengeModal, setShowChallengeModal] = useState(false)
  const [boardMeetingError, setBoardMeetingError] = useState('')
  const [saveLoadStatus, setSaveLoadStatus] = useState('')
  const [interviewRollByDay, setInterviewRollByDay] = useState({})
  const [interviewConsumedByDay, setInterviewConsumedByDay] = useState({})
  const [interviewSession, setInterviewSession] = useState(null)
  const [interviewMessages, setInterviewMessages] = useState([])
  const [isInterviewSubmitting, setIsInterviewSubmitting] = useState(false)
  const [isInterviewFinished, setIsInterviewFinished] = useState(false)
  const [interviewError, setInterviewError] = useState('')
  const [interviewMetrics, setInterviewMetrics] = useState({
    score: 0,
    professionalism: 0,
    hype: 0,
    controversy: 0,
    answerCount: 0,
  })
  const [interviewImpactSummary, setInterviewImpactSummary] = useState(null)
  const fileInputRef = useRef(null)
  const modFileInputRef = useRef(null)

  const todayEvent = getTodayEventProjection({ day, startDateIso, customEvents, sponsors })
  const isEventStep = Boolean(todayEvent)
  const isBoardMeetingDay = useMemo(() => (
    !isGameOver
    && getBoardMeetingSchedule({
      startDateIso,
      customEvents,
      throughDate: getGameDateFromDay(startDateIso, day),
    }).some((meeting) => meeting.scheduledDay === day)
    && (Boolean(boardMeeting.activeMeeting) || boardMeeting.lastMeetingDay !== day)
  ), [boardMeeting.activeMeeting, boardMeeting.lastMeetingDay, customEvents, day, isGameOver, startDateIso])
  const preparationEvent = !isEventStep ? getPreparationEvent({ day, customEvents }) : null
  const isPreparationDay = Boolean(preparationEvent)
  const preShowInterviewEvent = !isEventStep ? getPreShowInterviewEvent({ day, customEvents }) : null
  const isForcedPreShowInterviewDay = Boolean(preShowInterviewEvent)
  const shouldShowAiProgress = aiOptedInAtStart && aiStatus === 'downloading'
  const aiStatusMessage = shouldShowAiProgress
    ? t('dashboard.ai.downloading', {
        progress: Math.max(0, Math.min(100, Number(aiProgress) || 0)),
        detail: aiProgressText || t('dashboard.ai.defaultDownloadText'),
      })
    : ''

  const isInterviewEligible = aiEnabled
    && aiStatus === 'ready'
    && !isEventStep
    && !isBoardMeetingDay
    && !boardMeeting.activeMeeting
    && !isPreparationDay
    && !isSetupModalOpen
    && !showEventBanner
    && !showCustomEventIntro
    && !showMegaVideo
    && !showEventPrep

  useEffect(() => {
    if (!isInterviewEligible) {
      return
    }

    if (isForcedPreShowInterviewDay) {
      setInterviewRollByDay((prev) => ({
        ...prev,
        [day]: true,
      }))
      return
    }

    setInterviewRollByDay((prev) => {
      if (typeof prev?.[day] === 'boolean') {
        return prev
      }

      return {
        ...prev,
        [day]: Math.random() < AI_INTERVIEW_CHANCE,
      }
    })
  }, [day, isForcedPreShowInterviewDay, isInterviewEligible])

  const shouldOfferInterview = isInterviewEligible
    && interviewRollByDay?.[day] === true
    && interviewConsumedByDay?.[day] !== true
    && !interviewSession

  const interviewButtonLabel = shouldOfferInterview
    ? t('dashboard.controls.attendInterview')
    : null
  const boardMeetingButtonLabel = isBoardMeetingDay
    ? t('dashboard.controls.openBoardMeeting')
    : null

  const interviewContext = useMemo(() => {
    const newestEmployees = [...employees]
      .sort((a, b) => (Number(b.contractStartDay) || 0) - (Number(a.contractStartDay) || 0))
      .slice(0, 3)
      .map((employee) => employee.name)

    const activeTitles = (titles || [])
      .filter((title) => title?.isActive !== false)
      .slice(0, 4)
      .map((title) => {
        const holderIds = title.division === 'doubles'
          ? (Array.isArray(title.holderEmployeeIds) ? title.holderEmployeeIds : [])
          : (title.holderEmployeeId ? [title.holderEmployeeId] : [])
        const holders = holderIds
          .map((id) => employees.find((employee) => employee.employeeId === id)?.name)
          .filter(Boolean)

        return {
          title: title.name,
          holders,
        }
      })

    const recentMatches = Array.isArray(lastOutcome?.segments)
      ? lastOutcome.segments
          .filter((segment) => segment?.segmentType === 'match')
          .slice(0, 3)
          .map((segment) => ({
            participants: segment.participants || [],
            winner: segment.winnerName || 'No decision',
            rating: segment.matchRating,
          }))
      : []

    return {
      day,
      week,
      companyName: profile.companyName,
      cash,
      fans,
      prestige,
      upcomingEvent: bookedEvent?.name || 'No announced event',
      newestEmployees,
      recentMatches,
      champions: activeTitles,
    }
  }, [bookedEvent?.name, cash, day, employees, fans, lastOutcome?.segments, prestige, profile.companyName, titles, week])

  const onboardingSummary = useMemo(() => {
    if (!onboardingChallenge) {
      return null
    }

    const rosterObjective = onboardingChallenge.objectives?.rosterBuild || {}
    const firstShowObjective = onboardingChallenge.objectives?.firstShow || {}
    const stabilizeObjective = onboardingChallenge.objectives?.stabilize || {}
    const currentOperatingCashFlow = Number(stabilizeObjective.currentOperatingCashFlow || 0)
    const targetOperatingCashFlow = Number(stabilizeObjective.targetOperatingCashFlow || 0)

    const remainingDays = Math.max(0, Number(onboardingChallenge.deadlineDay || day) - day + 1)

    return {
      status: onboardingChallenge.status || 'active',
      remainingDays,
      reward: onboardingChallenge.reward || { cash: 0, prestige: 0 },
      penalty: onboardingChallenge.penalty || { fans: 0, prestige: 0 },
      objectives: [
        {
          key: 'rosterBuild',
          done: Boolean(rosterObjective.completed),
          progressText: `${Number(rosterObjective.currentWrestlers || 0)}/${Number(rosterObjective.targetWrestlers || 0)} ${t('dashboard.onboardingChallenge.objectiveRosterWrestlers')}, ${Number(rosterObjective.currentStaff || 0)}/${Number(rosterObjective.targetStaff || 0)} ${t('dashboard.onboardingChallenge.objectiveRosterStaff')}`,
        },
        {
          key: 'firstShow',
          done: Boolean(firstShowObjective.completed),
          progressText: `${Number(firstShowObjective.currentSuccessfulEvents || 0)}/${Number(firstShowObjective.targetSuccessfulEvents || 0)}`,
        },
        {
          key: 'stabilize',
          done: Boolean(stabilizeObjective.completed),
          progressText: `${Number(stabilizeObjective.currentFanGain || 0)}/${Number(stabilizeObjective.targetFanGain || 0)} ${t('dashboard.hud.fans')}, ${t('dashboard.onboardingChallenge.cashFlowProgress', {
            amount: `${currentOperatingCashFlow >= 0 ? '+' : '-'}$${Math.abs(currentOperatingCashFlow).toLocaleString()}`,
            target: `$${targetOperatingCashFlow.toLocaleString()}`,
          })}`,
        },
      ],
    }
  }, [day, onboardingChallenge, t])

  const openInterview = async () => {
    setInterviewConsumedByDay((prev) => ({
      ...prev,
      [day]: true,
    }))

    setInterviewError('')
    setIsInterviewFinished(false)
    setInterviewMetrics({
      score: 0,
      professionalism: 0,
      hype: 0,
      controversy: 0,
      answerCount: 0,
    })
    setInterviewImpactSummary(null)

    const placeholderSession = {
      journalistName: 'Journalist',
      newspaperName: 'Loading...',
      situation: t('dashboard.ai.interviewInitializing'),
      questions: [],
      questionIndex: 0,
      followUpCount: 0,
      targetFollowUps: 3,
    }

    setInterviewSession(placeholderSession)
    setInterviewMessages([
      { speaker: 'ai', text: t('dashboard.ai.interviewInitializing') },
    ])
    setIsInterviewSubmitting(true)

    try {
      const scenario = await createInterviewScenario(interviewContext)
      const firstQuestion = scenario.questions?.[0]

      if (!firstQuestion) {
        throw new Error('Interview questions unavailable')
      }

      setInterviewSession({
        ...scenario,
        questionIndex: 0,
        followUpCount: 0,
        targetFollowUps: 3 + Math.floor(Math.random() * 3),
      })

      setInterviewMessages([
        { speaker: 'ai', text: firstQuestion },
      ])
    } catch {
      setInterviewError(t('dashboard.ai.interviewInitError'))
      setInterviewSession(null)
      setInterviewMessages([])
    } finally {
      setIsInterviewSubmitting(false)
    }
  }

  const closeInterviewWithoutProceed = () => {
    setInterviewSession(null)
    setInterviewMessages([])
    setInterviewError('')
    setIsInterviewFinished(false)
    setIsInterviewSubmitting(false)
    setInterviewImpactSummary(null)
  }

  const finishInterviewAndContinueDay = () => {
    closeInterviewWithoutProceed()
    proceedTimeline()
  }

  const handleInterviewAnswer = async (userAnswer) => {
    if (!interviewSession || isInterviewFinished) {
      return
    }

    setInterviewError('')
    setIsInterviewSubmitting(true)

    const nextMessagesAfterUser = [...interviewMessages, { speaker: 'user', text: userAnswer }]
    setInterviewMessages(nextMessagesAfterUser)

    const baseQuestion = interviewSession.questions?.[interviewSession.questionIndex] || ''
    const currentQuestion = [...interviewMessages]
      .reverse()
      .find((entry) => entry.speaker === 'ai')?.text || baseQuestion

    try {
      const followUpCount = interviewSession.followUpCount || 0
      const targetFollowUps = interviewSession.targetFollowUps || 3
      const mustAskFollowUp = followUpCount < targetFollowUps

      const turn = await evaluateInterviewAnswer({
        journalistName: interviewSession.journalistName,
        newspaperName: interviewSession.newspaperName,
        currentQuestion,
        userAnswer,
        transcript: nextMessagesAfterUser,
        allowCounter: mustAskFollowUp,
        forceCounter: mustAskFollowUp,
      })

      const answerScore = scoreInterviewAnswer({ userAnswer, decision: turn.decision })
      const nextMetrics = {
        score: interviewMetrics.score + answerScore.score,
        professionalism: interviewMetrics.professionalism + answerScore.professionalism,
        hype: interviewMetrics.hype + answerScore.hype,
        controversy: interviewMetrics.controversy + answerScore.controversy,
        answerCount: interviewMetrics.answerCount + 1,
      }
      setInterviewMetrics(nextMetrics)

      if (mustAskFollowUp && turn.counterQuestion) {
        setInterviewMessages((prev) => [
          ...prev,
          { speaker: 'ai', text: turn.reply },
          { speaker: 'ai', text: turn.counterQuestion },
        ])

        setInterviewSession((prev) => ({
          ...prev,
          followUpCount: (prev.followUpCount || 0) + 1,
        }))

        return
      }

      if (mustAskFollowUp && !turn.counterQuestion) {
        setInterviewError(t('dashboard.ai.interviewTurnError'))
        return
      }

      const consequence = applyInterviewConsequences({
        metrics: nextMetrics,
        forcedPreShow: isForcedPreShowInterviewDay,
      })
      setInterviewImpactSummary(consequence)
      const impactPreview = computeInterviewImpactPreview({ metrics: nextMetrics, forcedPreShow: isForcedPreShowInterviewDay })

      setInterviewMessages((prev) => [
        ...prev,
        { speaker: 'ai', text: turn.reply },
        {
          speaker: 'ai',
          text: t('dashboard.ai.interviewImpactApplied', 'Media impact applied: Fans {{fans}} | Prestige {{prestige}} | Sponsor trust {{trust}}', {
            fans: impactPreview.fansDelta >= 0 ? `+${impactPreview.fansDelta}` : `${impactPreview.fansDelta}`,
            prestige: impactPreview.prestigeDelta >= 0 ? `+${impactPreview.prestigeDelta}` : `${impactPreview.prestigeDelta}`,
            trust: consequence.sponsorTrustDeltaAverage >= 0
              ? `+${consequence.sponsorTrustDeltaAverage}`
              : `${consequence.sponsorTrustDeltaAverage}`,
          }),
        },
        { speaker: 'ai', text: t('dashboard.ai.interviewClosing') },
      ])
      setIsInterviewFinished(true)
    } catch {
      setInterviewError(t('dashboard.ai.interviewTurnError'))
    } finally {
      setIsInterviewSubmitting(false)
    }
  }

  const continueEventFlow = () => {
    const { allMet } = checkEventRequirements(employees)
    if (!allMet) {
      setShowRequirementsOverlay(true)
      return
    }

    setShowEventBanner(true)
  }

  const handleProceed = () => {
    if (boardMeeting.activeMeeting) {
      return
    }

    if (isBoardMeetingDay) {
      const result = openBoardMeeting()
      if (!result.ok) {
        setBoardMeetingError(t(`dashboard.boardMeeting.errors.${result.reason}`, 'Could not open Board Meeting.'))
        return
      }
      setBoardMeetingError('')
      return
    }

    if (shouldOfferInterview) {
      openInterview()
      return
    }

    if (isPreparationDay) {
      setShowEventPrep(true)
      return
    }

    if (isEventStep) {
      if (todayEvent?.isCustomEvent && todayEvent?.imageUrl) {
        setShowCustomEventIntro(true)
        return
      }

      continueEventFlow()
      return
    }

    proceedTimeline()
  }

  const handleRequirementsGoBack = () => {
    setShowRequirementsOverlay(false)
  }

  const handleCustomEventIntroComplete = () => {
    setShowCustomEventIntro(false)
    if (todayEvent?.type === 'megaLive') {
      setShowMegaVideo(true)
      return
    }
    continueEventFlow()
  }

  const handleMegaVideoComplete = () => {
    setShowMegaVideo(false)
    continueEventFlow()
  }

  const handleEventPrepSave = ({ venueId, promotedWrestlerIds, promoStyleId, presentationId, ticketPrice }) => {
    if (preparationEvent) {
      setEventPreparation({
        eventId: preparationEvent.eventId,
        venueId: venueId || null,
        promotedWrestlerIds,
        promoStyleId,
        presentationId,
      })
    }
    if (preparationEvent && ticketPrice >= 0) {
      setEventTicketFee(preparationEvent.type, ticketPrice)
    }
    setShowEventPrep(false)
    proceedTimeline()
  }

  const handleEventPrepCancel = () => {
    setShowEventPrep(false)
  }

  const handleRequirementsSkip = () => {
    setShowRequirementsOverlay(false)
    skipEvent()
    proceedTimeline()
  }

  const handleBannerSetup = () => {
    setShowEventBanner(false)
    setIsSetupModalOpen(true)
  }

  const handleCloseSetupModal = () => {
    setIsSetupModalOpen(false)
  }

  const handleSubmitEventSetup = ({ segments }) => {
    proceedTimeline({
      eventId: todayEvent?.eventId,
      eventType: todayEvent?.type,
      totalSegments: todayEvent?.maxMatches || 1,
      segments,
    })
    // Capture the outcome immediately after the synchronous store update
    const outcome = useGameStore.getState().events.lastOutcome
    setIsSetupModalOpen(false)
    if (outcome && outcome.type === 'success') {
      setPendingEventResult(outcome)
    }
  }

  const handleDismissEventResult = () => {
    setPendingEventResult(null)
  }

  const handleSaveLocal = () => {
    try {
      const snapshot = createSaveSnapshot(useGameStore.getState())
      writeLocalBackup(snapshot)

      const payload = JSON.stringify({ state: snapshot, savedAt: Date.now() }, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const companyName = (useGameStore.getState().profile?.companyName || 'save').replace(/[^a-z0-9]/gi, '_').toLowerCase()
      anchor.href = url
      anchor.download = `wrestling-tycoon-${companyName}.json`
      anchor.click()
      URL.revokeObjectURL(url)

      setSaveLoadStatus(t('dashboard.saveLoad.savedLocal'))
    } catch (error) {
      setSaveLoadStatus(t('dashboard.saveLoad.errorSaveLocal'))
    }
  }

  const handleLoadLocal = () => {
    fileInputRef.current?.click()
  }

  const handleExportMods = () => {
    try {
      const state = useGameStore.getState()
      const modPackage = buildModDataPackageFromState(state)
      const payload = JSON.stringify(modPackage, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const companyName = (state.profile?.companyName || 'mod').replace(/[^a-z0-9]/gi, '_').toLowerCase()
      anchor.href = url
      anchor.download = `wrestling-tycoon-mod-${companyName}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setSaveLoadStatus(t('dashboard.saveLoad.modExported'))
    } catch {
      setSaveLoadStatus(t('dashboard.saveLoad.modExportFailed'))
    }
  }

  const handleImportMods = () => {
    modFileInputRef.current?.click()
  }

  const handleModFileLoad = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    const reader = new FileReader()
    reader.onload = (readerEvent) => {
      try {
        const parsed = JSON.parse(readerEvent.target.result)
        const validation = validateModDataPackage(parsed)

        if (!validation.ok) {
          setSaveLoadStatus(t('dashboard.saveLoad.modImportInvalid', {
            reason: validation.errors[0] || 'Invalid mod package.',
          }))
          return
        }

        const result = applyModDataPackage(validation.data)
        if (!result?.ok) {
          setSaveLoadStatus(t('dashboard.saveLoad.modImportInvalid', {
            reason: result?.errors?.[0] || 'Invalid mod package.',
          }))
          return
        }

        const moduleCount = result.modules?.length || 0
        const warningCount = Math.max(validation.warnings.length, result.warnings?.length || 0)
        setSaveLoadStatus(
          warningCount > 0
            ? t('dashboard.saveLoad.modImportSuccessWithWarnings', {
                moduleCount,
                warningCount,
              })
            : t('dashboard.saveLoad.modImportSuccess', { moduleCount }),
        )
      } catch {
        setSaveLoadStatus(t('dashboard.saveLoad.modImportFailed'))
      }
    }
    reader.readAsText(file)
  }

  const handleFileLoad = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    const reader = new FileReader()
    reader.onload = (readerEvent) => {
      try {
        const parsed = JSON.parse(readerEvent.target.result)
        if (!parsed?.state) {
          setSaveLoadStatus(t('dashboard.saveLoad.noLocalSave'))
          return
        }
        writeSnapshotAndReload(parsed.state)
      } catch {
        setSaveLoadStatus(t('dashboard.saveLoad.errorLoadLocal'))
      }
    }
    reader.readAsText(file)
  }

  const handleSaveFirebase = async (slot) => {
    if (!isFirebaseConfigured) {
      setSaveLoadStatus(t('dashboard.saveLoad.firebaseNotConfigured'))
      return
    }

    try {
      const snapshot = createSaveSnapshot(useGameStore.getState())
      await setDoc(doc(db, 'saveGames', slot), {
        slot,
        updatedAt: Date.now(),
        snapshot,
      })
      setSaveLoadStatus(t('dashboard.saveLoad.savedFirebase', { slot }))
    } catch (error) {
      const snapshot = createSaveSnapshot(useGameStore.getState())
      writeLocalBackup(snapshot)
      setSaveLoadStatus(t('dashboard.saveLoad.savedLocalFallback', {
        reason: t(getFirebaseSaveLoadErrorKey(error, 'save')),
      }))
    }
  }

  const handleLoadFirebase = async (slot) => {
    if (!isFirebaseConfigured) {
      setSaveLoadStatus(t('dashboard.saveLoad.firebaseNotConfigured'))
      return
    }

    try {
      const saveDoc = await getDoc(doc(db, 'saveGames', slot))
      if (!saveDoc.exists()) {
        setSaveLoadStatus(t('dashboard.saveLoad.noFirebaseSave', { slot }))
        return
      }

      const snapshot = saveDoc.data()?.snapshot
      if (!snapshot) {
        setSaveLoadStatus(t('dashboard.saveLoad.noFirebaseSave', { slot }))
        return
      }

      writeSnapshotAndReload(snapshot)
    } catch (error) {
      setSaveLoadStatus(t(getFirebaseSaveLoadErrorKey(error, 'load')))
    }
  }

  return (
    <main className={styles.dashboard}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileLoad}
      />
      <input
        ref={modFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleModFileLoad}
      />
      {showRequirementsOverlay && (
        <EventRequirementsOverlay
          employees={employees}
          onGoBack={handleRequirementsGoBack}
          onSkip={handleRequirementsSkip}
        />
      )}
      {showEventBanner && (
        <EventBannerScreen
          event={todayEvent}
          day={day}
          startDateIso={startDateIso}
          sponsors={sponsors}
          titles={titles}
          employees={employees}
          onSetup={handleBannerSetup}
        />
      )}
      {showCustomEventIntro && todayEvent?.isCustomEvent && todayEvent?.imageUrl && (
        <EventCustomIntroScreen
          event={todayEvent}
          presentationId={
            eventPreparation?.eventId === todayEvent.eventId
              ? eventPreparation.presentationId
              : 'classic'
          }
          durationMs={2600}
          onComplete={handleCustomEventIntroComplete}
        />
      )}
      {showMegaVideo && todayEvent?.type === 'megaLive' && (
        <MegaEventVideoScreen
          event={todayEvent}
          onComplete={handleMegaVideoComplete}
        />
      )}
      {showEventPrep && preparationEvent && (
        <EventPreparationScreen
          event={preparationEvent}
          employees={employees}
          titles={titles}
          sponsors={sponsors}
          ticketFees={ticketFees}
          eventPreparation={eventPreparation}
          unlocks={careerArcUnlocks}
          onSave={handleEventPrepSave}
          onCancel={handleEventPrepCancel}
        />
      )}
      {pendingEventResult && (
        <EventResultsScreen
          outcome={pendingEventResult}
          onContinue={handleDismissEventResult}
        />
      )}
      <AiInterviewModal
        isOpen={Boolean(interviewSession)}
        interview={interviewSession}
        messages={interviewMessages}
        impactSummary={interviewImpactSummary}
        onSubmitAnswer={handleInterviewAnswer}
        onSkip={finishInterviewAndContinueDay}
        onFinishAndContinue={finishInterviewAndContinueDay}
        isSubmitting={isInterviewSubmitting}
        isFinished={isInterviewFinished}
        error={interviewError}
      />
      <BoardMeetingModal
        meeting={boardMeeting.activeMeeting}
        relation={boardMeeting.relation}
        rejectionCounts={boardMeeting.rejectionCounts}
        boardPresidentName={boardMeeting.boardPresidentName}
        boardVicePresidentName={boardMeeting.boardVicePresidentName}
        boardPresidentName={boardMeeting.boardPresidentName}
        boardVicePresidentName={boardMeeting.boardVicePresidentName}
        managerName={profile.playerName}
        managerPhoto={
          profile.managerImageUrl
          || profile.playerImageUrl
          || profile.imageUrl
          || profile.image_url
          || ''
        }
        cash={cash}
        gameOverReason={isGameOver ? (gameOverReason || 'board-relation') : null}
        onResolve={resolveBoardAgenda}
        onAcknowledgeElectionResult={acknowledgeBoardElectionResult}
        onFinish={finishBoardMeeting}
        onReset={resetGame}
      />
      {aiShowEnableModal && aiStatus === 'ready' && !aiEnabled && (
        <section className={styles.aiModalBackdrop}>
          <article className={styles.aiModal}>
            <h3>{t('dashboard.ai.readyTitle')}</h3>
            <p>{t('dashboard.ai.readyBody')}</p>
            <div className={styles.aiModalActions}>
              <button type="button" className={styles.aiEnableButton} onClick={enableAi}>
                {t('dashboard.ai.enableButton')}
              </button>
              <button type="button" className={styles.aiLaterButton} onClick={closeAiEnableModal}>
                {t('dashboard.ai.laterButton')}
              </button>
            </div>
          </article>
        </section>
      )}
      <section className={styles.shell}>
        <header className={styles.topBar}>
          <div>
            <h1>{t('dashboard.welcome', { playerName: profile.playerName })}</h1>
            <p>{t('dashboard.company', { companyName: profile.companyName })}</p>
          </div>
          <div className={styles.topBarActions}>
            {onboardingSummary && (
              <button
                type="button"
                className={styles.challengeButton}
                onClick={() => setShowChallengeModal(true)}
              >
                {t('dashboard.onboardingChallenge.openButton')}
              </button>
            )}
            <SaveLoadControls
              onSaveLocal={handleSaveLocal}
              onLoadLocal={handleLoadLocal}
              onSaveFirebase={handleSaveFirebase}
              onLoadFirebase={handleLoadFirebase}
              onExportMods={handleExportMods}
              onImportMods={handleImportMods}
              firebaseEnabled={isFirebaseConfigured}
              statusMessage={saveLoadStatus}
              aiStatusMessage={aiStatusMessage}
              aiEnabled={aiEnabled}
            />
            <LanguageSwitcher />
          </div>
        </header>

        <HudBar
          snapshot={{
            day,
            week,
            isEventDay,
            boardMeetingToday: isBoardMeetingDay,
            cash,
            fans,
            prestige,
            startDateIso,
            ownerName: profile.ownerName,
            generalManagerName: profile.generalManagerName,
            homeCountry: profile.homeCountry,
            competitorPressure: lastOutcome?.competitorPressure || null,
          }}
        />

        {showChallengeModal && onboardingSummary && (
          <section className={styles.challengeModalBackdrop}>
            <article
              className={styles.challengeModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="challenge-modal-title"
            >
              <div className={styles.challengeModalHeader}>
                <button
                  type="button"
                  className={styles.challengeModalClose}
                  onClick={() => setShowChallengeModal(false)}
                >
                  {t('dashboard.onboardingChallenge.closeButton')}
                </button>
              </div>
              <section className={styles.onboardingChallengeCard}>
                <div className={styles.onboardingChallengeHeader}>
                  <div>
                    <h2 id="challenge-modal-title">{t('dashboard.onboardingChallenge.title')}</h2>
                    <p>{t('dashboard.onboardingChallenge.subtitle')}</p>
                  </div>
                  <span className={styles[`onboardingChallengeStatus${onboardingSummary.status}`]}>
                    {t(`dashboard.onboardingChallenge.status.${onboardingSummary.status}`)}
                  </span>
                </div>

                {onboardingSummary.status === 'active' && (
                  <p className={styles.onboardingChallengeDeadline}>
                    {t('dashboard.onboardingChallenge.deadline', { days: onboardingSummary.remainingDays })}
                  </p>
                )}

                <div className={styles.onboardingChallengeObjectives}>
                  {onboardingSummary.objectives.map((objective) => (
                    <article key={objective.key} className={styles.onboardingChallengeObjectiveRow}>
                      <div>
                        <h3>{t(`dashboard.onboardingChallenge.objectives.${objective.key}`)}</h3>
                        <p>{objective.progressText}</p>
                        {objective.key === 'stabilize' && (
                          <small>{t('dashboard.onboardingChallenge.cashProgressNote')}</small>
                        )}
                      </div>
                      <strong>
                        {objective.done
                          ? t('dashboard.onboardingChallenge.objectiveDone')
                          : t('dashboard.onboardingChallenge.objectivePending')}
                      </strong>
                    </article>
                  ))}
                </div>

                {onboardingSummary.status === 'active' ? (
                  <p className={styles.onboardingChallengeFooter}>
                    {t('dashboard.onboardingChallenge.rewardHint', {
                      cash: Number(onboardingSummary.reward.cash || 0).toLocaleString(),
                      prestige: onboardingSummary.reward.prestige || 0,
                    })}
                  </p>
                ) : onboardingSummary.status === 'completed' ? (
                  <p className={styles.onboardingChallengeFooterSuccess}>
                    {t('dashboard.onboardingChallenge.successSummary', {
                      cash: Number(onboardingSummary.reward.cash || 0).toLocaleString(),
                      prestige: onboardingSummary.reward.prestige || 0,
                    })}
                  </p>
                ) : (
                  <p className={styles.onboardingChallengeFooterFail}>
                    {t('dashboard.onboardingChallenge.failSummary', {
                      fans: onboardingSummary.penalty.fans || 0,
                      prestige: onboardingSummary.penalty.prestige || 0,
                    })}
                  </p>
                )}
              </section>
            </article>
          </section>
        )}

        {isSetupModalOpen ? (
          <section className={styles.eventSetupStage}>
            <EventSetupModal
              isOpen={isSetupModalOpen}
              eventConfig={{
                eventName: todayEvent?.name || bookedEvent?.name || t('dashboard.events.bookedLabel', 'Booked Event'),
                eventType: todayEvent?.type || bookedEvent?.type || 'regularWeekly',
                totalSegments: todayEvent?.maxMatches || bookedEvent?.maxMatches || 1,
              }}
              employees={employees}
              onClose={handleCloseSetupModal}
              onSubmit={handleSubmitEventSetup}
            />
          </section>
        ) : (
          <section className={styles.workspace}>
            <aside className={styles.sidebar}>
              {boardMeetingError && <p className={styles.boardMeetingError} role="alert">{boardMeetingError}</p>}
              <ControlPanel
                isEventDay={isEventStep}
                isPreparationDay={isPreparationDay}
                onProceed={handleProceed}
                onReset={resetGame}
                proceedLabelOverride={boardMeetingButtonLabel || interviewButtonLabel}
              />
              <ModuleNav activeModule={activeModule} onSelect={setActiveModule} />
            </aside>
            <ModulePanel moduleId={activeModule} />
          </section>
        )}
      </section>
    </main>
  )
}

export default DashboardPage
