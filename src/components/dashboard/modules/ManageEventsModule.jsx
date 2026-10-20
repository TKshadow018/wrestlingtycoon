import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import { getEventDisplayName } from '../../../utils/eventDisplay'
import MatchHealthSummary from '../MatchHealthSummary'
import {
  getGameDateFromDayOrFallback,
  getGameDayDifference,
  parseGameDate,
  toGameDateStartOfDay,
} from '../../../utils/gameCalendar'
import EventCreateModal from './EventCreateModal'
import EventCalendar from './EventCalendar'
import styles from './ManageEventsModule.module.scss'

const FEMALE_FALLBACK_IMAGE = '/people/girl.png'
const MALE_FALLBACK_IMAGE = '/people/boy.png'

const getFallbackImage = (gender) => (gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)

const getWeekFromDay = (day) => Math.floor((day - 1) / 7) + 1

const formatGameDateFromDay = (startDateIso, day) => {
  const gameDate = getGameDateFromDayOrFallback(startDateIso, day)
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const getScheduledWeekFromSpecificDate = (specificDate, currentGameDay, startDateIso) => {
  if (!specificDate) {
    return getWeekFromDay(currentGameDay)
  }

  const parsedDate = parseGameDate(specificDate)
  const selectedDate = parsedDate ? toGameDateStartOfDay(parsedDate) : null
  const parsedStartDate = parseGameDate(startDateIso)
  const today = parsedStartDate ? toGameDateStartOfDay(parsedStartDate) : toGameDateStartOfDay(new Date())

  if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
    return getWeekFromDay(currentGameDay)
  }

  const diffDays = Math.max(0, getGameDayDifference(today, selectedDate))
  const targetGameDay = currentGameDay + diffDays

  return getWeekFromDay(targetGameDay)
}

