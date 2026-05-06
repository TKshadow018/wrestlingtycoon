import { useMemo, useState } from 'react'
import styles from './EventCalendar.module.scss'

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

const formatGameDateFromDay = (startDateIso, gameDay) => {
  const baseDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(gameDay || 1) - 1))
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const getEventImageUrl = (event) => event?.imageUrl || event?.image_url || ''

function EventCalendar({ gameDay, startDateIso, regularWeeklyEvent, customEvents, onDaySelect }) {
  const gameToday = useMemo(() => {
    const base = parseIsoDateLocal(startDateIso)
    const d = base ? toStartOfDay(base) : toStartOfDay(new Date())
    d.setDate(d.getDate() + Math.max(0, Number(gameDay || 1) - 1))
    return d
  }, [startDateIso, gameDay])
  const [viewMonth, setViewMonth] = useState(() => gameToday.getMonth() + 1)
  const [viewYear, setViewYear] = useState(() => gameToday.getFullYear())

  const calendarGrid = useMemo(() => buildCalendarGrid(viewMonth, viewYear), [viewMonth, viewYear])

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
          name: regularWeeklyEvent.name,
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

    return eventMap
  }, [viewMonth, viewYear, regularWeeklyEvent, customEvents])

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
    const customEvent = dayEvents.find((event) => Boolean(event.eventId) && event.type !== 'regularWeekly')

    if (customEvent) {
      onDaySelect?.({ mode: 'edit', event: customEvent })
      return
    }

    onDaySelect?.({ mode: 'create', specificDate: toIsoDate(viewYear, viewMonth, calendarDay) })
  }

  return (
    <div className={styles.calendarContainer}>
      <div className={styles.calendarHeader}>
        <button className={styles.navButton} onClick={handlePrevMonth} aria-label="Previous month">
          ← Previous
        </button>
        <div className={styles.monthYearDisplay}>
          <h3>
            {monthNames[viewMonth - 1]} {viewYear}
          </h3>
          <p className={styles.currentDay}>{formatGameDateFromDay(startDateIso, gameDay)}</p>
        </div>
        <button className={styles.navButton} onClick={handleNextMonth} aria-label="Next month">
          Next →
        </button>
      </div>

      <div className={styles.weekDayLabels}>
        {dayNames.map((dayName) => (
          <div key={dayName} className={styles.dayLabel}>
            {dayName}
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
            const isCustomDisplayEvent = Boolean(displayEvent?.eventId) && displayEvent?.type !== 'regularWeekly'

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
                          className={`${styles.eventBadge} ${styles.fullDayEvent} ${displayEvent.type === 'regularWeekly' ? styles.regularWeekly : styles.custom}`}
                          title={displayEvent.name}
                        >
                          {isCustomDisplayEvent && displayEventImageUrl ? (
                            <button
                              type="button"
                              className={styles.eventPosterButton}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation()
                                onDaySelect?.({ mode: 'edit', event: displayEvent })
                              }}
                              title={`Edit ${displayEvent.name}`}
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
                              title={`Edit ${displayEvent.name}`}
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
          <span>Regular Weekly Event (Fridays)</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.custom}`}></div>
          <span>Custom Event</span>
        </div>
      </div>
    </div>
  )
}

export default EventCalendar
