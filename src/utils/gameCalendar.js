const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export const parseGameDate = (dateString) => {
  if (typeof dateString !== 'string') {
    return null
  }

  const match = dateString.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }

  return date
}

export const normalizeGameDate = (dateString) => {
  if (dateString == null || String(dateString).trim() === '') {
    return ''
  }

  const date = parseGameDate(String(dateString))
  if (!date) {
    throw new Error(`Invalid game date "${dateString}". Use YYYY-MM-DD.`)
  }

  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export const resolveGameCalendarStartDate = ({
  configuredStartDateIso,
  persistedStartDateIso,
  fallbackStartDateIso,
}) => {
  if (configuredStartDateIso) {
    return normalizeGameDate(configuredStartDateIso)
  }

  if (persistedStartDateIso) {
    const persistedDate = parseGameDate(String(persistedStartDateIso))
    if (persistedDate) {
      return toGameDateIso(persistedDate)
    }
  }

  return normalizeGameDate(fallbackStartDateIso)
}

export const toGameDateIso = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('A valid date is required to format a game date')
  }

  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export const getGameDayDifference = (fromDate, toDate) => {
  if (
    !(fromDate instanceof Date)
    || Number.isNaN(fromDate.getTime())
    || !(toDate instanceof Date)
    || Number.isNaN(toDate.getTime())
  ) {
    throw new Error('Valid start and target dates are required to calculate game-day difference')
  }

  const fromOrdinal = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
  const toOrdinal = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate())
  return Math.round((toOrdinal - fromOrdinal) / DAY_IN_MILLISECONDS)
}

export const getGameDateFromDay = (startDateIso, gameDay) => {
  const startDate = parseGameDate(normalizeGameDate(startDateIso))
  const numericGameDay = Number(gameDay)
  if (!startDate || !Number.isInteger(numericGameDay) || numericGameDay < 1) {
    throw new Error('A valid start date and positive game day are required')
  }

  const gameDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  gameDate.setDate(gameDate.getDate() + numericGameDay - 1)
  return gameDate
}

export const toGameDateStartOfDay = (date) => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate())
)

export const getGameDateFromDayOrFallback = (startDateIso, gameDay, fallbackDate = new Date()) => {
  const startDate = parseGameDate(startDateIso) || fallbackDate
  const numericGameDay = Math.max(1, Math.floor(Number(gameDay || 1)))

  return getGameDateFromDay(toGameDateIso(startDate), numericGameDay)
}
