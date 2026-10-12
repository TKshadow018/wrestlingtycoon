import { getGameDayDifference, parseGameDate, toGameDateIso } from './gameCalendar'

const addDays = (date, days) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() + days)
  return result
}

const getGameDay = (startDate, date) => getGameDayDifference(startDate, date) + 1

export const getBoardMeetingSchedule = ({
  startDateIso,
  customEvents = [],
  throughDate,
}) => {
  const startDate = parseGameDate(startDateIso)
  if (!startDate || !(throughDate instanceof Date) || Number.isNaN(throughDate.getTime())) {
    return []
  }

  const normalizedStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const normalizedThroughDate = new Date(throughDate.getFullYear(), throughDate.getMonth(), throughDate.getDate())
  if (normalizedThroughDate < normalizedStartDate) {
    return []
  }

  const occupiedBoardMeetingDates = new Set()
  const meetings = []
  let lastScheduledDate = null

  const isOccupied = (date) => {
    const dateKey = toGameDateIso(date)
    if (date.getDay() === 5 || occupiedBoardMeetingDates.has(dateKey)) {
      return true
    }

    return customEvents.some((event) => {
      const eventDate = parseGameDate(event?.specificDate)
      if (eventDate) {
        if (toGameDateIso(eventDate) === dateKey) {
          return true
        }

        if (
          event.isRecurringAnnually
          && eventDate.getFullYear() < date.getFullYear()
          && eventDate.getMonth() === date.getMonth()
          && eventDate.getDate() === date.getDate()
        ) {
          return true
        }
      }

      const scheduledDay = Number(event?.scheduledDay)
      return Number.isInteger(scheduledDay)
        && scheduledDay >= 1
        && toGameDateIso(addDays(normalizedStartDate, scheduledDay - 1)) === dateKey
    })
  }

  let monthCursor = new Date(normalizedStartDate.getFullYear(), normalizedStartDate.getMonth(), 1)
  const endMonth = new Date(normalizedThroughDate.getFullYear(), normalizedThroughDate.getMonth(), 1)

  while (monthCursor <= endMonth) {
    const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)

    if (firstOfMonth >= normalizedStartDate) {
      let scheduledDate = firstOfMonth
      if (lastScheduledDate && scheduledDate <= lastScheduledDate) {
        scheduledDate = addDays(lastScheduledDate, 1)
      }

      while (isOccupied(scheduledDate)) {
        scheduledDate = addDays(scheduledDate, 1)
      }

      const scheduledDay = getGameDay(normalizedStartDate, scheduledDate)
      meetings.push({
        eventId: `board-meeting-${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`,
        name: 'Board Meeting',
        type: 'boardMeeting',
        scheduledDay,
        scheduledWeek: Math.floor((scheduledDay - 1) / 7) + 1,
        month: scheduledDate.getMonth() + 1,
        year: scheduledDate.getFullYear(),
        specificDate: toGameDateIso(scheduledDate),
        isSystem: true,
        isNonWrestling: true,
        isRecurring: true,
      })
      occupiedBoardMeetingDates.add(toGameDateIso(scheduledDate))
      lastScheduledDate = scheduledDate
    }

    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)
  }

  return meetings
}
