import { useState } from 'react'
import { useGameStore } from '../../../store/useGameStore'
import EventCreateModal from './EventCreateModal'
import EventCalendar from './EventCalendar'
import styles from './ManageEventsModule.module.scss'

const FEMALE_FALLBACK_IMAGE = '/people/girl.png'
const MALE_FALLBACK_IMAGE = '/people/boy.png'

const getFallbackImage = (gender) => (gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)

const getWeekFromDay = (day) => Math.floor((day - 1) / 7) + 1

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

const formatGameDateFromDay = (startDateIso, day) => {
  const baseDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const getScheduledWeekFromSpecificDate = (specificDate, currentGameDay, startDateIso) => {
  if (!specificDate) {
    return getWeekFromDay(currentGameDay)
  }

  const parsedDate = parseIsoDateLocal(specificDate)
  const selectedDate = parsedDate ? toStartOfDay(parsedDate) : null
  const parsedStartDate = parseIsoDateLocal(startDateIso)
  const today = parsedStartDate ? toStartOfDay(parsedStartDate) : toStartOfDay(new Date())

  if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
    return getWeekFromDay(currentGameDay)
  }

  const diffMs = selectedDate.getTime() - today.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  const targetGameDay = currentGameDay + diffDays

  return getWeekFromDay(targetGameDay)
}

function ManageEventsModule() {
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

  return (
    <section className={styles.moduleBody}>
      <div className={styles.headerSection}>
        <h3>Events Calendar</h3>
        <button className={styles.createButton} onClick={handleOpenModal}>
          + Create Event
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
          <p>Latest Event Outcome</p>
          <h4>{lastOutcome.type === 'success' ? `${lastOutcome.eventName} delivered a strong show` : 'No event outcome available'}</h4>

          {lastOutcome.audience != null && (
            <div className={styles.outcomeRow}>
              <span>Audience</span>
              <span>{lastOutcome.audience.toLocaleString()} attendees</span>
            </div>
          )}

          {lastOutcome.overallRating != null && (
            <div className={styles.outcomeRow}>
              <span>Overall Rating</span>
              <span>★ {lastOutcome.overallRating} / 10</span>
            </div>
          )}

          <div className={styles.outcomeRow}>
            <span>Fans</span>
            <span className={lastOutcome.fanDelta >= 0 ? styles.positive : styles.negative}>
              {lastOutcome.fanDelta >= 0 ? '+' : ''}{lastOutcome.fanDelta}
            </span>
          </div>

          <div className={styles.outcomeRow}>
            <span>Prestige</span>
            <span className={lastOutcome.prestigeDelta >= 0 ? styles.positive : styles.negative}>
              {lastOutcome.prestigeDelta >= 0 ? '+' : ''}{lastOutcome.prestigeDelta}
            </span>
          </div>

          {lastOutcome.incomeBreakdown && (
            <div className={styles.breakdownSection}>
              <p className={styles.breakdownTitle}>Day Earnings Breakdown</p>
              <div className={styles.outcomeRow}>
                <span>Event Gate</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.eventGate || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Merchandise</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.merchandise || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Sponsor</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.sponsor || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Web Subscriptions</span>
                <span className={styles.positive}>+$ {(lastOutcome.incomeBreakdown.webSubscription || 0).toLocaleString()}</span>
              </div>
              {(lastOutcome.incomeBreakdown.thirdParty || 0) > 0 && (
                <div className={styles.outcomeRow}>
                  <span>3rd Party</span>
                  <span className={styles.positive}>+$ {lastOutcome.incomeBreakdown.thirdParty.toLocaleString()}</span>
                </div>
              )}
              <div className={`${styles.outcomeRow} ${styles.outcomeTotal}`}>
                <span>Total Income</span>
                <span className={styles.positive}>$ {(lastOutcome.totalDayIncome || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          {lastOutcome.expenseBreakdown && (
            <div className={styles.breakdownSection}>
              <p className={styles.breakdownTitle}>Day Cost Breakdown</p>
              <div className={styles.outcomeRow}>
                <span>Event Cost</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.eventCost || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Wrestler Payroll</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.wrestlerPayroll || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Staff Cost</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.staffCost || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Operating Cost</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.operatingCost || 0).toLocaleString()}</span>
              </div>
              <div className={styles.outcomeRow}>
                <span>Other Cost</span>
                <span className={styles.negative}>-$ {(lastOutcome.expenseBreakdown.otherCost || 0).toLocaleString()}</span>
              </div>
              <div className={`${styles.outcomeRow} ${styles.outcomeTotal}`}>
                <span>Total Expenses</span>
                <span className={styles.negative}>$ {(lastOutcome.totalDayExpenses || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          {lastOutcome.setup && (
            <div className={styles.breakdownSection}>
              <p className={styles.breakdownTitle}>Participation ({lastOutcome.setup.uniqueParticipants} unique)</p>
              {lastOutcome.setup.segments.map((seg, i) => (
                <div key={i} className={styles.outcomeRow}>
                  <span className={styles.segType}>{seg.segmentType}</span>
                  <span>{seg.participants.join(', ') || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      ) : null}

      {recentEvents.length > 0 ? (
        <section className={styles.recentHistorySection}>
          <h4 className={styles.recentHistoryTitle}>Recent 5 Event Histories</h4>
          <div className={styles.recentHistoryList}>
            {recentEvents.map((event) => (
              <article key={event.id} className={styles.recentEventCard}>
                <div className={styles.recentEventHeader}>
                  <strong>{event.eventName}</strong>
                  <span>{formatGameDateFromDay(startDateIso, event.day)}</span>
                </div>

                {Array.isArray(event.segments) && event.segments.length > 0 ? (
                  <div className={styles.recentSegmentList}>
                    {event.segments.map((segment, index) => (
                      <div key={`${event.id}-segment-${index}`} className={styles.recentSegmentCard}>
                        <p className={styles.recentSegmentType}>{segment.segmentType}</p>
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
                          <p className={styles.recentNoParticipants}>No participants recorded.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.recentNoParticipants}>No segments recorded.</p>
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