import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FirebaseError } from 'firebase/app'
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore'
import { createInterviewScenario, evaluateInterviewAnswer } from '../ai/interviewService'
import LanguageSwitcher from '../components/common/LanguageSwitcher'
import AiInterviewModal from '../components/dashboard/AiInterviewModal'
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
  if (!isoDateString) {
    return null
  }

  const [yearStr, monthStr, dayStr] = isoDateString.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
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
  const skipEvent = useGameStore((state) => state.skipEvent)
  const resetGame = useGameStore((state) => state.resetGame)
  const titles = useGameStore((state) => state.roster.titles)
  const ticketFees = useGameStore((state) => state.finances.ticketFees)
  const eventPreparation = useGameStore((state) => state.events.eventPreparation)
  const setEventPreparation = useGameStore((state) => state.setEventPreparation)
  const setEventTicketFee = useGameStore((state) => state.setEventTicketFee)
  const aiStatus = useGameStore((state) => state.ai.status)
  const aiProgress = useGameStore((state) => state.ai.progress)
  const aiProgressText = useGameStore((state) => state.ai.progressText)
  const aiEnabled = useGameStore((state) => state.ai.enabled)
  const aiShowEnableModal = useGameStore((state) => state.ai.showEnableModal)
  const aiOptedInAtStart = useGameStore((state) => state.ai.optedInAtStart)
  const enableAi = useGameStore((state) => state.enableAi)
  const closeAiEnableModal = useGameStore((state) => state.closeAiEnableModal)
  const [showEventBanner, setShowEventBanner] = useState(false)
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
  const [showRequirementsOverlay, setShowRequirementsOverlay] = useState(false)
  const [pendingEventResult, setPendingEventResult] = useState(null)
  const [showCustomEventIntro, setShowCustomEventIntro] = useState(false)
  const [showMegaVideo, setShowMegaVideo] = useState(false)
  const [showEventPrep, setShowEventPrep] = useState(false)
  const [saveLoadStatus, setSaveLoadStatus] = useState('')
  const [interviewRollByDay, setInterviewRollByDay] = useState({})
  const [interviewConsumedByDay, setInterviewConsumedByDay] = useState({})
  const [interviewSession, setInterviewSession] = useState(null)
  const [interviewMessages, setInterviewMessages] = useState([])
  const [isInterviewSubmitting, setIsInterviewSubmitting] = useState(false)
  const [isInterviewFinished, setIsInterviewFinished] = useState(false)
  const [interviewError, setInterviewError] = useState('')
  const fileInputRef = useRef(null)

  const todayEvent = getTodayEventProjection({ day, startDateIso, customEvents, sponsors })
  const isEventStep = Boolean(todayEvent)
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

  const openInterview = async () => {
    setInterviewConsumedByDay((prev) => ({
      ...prev,
      [day]: true,
    }))

    setInterviewError('')
    setIsInterviewFinished(false)

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

      setInterviewMessages((prev) => [
        ...prev,
        { speaker: 'ai', text: turn.reply },
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

  const handleEventPrepSave = ({ venueId, promotedWrestlerIds, ticketPrice }) => {
    if (preparationEvent) {
      setEventPreparation({
        eventId: preparationEvent.eventId,
        venueId: venueId || null,
        promotedWrestlerIds,
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
        onSubmitAnswer={handleInterviewAnswer}
        onSkip={finishInterviewAndContinueDay}
        onFinishAndContinue={finishInterviewAndContinueDay}
        isSubmitting={isInterviewSubmitting}
        isFinished={isInterviewFinished}
        error={interviewError}
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
            <small>{t('dashboard.nextEvent', { days: GAME_CONFIG.eventCycleDays })}</small>
          </div>
          <div className={styles.topBarActions}>
            <SaveLoadControls
              onSaveLocal={handleSaveLocal}
              onLoadLocal={handleLoadLocal}
              onSaveFirebase={handleSaveFirebase}
              onLoadFirebase={handleLoadFirebase}
              firebaseEnabled={isFirebaseConfigured}
              statusMessage={saveLoadStatus}
              aiStatusMessage={aiStatusMessage}
              aiEnabled={aiEnabled}
            />
            <LanguageSwitcher />
          </div>
        </header>

        <HudBar snapshot={{ day, week, isEventDay, cash, fans, prestige, startDateIso }} />

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
              <ControlPanel
                isEventDay={isEventStep}
                isPreparationDay={isPreparationDay}
                onProceed={handleProceed}
                onReset={resetGame}
                proceedLabelOverride={interviewButtonLabel}
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
