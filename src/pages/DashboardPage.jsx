import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FirebaseError } from 'firebase/app'
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore'
import LanguageSwitcher from '../components/common/LanguageSwitcher'
import SaveLoadControls from '../components/common/SaveLoadControls'
import ControlPanel from '../components/dashboard/ControlPanel'
import HudBar from '../components/dashboard/HudBar'
import ModuleNav from '../components/dashboard/ModuleNav'
import ModulePanel from '../components/dashboard/ModulePanel'
import EventBannerScreen from '../components/dashboard/EventBannerScreen'
import EventCustomIntroScreen from '../components/dashboard/EventCustomIntroScreen'
import EventRequirementsOverlay, { checkEventRequirements } from '../components/dashboard/EventRequirementsOverlay'
import EventResultsScreen from '../components/dashboard/EventResultsScreen'
import EventSetupModal from '../components/dashboard/modules/EventSetupModal'
import app, { isFirebaseConfigured } from '../config/firebase'
import { GAME_CONFIG } from '../config/gameConfig'
import { useGameStore } from '../store/useGameStore'
import styles from './DashboardPage.module.scss'

const MAIN_SAVE_KEY = 'wrestling-tycoon-save-v1'
const LOCAL_BACKUP_KEY = 'wrestling-tycoon-manual-save-v1'
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
  const [showEventBanner, setShowEventBanner] = useState(false)
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false)
  const [showRequirementsOverlay, setShowRequirementsOverlay] = useState(false)
  const [pendingEventResult, setPendingEventResult] = useState(null)
  const [showCustomEventIntro, setShowCustomEventIntro] = useState(false)
  const [saveLoadStatus, setSaveLoadStatus] = useState('')

  const todayEvent = getTodayEventProjection({ day, startDateIso, customEvents, sponsors })
  const isEventStep = Boolean(todayEvent)

  const continueEventFlow = () => {
    const { allMet } = checkEventRequirements(employees)
    if (!allMet) {
      setShowRequirementsOverlay(true)
      return
    }

    setShowEventBanner(true)
  }

  const handleProceed = () => {
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
    continueEventFlow()
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
      setSaveLoadStatus(t('dashboard.saveLoad.savedLocal'))
    } catch (error) {
      setSaveLoadStatus(t('dashboard.saveLoad.errorSaveLocal'))
    }
  }

  const handleLoadLocal = () => {
    try {
      const raw = localStorage.getItem(LOCAL_BACKUP_KEY)
      if (!raw) {
        setSaveLoadStatus(t('dashboard.saveLoad.noLocalSave'))
        return
      }

      const parsed = JSON.parse(raw)
      if (!parsed?.state) {
        setSaveLoadStatus(t('dashboard.saveLoad.noLocalSave'))
        return
      }

      writeSnapshotAndReload(parsed.state)
    } catch (error) {
      setSaveLoadStatus(t('dashboard.saveLoad.errorLoadLocal'))
    }
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
      {pendingEventResult && (
        <EventResultsScreen
          outcome={pendingEventResult}
          onContinue={handleDismissEventResult}
        />
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
              <ControlPanel isEventDay={isEventStep} onProceed={handleProceed} onReset={resetGame} />
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
