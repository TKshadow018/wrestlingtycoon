import { parseGameDate } from './gameCalendar'

const isRegularWeeklyGameDay = (startDateIso, day) => {
  if (typeof startDateIso !== 'string' || !Number.isInteger(Number(day)) || Number(day) < 1) {
    return false
  }

  const startDate = parseGameDate(startDateIso)
  if (!startDate) {
    return false
  }

  const gameDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  gameDate.setDate(gameDate.getDate() + Number(day) - 1)
  return gameDate.getDay() === 5
}

export const isRegularWeeklyEvent = (event) => (
  event?.eventId === 'regular-weekly-event'
  || event?.type === 'regularWeekly'
  || event?.eventType === 'regularWeekly'
)

export const getEventTypeKey = (event) => {
  if (isRegularWeeklyEvent(event)) {
    return 'regularWeekly'
  }

  return event?.eventType || event?.type || null
}

export const getEventDisplayName = (
  event,
  t,
  eventLog = [],
  unknownKey = 'dashboard.eventTypes.unknown',
  startDateIso = '',
) => {
  const legacyEventForDay = Array.isArray(eventLog)
    ? eventLog.find((entry) => Number(entry?.day) === Number(event?.day))
    : null

  if (isRegularWeeklyEvent(event) || isRegularWeeklyEvent(legacyEventForDay)) {
    return t('dashboard.eventTypes.regularWeekly')
  }
  if (!legacyEventForDay && isRegularWeeklyGameDay(startDateIso, event?.day)) {
    return t('dashboard.eventTypes.regularWeekly')
  }

  return event?.eventName || event?.name || t(unknownKey)
}
