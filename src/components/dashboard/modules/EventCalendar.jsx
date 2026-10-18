import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBoardMeetingSchedule } from '../../../utils/boardMeetings'
import { getGameDateFromDay, parseGameDate } from '../../../utils/gameCalendar'
import { getBoardMeetingImageUrl } from '../../../utils/boardMeetingVisuals'
import styles from './EventCalendar.module.scss'

const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// Build calendar grid for given month/year
const buildCalendarGrid = (month, year) => {
  const firstDate = new Date(year, month - 1, 1)
  const jsStartDay = firstDate.getDay()
  const monthStartDay = (jsStartDay + 6) % 7 // Convert JS Sun=0 to Mon=0
  const daysInMonth = new Date(year, month, 0).getDate()
  const grid = []
  let week = []

  // Add empty cells for days before month starts
  for (let i = 0; i < monthStartDay; i++) {
    week.push(null)
  }

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day)
    if (week.length === 7) {
      grid.push(week)
      week = []
    }
  }

  // Fill remaining slots
  if (week.length > 0) {
    while (week.length < 7) {
      week.push(null)
    }
    grid.push(week)
  }

  return grid
}

const parseIsoDateLocal = (isoDateString) => parseGameDate(isoDateString)

const formatGameDateFromDay = (startDateIso, gameDay) => {
  const gameDate = getGameDateFromDay(startDateIso, Math.max(1, Number(gameDay) || 1))
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const getEventImageUrl = (event) => event?.imageUrl || event?.image_url || ''

function EventCalendar({ gameDay, startDateIso, regularWeeklyEvent, customEvents, onDaySelect }) {
  const { t } = useTranslation()
  const gameToday = useMemo(() => {
    return getGameDateFromDay(startDateIso, Math.max(1, Number(gameDay) || 1))
  }, [startDateIso, gameDay])
  const [viewMonth, setViewMonth] = useState(() => gameToday.getMonth() + 1)
  const [viewYear, setViewYear] = useState(() => gameToday.getFullYear())

  const calendarGrid = useMemo(() => buildCalendarGrid(viewMonth, viewYear), [viewMonth, viewYear])

  const boardMeetings = useMemo(
    () => getBoardMeetingSchedule({
      startDateIso,
      customEvents,
      throughDate: new Date(viewYear, viewMonth, 0),
    }),
    [customEvents, startDateIso, viewMonth, viewYear],
  )

  // Map events to calendar dates
  const eventsByDay = useMemo(() => {
    const eventMap = {}
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()

    // Add regular weekly event every Friday (day index 4 in the week)
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(viewYear, viewMonth - 1, d)
      if (currentDate.getDay() === 5) {
        eventMap[d] = eventMap[d] || []
        eventMap[d].push({
          id: `regular-weekly-event-${viewYear}-${viewMonth}-${d}`,
          name: t('dashboard.eventTypes.regularWeekly'),
          type: regularWeeklyEvent.type,
          isSystem: true,
          maxMatches: regularWeeklyEvent.maxMatches,
        })
      }
    }

    // Add custom events by their specific date
    customEvents.forEach((event) => {
      if (event.specificDate) {
        const eventDate = parseIsoDateLocal(event.specificDate)
        if (!eventDate || Number.isNaN(eventDate.getTime())) {
          return
        }
        const eventMonth = eventDate.getMonth() + 1
        const eventDay = eventDate.getDate()
        const eventYear = eventDate.getFullYear()

        // Check if this event is in the current calendar month
        if (eventMonth === viewMonth && eventYear === viewYear) {
          eventMap[eventDay] = eventMap[eventDay] || []
          eventMap[eventDay].push(event)
        }

        // Handle recurring annually
        if (event.isRecurringAnnually && eventYear < viewYear) {
          if (eventMonth === viewMonth) {
            eventMap[eventDay] = eventMap[eventDay] || []
            eventMap[eventDay].push({
              ...event,
              isRecurring: true,
            })
          }
        }
      }
    })

    boardMeetings.forEach((meeting) => {
      const meetingDate = parseIsoDateLocal(meeting.specificDate)
      if (!meetingDate || meetingDate.getMonth() + 1 !== viewMonth || meetingDate.getFullYear() !== viewYear) {
        return
      }

      const eventDay = meetingDate.getDate()
      const isJanuary = meetingDate.getMonth() === 0
      eventMap[eventDay] = eventMap[eventDay] || []
      eventMap[eventDay].push({
        ...meeting,
        name: t('dashboard.events.boardMeeting'),
        imageUrl: getBoardMeetingImageUrl(isJanuary),
      })
    })

    return eventMap
  }, [boardMeetings, customEvents, regularWeeklyEvent, t, viewMonth, viewYear])

  const isToday = (calendarDay) => {
    if (!calendarDay) return false
    return (
      gameToday.getDate() === calendarDay
      && gameToday.getMonth() + 1 === viewMonth
      && gameToday.getFullYear() === viewYear
    )
  }

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const toIsoDate = (year, month, day) => {
    const paddedMonth = String(month).padStart(2, '0')
    const paddedDay = String(day).padStart(2, '0')
    return `${year}-${paddedMonth}-${paddedDay}`
  }

  const handleDayClick = (calendarDay) => {
    if (!calendarDay) {
      return
    }

    const dayEvents = eventsByDay[calendarDay] || []
    if (dayEvents.some((event) => event.isNonWrestling)) {
      return
    }

    const customEvent = dayEvents.find(
      (event) => Boolean(event.eventId) && event.type !== 'regularWeekly' && !event.isNonWrestling,
    )

    if (customEvent) {
      onDaySelect?.({ mode: 'edit', event: customEvent })
      return
    }

    onDaySelect?.({ mode: 'create', specificDate: toIsoDate(viewYear, viewMonth, calendarDay) })
  }

  return (
    <div className={styles.calendarContainer}>
      <div className={styles.calendarHeader}>
        <button className={styles.navButton} onClick={handlePrevMonth} aria-label={t('dashboard.accessibility.previousMonth')}>
          ← {t('dashboard.calendar.previous')}
        </button>
        <div className={styles.monthYearDisplay}>
          <h3>
            {t(`dashboard.calendar.months.${monthKeys[viewMonth - 1]}`)} {viewYear}
          </h3>
          <p className={styles.currentDay}>{formatGameDateFromDay(startDateIso, gameDay)}</p>
        </div>
        <button className={styles.navButton} onClick={handleNextMonth} aria-label={t('dashboard.accessibility.nextMonth')}>
          {t('dashboard.calendar.next')} →
        </button>
      </div>

      <div className={styles.weekDayLabels}>
        {dayKeys.map((dayKey) => (
          <div key={dayKey} className={styles.dayLabel}>
            {t(`dashboard.calendar.weekdaysShort.${dayKey}`)}
          </div>
        ))}
      </div>

      <div className={styles.calendarGrid}>
        {calendarGrid.map((week, weekIdx) =>
          week.map((calendarDay, dayIdx) => {
            const dayEvents = eventsByDay[calendarDay] || []
            const displayEvent = dayEvents.find((event) => Boolean(event.eventId) && event.type !== 'regularWeekly') || dayEvents[0] || null
            const isTodayCell = isToday(calendarDay)
            const displayEventImageUrl = getEventImageUrl(displayEvent)
            const isCustomDisplayEvent = Boolean(displayEvent?.eventId)
              && displayEvent?.type !== 'regularWeekly'
              && !displayEvent?.isNonWrestling
            const displayEventClass = displayEvent?.type === 'regularWeekly'
              ? styles.regularWeekly
              : displayEvent?.isNonWrestling
                ? styles.boardMeeting
                : styles.custom

            return (
              <div
                key={`${weekIdx}-${dayIdx}`}
                className={`${styles.calendarDay} ${calendarDay ? styles.inMonth : styles.outOfMonth} ${isTodayCell ? styles.today : ''}`}
                onClick={() => handleDayClick(calendarDay)}
              >
                {calendarDay && (
                  <>
                    <div className={styles.dayNumber}>{calendarDay}</div>
                    <div className={styles.eventsList}>
                      {displayEvent ? (
                        <div
                          className={`${styles.eventBadge} ${styles.fullDayEvent} ${displayEventClass}`}
                          title={displayEvent.name}
                        >
                          {displayEvent?.isNonWrestling && displayEventImageUrl ? (
                            <img className={styles.eventPosterImage} src={displayEventImageUrl} alt={displayEvent.name} />
                          ) : isCustomDisplayEvent && displayEventImageUrl ? (
                            <button
                              type="button"
                              className={styles.eventPosterButton}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation()
                                onDaySelect?.({ mode: 'edit', event: displayEvent })
                              }}
                              title={t('dashboard.accessibility.editEvent', { name: displayEvent.name })}
                            >
                              <img className={styles.eventPosterImage} src={displayEventImageUrl} alt={displayEvent.name} />
                            </button>
                          ) : isCustomDisplayEvent ? (
                            <button
                              type="button"
                              className={styles.eventEditButton}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation()
                                onDaySelect?.({ mode: 'edit', event: displayEvent })
                              }}
                              title={t('dashboard.accessibility.editEvent', { name: displayEvent.name })}
                            >
                              <span className={styles.eventName}>{displayEvent.name}</span>
                              {displayEvent.isRecurring && <span className={styles.recurring}>↻</span>}
                            </button>
                          ) : (
                            <>
                              <span className={styles.eventName}>{displayEvent.name}</span>
                              {displayEvent.isRecurring && <span className={styles.recurring}>↻</span>}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className={styles.eventLegend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.regularWeekly}`}></div>
          <span>{t('dashboard.eventTypes.regularWeeklyLegend')}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.custom}`}></div>
          <span>{t('dashboard.events.customEventLegend')}</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.boardMeeting}`}></div>
          <span>{t('dashboard.events.boardMeetingLegend')}</span>
        </div>
      </div>
    </div>
  )
}

export default EventCalendar
