const DEFAULT_DYNAMIC_TICKET_PRICING = {
  enabled: true,
  ratingReference: 8,
  ratingSensitivity: 0.1,
  minMultiplier: 0.5,
  maxMultiplier: 1.5,
  randomRange: 0.1,
  regularRepeatPenalty: 0.1,
  lowerPriceElasticity: 0.5,
  higherPriceElasticity: 2.5,
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const getEventDay = (entry) => {
  const scheduledDay = Number(entry?.scheduledDay)
  if (Number.isInteger(scheduledDay) && scheduledDay > 0) {
    return scheduledDay
  }

  const day = Number(entry?.day)
  return Number.isInteger(day) && day > 0 ? day : null
}

const getPreviousMonthWindow = (eventDay) => {
  const currentDay = Math.max(1, Math.floor(toFiniteNumber(eventDay, 1)))
  const currentMonthIndex = Math.floor((currentDay - 1) / 30)
  return {
    startDay: currentMonthIndex > 0 ? ((currentMonthIndex - 1) * 30) + 1 : null,
    endDay: currentMonthIndex > 0 ? currentMonthIndex * 30 : null,
  }
}

const isInPreviousMonth = (day, eventDay) => {
  const window = getPreviousMonthWindow(eventDay)
  return window.startDay !== null && day >= window.startDay && day <= window.endDay
}

const isCompletedEvent = (entry) => entry?.type === 'success' || entry?.eventOutcomeType === 'success'

export const getPreviousMonthCompanyRating = ({ eventDay, eventLog = [], ratingReference = 8 } = {}) => {
  const ratings = (Array.isArray(eventLog) ? eventLog : [])
    .filter((entry) => isCompletedEvent(entry) && isInPreviousMonth(getEventDay(entry), eventDay))
    .map((entry) => Number(entry.overallRating))
    .filter(Number.isFinite)

  const recentAverageRating = ratings.length > 0
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null
  const safeReference = toFiniteNumber(ratingReference, DEFAULT_DYNAMIC_TICKET_PRICING.ratingReference)

  return {
    recentAverageRating,
    sampleSize: ratings.length,
    ratingReference: safeReference,
    ratingCoefficient: recentAverageRating === null
      ? 0
      : Math.round((recentAverageRating - safeReference) * 100) / 100,
    noPreviousMonthRating: ratings.length === 0,
  }
}

const getRivalAverageRating = (company, eventDay) => {
  const ratings = (Array.isArray(company?.eventHistory) ? company.eventHistory : [])
    .filter((event) => isInPreviousMonth(getEventDay(event), eventDay))
    .flatMap((event) => (Array.isArray(event?.matches) ? event.matches : []))
    .map((match) => Number(match?.matchRating))
    .filter(Number.isFinite)

  return ratings.length > 0
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null
}

export const getRivalPerformanceRanking = ({
  companyRating,
  eventDay,
  competitorCompanies = [],
  baseTicketPrice = 0,
  rankAdjustments = {},
} = {}) => {
  const safeCompanyRating = Number(companyRating)
  const validCompanyRating = companyRating !== null && companyRating !== undefined && Number.isFinite(safeCompanyRating)
  const comparisons = (Array.isArray(competitorCompanies) ? competitorCompanies : [])
    .map((company) => ({
      id: String(company?.id || ''),
      averageRating: getRivalAverageRating(company, eventDay),
    }))
    .filter((company) => company.id && company.averageRating !== null)

  if (!validCompanyRating) {
    return {
      rivalRank: null,
      rankedCompanyCount: comparisons.length,
      rankAdjustment: 0,
      rivalAdjustment: 0,
      comparisons,
      noCompanyRating: true,
      noComparableRivals: comparisons.length === 0,
    }
  }

  const ranked = [
    { id: 'player', averageRating: safeCompanyRating },
    ...comparisons,
  ].sort((left, right) => (
    right.averageRating - left.averageRating || left.id.localeCompare(right.id)
  ))
  const rivalRank = ranked.findIndex(({ id }) => id === 'player') + 1
  const rankedCompanyCount = ranked.length
  const safeRankAdjustments = {
    first: toFiniteNumber(rankAdjustments.first, 0.2),
    second: toFiniteNumber(rankAdjustments.second, 0.1),
    third: toFiniteNumber(rankAdjustments.third, -0.1),
    last: toFiniteNumber(rankAdjustments.last, -0.2),
  }
  let rankAdjustment = 0
  if (rivalRank === 1) {
    rankAdjustment = safeRankAdjustments.first
  } else if (rivalRank === 2) {
    rankAdjustment = safeRankAdjustments.second
  } else if (rivalRank === rankedCompanyCount) {
    rankAdjustment = safeRankAdjustments.last
  } else if (rivalRank === rankedCompanyCount - 1) {
    rankAdjustment = safeRankAdjustments.third
  }

  return {
    rivalRank,
    rankedCompanyCount,
    rankAdjustment,
    rivalAdjustment: Math.round(toFiniteNumber(baseTicketPrice) * rankAdjustment * 100) / 100,
    comparisons: ranked,
    noCompanyRating: false,
    noComparableRivals: comparisons.length === 0,
  }
}

export const countEarlierSameWeekRegularEvents = ({ eventType, eventDay, eventLog = [] } = {}) => {
  if (eventType !== 'regularWeekly') {
    return 0
  }

  const currentDay = getEventDay({ day: eventDay })
  if (!currentDay) {
    return 0
  }

  const currentWeek = Math.floor((currentDay - 1) / 7) + 1
  return (Array.isArray(eventLog) ? eventLog : []).filter((entry) => {
    if (entry?.eventType !== 'regularWeekly' && entry?.type !== 'regularWeekly') {
      return false
    }
    const eventDayValue = getEventDay(entry)
    const eventWeek = eventDayValue ? Math.floor((eventDayValue - 1) / 7) + 1 : null
    return eventDayValue < currentDay && eventWeek === currentWeek
  }).length
}

const normalizeConfig = (config = {}) => ({
  ...DEFAULT_DYNAMIC_TICKET_PRICING,
  ...(config || {}),
})

export const calculateTicketDemandFactor = ({
  selectedTicketPrice,
  recommendedTicketPrice,
  config = {},
} = {}) => {
  const selected = Math.max(0, toFiniteNumber(selectedTicketPrice))
  const recommended = Math.max(0, toFiniteNumber(recommendedTicketPrice))
  if (recommended <= 0) {
    return selected <= 0 ? 1 : 0
  }
  if (selected <= 0) {
    return 0
  }

  const normalizedConfig = normalizeConfig(config)
  if (!normalizedConfig.enabled) {
    return 1
  }
  const priceRatio = selected / recommended
  if (priceRatio <= 1) {
    return Math.pow(1 / priceRatio, Math.max(0, toFiniteNumber(normalizedConfig.lowerPriceElasticity, 0.5)))
  }

  return Math.pow(1 / priceRatio, Math.max(0, toFiniteNumber(normalizedConfig.higherPriceElasticity, 2.5)))
}

export const calculateTicketGateRevenue = ({
  attendance,
  selectedTicketPrice,
  recommendedTicketPrice,
  config = {},
} = {}) => {
  const safeAttendance = Math.max(0, toFiniteNumber(attendance))
  const safePrice = Math.max(0, toFiniteNumber(selectedTicketPrice))
  const demandFactor = calculateTicketDemandFactor({
    selectedTicketPrice: safePrice,
    recommendedTicketPrice,
    config,
  })
  return Math.round(safeAttendance * demandFactor * safePrice)
}

export const calculateDynamicTicketPrice = ({
  eventType,
  eventDay,
  baseTicketPrice,
  eventLog = [],
  competitorCompanies = [],
  random = Math.random,
  config = {},
} = {}) => {
  const normalizedConfig = normalizeConfig(config)
  const safeBasePrice = Math.max(0, toFiniteNumber(baseTicketPrice))
  const effectiveConfig = normalizedConfig.enabled
    ? normalizedConfig
    : {
        ...normalizedConfig,
        ratingSensitivity: 0,
        randomRange: 0,
        regularRepeatPenalty: 0,
        rankAdjustments: { first: 0, second: 0, third: 0, last: 0 },
      }
  const rating = getPreviousMonthCompanyRating({
    eventDay,
    eventLog,
    ratingReference: effectiveConfig.ratingReference,
  })
  const ratingCoefficient = clamp(
    rating.ratingCoefficient,
    -2,
    2,
  )
  const ratingAdjustment = safeBasePrice * ratingCoefficient * toFiniteNumber(effectiveConfig.ratingSensitivity)
  const ranking = getRivalPerformanceRanking({
    companyRating: rating.recentAverageRating,
    eventDay,
    competitorCompanies,
    baseTicketPrice: safeBasePrice,
    rankAdjustments: effectiveConfig.rankAdjustments,
  })
  const randomValue = clamp(toFiniteNumber(random(), 0.5), 0, 1)
  const randomAdjustment = safeBasePrice * ((randomValue * 2) - 1) * toFiniteNumber(effectiveConfig.randomRange)
  const sameWeekRegularEventCount = countEarlierSameWeekRegularEvents({ eventType, eventDay, eventLog })
  const sameWeekPenalty = eventType === 'regularWeekly'
    ? -safeBasePrice * toFiniteNumber(effectiveConfig.regularRepeatPenalty) * sameWeekRegularEventCount
    : 0
  const rawRecommendedPrice = safeBasePrice
    + ratingAdjustment
    + ranking.rivalAdjustment
    + randomAdjustment
    + sameWeekPenalty
  const priceLowerBound = safeBasePrice * toFiniteNumber(normalizedConfig.minMultiplier)
  const priceUpperBound = safeBasePrice * toFiniteNumber(normalizedConfig.maxMultiplier)
  const clampedPrice = clamp(rawRecommendedPrice, priceLowerBound, priceUpperBound)
  const integerLowerBound = Math.ceil(priceLowerBound)
  const integerUpperBound = Math.floor(priceUpperBound)
  const recommendedTicketPrice = safeBasePrice <= 0
    ? 0
    : clamp(Math.round(clampedPrice), integerLowerBound, Math.max(integerLowerBound, integerUpperBound))

  return {
    eventType,
    baseTicketPrice: safeBasePrice,
    recentAverageRating: rating.recentAverageRating,
    ratingReference: rating.ratingReference,
    ratingCoefficient,
    ratingAdjustment: Math.round(ratingAdjustment * 100) / 100,
    rivalRank: ranking.rivalRank,
    rankedCompanyCount: ranking.rankedCompanyCount,
    rivalRankAdjustment: ranking.rankAdjustment,
    rivalAdjustment: ranking.rivalAdjustment,
    randomValue,
    randomAdjustment: Math.round(randomAdjustment * 100) / 100,
    sameWeekRegularEventCount,
    sameWeekPenalty: Math.round(sameWeekPenalty * 100) / 100,
    rawRecommendedPrice: Math.round(rawRecommendedPrice * 100) / 100,
    recommendedTicketPrice,
    priceLowerBound,
    priceUpperBound,
    noPreviousMonthRating: rating.noPreviousMonthRating,
    noComparableRivals: ranking.noComparableRivals,
    noCompanyRating: ranking.noCompanyRating,
    priceDemandModel: {
      lowerPriceElasticity: effectiveConfig.lowerPriceElasticity,
      higherPriceElasticity: effectiveConfig.higherPriceElasticity,
    },
  }
}

export { DEFAULT_DYNAMIC_TICKET_PRICING }