function ManageEventsModule() {
  const { t } = useTranslation()
  const day = useGameStore((state) => state.calendar.day)
  const week = useGameStore((state) => state.calendar.week)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const regularWeeklyEvent = useGameStore((state) => state.events.regularWeeklyEvent)
  const customEvents = useGameStore((state) => state.events.customEvents)
  const lastOutcome = useGameStore((state) => state.events.lastOutcome)
  const eventLog = useGameStore((state) => state.events.eventLog)
  const createCustomEvent = useGameStore((state) => state.createCustomEvent)
  const updateCustomEvent = useGameStore((state) => state.updateCustomEvent)
  const deleteCustomEvent = useGameStore((state) => state.deleteCustomEvent)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)
  const [initialSpecificDate, setInitialSpecificDate] = useState('')

  const eventToEdit = editingEventId ? customEvents.find((e) => e.eventId === editingEventId) : null

  const handleOpenModal = (specificDate = '') => {
    setEditingEventId(null)
    setInitialSpecificDate(specificDate)
    setIsModalOpen(true)
  }

  const handleStartEdit = (eventRecord) => {
    setEditingEventId(eventRecord.eventId)
    setInitialSpecificDate(eventRecord.specificDate || '')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingEventId(null)
    setInitialSpecificDate('')
  }

  const handleDeleteEvent = (eventId) => {
    deleteCustomEvent(eventId)
    handleCloseModal()
    return { ok: true }
  }

  const handleCalendarDaySelect = ({ mode, event, specificDate }) => {
    if (mode === 'edit' && event) {
      handleStartEdit(event)
      return
    }

    handleOpenModal(specificDate)
  }

  const handleModalSubmit = (formData) => {
    const scheduledWeek = getScheduledWeekFromSpecificDate(formData.specificDate, day, startDateIso)

    const payload = {
      ...formData,
      scheduledWeek,
    }

    const result = editingEventId
      ? updateCustomEvent(editingEventId, payload)
      : createCustomEvent(payload)

    return result
  }

  const recentEvents = [...(eventLog || [])].reverse().slice(0, 5)
  const lastOutcomeEventName = getEventDisplayName(lastOutcome, t, eventLog)

  return (
    <section className={styles.moduleBody}>
      <div className={styles.headerSection}>
        <h3>{t('dashboard.events.calendarTitle')}</h3>
        <button className={styles.createButton} onClick={handleOpenModal}>
          {t('dashboard.events.createEventButton')}
        </button>
      </div>

      <EventCalendar
        gameDay={day}
        startDateIso={startDateIso}
        regularWeeklyEvent={regularWeeklyEvent}
        customEvents={customEvents}
        onDaySelect={handleCalendarDaySelect}
      />

      {lastOutcome ? (
        <article className={styles.outcomeCard}>
          <p>{t('dashboard.events.lastOutcome')}</p>
          <h4>
            {lastOutcome.type === 'success'
              ? t('dashboard.events.outcomeSuccess', { eventName: lastOutcomeEventName })
              : t('dashboard.events.outcomeUnavailable')}
          </h4>

          {lastOutcome.audience != null && (
            <div className={styles.outcomeRow}>
              <span>{t('dashboard.events.audience')}</span>
              <span>{t('dashboard.events.audienceAttendance', { count: lastOutcome.audience.toLocaleString() })}</span>
            </div>
          )}

          {lastOutcome.overallRating != null && (
            <div className={styles.outcomeRow}>
              <span>{t('dashboard.events.overallRating')}</span>
              <span>★ {lastOutcome.overallRating} / 10</span>
            </div>
          )}

          <div className={styles.outcomeRow}>
            <span>{t('dashboard.eventResults.fans')}</span>
            <span className={lastOutcome.fanDelta >= 0 ? styles.positive : styles.negative}>
              {lastOutcome.fanDelta >= 0 ? '+' : ''}{lastOutcome.fanDelta}
            </span>
          </div>

          <div className={styles.outcomeRow}>
            <span>{t('dashboard.eventResults.prestige')}</span>
            <span className={lastOutcome.prestigeDelta >= 0 ? styles.positive : styles.negative}>
              {lastOutcome.prestigeDelta >= 0 ? '+' : ''}{lastOutcome.prestigeDelta}
            </span>
          </div>

          {lastOutcome.incomeBreakdown && (
            <div className={styles.breakdownSection}>
              <p className={styles.breakdownTitle}>{t('dashboard.events.dayEarningsBreakdown')}</p>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.eventGate')}</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.eventGate || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.merchandise')}</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.merchandise || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.sponsorRevenue')}</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.sponsor || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.webSubscriptions')}</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.webSubscription || 0).toLocaleString()}</span>
              </div>
              {(lastOutcome.incomeBreakdown.thirdParty || 0) > 0 && (
                <div className={styles.outcomeRow}>
                  <span>{t('dashboard.events.thirdParty')}</span>
                  <span className={styles.positive}>+$ {lastOutcome.incomeBreakdown.thirdParty.toLocaleString()}</span>
                </div>
              )}
              <div className={`${styles.outcomeRow} ${styles.outcomeTotal}`}>
                <span>{t('dashboard.events.totalIncome')}</span>
                <span className={styles.positive}>$ {(lastOutcome.totalDayIncome || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          {lastOutcome.expenseBreakdown && (
            <div className={styles.breakdownSection}>
              <p className={styles.breakdownTitle}>{t('dashboard.events.dayCostBreakdown')}</p>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.eventCost')}</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.eventCost || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.wrestlerPayroll')}</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.wrestlerPayroll || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.staffCost')}</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.staffCost || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.operatingCost')}</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.operatingCost || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>{t('dashboard.events.otherCost')}</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.otherCost || 0).toLocaleString()}</span>
              </div>
              <div className={`${styles.outcomeRow} ${styles.outcomeTotal}`}>
                <span>{t('dashboard.events.totalExpenses')}</span>
                <span className={styles.negative}>$ {(lastOutcome.totalDayExpenses || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          {lastOutcome.setup && (
            <div className={styles.breakdownSection}>
              <p className={styles.breakdownTitle}>
                {t('dashboard.events.participation', { count: lastOutcome.setup.uniqueParticipants })}
              </p>
              {lastOutcome.setup.segments.map((seg, i) => (
                <div key={i} className={styles.outcomeRow}>
                  <span className={styles.segType}>
                    {t(`dashboard.segments.${seg.segmentType}`, {
                      defaultValue: t('dashboard.segments.unknown'),
                    })}
                  </span>
                  <span>{seg.participants.join(', ') || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      ) : null}

      {recentEvents.length > 0 ? (
        <section className={styles.recentHistorySection}>
          <h4 className={styles.recentHistoryTitle}>
            {t('dashboard.events.recentHistoryTitle', { count: recentEvents.length })}
          </h4>
          <div className={styles.recentHistoryList}>
            {recentEvents.map((event) => (
              <article key={event.id} className={styles.recentEventCard}>
                <div className={styles.recentEventHeader}>
                  <strong>{getEventDisplayName(event, t)}</strong>
                  <span>{formatGameDateFromDay(startDateIso, event.day)}</span>
                </div>

                {Array.isArray(event.segments) && event.segments.length > 0 ? (
                  <div className={styles.recentSegmentList}>
                    {event.segments.map((segment, index) => (
                      <div key={`${event.id}-segment-${index}`} className={styles.recentSegmentCard}>
                        <p className={styles.recentSegmentType}>
                          {t(`dashboard.segments.${segment.segmentType}`, {
                            defaultValue: t('dashboard.segments.unknown'),
                          })}
                        </p>
                        {segment.cancelled ? <MatchHealthSummary segment={segment} /> : null}
                        {Array.isArray(segment.participantDetails) && segment.participantDetails.length > 0 ? (
                          <div className={styles.recentParticipantsGrid}>
                            {segment.participantDetails.map((participant) => (
                              <div
                                key={`${event.id}-${index}-${participant.employeeId || participant.name}`}
                                className={styles.recentParticipantCard}
                              >
                                <img
                                  src={participant.imageUrl || getFallbackImage(participant.gender)}
                                  alt={participant.name}
                                  loading="lazy"
                                  onError={(eventRef) => {
                                    if (!eventRef.currentTarget.dataset.fallbackApplied) {
                                      eventRef.currentTarget.dataset.fallbackApplied = '1'
                                      eventRef.currentTarget.src = getFallbackImage(participant.gender)
                                    }
                                  }}
                                />
                                <span>{participant.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.recentNoParticipants}>{t('dashboard.events.noParticipantsRecorded')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.recentNoParticipants}>{t('dashboard.events.noSegmentsRecorded')}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <EventCreateModal
        isOpen={isModalOpen}
        eventToEdit={eventToEdit}
        initialSpecificDate={initialSpecificDate}
        currentWeek={week}
        currentDay={day}
        startDateIso={startDateIso}
        onClose={handleCloseModal}
        onSubmit={handleModalSubmit}
        onDelete={handleDeleteEvent}
      />
    </section>
  )
}

export default ManageEventsModule