import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { GAME_CONFIG, MANAGEMENT_MODULES } from '../config/gameConfig'
import { createEmployeeCandidates } from '../data/employeeMarket'
import { createEventTemplates } from '../data/eventTemplates'
import { createSponsorOffers, SPONSOR_TYPE_CONFIG } from '../data/sponsorOffers'
import { clampHeelFaceMeter, DEFAULT_HEEL_FACE_METER_VALUE } from '../utils/heelFaceMeter'
import preloadedEvents from '../data/preloadedEvents.json'
import titleCatalog from '../data/titles.json'

const normalizeTitleHolderIds = (title) => {
  const ids = [
    ...(Array.isArray(title?.holderEmployeeIds) ? title.holderEmployeeIds : []),
    ...(title?.holderEmployeeId ? [title.holderEmployeeId] : []),
  ].filter((id) => typeof id === 'string')

  if (title?.division === 'doubles') {
    return Array.from(new Set(ids)).slice(0, 2)
  }

  return ids.length > 0 ? [ids[0]] : []
}

const holdersKey = (holderIds = []) => [...holderIds].sort().join('::')

const normalizeTitleRecord = (title) => {
  const holderIds = normalizeTitleHolderIds(title)
  const hasHolder = holderIds.length > 0
  const normalizedStartDay = Number.isInteger(title?.currentHolderStartDay)
    ? title.currentHolderStartDay
    : (hasHolder ? 1 : null)

  return {
    ...title,
    holderEmployeeId: holderIds[0] || null,
    holderEmployeeIds: title?.division === 'doubles' ? holderIds : [],
    currentHolderStartDay: normalizedStartDay,
    holderHistory: Array.isArray(title?.holderHistory) ? title.holderHistory : [],
  }
}

const createInitialTitles = () => titleCatalog.map((title) => normalizeTitleRecord(title))

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const parseStartDateIso = (startDateIso) => {
  const parsed = new Date(`${startDateIso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return toStartOfDay(new Date())
  }

  return toStartOfDay(parsed)
}

const getGameDateFromDay = (startDateIso, day) => {
  const startDate = parseStartDateIso(startDateIso)
  const nextDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  nextDate.setDate(nextDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return nextDate
}

const isRegularWeeklyEventDay = (startDateIso, day) => {
  const gameDate = getGameDateFromDay(startDateIso, day)
  return gameDate.getDay() === 5
}

const calculateNextCalendar = (currentDay, startDateIso) => {
  const nextDay = currentDay + 1
  const isEventDay = isRegularWeeklyEventDay(startDateIso, nextDay)

  return {
    day: nextDay,
    week: Math.floor((nextDay - 1) / 7) + 1,
    isEventDay,
  }
}

const calculateNextEventDay = (currentDay, startDateIso) => {
  let nextDay = currentDay + 1
  while (!isRegularWeeklyEventDay(startDateIso, nextDay)) {
    nextDay += 1
  }
  return nextDay
}

const appendLedger = (ledger, entry) => {
  return [...(ledger || []), entry].slice(-120)
}

const DEFAULT_CONTRACT_LENGTH_MONTHS = 12
const MIN_CONTRACT_LENGTH_MONTHS = 1
const MAX_CONTRACT_LENGTH_MONTHS = 60

const toContractDurationDays = (contractLengthMonths) => {
  return Math.max(MIN_CONTRACT_LENGTH_MONTHS, Number(contractLengthMonths) || DEFAULT_CONTRACT_LENGTH_MONTHS) * 30
}

const clampContractLengthMonths = (value) => {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_CONTRACT_LENGTH_MONTHS
  }

  return Math.max(MIN_CONTRACT_LENGTH_MONTHS, Math.min(MAX_CONTRACT_LENGTH_MONTHS, Math.round(numericValue)))
}

const hasActiveContract = (employee, day) => {
  if (!employee?.contract?.endDay) {
    return true
  }

  return employee.contract.endDay >= day
}

const filterActiveEmployees = (employees = [], day = 1) => {
  return employees.filter((employee) => hasActiveContract(employee, day))
}

const normalizePersistedEmployees = (employees = [], day = 1) => {
  return (employees || []).map((employee) => {
    const contractStartDay = Number.isInteger(employee?.contract?.startDay)
      ? employee.contract.startDay
      : Math.max(1, day - 1)
    const contractLengthMonths = Number.isInteger(employee?.contract?.contractLengthMonths)
      ? employee.contract.contractLengthMonths
      : DEFAULT_CONTRACT_LENGTH_MONTHS
    const contractDurationDays = Number.isInteger(employee?.contract?.durationDays)
      ? employee.contract.durationDays
      : toContractDurationDays(contractLengthMonths)
    const contractEndDay = Number.isInteger(employee?.contract?.endDay)
      ? employee.contract.endDay
      : contractStartDay + contractDurationDays

    const persistedMatchStats = employee?.matchStats
    const matchStats = persistedMatchStats && typeof persistedMatchStats === 'object'
      ? {
          totalMatches: Number(persistedMatchStats.totalMatches) || 0,
          totalWins: Number(persistedMatchStats.totalWins) || 0,
          totalLosses: Number(persistedMatchStats.totalLosses) || 0,
          matchHistory: Array.isArray(persistedMatchStats.matchHistory) ? persistedMatchStats.matchHistory : [],
        }
      : { totalMatches: 0, totalWins: 0, totalLosses: 0, matchHistory: [] }

    return {
      ...employee,
      popularity: clampPopularity(employee?.popularity ?? 0),
      happiness: shouldTrackHappiness(employee?.role)
        ? clampHappiness(employee?.happiness ?? DEFAULT_HAPPINESS)
        : employee?.happiness,
      lastHappinessInactivityPenaltyDay: Number.isInteger(employee?.lastHappinessInactivityPenaltyDay)
        ? employee.lastHappinessInactivityPenaltyDay
        : null,
      stamina: employee?.role === 'wrestler'
        ? clampStamina(employee?.stamina ?? MAX_STAMINA)
        : employee?.stamina,
      managerId: employee?.managerId || null,
      heelFaceMeter: clampHeelFaceMeter(employee?.heelFaceMeter ?? DEFAULT_HEEL_FACE_METER_VALUE),
      contract: {
        monthlySalary: employee?.contract?.monthlySalary || employee.salary || 0,
        perMatchSalary: employee?.contract?.perMatchSalary || 0,
        signingBonus: employee?.contract?.signingBonus || 0,
        contractLengthMonths,
        startDay: contractStartDay,
        durationDays: contractDurationDays,
        endDay: contractEndDay,
      },
      matchStats,
    }
  })
}

const getCandidatePersonId = (candidate) => {
  if (typeof candidate?.id === 'string') {
    return candidate.id
  }
  if (typeof candidate?.personId === 'string') {
    return candidate.personId
  }
  return null
}

const pruneExpiredHiringLocks = (hiringLocks = {}, currentDay = 1) => {
  return Object.entries(hiringLocks || {}).reduce((acc, [personId, unlockDay]) => {
    if (typeof personId !== 'string') {
      return acc
    }
    const normalizedUnlockDay = Number(unlockDay)
    if (!Number.isFinite(normalizedUnlockDay) || normalizedUnlockDay <= currentDay) {
      return acc
    }
    acc[personId] = Math.round(normalizedUnlockDay)
    return acc
  }, {})
}

const syncEmployeeCandidates = ({ employees = [], currentCandidates = [], currentDay = 1, hiringLocks = {} }) => {
  const unlockedLocks = pruneExpiredHiringLocks(hiringLocks, currentDay)
  const candidates = createEmployeeCandidates({
    hiredEmployees: employees,
    previousCandidates: currentCandidates,
  })

  return candidates.filter((candidate) => {
    const personId = getCandidatePersonId(candidate)
    if (!personId) {
      return true
    }
    return !(personId in unlockedLocks)
  })
}

const toEmployeeRecord = (candidate, currentDay) => {
  const contractLengthMonths = clampContractLengthMonths(
    candidate.contract?.negotiatedContractLengthMonths || candidate.contract?.contractLengthMonths,
  )
  const durationDays = toContractDurationDays(contractLengthMonths)

  return {
  employeeId: `employee-${Date.now()}-${candidate.candidateId}`,
  personId: candidate.id,
  name: candidate.name,
  dob: candidate.dob,
  gender: candidate.gender,
  role: candidate.role,
  imageUrl: candidate.image_url,
  popularity: candidate.popularity,
  happiness: shouldTrackHappiness(candidate.role) ? DEFAULT_HAPPINESS : null,
  lastHappinessInactivityPenaltyDay: null,
  stamina: candidate.role === 'wrestler' ? MAX_STAMINA : null,
  hasMoneyAmount: candidate.has_money_amount,
  skill: candidate.skill,
  tier: candidate.tier,
  salary: candidate.contract?.negotiatedMonthlySalary || candidate.salary,
  contract: {
    monthlySalary: candidate.contract?.negotiatedMonthlySalary || candidate.salary,
    perMatchSalary: candidate.contract?.negotiatedPerMatchSalary || 0,
    signingBonus: candidate.contract?.negotiatedSigningBonus || candidate.signingBonus || 0,
    contractLengthMonths,
    startDay: currentDay,
    durationDays,
    endDay: currentDay + durationDays,
  },
  signatureMoves: candidate.signature_moves || [],
  finisherMoves: candidate.finisher_moves || [],
  wrestlingAbility: candidate.wrestling_ability || null,
  officiatingAbility: candidate.officiating_ability || null,
  managementAbility: candidate.management_ability || null,
  broadcastAbility: candidate.broadcast_ability || null,
  staffAbility: candidate.staff_ability || null,
  staffDepartment: candidate.staff_department || null,
  managerId: null,
  heelFaceMeter: DEFAULT_HEEL_FACE_METER_VALUE,
  matchStats: {
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    matchHistory: [],
  },
  }
}

const MIN_NEGOTIATION_DISCOUNT_PERCENT = 1
const MAX_NEGOTIATION_DISCOUNT_PERCENT = 30

const clampNegotiationValue = (value, minimum = 0) => {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return minimum
  }

  return Math.max(minimum, Math.round(numericValue))
}

const getCandidateMaxDiscountPercent = (candidate) => {
  const popularity = Math.max(0, Math.min(100, Number(candidate?.popularity) || 0))
  const popularityRatio = popularity / 100

  return Math.max(
    MIN_NEGOTIATION_DISCOUNT_PERCENT,
    Math.min(
      MAX_NEGOTIATION_DISCOUNT_PERCENT,
      Math.round(MAX_NEGOTIATION_DISCOUNT_PERCENT - popularityRatio * (MAX_NEGOTIATION_DISCOUNT_PERCENT - MIN_NEGOTIATION_DISCOUNT_PERCENT)),
    ),
  )
}

const canCandidateSkipSigningBonus = (candidate) => {
  return (candidate?.popularity || 0) <= 18
}

const evaluateCandidateOffer = (candidate, offer = {}) => {
  const contract = candidate?.contract

  if (!candidate || !contract) {
    return {
      accepted: false,
      maxDiscountPercent: MIN_NEGOTIATION_DISCOUNT_PERCENT,
      adjustedOffer: null,
    }
  }

  const maxDiscountPercent = getCandidateMaxDiscountPercent(candidate)
  const adjustedOffer = {
    monthlySalary: clampNegotiationValue(offer.monthlySalary, 0),
    perMatchSalary: clampNegotiationValue(offer.perMatchSalary, 0),
    signingBonus: clampNegotiationValue(offer.signingBonus, 0),
    contractLengthMonths: clampContractLengthMonths(offer.contractLengthMonths),
    adjustPercent: Number.isFinite(Number(offer.adjustPercent)) ? Math.round(Number(offer.adjustPercent)) : 0,
    benefits: {
      healthCare: Boolean(offer?.benefits?.healthCare),
      travel: Boolean(offer?.benefits?.travel),
      accommodation: Boolean(offer?.benefits?.accommodation),
    },
  }
  const benefitBonusPercent =
    (adjustedOffer.benefits.healthCare ? 2 : 0) +
    (adjustedOffer.benefits.travel ? 2 : 0) +
    (adjustedOffer.benefits.accommodation ? 2 : 0)
  const benefitMultiplier = 1 + (benefitBonusPercent / 100)
  const minimumMultiplier = (100 - maxDiscountPercent) / 100
  const minimumMonthlySalary = Math.max(0, Math.round((contract.monthlySalary || 0) * minimumMultiplier))
  const minimumPerMatchSalary = Math.max(0, Math.round((contract.perMatchSalary || 0) * minimumMultiplier))
  const minimumSigningBonus = canCandidateSkipSigningBonus(candidate)
    ? 0
    : Math.max(0, Math.round((contract.signingBonus || 0) * minimumMultiplier))
  const accepted =
    Math.round(adjustedOffer.monthlySalary * benefitMultiplier) >= minimumMonthlySalary &&
    Math.round(adjustedOffer.perMatchSalary * benefitMultiplier) >= minimumPerMatchSalary &&
    Math.round(adjustedOffer.signingBonus * benefitMultiplier) >= minimumSigningBonus

  return {
    accepted,
    maxDiscountPercent,
    adjustedOffer,
    minimumOffer: {
      monthlySalary: minimumMonthlySalary,
      perMatchSalary: minimumPerMatchSalary,
      signingBonus: minimumSigningBonus,
    },
  }
}

const buildInitialState = () => {
  const startDateIso = GAME_CONFIG.startDateIso || toIsoDateLocal(new Date())
  const seededCustomEvents = createPreloadedCustomEvents(startDateIso)
  const initialRoster = {
    employees: [],
    titles: createInitialTitles(),
    sponsors: [],
    teams: [],
  }

  return {
    gameStatus: {
      hasStarted: false,
      version: GAME_CONFIG.version,
    },
    profile: {
      playerName: '',
      companyName: '',
    },
    calendar: {
      day: 1,
      week: 1,
      isEventDay: isRegularWeeklyEventDay(startDateIso, 1),
      startDateIso,
    },
    finances: {
      cash: GAME_CONFIG.startingCash,
      lastIncome: 0,
      lastExpenses: 0,
      lastDelta: 0,
      subscriptionFee: GAME_CONFIG.economy.webSubscription.defaultFee,
      ticketFees: {
        regularWeekly: GAME_CONFIG.economy.audience.byEventType.regularWeekly.ticketPrice,
        houseShow: GAME_CONFIG.economy.audience.byEventType.houseShow.ticketPrice,
        digitalOnly: GAME_CONFIG.economy.audience.byEventType.digitalOnly.ticketPrice,
        ppv: GAME_CONFIG.economy.audience.byEventType.ppv.ticketPrice,
        oneTime: GAME_CONFIG.economy.audience.byEventType.oneTime.ticketPrice,
        megaLive: GAME_CONFIG.economy.audience.byEventType.megaLive.ticketPrice,
      },
      ledger: [],
    },
    roster: initialRoster,
    market: {
      employeeCandidates: syncEmployeeCandidates({
        employees: initialRoster.employees,
        currentDay: 1,
        hiringLocks: {},
      }),
      hiringLocks: {},
      eventTemplates: createEventTemplates(),
      sponsorOffers: createSponsorOffers(10, {
        requiredTier: getSponsorOfferTierByStaffSkill(initialRoster.employees),
      }),
      sponsorOffersLastRerolledDay: null,
    },
    events: {
      regularWeeklyEvent: {
        eventId: 'regular-weekly-event',
        name: 'Weekly TV Show',
        type: 'regularWeekly',
        isSystem: true,
        maxMatches: EVENT_TYPE_CONFIG.regularWeekly.maxMatches,
      },
      customEvents: seededCustomEvents,
      bookedEvent: buildBookedEventProjection(1, seededCustomEvents, startDateIso),
      lastOutcome: null,
      eventLog: [],
      eventPreparation: null,
    },
    history: {
      timeline: [],
    },
    stats: {
      fans: GAME_CONFIG.startingFans,
      morale: GAME_CONFIG.startingMorale,
      prestige: 10,
    },
    ui: {
      activeModule: MANAGEMENT_MODULES[0].id,
    },
    ai: {
      optedInAtStart: false,
      enabled: false,
      modelId: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
      status: 'idle',
      progress: 0,
      progressText: '',
      error: '',
      showEnableModal: false,
    },
  }
}

const getWeekFromDay = (day) => Math.floor((day - 1) / 7) + 1
const getMonthFromWeek = (week) => Math.floor((week - 1) / 4) + 1
const getYearFromWeek = (week) => Math.floor((week - 1) / 52) + 1
const getScheduledDayFromWeek = (week) => week * 7
const shiftCustomEventDayIfOverlappingRegular = (scheduledDay, startDateIso) => {
  if (!Number.isInteger(scheduledDay) || scheduledDay < 1) {
    return 1
  }

  return isRegularWeeklyEventDay(startDateIso, scheduledDay)
    ? scheduledDay + 2
    : scheduledDay
}

const MONTH_NAME_TO_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

const parseDayMonthEventDate = (eventDate, year) => {
  if (typeof eventDate !== 'string') {
    return null
  }

  const trimmed = eventDate.trim()
  const match = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]+)$/)
  if (!match) {
    return null
  }

  const day = Number(match[1])
  const monthIndex = MONTH_NAME_TO_INDEX[match[2].toLowerCase()]
  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(monthIndex)) {
    return null
  }

  const date = new Date(year, monthIndex, day)
  // Guard against JS date overflow (e.g. 31 February)
  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
    return null
  }

  return date
}

const getNextSpecificDateIsoFromDayMonth = (eventDate, startDateIso) => {
  const startDate = parseStartDateIso(startDateIso)
  const startYear = startDate.getFullYear()
  const thisYearDate = parseDayMonthEventDate(eventDate, startYear)

  if (!thisYearDate) {
    return ''
  }

  const normalizedThisYearDate = toStartOfDay(thisYearDate)
  const normalizedStartDate = toStartOfDay(startDate)
  const targetDate = normalizedThisYearDate < normalizedStartDate
    ? parseDayMonthEventDate(eventDate, startYear + 1)
    : normalizedThisYearDate

  if (!targetDate) {
    return ''
  }

  return toIsoDateLocal(targetDate)
}

const createPreloadedCustomEvents = (startDateIso) => {
  return (preloadedEvents || [])
    .map((event, index) => {
      const type = typeof event?.event_type === 'string' ? event.event_type : ''
      if (!EVENT_TYPE_CONFIG[type] || type === 'regularWeekly') {
        return null
      }

      const sourceSpecificDate = getNextSpecificDateIsoFromDayMonth(event.event_date, startDateIso)
      if (!sourceSpecificDate) {
        return null
      }

      const scheduledDay = getScheduledDayFromSpecificDate({
        specificDate: sourceSpecificDate,
        startDateIso,
        fallbackScheduledWeek: index + 1,
      })
      const scheduledWeek = getWeekFromDay(scheduledDay)
      const specificDate = toIsoDateLocal(getGameDateFromDay(startDateIso, scheduledDay))

      return {
        eventId: `preloaded-${event.id || index + 1}`,
        type,
        name: event.event_name,
        imageUrl: typeof event.image_url === 'string' ? event.image_url : '',
        maxMatches: EVENT_TYPE_CONFIG[type].maxMatches,
        scheduledWeek,
        scheduledDay,
        month: getMonthFromWeek(scheduledWeek),
        year: getYearFromWeek(scheduledWeek),
        specificDate,
        isRecurringAnnually: true,
        isSystem: false,
        createdAt: index,
        eventReputation: Number(event.event_reputation) || EVENT_TYPE_CONFIG[type].reputation,
      }
    })
    .filter((event) => event && event.scheduledDay >= 1)
    .sort((a, b) => {
      if (a.scheduledDay !== b.scheduledDay) {
        return a.scheduledDay - b.scheduledDay
      }

      return (a.createdAt || 0) - (b.createdAt || 0)
    })
}

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

const getScheduledDayFromSpecificDate = ({ specificDate, startDateIso, fallbackScheduledWeek }) => {
  const parsedSpecificDate = parseIsoDateLocal(specificDate)
  const parsedStartDate = parseStartDateIso(startDateIso)
  let scheduledDay = getScheduledDayFromWeek(Number(fallbackScheduledWeek) || 1)

  if (parsedSpecificDate && !Number.isNaN(parsedSpecificDate.getTime())) {
    const specificDateStart = toStartOfDay(parsedSpecificDate)
    const diffDays = Math.floor((specificDateStart.getTime() - parsedStartDate.getTime()) / (1000 * 60 * 60 * 24))
    scheduledDay = diffDays + 1
  }

  return shiftCustomEventDayIfOverlappingRegular(scheduledDay, startDateIso)
}

const getCalendarWeekKey = (date) => {
  const startOfWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOffset = (startOfWeek.getDay() + 6) % 7 // Monday = 0
  startOfWeek.setDate(startOfWeek.getDate() - dayOffset)

  const year = startOfWeek.getFullYear()
  const month = String(startOfWeek.getMonth() + 1).padStart(2, '0')
  const day = String(startOfWeek.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const getEventWeekKey = (event) => {
  const specificDate = parseIsoDateLocal(event?.specificDate)
  if (specificDate && !Number.isNaN(specificDate.getTime())) {
    return getCalendarWeekKey(specificDate)
  }

  return `legacy-${Number(event?.scheduledWeek) || 0}`
}

const toIsoDateLocal = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getEventMonthYearKey = (event) => {
  const specificDate = parseIsoDateLocal(event?.specificDate)
  if (specificDate && !Number.isNaN(specificDate.getTime())) {
    return {
      monthKey: `${specificDate.getFullYear()}-${String(specificDate.getMonth() + 1).padStart(2, '0')}`,
      yearKey: String(specificDate.getFullYear()),
    }
  }

  const scheduledWeek = Number(event?.scheduledWeek)
  return {
    monthKey: `legacy-${getYearFromWeek(scheduledWeek)}-${String(getMonthFromWeek(scheduledWeek)).padStart(2, '0')}`,
    yearKey: `legacy-${getYearFromWeek(scheduledWeek)}`,
  }
}

const EVENT_TYPE_CONFIG = {
  regularWeekly: {
    label: 'Regular Weekly Event',
    maxMatches: 5,
    reputation: 62,
    popularityWeight: 1.14,
    productionScale: 2,
    risk: 16,
    hype: 62,
    setupCost: 0,
  },
  houseShow: {
    label: 'House Show',
    maxMatches: 3,
    reputation: 48,
    popularityWeight: 1.02,
    productionScale: 1,
    risk: 12,
    hype: 50,
    setupCost: 9000,
  },
  ppv: {
    label: 'PPV',
    maxMatches: 7,
    reputation: 86,
    popularityWeight: 1.48,
    productionScale: 4,
    risk: 28,
    hype: 88,
    setupCost: 24000,
  },
  megaLive: {
    label: 'Mega Live Event',
    maxMatches: 10,
    reputation: 96,
    popularityWeight: 1.7,
    productionScale: 5,
    risk: 34,
    hype: 98,
    setupCost: 32000,
  },
  oneTime: {
    label: 'One Time Event',
    maxMatches: 8,
    reputation: 84,
    popularityWeight: 1.42,
    productionScale: 4,
    risk: 24,
    hype: 84,
    setupCost: 20000,
  },
  digitalOnly: {
    label: 'Digital Only Show',
    maxMatches: 3,
    reputation: 50,
    popularityWeight: 0.98,
    productionScale: 1,
    risk: 10,
    hype: 52,
    setupCost: 7000,
  },
}

const EVENT_BOOKING_REFUND_RATE = 0.6

const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])
const HELPER_ROLES = new Set(['announcer', 'referee'])
const HAPPINESS_TRACKED_ROLES = new Set(['wrestler', 'staff'])
const MAX_STAMINA = 100
const MAX_HAPPINESS = 100
const DEFAULT_HAPPINESS = 50
const HAPPINESS_MATCH_WIN_SINGLE = 1
const HAPPINESS_MATCH_WIN_MULTI_PER_OPPONENT = 1
const HAPPINESS_MATCH_LOSS_SINGLE = -2
const HAPPINESS_MATCH_LOSS_MULTI = -1
const HAPPINESS_TITLE_WIN = 10
const HAPPINESS_INACTIVITY_PENALTY = -3
const HAPPINESS_INACTIVITY_DAYS = 30
const HAPPINESS_LOCKOUT_DAYS = 90
const HAPPINESS_BONUS_CASH_STEP = 1000
const HAPPINESS_BONUS_MIN_BOOST = 1
const HAPPINESS_BONUS_MAX_BOOST = 20
const DAILY_STAMINA_REGEN = 10
const MIN_MATCH_STAMINA_LOSS = 20
const MAX_MATCH_STAMINA_LOSS = 50
const MAX_MALE_WRESTLERS = 20
const MAX_FEMALE_WRESTLERS = 15

const getEventSetupCost = (eventType) => {
  const typeConfig = EVENT_TYPE_CONFIG[eventType]
  return Math.max(0, Math.round(Number(typeConfig?.setupCost || 0)))
}

const clampStamina = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return MAX_STAMINA
  }

  return Math.max(0, Math.min(MAX_STAMINA, Math.round(numeric)))
}

const shouldTrackHappiness = (role) => HAPPINESS_TRACKED_ROLES.has(role)

const clampHappiness = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_HAPPINESS
  }

  return Math.max(0, Math.min(MAX_HAPPINESS, Math.round(numeric)))
}

const getHappinessBoostFromBonusAmount = (amount) => {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return 0
  }

  const rawBoost = Math.floor(numericAmount / HAPPINESS_BONUS_CASH_STEP)
  return Math.max(HAPPINESS_BONUS_MIN_BOOST, Math.min(HAPPINESS_BONUS_MAX_BOOST, rawBoost))
}

const clampPopularity = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(numeric)))
}

const rollStaminaLoss = () => {
  return Math.floor(Math.random() * (MAX_MATCH_STAMINA_LOSS - MIN_MATCH_STAMINA_LOSS + 1)) + MIN_MATCH_STAMINA_LOSS
}

const calculateMatchRating = (wrestlers = []) => {
  if (wrestlers.length === 0) {
    return null
  }

  const averageSkill = wrestlers.reduce((sum, wrestler) => sum + (Number(wrestler.skill) || 0), 0) / wrestlers.length
  const averageStamina = wrestlers.reduce((sum, wrestler) => sum + clampStamina(wrestler.stamina), 0) / wrestlers.length
  const skillFactor = (averageSkill / 100) * 6.5
  const staminaFactor = (averageStamina / 100) * 2.5
  const randomFactor = (Math.random() * 2) - 1
  const rating = 1 + skillFactor + staminaFactor + randomFactor

  return Math.max(1, Math.min(10, Number(rating.toFixed(1))))
}

const applyDailyPerformanceChanges = (employees = [], configuredSegments = []) => {
  const withRegen = employees.map((employee) => {
    if (employee.role !== 'wrestler') {
      return employee
    }

    return {
      ...employee,
      stamina: clampStamina((employee.stamina ?? MAX_STAMINA) + DAILY_STAMINA_REGEN),
    }
  })

  if (!Array.isArray(configuredSegments) || configuredSegments.length === 0) {
    return {
      employees: withRegen,
      configuredSegments,
    }
  }

  const employeesById = new Map(withRegen.map((employee) => [employee.employeeId, employee]))
  const staminaLossById = new Map()
  const popularityDeltaById = new Map()

  const segmentsWithPerformance = configuredSegments.map((segment) => {
    const providedMatchRating = Number(segment?.matchRating)
    const hasProvidedMatchRating = Number.isFinite(providedMatchRating)
    const providedStaminaLossById =
      segment?.staminaLossById && typeof segment.staminaLossById === 'object'
        ? segment.staminaLossById
        : null

    const baseSegment = {
      ...segment,
      matchRating: hasProvidedMatchRating
        ? Math.max(1, Math.min(10, Number(providedMatchRating.toFixed(1))))
        : null,
      interviewPopularityChanges: Array.isArray(segment.interviewPopularityChanges)
        ? segment.interviewPopularityChanges
        : [],
    }

    const wrestlerParticipants = (segment.wrestlerIds || [])
      .map((id) => employeesById.get(id))
      .filter((employee) => employee?.role === 'wrestler')

    if (MATCH_SEGMENT_TYPES.has(segment.segmentType)) {
      if (!hasProvidedMatchRating) {
        baseSegment.matchRating = calculateMatchRating(wrestlerParticipants)
      }

      wrestlerParticipants.forEach((wrestler) => {
        const current = staminaLossById.get(wrestler.employeeId) || 0
        const providedLoss = Number(providedStaminaLossById?.[wrestler.employeeId])
        const staminaLoss = Number.isFinite(providedLoss)
          ? Math.max(0, Math.round(providedLoss))
          : rollStaminaLoss()
        staminaLossById.set(wrestler.employeeId, current + staminaLoss)
      })
    }

    if (segment.segmentType === 'interview') {
      const sanitizedChanges = baseSegment.interviewPopularityChanges
        .filter((change) => {
          const employee = employeesById.get(change?.employeeId)
          return employee?.role === 'wrestler'
        })
        .map((change) => ({
          employeeId: change.employeeId,
          delta: Number.isFinite(Number(change.delta)) ? Math.round(Number(change.delta)) : 0,
        }))

      const interviewChanges = sanitizedChanges.length > 0
        ? sanitizedChanges
        : (() => {
            const target = wrestlerParticipants[0]
            if (!target) {
              return []
            }

            const swing = Math.floor(Math.random() * 8) + 3
            const delta = Math.random() < 0.5 ? -swing : swing

            return [{ employeeId: target.employeeId, delta }]
          })()

      interviewChanges.forEach((change) => {
        const current = popularityDeltaById.get(change.employeeId) || 0
        popularityDeltaById.set(change.employeeId, current + change.delta)
      })

      baseSegment.interviewPopularityChanges = interviewChanges
    }

    return baseSegment
  })

  const withPerformance = withRegen.map((employee) => {
    if (employee.role !== 'wrestler') {
      return employee
    }

    const staminaLoss = staminaLossById.get(employee.employeeId) || 0
    const popularityDelta = popularityDeltaById.get(employee.employeeId) || 0

    return {
      ...employee,
      stamina: clampStamina((employee.stamina ?? MAX_STAMINA) - staminaLoss),
      popularity: clampPopularity((employee.popularity ?? 0) + popularityDelta),
    }
  })

  return {
    employees: withPerformance,
    configuredSegments: segmentsWithPerformance,
  }
}

const applyMatchStats = (employees, configuredSegments, eventDay, eventName) => {
  if (!Array.isArray(configuredSegments) || configuredSegments.length === 0) {
    return employees
  }

  const employeesById = new Map(employees.map((employee) => [employee.employeeId, employee]))

  return employees.map((employee) => {
    const involvedSegments = configuredSegments.filter((seg) =>
      seg.participantIds
        .filter((participantId) => {
          const participant = employeesById.get(participantId)
          return participant && !HELPER_ROLES.has(participant.role)
        })
        .includes(employee.employeeId),
    )

    if (involvedSegments.length === 0) {
      return employee
    }

    const currentStats = employee.matchStats ?? { totalMatches: 0, totalWins: 0, totalLosses: 0, matchHistory: [] }
    let wins = 0
    let losses = 0
    let nextHeelFaceMeter = clampHeelFaceMeter(employee?.heelFaceMeter ?? DEFAULT_HEEL_FACE_METER_VALUE)

    const newHistory = involvedSegments.map((seg) => {
      const isMatchType = MATCH_SEGMENT_TYPES.has(seg.segmentType)
      const isTagTeam = seg.matchType === 'tagTeam'
      const segWinnerTeamIds = Array.isArray(seg.winnerTeamIds) ? seg.winnerTeamIds : []
      const isWinner = isMatchType && (
        isTagTeam
          ? segWinnerTeamIds.includes(employee.employeeId)
          : Boolean(seg.winnerEmployeeId) && seg.winnerEmployeeId === employee.employeeId
      )
      const isLoser = isMatchType && (
        isTagTeam
          ? segWinnerTeamIds.length > 0 && !segWinnerTeamIds.includes(employee.employeeId)
          : Boolean(seg.winnerEmployeeId) && seg.winnerEmployeeId !== employee.employeeId
      )

      if (isMatchType && isWinner) wins += 1
      if (isLoser) losses += 1
  if (isMatchType && isWinner) nextHeelFaceMeter -= 4
  if (isMatchType && isLoser) nextHeelFaceMeter += 4

      const participantDetails = seg.participantIds
        .map((id) => employeesById.get(id))
        .filter(Boolean)
        .filter((participant) => !HELPER_ROLES.has(participant.role))
        .map((participant) => ({
          employeeId: participant.employeeId,
          name: participant.name,
          role: participant.role,
          gender: participant.gender,
          imageUrl: participant.imageUrl || null,
        }))

      const otherParticipantDetails = participantDetails.filter(
        (participant) => participant.employeeId !== employee.employeeId,
      )

      const winnerTeamEmployees = isTagTeam
        ? segWinnerTeamIds.map((id) => employeesById.get(id)).filter(Boolean)
        : []
      const winnerEmployee = !isTagTeam && seg.winnerEmployeeId
        ? employeesById.get(seg.winnerEmployeeId)
        : null

      // Determine tag team partners (wrestlers on the same team as this employee)
      const tagTeamPartnerIds = isTagTeam
        ? (() => {
            const myTeam = Array.isArray(seg.team1Ids) && seg.team1Ids.includes(employee.employeeId)
              ? seg.team1Ids
              : (Array.isArray(seg.team2Ids) && seg.team2Ids.includes(employee.employeeId) ? seg.team2Ids : [])
            return myTeam.filter((id) => id !== employee.employeeId)
          })()
        : []

      return {
        day: eventDay,
        eventName,
        segmentType: seg.segmentType,
        matchType: seg.matchType || null,
        result: isWinner ? 'win' : isLoser ? 'loss' : 'nodecision',
        opponent: otherParticipantDetails.map((participant) => participant.name),
        participantDetails,
        otherParticipantDetails,
        winnerEmployeeId: isTagTeam ? null : (winnerEmployee?.employeeId || null),
        winnerTeamIds: isTagTeam ? segWinnerTeamIds : [],
        winnerName: isTagTeam
          ? (winnerTeamEmployees.map((e) => e.name).join(' & ') || null)
          : (winnerEmployee?.name || null),
        matchRating: seg.matchRating,
        tagTeamPartnerIds,
      }
    })

    return {
      ...employee,
      heelFaceMeter: clampHeelFaceMeter(nextHeelFaceMeter),
      matchStats: {
        totalMatches: currentStats.totalMatches + involvedSegments.length,
        totalWins: currentStats.totalWins + wins,
        totalLosses: currentStats.totalLosses + losses,
        matchHistory: [...currentStats.matchHistory, ...newHistory],
      },
    }
  })
}

const applyTitleMatchResults = (titles, configuredSegments, employees, eventDay) => {
  if (!Array.isArray(titles) || titles.length === 0) {
    return titles
  }

  if (!Array.isArray(configuredSegments) || configuredSegments.length === 0) {
    return titles
  }

  const validWrestlerIds = new Set(
    (employees || [])
      .filter((employee) => employee?.role === 'wrestler')
      .map((employee) => employee.employeeId),
  )

  const winnerByTitleId = new Map()
  const employeesById = new Map((employees || []).map((employee) => [employee.employeeId, employee]))
  let cashInByEmployeeId = null

  configuredSegments.forEach((segment) => {
    if (segment?.segmentType !== 'titleMatch' || typeof segment?.titleId !== 'string') {
      return
    }

    if (!cashInByEmployeeId && typeof segment?.cashInByEmployeeId === 'string' && validWrestlerIds.has(segment.cashInByEmployeeId)) {
      cashInByEmployeeId = segment.cashInByEmployeeId
    }

    const tagWinnerIds = Array.isArray(segment?.winnerTeamIds)
      ? segment.winnerTeamIds.filter((id) => validWrestlerIds.has(id))
      : []
    const tagWinnerId = tagWinnerIds.length > 0 ? tagWinnerIds[0] : null
    const singlesWinnerId = typeof segment?.winnerEmployeeId === 'string' ? segment.winnerEmployeeId : null
    const resolvedWinnerId = singlesWinnerId || tagWinnerId || null

    if (!resolvedWinnerId || !validWrestlerIds.has(resolvedWinnerId)) {
      return
    }

    winnerByTitleId.set(segment.titleId, {
      singlesWinnerId: resolvedWinnerId,
      tagWinnerIds,
    })
  })

  if (winnerByTitleId.size === 0 && !cashInByEmployeeId) {
    return titles
  }

  const titlesWithWinners = titles.map((title) => {
    const nextWinner = winnerByTitleId.get(title.titleId)
    if (!nextWinner) {
      return normalizeTitleRecord(title)
    }

    const currentHolderIds = normalizeTitleHolderIds(title)
    const nextHolderIds = title.division === 'doubles'
      ? Array.from(new Set(nextWinner.tagWinnerIds)).slice(0, 2)
      : (nextWinner.singlesWinnerId ? [nextWinner.singlesWinnerId] : [])

    if (nextHolderIds.length === 0) {
      return normalizeTitleRecord(title)
    }

    const sameHolder = holdersKey(currentHolderIds) === holdersKey(nextHolderIds)
    if (sameHolder) {
      return normalizeTitleRecord(title)
    }

    const currentStartDay = Number.isInteger(title?.currentHolderStartDay)
      ? title.currentHolderStartDay
      : Number(eventDay || 1)
    const nextHistory = Array.isArray(title?.holderHistory) ? [...title.holderHistory] : []

    if (currentHolderIds.length > 0) {
      const holderSnapshots = currentHolderIds.map((holderId) => {
        const holder = employeesById.get(holderId)
        return {
          employeeId: holderId,
          name: holder?.name || holderId,
          gender: holder?.gender || null,
          imageUrl: holder?.imageUrl || null,
        }
      })

      nextHistory.push({
        holderEmployeeIds: currentHolderIds,
        holders: holderSnapshots,
        startDay: currentStartDay,
        endDay: Number(eventDay || currentStartDay),
        daysHeld: Math.max(1, Number(eventDay || currentStartDay) - currentStartDay + 1),
      })
    }

    return normalizeTitleRecord({
      ...title,
      holderEmployeeId: nextHolderIds[0] || null,
      holderEmployeeIds: title.division === 'doubles' ? nextHolderIds : [],
      currentHolderStartDay: Number(eventDay || 1),
      holderHistory: nextHistory.slice(-120),
    })
  })

  if (!cashInByEmployeeId) {
    return titlesWithWinners
  }

  return titlesWithWinners.map((title) => {
    const isMoneyInTheBankTitle =
      title?.titleId === 'money-in-the-bank' || /money\s*in\s*the\s*bank/i.test(title?.name || '')
    if (!isMoneyInTheBankTitle) {
      return normalizeTitleRecord(title)
    }

    const currentHolderIds = normalizeTitleHolderIds(title)
    if (!currentHolderIds.includes(cashInByEmployeeId)) {
      return normalizeTitleRecord(title)
    }

    const currentStartDay = Number.isInteger(title?.currentHolderStartDay)
      ? title.currentHolderStartDay
      : Number(eventDay || 1)
    const nextHistory = Array.isArray(title?.holderHistory) ? [...title.holderHistory] : []
    const holderSnapshots = currentHolderIds.map((holderId) => {
      const holder = employeesById.get(holderId)
      return {
        employeeId: holderId,
        name: holder?.name || holderId,
        gender: holder?.gender || null,
        imageUrl: holder?.imageUrl || null,
      }
    })

    nextHistory.push({
      holderEmployeeIds: currentHolderIds,
      holders: holderSnapshots,
      startDay: currentStartDay,
      endDay: Number(eventDay || currentStartDay),
      daysHeld: Math.max(1, Number(eventDay || currentStartDay) - currentStartDay + 1),
    })

    return normalizeTitleRecord({
      ...title,
      holderEmployeeId: null,
      holderEmployeeIds: [],
      currentHolderStartDay: Number(eventDay || 1),
      holderHistory: nextHistory.slice(-120),
    })
  })
}

const buildTitleWinCountsByEmployeeId = (prevTitles = [], nextTitles = []) => {
  const winnerCounts = new Map()

  ;(nextTitles || []).forEach((title) => {
    const previous = (prevTitles || []).find((item) => item.titleId === title.titleId)
    const previousKey = previous ? holdersKey(normalizeTitleHolderIds(previous)) : ''
    const nextHolderIds = normalizeTitleHolderIds(title)
    const nextKey = holdersKey(nextHolderIds)
    if (!nextKey || nextKey === previousKey) {
      return
    }

    nextHolderIds.forEach((holderId) => {
      winnerCounts.set(holderId, (winnerCounts.get(holderId) || 0) + 1)
    })
  })

  return winnerCounts
}

const sanitizeTitlesForActiveEmployees = (titles = [], activeEmployeeIds = new Set()) => {
  return (titles || []).map((title) => {
    const holderIds = normalizeTitleHolderIds(title).filter((id) => activeEmployeeIds.has(id))
    return normalizeTitleRecord({
      ...title,
      holderEmployeeId: holderIds[0] || null,
      holderEmployeeIds: title.division === 'doubles' ? holderIds.slice(0, 2) : [],
    })
  })
}

const applyHappinessAndDeparture = ({
  employees,
  prevTitles,
  nextTitles,
  currentDay,
  existingHiringLocks,
}) => {
  const titleWinCounts = buildTitleWinCountsByEmployeeId(prevTitles, nextTitles)
  const nextHiringLocks = { ...(existingHiringLocks || {}) }
  const departingEmployeeIds = new Set()

  const updatedEmployees = (employees || []).map((employee) => {
    if (!shouldTrackHappiness(employee.role)) {
      return employee
    }

    const history = Array.isArray(employee?.matchStats?.matchHistory) ? employee.matchStats.matchHistory : []

    let nextHappiness = clampHappiness(employee?.happiness ?? DEFAULT_HAPPINESS)
    let nextInactivityPenaltyDay = Number.isInteger(employee?.lastHappinessInactivityPenaltyDay)
      ? employee.lastHappinessInactivityPenaltyDay
      : null

    if (employee.role === 'wrestler') {
      const todayMatchEntries = history.filter((entry) => (
        Number(entry?.day) === currentDay && MATCH_SEGMENT_TYPES.has(entry?.segmentType)
      ))

      todayMatchEntries.forEach((entry) => {
        const opponentCount = Array.isArray(entry?.opponent) ? entry.opponent.length : 0
        if (entry.result === 'win') {
          nextHappiness += opponentCount <= 1
            ? HAPPINESS_MATCH_WIN_SINGLE
            : opponentCount * HAPPINESS_MATCH_WIN_MULTI_PER_OPPONENT
          return
        }

        if (entry.result === 'loss') {
          nextHappiness += opponentCount <= 1
            ? HAPPINESS_MATCH_LOSS_SINGLE
            : HAPPINESS_MATCH_LOSS_MULTI
        }
      })

      const titleWins = titleWinCounts.get(employee.employeeId) || 0
      if (titleWins > 0) {
        nextHappiness += titleWins * HAPPINESS_TITLE_WIN
      }
    }

    const lastParticipationDay = history.reduce((latest, entry) => {
      if (!MATCH_SEGMENT_TYPES.has(entry?.segmentType)) {
        return latest
      }
      const day = Number(entry?.day) || 0
      return day > latest ? day : latest
    }, 0)

    const inactiveDays = lastParticipationDay > 0 ? (currentDay - lastParticipationDay) : currentDay
    const hasPenaltyCooldown = Number.isInteger(nextInactivityPenaltyDay)
      ? (currentDay - nextInactivityPenaltyDay) < HAPPINESS_INACTIVITY_DAYS
      : false

    if (inactiveDays >= HAPPINESS_INACTIVITY_DAYS && !hasPenaltyCooldown) {
      nextHappiness += HAPPINESS_INACTIVITY_PENALTY
      nextInactivityPenaltyDay = currentDay
    }

    const clampedHappiness = clampHappiness(nextHappiness)
    if (clampedHappiness <= 0) {
      departingEmployeeIds.add(employee.employeeId)
      if (typeof employee.personId === 'string') {
        nextHiringLocks[employee.personId] = currentDay + HAPPINESS_LOCKOUT_DAYS
      }
    }

    return {
      ...employee,
      happiness: clampedHappiness,
      lastHappinessInactivityPenaltyDay: nextInactivityPenaltyDay,
    }
  })

  const activeEmployees = updatedEmployees.filter((employee) => !departingEmployeeIds.has(employee.employeeId))
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.employeeId))
  const employeesWithValidManager = activeEmployees.map((employee) => {
    if (!employee.managerId || activeEmployeeIds.has(employee.managerId)) {
      return employee
    }

    return {
      ...employee,
      managerId: null,
    }
  })

  return {
    employees: employeesWithValidManager,
    hiringLocks: pruneExpiredHiringLocks(nextHiringLocks, currentDay),
    departedEmployeeIds: departingEmployeeIds,
  }
}

const SPONSORABLE_EVENT_TYPES = ['ppv', 'megaLive', 'oneTime']

const clampMatchesByType = (type, maxMatches) => {
  const typeConfig = EVENT_TYPE_CONFIG[type]
  if (!typeConfig) {
    return 1
  }
  return Math.max(1, Math.min(typeConfig.maxMatches, maxMatches || typeConfig.maxMatches))
}

const SEGMENT_TYPE_BONUS = {
  match: {
    income: 180,
    fans: 7,
    prestige: 1,
  },
  mainEvent: {
    income: 380,
    fans: 18,
    prestige: 4,
  },
  titleMatch: {
    income: 320,
    fans: 15,
    prestige: 3,
  },
  interview: {
    income: 95,
    fans: 4,
    prestige: 0,
  },
  promo: {
    income: 120,
    fans: 5,
    prestige: 1,
  },
}

const normalizeSegmentType = (segmentType) => {
  if (SEGMENT_TYPE_BONUS[segmentType]) {
    return segmentType
  }

  return 'match'
}

const sanitizeEventSetup = (eventSetup, activeEmployees, defaultMaxSegments) => {
  const maxSegments = Math.max(1, Number(eventSetup?.totalSegments) || Number(defaultMaxSegments) || 1)

  if (!Array.isArray(eventSetup?.segments) || eventSetup.segments.length === 0) {
    return []
  }

  const validEmployeeIds = new Set((activeEmployees || []).map((employee) => employee.employeeId))

  const filterIds = (ids) =>
    Array.isArray(ids)
      ? Array.from(new Set(ids)).filter((id) => typeof id === 'string' && validEmployeeIds.has(id))
      : []

  const filterId = (id) =>
    typeof id === 'string' && validEmployeeIds.has(id) ? id : null

  return eventSetup.segments
    .slice(0, maxSegments)
    .map((segment, index) => {
      const segmentType = normalizeSegmentType(segment?.segmentType)
      const rawMatchType = segment?.matchType === 'tagTeam' ? 'tagTeam' : 'singles'
      const rawMatchStipulation = typeof segment?.matchStipulation === 'string' && segment.matchStipulation.trim()
        ? segment.matchStipulation.trim()
        : 'singles'
      const team1Ids = rawMatchType === 'tagTeam'
        ? filterIds(segment?.team1Ids)
        : []
      const team2Ids = rawMatchType === 'tagTeam'
        ? filterIds(segment?.team2Ids).filter((id) => !team1Ids.includes(id))
        : []
      const wrestlerIds = rawMatchType === 'tagTeam'
        ? Array.from(new Set([...team1Ids, ...team2Ids]))
        : filterIds(segment?.wrestlerIds ?? segment?.participantIds)
      const refereeId   = filterId(segment?.refereeId)
      const announcerId = filterId(segment?.announcerId)
      const cashInByEmployeeId = segmentType === 'titleMatch' ? filterId(segment?.cashInByEmployeeId) : null
      const participantIds = Array.from(
        new Set([...wrestlerIds, refereeId, announcerId, cashInByEmployeeId].filter(Boolean)),
      )
      const rawWinnerId = filterId(segment?.winnerEmployeeId)
      const rawWinnerTeamIds = rawMatchType === 'tagTeam' && Array.isArray(segment?.winnerTeamIds)
        ? segment.winnerTeamIds.map(filterId).filter((id) => id && wrestlerIds.includes(id))
        : []
      const winnerEmployeeId = segmentType === 'interview' || rawMatchType === 'tagTeam'
        ? null
        : (rawWinnerId && participantIds.includes(rawWinnerId) ? rawWinnerId : null)
      const winnerTeamIds = MATCH_SEGMENT_TYPES.has(segmentType) && rawMatchType === 'tagTeam'
        ? rawWinnerTeamIds
        : []
      const rawMatchRating = Number(segment?.matchRating)
      const matchRating = Number.isFinite(rawMatchRating)
        ? Math.max(1, Math.min(10, Number(rawMatchRating.toFixed(1))))
        : null
      const staminaLossById = MATCH_SEGMENT_TYPES.has(segmentType) && segment?.staminaLossById && typeof segment.staminaLossById === 'object'
        ? Object.entries(segment.staminaLossById).reduce((acc, [employeeId, loss]) => {
            if (!wrestlerIds.includes(employeeId)) {
              return acc
            }

            const numericLoss = Number(loss)
            if (!Number.isFinite(numericLoss)) {
              return acc
            }

            acc[employeeId] = Math.max(0, Math.round(numericLoss))
            return acc
          }, {})
        : {}
      const interviewPopularityChanges = segmentType === 'interview' && Array.isArray(segment?.interviewPopularityChanges)
        ? segment.interviewPopularityChanges
            .map((change) => ({
              employeeId: filterId(change?.employeeId),
              delta: Number.isFinite(Number(change?.delta)) ? Math.round(Number(change.delta)) : 0,
            }))
            .filter((change) => {
              if (!change.employeeId) {
                return false
              }

              return wrestlerIds.includes(change.employeeId)
            })
        : []

      return {
        id: `segment-${index + 1}`,
        segmentType,
        matchType: MATCH_SEGMENT_TYPES.has(segmentType) ? rawMatchType : null,
        matchStipulation: MATCH_SEGMENT_TYPES.has(segmentType) ? rawMatchStipulation : null,
        titleId: segmentType === 'titleMatch' && typeof segment?.titleId === 'string' ? segment.titleId : null,
        wrestlerIds,
        team1Ids: MATCH_SEGMENT_TYPES.has(segmentType) && rawMatchType === 'tagTeam' ? team1Ids : [],
        team2Ids: MATCH_SEGMENT_TYPES.has(segmentType) && rawMatchType === 'tagTeam' ? team2Ids : [],
        refereeId,
        announcerId,
        cashInByEmployeeId,
        participantIds,
        winnerEmployeeId,
        winnerTeamIds,
        matchRating,
        staminaLossById,
        interviewPopularityChanges,
      }
    })
    .filter((segment) => segment.participantIds.length > 0)
}

const toProductionEvent = (event) => {
  const typeConfig = EVENT_TYPE_CONFIG[event.type]
  if (!typeConfig) {
    return null
  }

  return {
    eventId: event.eventId,
    templateKey: event.eventId,
    type: event.type,
    name: event.name,
    maxMatches: event.maxMatches,
    reputation: typeConfig.reputation,
    popularityWeight: typeConfig.popularityWeight,
    productionScale: typeConfig.productionScale,
    risk: typeConfig.risk,
    hype: typeConfig.hype,
    scheduledWeek: event.scheduledWeek,
    scheduledDay: event.scheduledDay,
    month: event.month,
    year: event.year,
    isSystem: event.isSystem || false,
  }
}

const buildRegularWeeklyProjection = (day, startDateIso) => {
  const scheduledDay = calculateNextEventDay(day, startDateIso)
  const scheduledWeek = getWeekFromDay(scheduledDay)

  return toProductionEvent({
    eventId: 'regular-weekly-event',
    type: 'regularWeekly',
    name: 'Weekly TV Show',
    maxMatches: EVENT_TYPE_CONFIG.regularWeekly.maxMatches,
    scheduledDay,
    scheduledWeek,
    month: getMonthFromWeek(scheduledWeek),
    year: getYearFromWeek(scheduledWeek),
    isSystem: true,
  })
}

const sortCustomEventsBySchedule = (events = []) => {
  return [...events].sort((a, b) => {
    if (a.scheduledDay !== b.scheduledDay) {
      return a.scheduledDay - b.scheduledDay
    }

    return (a.createdAt || 0) - (b.createdAt || 0)
  })
}

const getUpcomingCustomEvent = (day, customEvents = []) => {
  return sortCustomEventsBySchedule(customEvents)
    .filter((event) => event.scheduledDay >= day)[0] || null
}

const getDueCustomEventForDay = (day, customEvents = []) => {
  return sortCustomEventsBySchedule(customEvents)
    .filter((event) => event.scheduledDay === day)[0] || null
}

const buildBookedEventProjection = (day, customEvents, startDateIso) => {
  const upcomingCustom = getUpcomingCustomEvent(day, customEvents)

  if (upcomingCustom) {
    return toProductionEvent(upcomingCustom)
  }

  return buildRegularWeeklyProjection(day, startDateIso)
}

const validateCustomEventRules = ({ customEvents, draftEvent, currentWeek, currentDay, ignoreEventId = null }) => {
  const typeConfig = EVENT_TYPE_CONFIG[draftEvent.type]
  if (!typeConfig || draftEvent.type === 'regularWeekly') {
    return { ok: false, error: 'Unsupported event type.' }
  }

  if (!Number.isInteger(draftEvent.scheduledDay) || draftEvent.scheduledDay < currentDay) {
    return { ok: false, error: 'Scheduled date must be today or later.' }
  }

  const comparableEvents = customEvents.filter((event) => event.eventId !== ignoreEventId)
  const draftSpecificDate = parseIsoDateLocal(draftEvent.specificDate)
  const draftWeekKey = draftSpecificDate
    ? getCalendarWeekKey(draftSpecificDate)
    : `legacy-${Number(draftEvent.scheduledWeek) || 0}`
  const sameWeekCount = comparableEvents.filter((event) => getEventWeekKey(event) === draftWeekKey).length

  // Allow up to 2 custom events in the same week.
  if (sameWeekCount >= 2) {
    return { ok: false, error: 'Weekly event cap reached (maximum 2 custom events per week).' }
  }

  const draftEventKeys = getEventMonthYearKey(draftEvent)
  const sameYearEvents = comparableEvents.filter((event) => getEventMonthYearKey(event).yearKey === draftEventKeys.yearKey)
  const sameMonthEvents = sameYearEvents.filter((event) => getEventMonthYearKey(event).monthKey === draftEventKeys.monthKey)

  if (draftEvent.type === 'ppv') {
    const ppvInMonth = sameMonthEvents.filter((event) => event.type === 'ppv').length
    if (ppvInMonth >= 1) {
      return { ok: false, error: 'Only one PPV is allowed per month.' }
    }
  }

  if (draftEvent.type === 'megaLive') {
    const megaInYear = sameYearEvents.filter((event) => event.type === 'megaLive').length
    if (megaInYear >= 1) {
      return { ok: false, error: 'Only one Mega Live Event is allowed per year.' }
    }
  }

  if (draftEvent.type === 'oneTime') {
    const oneTimeInYear = sameYearEvents.filter((event) => event.type === 'oneTime').length
    if (oneTimeInYear >= 3) {
      return { ok: false, error: 'Only three One Time Events are allowed per year.' }
    }
  }

  if (draftEvent.type === 'digitalOnly') {
    const digitalInWeek = comparableEvents.filter(
      (event) => event.type === 'digitalOnly' && event.scheduledWeek === draftEvent.scheduledWeek,
    ).length
    if (digitalInWeek >= 1) {
      return { ok: false, error: 'Only one Digital Only Show is allowed each week.' }
    }
  }

  return { ok: true }
}

// ── Team helpers ────────────────────────────────────────────────────────────

const MIN_TEAM_MEMBERS = 2
const MAX_TEAM_MEMBERS = 10
const TAG_STREAK_THRESHOLD = 3
const TAG_STREAK_WINDOW_DAYS = 90

const teamMembersKey = (memberIds = []) => [...memberIds].sort().join('::')

const teamAlreadyExists = (teams = [], memberIds = []) => {
  const key = teamMembersKey(memberIds)
  return teams.some((team) => teamMembersKey(team.memberIds) === key)
}

const generateTeamId = () =>
  `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const deriveTeamName = (memberIds, employees) => {
  const members = memberIds
    .map((id) => employees.find((e) => e.employeeId === id))
    .filter(Boolean)
  return members.map((e) => (e.name || '').split(' ')[0]).filter(Boolean).join(' & ')
}

const detectAutoTeams = ({ employees, prevTitles, nextTitles, currentDay, existingTeams }) => {
  const resultTeams = [...existingTeams]

  // 1. Tag team title win → auto-form team from new holders
  ;(nextTitles || []).forEach((title) => {
    if (title.division !== 'doubles') return
    const prevTitle = (prevTitles || []).find((t) => t.titleId === title.titleId)
    const prevKey = prevTitle ? holdersKey(normalizeTitleHolderIds(prevTitle)) : ''
    const currKey = holdersKey(normalizeTitleHolderIds(title))
    if (currKey === prevKey || currKey === '') return
    const newHolderIds = title.holderEmployeeIds || []
    if (newHolderIds.length < 2) return
    if (teamAlreadyExists(resultTeams, newHolderIds)) return
    resultTeams.push({
      teamId: generateTeamId(),
      name: deriveTeamName(newHolderIds, employees),
      memberIds: [...newHolderIds],
      autoFormed: true,
      autoReason: 'tagTitleWin',
      formedDay: currentDay,
      createdAt: Date.now(),
    })
  })

  // 2. 3+ tag team matches as partners within last 90 days → auto-form pair
  const minDay = currentDay - TAG_STREAK_WINDOW_DAYS
  const pairCount = new Map()

  ;(employees || []).forEach((emp) => {
    if (emp.role !== 'wrestler') return
    const history = emp.matchStats?.matchHistory || []
    history.forEach((entry) => {
      if (entry.matchType !== 'tagTeam') return
      if ((entry.day || 0) < minDay) return
      const partners = Array.isArray(entry.tagTeamPartnerIds) ? entry.tagTeamPartnerIds : []
      partners.forEach((partnerId) => {
        // Only count from one side to avoid double-counting
        if (emp.employeeId >= partnerId) return
        const key = `${emp.employeeId}::${partnerId}`
        pairCount.set(key, (pairCount.get(key) || 0) + 1)
      })
    })
  })

  pairCount.forEach((count, key) => {
    if (count < TAG_STREAK_THRESHOLD) return
    const [idA, idB] = key.split('::')
    if (teamAlreadyExists(resultTeams, [idA, idB])) return
    const empA = (employees || []).find((e) => e.employeeId === idA)
    const empB = (employees || []).find((e) => e.employeeId === idB)
    if (!empA || !empB) return
    resultTeams.push({
      teamId: generateTeamId(),
      name: deriveTeamName([idA, idB], employees),
      memberIds: [idA, idB],
      autoFormed: true,
      autoReason: 'tagMatchStreak',
      formedDay: currentDay,
      createdAt: Date.now(),
    })
  })

  return resultTeams
}

// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_SPONSOR_TYPE = 'digital'

const getStaffCombinedAbility = (employee) => {
  const ability = employee?.staffAbility || employee?.staff_ability || {}
  return (
    (Number(ability.reliability) || 0) +
    (Number(ability.pressure_handling) || 0) +
    (Number(ability.teamwork) || 0) +
    (Number(ability.technical_skill) || 0)
  )
}

const getSponsorOfferTierByStaffSkill = (employees = []) => {
  const staffCombinedSkill = (employees || [])
    .filter((employee) => employee?.role === 'staff')
    .reduce((sum, employee) => sum + getStaffCombinedAbility(employee), 0)

  if (staffCombinedSkill > 3500) return 7
  if (staffCombinedSkill > 2500) return 6
  if (staffCombinedSkill > 1700) return 5
  if (staffCombinedSkill > 1200) return 4
  if (staffCombinedSkill > 800) return 3
  if (staffCombinedSkill > 500) return 2
  if (staffCombinedSkill > 220) return 1
  return 1
}

const normalizeSponsor = (sponsor) => {
  const sponsorType = SPONSOR_TYPE_CONFIG[sponsor?.sponsorType] ? sponsor.sponsorType : DEFAULT_SPONSOR_TYPE
  const config = SPONSOR_TYPE_CONFIG[sponsorType]

  if (config.eventScoped) {
    return {
      ...sponsor,
      sponsorType,
      contractWeeks: null,
      remainingDays: null,
      eventScoped: true,
    }
  }

  const contractWeeks = Number.isInteger(sponsor?.contractWeeks) ? sponsor.contractWeeks : 52
  const remainingDays = Number.isInteger(sponsor?.remainingDays)
    ? Math.max(0, sponsor.remainingDays)
    : contractWeeks * 7

  return {
    ...sponsor,
    sponsorType,
    contractWeeks,
    remainingDays,
    eventScoped: false,
  }
}

const normalizeSponsors = (sponsors) => {
  if (!Array.isArray(sponsors)) {
    return []
  }

  return sponsors.map(normalizeSponsor)
}

const withEventSponsorName = (event, sponsors = []) => {
  if (!event || !SPONSORABLE_EVENT_TYPES.includes(event.type)) {
    return event
  }

  const eventSponsor = normalizeSponsors(sponsors).find((sponsor) => sponsor.eventScoped)
  if (!eventSponsor) {
    return event
  }

  return {
    ...event,
    name: `${event.name} - Sponsored by ${eventSponsor.name}`,
  }
}

export const useGameStore = create(
  persist(
    (set) => ({
      ...buildInitialState(),

      startGame: ({ playerName, companyName }) => {
        const cleanPlayerName = playerName.trim()
        const cleanCompanyName = companyName.trim()

        if (!cleanPlayerName || !cleanCompanyName) {
          return { ok: false }
        }

        const initialState = buildInitialState()

        set(() => ({
          ...initialState,
          gameStatus: {
            ...initialState.gameStatus,
            hasStarted: true,
          },
          profile: {
            playerName: cleanPlayerName,
            companyName: cleanCompanyName,
          },
        }))

        return { ok: true }
      },

      resetGame: () => {
        set(() => buildInitialState())
      },

      setActiveModule: (moduleId) => {
        set((state) => ({
          ui: {
            ...state.ui,
            activeModule: moduleId,
          },
        }))
      },

      setAiOptedInAtStart: (optedInAtStart) => {
        set((state) => ({
          ai: {
            ...state.ai,
            optedInAtStart: Boolean(optedInAtStart),
          },
        }))
      },

      setAiDownloadStarted: ({ modelId } = {}) => {
        set((state) => ({
          ai: {
            ...state.ai,
            modelId: modelId || state.ai.modelId || 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
            status: 'downloading',
            progress: state.ai.status === 'ready' ? 100 : Math.max(0, Number(state.ai.progress) || 0),
            progressText: '',
            error: '',
          },
        }))
      },

      setAiDownloadProgress: ({ progress, text } = {}) => {
        set((state) => {
          if (state.ai.status === 'ready') {
            return state
          }

          const numericProgress = Number(progress)
          const normalizedProgress = Number.isFinite(numericProgress)
            ? Math.max(0, Math.min(100, Math.round(numericProgress)))
            : state.ai.progress

          return {
            ai: {
              ...state.ai,
              status: 'downloading',
              progress: normalizedProgress,
              progressText: typeof text === 'string' ? text : state.ai.progressText,
              error: '',
            },
          }
        })
      },

      setAiDownloadReady: () => {
        set((state) => ({
          ai: {
            ...state.ai,
            status: 'ready',
            progress: 100,
            progressText: 'Model ready',
            error: '',
            showEnableModal: !state.ai.enabled,
          },
        }))
      },

      setAiDownloadError: (errorMessage) => {
        set((state) => ({
          ai: {
            ...state.ai,
            status: 'error',
            error: String(errorMessage || 'Model download failed'),
          },
        }))
      },

      enableAi: () => {
        set((state) => ({
          ai: {
            ...state.ai,
            enabled: true,
            showEnableModal: false,
          },
        }))
      },

      closeAiEnableModal: () => {
        set((state) => ({
          ai: {
            ...state.ai,
            showEnableModal: false,
          },
        }))
      },

      rerollEmployeeMarket: () => {
        set((state) => ({
          market: {
            ...state.market,
            employeeCandidates: syncEmployeeCandidates({
              employees: state.roster.employees,
              currentCandidates: state.market.employeeCandidates,
              currentDay: state.calendar.day,
              hiringLocks: state.market.hiringLocks,
            }),
            hiringLocks: pruneExpiredHiringLocks(state.market.hiringLocks, state.calendar.day),
          },
        }))
      },

      rerollEventTemplates: () => {
        set((state) => ({
          market: {
            ...state.market,
            eventTemplates: createEventTemplates(),
          },
        }))
      },

      rerollSponsorOffers: () => {
        set((state) => {
          const currentDay = state.calendar.day
          const lastDay = state.market.sponsorOffersLastRerolledDay
          if (lastDay !== null && currentDay - lastDay < 7) {
            return state
          }

          return {
            market: {
              ...state.market,
              sponsorOffers: createSponsorOffers(10, {
                requiredTier: getSponsorOfferTierByStaffSkill(state.roster.employees),
              }),
              sponsorOffersLastRerolledDay: currentDay,
            },
          }
        })
      },

      signSponsor: (offerId) => {
        set((state) => {
          const offer = state.market.sponsorOffers.find((item) => item.offerId === offerId)
          if (!offer) {
            return state
          }

          const sponsorType = offer.sponsorType || DEFAULT_SPONSOR_TYPE
          const typeConfig = SPONSOR_TYPE_CONFIG[sponsorType]
          if (!typeConfig) {
            return state
          }

          const normalizedSponsors = normalizeSponsors(state.roster.sponsors)
          const occupiedSlots = normalizedSponsors.filter((item) => item.sponsorType === sponsorType).length

          if (occupiedSlots >= typeConfig.maxActive) {
            return state
          }

          const hasSponsorableUpcomingEvent = Boolean(
            state.events.bookedEvent && SPONSORABLE_EVENT_TYPES.includes(state.events.bookedEvent.type),
          )

          if (typeConfig.eventScoped && !hasSponsorableUpcomingEvent) {
            return state
          }

          const contractWeeks = typeConfig.eventScoped ? null : Math.max(1, offer.contractWeeks || 1)
          const signedSponsor = normalizeSponsor({
            ...offer,
            sponsorType,
            contractWeeks,
            remainingDays: contractWeeks ? contractWeeks * 7 : null,
          })

          return {
            roster: {
              ...state.roster,
              sponsors: [...normalizedSponsors, signedSponsor],
            },
            market: {
              ...state.market,
              sponsorOffers: state.market.sponsorOffers.filter((item) => item.offerId !== offerId),
            },
            finances: {
              ...state.finances,
              cash: state.finances.cash + offer.signingBonus,
              lastIncome: state.finances.lastIncome + offer.signingBonus,
              lastDelta: state.finances.lastDelta + offer.signingBonus,
              ledger: appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-sponsor-sign`,
                day: state.calendar.day,
                type: 'income',
                category: 'sponsorSigning',
                amount: offer.signingBonus,
                note: `Signed sponsor ${offer.name}`,
              }),
            },
          }
        })
      },

      createCustomEvent: ({ type, name, scheduledWeek, maxMatches, specificDate, isRecurringAnnually }) => {
        const cleanName = (name || '').trim()
        if (!cleanName) {
          return { ok: false, error: 'Event name is required.' }
        }

        let result = { ok: false, error: 'Unknown error.' }

        set((state) => {
          const scheduledDay = getScheduledDayFromSpecificDate({
            specificDate,
            startDateIso: state.calendar.startDateIso,
            fallbackScheduledWeek: scheduledWeek,
          })
          const computedScheduledWeek = getWeekFromDay(scheduledDay)
          const effectiveSpecificDate = specificDate
            ? toIsoDateLocal(getGameDateFromDay(state.calendar.startDateIso, scheduledDay))
            : ''
          const draftEvent = {
            type,
            name: cleanName,
            scheduledWeek: computedScheduledWeek,
            scheduledDay,
            maxMatches: clampMatchesByType(type, Number(maxMatches)),
            specificDate: effectiveSpecificDate,
            isRecurringAnnually: isRecurringAnnually || false,
          }

          const validation = validateCustomEventRules({
            customEvents: state.events.customEvents,
            draftEvent,
            currentWeek: state.calendar.week,
            currentDay: state.calendar.day,
          })

          if (!validation.ok) {
            result = validation
            return state
          }

          const createdEvent = {
            eventId: `custom-event-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: draftEvent.type,
            name: draftEvent.name,
            maxMatches: draftEvent.maxMatches,
            scheduledWeek: draftEvent.scheduledWeek,
            scheduledDay,
            month: getMonthFromWeek(draftEvent.scheduledWeek),
            year: getYearFromWeek(draftEvent.scheduledWeek),
            specificDate: draftEvent.specificDate,
            isRecurringAnnually: draftEvent.isRecurringAnnually,
            isSystem: false,
            createdAt: Date.now(),
          }

          const bookingCost = getEventSetupCost(createdEvent.type)
          if (state.finances.cash < bookingCost) {
            result = { ok: false, error: 'Insufficient cash for event setup cost.' }
            return state
          }

          const nextCustomEvents = [...state.events.customEvents, createdEvent]

          result = { ok: true }

          return {
            events: {
              ...state.events,
              customEvents: nextCustomEvents,
              bookedEvent: buildBookedEventProjection(state.calendar.day, nextCustomEvents, state.calendar.startDateIso),
            },
            finances: {
              ...state.finances,
              cash: state.finances.cash - bookingCost,
              lastExpenses: state.finances.lastExpenses + bookingCost,
              lastDelta: state.finances.lastDelta - bookingCost,
              ledger: appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-event-booking`,
                day: state.calendar.day,
                type: 'expense',
                category: 'eventBooking',
                amount: bookingCost,
                note: `Booked custom event ${createdEvent.name}`,
              }),
            },
          }
        })

        return result
      },

      updateCustomEvent: (eventId, { type, name, scheduledWeek, maxMatches, specificDate, isRecurringAnnually }) => {
        const cleanName = (name || '').trim()
        if (!cleanName) {
          return { ok: false, error: 'Event name is required.' }
        }

        let result = { ok: false, error: 'Unknown error.' }

        set((state) => {
          const currentEvent = state.events.customEvents.find((event) => event.eventId === eventId)
          if (!currentEvent) {
            result = { ok: false, error: 'Event not found.' }
            return state
          }

          const scheduledDay = getScheduledDayFromSpecificDate({
            specificDate,
            startDateIso: state.calendar.startDateIso,
            fallbackScheduledWeek: scheduledWeek,
          })
          const computedScheduledWeek = getWeekFromDay(scheduledDay)
          const effectiveSpecificDate = specificDate
            ? toIsoDateLocal(getGameDateFromDay(state.calendar.startDateIso, scheduledDay))
            : ''
          const draftEvent = {
            type,
            name: cleanName,
            scheduledWeek: computedScheduledWeek,
            scheduledDay,
            maxMatches: clampMatchesByType(type, Number(maxMatches)),
            specificDate: effectiveSpecificDate,
            isRecurringAnnually: isRecurringAnnually || false,
          }

          const validation = validateCustomEventRules({
            customEvents: state.events.customEvents,
            draftEvent,
            currentWeek: state.calendar.week,
            currentDay: state.calendar.day,
            ignoreEventId: eventId,
          })

          if (!validation.ok) {
            result = validation
            return state
          }

          const updatedEvents = state.events.customEvents.map((event) => {
            if (event.eventId !== eventId) {
              return event
            }

            const nextScheduledWeek = Number(draftEvent.scheduledWeek)

            return {
              ...event,
              type: draftEvent.type,
              name: draftEvent.name,
              maxMatches: draftEvent.maxMatches,
              scheduledWeek: nextScheduledWeek,
              scheduledDay: draftEvent.scheduledDay,
              month: getMonthFromWeek(nextScheduledWeek),
              year: getYearFromWeek(nextScheduledWeek),
              specificDate: draftEvent.specificDate,
              isRecurringAnnually: draftEvent.isRecurringAnnually,
            }
          })

          const oldSetupCost = getEventSetupCost(currentEvent.type)
          const nextSetupCost = getEventSetupCost(draftEvent.type)
          const setupCostDelta = nextSetupCost - oldSetupCost

          if (setupCostDelta > 0 && state.finances.cash < setupCostDelta) {
            result = { ok: false, error: 'Insufficient cash for updated event setup cost.' }
            return state
          }

          result = { ok: true }

          const nextLedger = (() => {
            if (setupCostDelta === 0) {
              return state.finances.ledger
            }

            return appendLedger(state.finances.ledger, {
              id: `tx-${Date.now()}-event-update-${eventId}`,
              day: state.calendar.day,
              type: setupCostDelta > 0 ? 'expense' : 'income',
              category: setupCostDelta > 0 ? 'eventBooking' : 'eventRefund',
              amount: Math.abs(setupCostDelta),
              note: `Updated setup cost for ${draftEvent.name}`,
            })
          })()

          return {
            events: {
              ...state.events,
              customEvents: updatedEvents,
              bookedEvent: buildBookedEventProjection(state.calendar.day, updatedEvents, state.calendar.startDateIso),
            },
            finances: {
              ...state.finances,
              cash: state.finances.cash - setupCostDelta,
              lastIncome: setupCostDelta < 0
                ? state.finances.lastIncome + Math.abs(setupCostDelta)
                : state.finances.lastIncome,
              lastExpenses: setupCostDelta > 0
                ? state.finances.lastExpenses + setupCostDelta
                : state.finances.lastExpenses,
              lastDelta: state.finances.lastDelta - setupCostDelta,
              ledger: nextLedger,
            },
          }
        })

        return result
      },

      deleteCustomEvent: (eventId) => {
        set((state) => {
          const eventToDelete = state.events.customEvents.find((event) => event.eventId === eventId)
          const nextCustomEvents = state.events.customEvents.filter((event) => event.eventId !== eventId)
          const isFutureOrCurrent = Boolean(eventToDelete && Number(eventToDelete.scheduledDay) >= Number(state.calendar.day))
          const refundAmount = isFutureOrCurrent
            ? Math.round(getEventSetupCost(eventToDelete.type) * EVENT_BOOKING_REFUND_RATE)
            : 0
          const nextLedger = refundAmount > 0
            ? appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-event-refund-${eventId}`,
                day: state.calendar.day,
                type: 'income',
                category: 'eventRefund',
                amount: refundAmount,
                note: `Refund for deleted event ${eventToDelete.name}`,
              })
            : state.finances.ledger

          return {
            events: {
              ...state.events,
              customEvents: nextCustomEvents,
              bookedEvent: buildBookedEventProjection(state.calendar.day, nextCustomEvents, state.calendar.startDateIso),
            },
            finances: {
              ...state.finances,
              cash: state.finances.cash + refundAmount,
              lastIncome: state.finances.lastIncome + refundAmount,
              lastDelta: state.finances.lastDelta + refundAmount,
              ledger: nextLedger,
            },
          }
        })
      },

      hireEmployee: (candidateId, options = {}) => {
        const skipNegotiation = Boolean(options?.skipNegotiation)
        let hireResult = {
          ok: false,
          reason: 'unknown',
        }

        set((state) => {
          const candidate = state.market.employeeCandidates.find((item) => item.candidateId === candidateId)
          const activeHiringLocks = pruneExpiredHiringLocks(state.market.hiringLocks, state.calendar.day)
          const candidatePersonId = getCandidatePersonId(candidate)

          if (!candidate) {
            hireResult = { ok: false, reason: 'notFound' }
            return state
          }

          if (candidatePersonId && activeHiringLocks[candidatePersonId]) {
            hireResult = { ok: false, reason: 'lockedUntil', unlockDay: activeHiringLocks[candidatePersonId] }
            return {
              market: {
                ...state.market,
                hiringLocks: activeHiringLocks,
              },
            }
          }

          const demandMonthlySalary = candidate?.contract?.monthlySalary || candidate?.salary || 0
          const demandPerMatchSalary = candidate?.contract?.perMatchSalary || 0
          const demandSigningBonus = candidate?.contract?.signingBonus || candidate?.signingBonus || 0
          const demandContractLengthMonths =
            candidate?.contract?.contractLengthMonths || candidate?.contract?.negotiatedContractLengthMonths || 12

          const upfrontMonthlySalary = skipNegotiation
            ? demandMonthlySalary
            : (candidate?.contract?.negotiatedMonthlySalary || candidate?.salary || 0)

          if (!skipNegotiation && !candidate.contract?.offerAccepted) {
            hireResult = { ok: false, reason: 'offerNotAccepted' }
            return state
          }

          if (state.finances.cash < upfrontMonthlySalary) {
            hireResult = { ok: false, reason: 'insufficientCash' }
            return state
          }

          if (candidate.role === 'wrestler') {
            const maxRosterSize = candidate.gender === 'female' ? MAX_FEMALE_WRESTLERS : MAX_MALE_WRESTLERS
            const currentCount = state.roster.employees.filter(
              (emp) => emp.role === 'wrestler' && emp.gender === candidate.gender,
            ).length
            if (currentCount >= maxRosterSize) {
              hireResult = { ok: false, reason: 'rosterFull' }
              return state
            }
          }

          const candidateForHire = skipNegotiation
            ? {
                ...candidate,
                salary: demandMonthlySalary,
                signingBonus: demandSigningBonus,
                contract: {
                  ...candidate.contract,
                  offerAccepted: true,
                  negotiatedMonthlySalary: demandMonthlySalary,
                  negotiatedPerMatchSalary: demandPerMatchSalary,
                  negotiatedSigningBonus: demandSigningBonus,
                  negotiatedContractLengthMonths: demandContractLengthMonths,
                },
              }
            : candidate

          const hiredEmployee = toEmployeeRecord(candidateForHire, state.calendar.day)

          hireResult = { ok: true, reason: null }

          const hirePrestigeDelta = (hiredEmployee.role === 'wrestler' && hiredEmployee.skill >= 82)
            ? Math.round((hiredEmployee.skill - 80) / 3)
            : 0

          return {
            roster: {
              ...state.roster,
              employees: [...state.roster.employees, hiredEmployee],
            },
            market: {
              ...state.market,
              employeeCandidates: syncEmployeeCandidates({
                employees: [...state.roster.employees, hiredEmployee],
                currentCandidates: state.market.employeeCandidates.filter((item) => item.candidateId !== candidateId),
                currentDay: state.calendar.day,
                hiringLocks: state.market.hiringLocks,
              }),
              hiringLocks: pruneExpiredHiringLocks(state.market.hiringLocks, state.calendar.day),
            },
            stats: hirePrestigeDelta > 0
              ? { ...state.stats, prestige: Math.max(0, state.stats.prestige + hirePrestigeDelta) }
              : state.stats,
            finances: {
              ...state.finances,
              cash: state.finances.cash - upfrontMonthlySalary,
              lastExpenses: state.finances.lastExpenses + upfrontMonthlySalary,
              lastDelta: state.finances.lastDelta - upfrontMonthlySalary,
              ledger: appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-hire`,
                day: state.calendar.day,
                type: 'expense',
                category: 'hiring',
                amount: upfrontMonthlySalary,
                note: `Upfront monthly salary for ${candidate.name} (${candidate.role})`,
              }),
            },
          }
        })

        return hireResult
      },

      negotiateEmployeeContract: (candidateId, offer) => {
        let result = {
          ok: false,
          accepted: false,
        }

        set((state) => {
          const candidate = state.market.employeeCandidates.find((item) => item.candidateId === candidateId)

          if (!candidate || candidate.contract?.negotiationLocked) {
            result = {
              ok: false,
              accepted: false,
              reason: 'locked',
            }

            return state
          }

          const evaluation = evaluateCandidateOffer(candidate, offer)

          result = {
            ok: true,
            accepted: evaluation.accepted,
            maxDiscountPercent: evaluation.maxDiscountPercent,
            minimumOffer: evaluation.minimumOffer,
            offer: evaluation.adjustedOffer,
          }

          return {
            market: {
              ...state.market,
              employeeCandidates: state.market.employeeCandidates.map((entry) => {
                if (entry.candidateId !== candidateId) {
                  return entry
                }

                return {
                  ...entry,
                  salary: evaluation.accepted ? evaluation.adjustedOffer.monthlySalary : entry.salary,
                  signingBonus: evaluation.accepted ? evaluation.adjustedOffer.signingBonus : entry.signingBonus,
                  contract: {
                    ...entry.contract,
                    negotiatedMonthlySalary: evaluation.accepted
                      ? evaluation.adjustedOffer.monthlySalary
                      : entry.contract.negotiatedMonthlySalary,
                    negotiatedPerMatchSalary: evaluation.accepted
                      ? evaluation.adjustedOffer.perMatchSalary
                      : entry.contract.negotiatedPerMatchSalary,
                    negotiatedSigningBonus: evaluation.accepted
                      ? evaluation.adjustedOffer.signingBonus
                      : entry.contract.negotiatedSigningBonus,
                    lastOfferMonthlySalary: evaluation.adjustedOffer.monthlySalary,
                    lastOfferPerMatchSalary: evaluation.adjustedOffer.perMatchSalary,
                    lastOfferSigningBonus: evaluation.adjustedOffer.signingBonus,
                    lastOfferContractLengthMonths: evaluation.adjustedOffer.contractLengthMonths,
                    lastOfferAdjustPercent: evaluation.adjustedOffer.adjustPercent,
                    lastOfferBenefits: evaluation.adjustedOffer.benefits,
                    maxDiscountPercent: evaluation.maxDiscountPercent,
                    negotiationAttempted: true,
                    negotiationLocked: evaluation.accepted,
                    offerAccepted: evaluation.accepted,
                    negotiatedBenefits: evaluation.accepted
                      ? evaluation.adjustedOffer.benefits
                      : entry.contract.negotiatedBenefits,
                    negotiatedContractLengthMonths: evaluation.accepted
                      ? evaluation.adjustedOffer.contractLengthMonths
                      : entry.contract.negotiatedContractLengthMonths,
                  },
                }
              }),
            },
          }
        })

        return result
      },

      fireEmployee: (employeeId) => {
        set((state) => {
          const employee = state.roster.employees.find((item) => item.employeeId === employeeId)
          if (!employee) {
            return state
          }

          const perMatchSalary = Number(employee.contract?.perMatchSalary) || 0
          const signingBonus = Number(employee.contract?.signingBonus) || 0
          const severanceCost = 20 * perMatchSalary + 3 * signingBonus
          const firePrestigeDelta = (employee.role === 'wrestler' && (employee.skill || 0) >= 82)
            ? -Math.round(((employee.skill || 0) - 80) / 3)
            : 0

          return {
            roster: {
              ...state.roster,
              employees: state.roster.employees.filter((item) => item.employeeId !== employeeId),
            },
            market: {
              ...state.market,
              employeeCandidates: syncEmployeeCandidates({
                employees: state.roster.employees.filter((item) => item.employeeId !== employeeId),
                currentCandidates: state.market.employeeCandidates,
                currentDay: state.calendar.day,
                hiringLocks: state.market.hiringLocks,
              }),
              hiringLocks: pruneExpiredHiringLocks(state.market.hiringLocks, state.calendar.day),
            },
            stats: firePrestigeDelta < 0
              ? { ...state.stats, prestige: Math.max(0, state.stats.prestige + firePrestigeDelta) }
              : state.stats,
            finances: {
              ...state.finances,
              cash: state.finances.cash - severanceCost,
              lastExpenses: state.finances.lastExpenses + severanceCost,
              lastDelta: state.finances.lastDelta - severanceCost,
              ledger: appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-fire`,
                day: state.calendar.day,
                type: 'expense',
                category: 'severance',
                amount: severanceCost,
                note: `Severance for ${employee.name}`,
              }),
            },
          }
        })
      },

      setEmployeeManager: (employeeId, managerId) => {
        set((state) => {
          const employee = state.roster.employees.find((item) => item.employeeId === employeeId)
          if (!employee) {
            return state
          }

          if (managerId !== null) {
            const manager = state.roster.employees.find((item) => item.employeeId === managerId)
            if (!manager || manager.role !== 'manager') {
              return state
            }
          }

          return {
            roster: {
              ...state.roster,
              employees: state.roster.employees.map((emp) =>
                emp.employeeId === employeeId
                  ? { ...emp, managerId }
                  : emp,
              ),
            },
          }
        })
      },

      giveEmployeeBonus: (employeeId, amount, rankPosition = 0) => {
        const parsedAmount = Math.max(0, Math.round(Number(amount) || 0))

        if (parsedAmount <= 0) {
          return { ok: false, reason: 'invalidAmount' }
        }

        let result = { ok: false, reason: 'unknown' }

        set((state) => {
          const employee = state.roster.employees.find((item) => item.employeeId === employeeId)
          if (!employee) {
            result = { ok: false, reason: 'notFound' }
            return state
          }

          if (!shouldTrackHappiness(employee.role)) {
            result = { ok: false, reason: 'ineligibleRole' }
            return state
          }

          if (state.finances.cash < parsedAmount) {
            result = { ok: false, reason: 'insufficientCash' }
            return state
          }

          const holdsTitle = state.roster.titles.some((title) => {
            const ids = [
              ...(Array.isArray(title.holderEmployeeIds) ? title.holderEmployeeIds : []),
              ...(title.holderEmployeeId ? [title.holderEmployeeId] : []),
            ].filter(Boolean)
            return ids.includes(employeeId)
          })
          const titleHolderFlag = holdsTitle ? 3 : 1
          const perMatchFee = Number(employee.contract?.perMatchSalary || 0)
          const rank = Number(rankPosition) || 0
          const divisor = (perMatchFee - rank) * 5
          const happinessBoost = divisor > 0
            ? Math.max(1, Math.round((parsedAmount / divisor) * titleHolderFlag))
            : titleHolderFlag

          const nextHappiness = clampHappiness((employee.happiness ?? DEFAULT_HAPPINESS) + happinessBoost)
          result = { ok: true, happinessBoost, nextHappiness }

          return {
            roster: {
              ...state.roster,
              employees: state.roster.employees.map((item) =>
                item.employeeId === employeeId
                  ? {
                      ...item,
                      happiness: nextHappiness,
                    }
                  : item,
              ),
            },
            finances: {
              ...state.finances,
              cash: state.finances.cash - parsedAmount,
              lastExpenses: state.finances.lastExpenses + parsedAmount,
              lastDelta: state.finances.lastDelta - parsedAmount,
              ledger: appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-bonus`,
                day: state.calendar.day,
                type: 'expense',
                category: 'employeeBonus',
                amount: parsedAmount,
                note: `Bonus for ${employee.name} (+${happinessBoost} happiness)`,
              }),
            },
          }
        })

        return result
      },

      setSubscriptionFee: (fee) => {
        set((state) => {
          const parsed = Number(fee)
          if (!Number.isFinite(parsed)) return state
          const minFee = GAME_CONFIG.economy.webSubscription.minFee
          const maxFee = GAME_CONFIG.economy.webSubscription.maxFee
          const normalizedFee = Math.max(minFee, Math.min(maxFee, parsed))
          return {
            finances: {
              ...state.finances,
              subscriptionFee: normalizedFee,
            },
          }
        })
      },

      setEventTicketFee: (eventType, fee) => {
        set((state) => {
          const parsed = Number(fee)
          if (!Number.isFinite(parsed) || parsed < 0) return state
          if (!GAME_CONFIG.economy.audience.byEventType[eventType]) return state

          return {
            finances: {
              ...state.finances,
              ticketFees: {
                ...(state.finances.ticketFees || {}),
                [eventType]: Math.round(parsed),
              },
            },
          }
        })
      },

      setEventPreparation: (data) => {
        set((state) => ({
          events: {
            ...state.events,
            eventPreparation: data
              ? {
                  eventId: typeof data.eventId === 'string' ? data.eventId : null,
                  venueId: typeof data.venueId === 'string' ? data.venueId : null,
                  promotedWrestlerIds: Array.isArray(data.promotedWrestlerIds)
                    ? data.promotedWrestlerIds.filter((id) => typeof id === 'string')
                    : [],
                }
              : null,
          },
        }))
      },

      setTitleActive: (titleId, isActive) => {
        set((state) => ({
          roster: {
            ...state.roster,
            titles: state.roster.titles.map((title) =>
              title.titleId === titleId
                ? {
                    ...title,
                    isActive,
                  }
                : title,
            ),
          },
        }))
      },

      createTeam: ({ name, memberIds }) => {
        const cleanName = (name || '').trim()
        if (!cleanName) {
          return { ok: false, error: 'teamNameRequired' }
        }

        const uniqueIds = Array.from(new Set(memberIds || []))
        if (uniqueIds.length < MIN_TEAM_MEMBERS || uniqueIds.length > MAX_TEAM_MEMBERS) {
          return { ok: false, error: 'teamMemberCount' }
        }

        let result = { ok: false, error: 'unknown' }

        set((state) => {
          const activeIds = new Set(state.roster.employees.map((e) => e.employeeId))
          const validIds = uniqueIds.filter((id) => activeIds.has(id))
          if (validIds.length < MIN_TEAM_MEMBERS) {
            result = { ok: false, error: 'teamMemberCount' }
            return state
          }

          const existingTeams = Array.isArray(state.roster.teams) ? state.roster.teams : []
          if (teamAlreadyExists(existingTeams, validIds)) {
            result = { ok: false, error: 'teamAlreadyExists' }
            return state
          }

          const newTeam = {
            teamId: generateTeamId(),
            name: cleanName,
            memberIds: validIds,
            autoFormed: false,
            autoReason: null,
            formedDay: state.calendar.day,
            createdAt: Date.now(),
          }

          result = { ok: true }

          return {
            roster: {
              ...state.roster,
              teams: [...existingTeams, newTeam],
            },
          }
        })

        return result
      },

      updateTeam: (teamId, { name, memberIds }) => {
        const cleanName = (name || '').trim()
        if (!cleanName) {
          return { ok: false, error: 'teamNameRequired' }
        }

        const uniqueIds = Array.from(new Set(memberIds || []))
        if (uniqueIds.length < MIN_TEAM_MEMBERS || uniqueIds.length > MAX_TEAM_MEMBERS) {
          return { ok: false, error: 'teamMemberCount' }
        }

        let result = { ok: false, error: 'unknown' }

        set((state) => {
          const existingTeams = Array.isArray(state.roster.teams) ? state.roster.teams : []
          const teamIndex = existingTeams.findIndex((t) => t.teamId === teamId)
          if (teamIndex === -1) {
            result = { ok: false, error: 'teamNotFound' }
            return state
          }

          const activeIds = new Set(state.roster.employees.map((e) => e.employeeId))
          const validIds = uniqueIds.filter((id) => activeIds.has(id))
          if (validIds.length < MIN_TEAM_MEMBERS) {
            result = { ok: false, error: 'teamMemberCount' }
            return state
          }

          const otherTeams = existingTeams.filter((t) => t.teamId !== teamId)
          if (teamAlreadyExists(otherTeams, validIds)) {
            result = { ok: false, error: 'teamAlreadyExists' }
            return state
          }

          const updatedTeams = existingTeams.map((t) =>
            t.teamId === teamId
              ? { ...t, name: cleanName, memberIds: validIds, autoFormed: false }
              : t,
          )

          result = { ok: true }

          return {
            roster: {
              ...state.roster,
              teams: updatedTeams,
            },
          }
        })

        return result
      },

      deleteTeam: (teamId) => {
        set((state) => ({
          roster: {
            ...state.roster,
            teams: (state.roster.teams || []).filter((t) => t.teamId !== teamId),
          },
        }))
      },

      skipEvent: () => {
        set((state) => {
          const reductionPct = (5 + Math.random() * 5) / 100
          const reductionAmount = Math.max(1, Math.round(state.stats.prestige * reductionPct))
          return {
            stats: {
              ...state.stats,
              prestige: Math.max(0, state.stats.prestige - reductionAmount),
            },
          }
        })
      },

      proceedTimeline: (eventSetup = null) => {
        set((state) => {
          const nextCalendar = calculateNextCalendar(state.calendar.day, state.calendar.startDateIso)
          const nextActiveEmployees = filterActiveEmployees(state.roster.employees, nextCalendar.day)
          const normalizedSponsors = normalizeSponsors(state.roster.sponsors)
          const dueCustomEvent = getDueCustomEventForDay(state.calendar.day, state.events.customEvents)
          const regularEventToday = isRegularWeeklyEventDay(state.calendar.startDateIso, state.calendar.day)
          const production = dueCustomEvent
            ? toProductionEvent(dueCustomEvent)
            : (regularEventToday ? buildRegularWeeklyProjection(state.calendar.day - 1, state.calendar.startDateIso) : null)
          const shouldRunEvent = Boolean(eventSetup && production)
          const productionWithSponsor = shouldRunEvent ? withEventSponsorName(production, normalizedSponsors) : production
          const executedCustomEventId = dueCustomEvent?.eventId || null
          const isSponsorableEventType = Boolean(productionWithSponsor && SPONSORABLE_EVENT_TYPES.includes(productionWithSponsor.type))
          const sponsorEventBoost = isSponsorableEventType
            ? normalizedSponsors.reduce((sum, sponsor) => sum + sponsor.eventMultiplier, 0)
            : 0
          const sponsorFanBoost = isSponsorableEventType
            ? normalizedSponsors.reduce((sum, sponsor) => sum + sponsor.fanBoost, 0)
            : 0
          let eventIncome = 0
          let perMatchSalaryExpenses = 0
          let perMatchPayoutCount = 0
          let titleHolderMatchBonus = 0
          let staffMatchExpenses = 0
          let staffMatchPayoutCount = 0
          let fanDelta = 60
          let prestigeDelta = 0
          let moraleDelta = 0
          let lastOutcome = null
          let configuredSegments = []

          const eventSetupSegments = shouldRunEvent
            ? sanitizeEventSetup(eventSetup, nextActiveEmployees, productionWithSponsor.maxMatches)
            : []
          const performanceApplied = applyDailyPerformanceChanges(nextActiveEmployees, eventSetupSegments)
          const nextActiveEmployeesWithPerformance = performanceApplied.employees
          configuredSegments = performanceApplied.configuredSegments || []

          // Apply event preparation promotion bonus/penalty
          const prepEventId = dueCustomEvent?.eventId || 'regular-weekly-event'
          const prep = state.events.eventPreparation
          if (shouldRunEvent && prep && prep.eventId === prepEventId) {
            const promotedIds = Array.isArray(prep.promotedWrestlerIds) ? prep.promotedWrestlerIds : []
            if (promotedIds.length >= 2) {
              const promotedMatchSeg = configuredSegments.find(
                (seg) =>
                  MATCH_SEGMENT_TYPES.has(seg.segmentType) &&
                  promotedIds.every((id) => (seg.wrestlerIds || []).includes(id)),
              )
              if (promotedMatchSeg) {
                const prepTitleHolderIds = new Set(
                  (state.roster.titles || [])
                    .filter((t) => t.isActive !== false)
                    .flatMap((t) =>
                      t.division === 'doubles'
                        ? (Array.isArray(t.holderEmployeeIds) ? t.holderEmployeeIds : [])
                        : (t.holderEmployeeId ? [t.holderEmployeeId] : []),
                    ),
                )
                const sortedByPop = [...nextActiveEmployees]
                  .filter((e) => e.role === 'wrestler')
                  .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))
                const top5Ids = new Set(sortedByPop.slice(0, 5).map((e) => e.employeeId))
                const hasQualifier = promotedIds.some((id) => top5Ids.has(id) || prepTitleHolderIds.has(id))
                const promoBonus = hasQualifier ? 0.5 : 0.2
                configuredSegments = configuredSegments.map((seg) => {
                  if (seg !== promotedMatchSeg) return seg

                  const baseRating = Number.isFinite(Number(seg.matchRating))
                    ? Number(seg.matchRating)
                    : calculateMatchRating(
                        (seg.wrestlerIds || [])
                          .map((id) => nextActiveEmployeesWithPerformance.find((employee) => employee.employeeId === id))
                          .filter((employee) => employee?.role === 'wrestler'),
                      )
                  const nextRating = Math.max(1, Math.min(10, Number((baseRating + promoBonus).toFixed(1))))
                  const appliedDelta = Number((nextRating - baseRating).toFixed(1))
                  return {
                    ...seg,
                    matchRating: nextRating,
                    promoRatingAdjustment: appliedDelta,
                    promoRatingAdjustmentType: 'bonus',
                    promoRatingAdjustmentRule: hasQualifier ? 'qualified' : 'base',
                    promoRatingAdjustmentSource: 'eventPreparation',
                    promoRatingCapHit: nextRating >= 10,
                  }
                })
              } else {
                // Promoted match didn't happen: penalise all match ratings
                configuredSegments = configuredSegments.map((seg) => {
                  if (!MATCH_SEGMENT_TYPES.has(seg.segmentType) || seg.matchRating == null) return seg
                  const baseRating = Number(seg.matchRating)
                  const nextRating = Math.max(1, Math.min(10, Number((baseRating - 0.2).toFixed(1))))
                  const appliedDelta = Number((nextRating - baseRating).toFixed(1))
                  return {
                    ...seg,
                    matchRating: nextRating,
                    promoRatingAdjustment: appliedDelta,
                    promoRatingAdjustmentType: 'penalty',
                    promoRatingAdjustmentRule: 'missedPromotedMatch',
                    promoRatingAdjustmentSource: 'eventPreparation',
                    promoRatingCapHit: nextRating <= 1,
                  }
                })
              }
            }
          }

          if (shouldRunEvent) {
            // Collect title holder IDs for bonus calculation
            const titleHolderIds = new Set(
              (state.roster.titles || [])
                .filter((t) => t.isActive !== false)
                .flatMap((t) =>
                  t.division === 'doubles'
                    ? (Array.isArray(t.holderEmployeeIds) ? t.holderEmployeeIds : [])
                    : (t.holderEmployeeId ? [t.holderEmployeeId] : []),
                ),
            )

            // Track segment count per staff member
            const staffSegmentCounts = {}

            configuredSegments.forEach((segment) => {
              if (!MATCH_SEGMENT_TYPES.has(segment.segmentType)) {
                return
              }

              const wrestlerIds = Array.from(
                new Set(
                  (segment.participantIds || [])
                    .map((id) => nextActiveEmployeesWithPerformance.find((employee) => employee.employeeId === id))
                    .filter((employee) => employee?.role === 'wrestler')
                    .map((employee) => employee.employeeId),
                ),
              )

              wrestlerIds.forEach((wrestlerId) => {
                const wrestler = nextActiveEmployeesWithPerformance.find((employee) => employee.employeeId === wrestlerId)
                if (!wrestler) {
                  return
                }

                const fee = Math.max(0, Number(wrestler.contract?.perMatchSalary || 0))
                perMatchSalaryExpenses += fee
                perMatchPayoutCount += 1

                // Title holders get an additional per-match bonus multiplier
                if (titleHolderIds.has(wrestlerId)) {
                  titleHolderMatchBonus += Math.round(fee * GAME_CONFIG.economy.expense.titleHolderMatchBonusMultiplier)
                }
              })

              // Track staff participation per segment
              ;(segment.participantIds || []).forEach((id) => {
                const emp = nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id)
                if (emp && (emp.role === 'staff' || emp.role === 'referee' || emp.role === 'announcer')) {
                  staffSegmentCounts[id] = (staffSegmentCounts[id] || 0) + 1
                }
              })
            })

            // Staff cost: per-match fee + bonus if appeared above threshold segments
            Object.entries(staffSegmentCounts).forEach(([id, count]) => {
              const emp = nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id)
              if (!emp) return
              const fee = Math.max(0, Number(emp.contract?.perMatchSalary || 0))
              staffMatchExpenses += fee
              if (count > GAME_CONFIG.economy.expense.staffHeavyUsageThreshold) {
                staffMatchExpenses += Math.round(fee * GAME_CONFIG.economy.expense.staffHeavyUsageBonusMultiplier)
              }
              staffMatchPayoutCount += 1
            })
          }

          if (shouldRunEvent) {
            const setupParticipantCount = new Set(
              configuredSegments.flatMap((segment) => segment.participantIds),
            ).size
            const setupBonus = configuredSegments.reduce(
              (totals, segment) => {
                const typeBonus = SEGMENT_TYPE_BONUS[segment.segmentType] || SEGMENT_TYPE_BONUS.match
                return {
                  income: totals.income + typeBonus.income,
                  fans: totals.fans + typeBonus.fans,
                  prestige: totals.prestige + typeBonus.prestige,
                }
              },
              { income: 0, fans: 0, prestige: 0 },
            )

            // Audience-based event income
            const eventType = productionWithSponsor.type
            const audienceConfig = GAME_CONFIG.economy.audience.byEventType[eventType]
              || GAME_CONFIG.economy.audience.byEventType.regularWeekly
            const audienceMin = audienceConfig.min
            const audienceMax = audienceConfig.max
            const ticketPrice = Number(state.finances.ticketFees?.[eventType]) || audienceConfig.ticketPrice
            const fanFactor = Math.min(state.stats.fans / GAME_CONFIG.economy.audience.fanScaleMax, 1)
            const prestigeFactor = Math.min(state.stats.prestige / GAME_CONFIG.economy.audience.prestigeScaleMax, 1)
            const audienceNorm =
              fanFactor * GAME_CONFIG.economy.audience.fansWeight
              + prestigeFactor * GAME_CONFIG.economy.audience.prestigeWeight
            const crowdRand =
              GAME_CONFIG.economy.audience.randomMin
              + Math.random() * (GAME_CONFIG.economy.audience.randomMax - GAME_CONFIG.economy.audience.randomMin)
            const audienceCount = Math.round(
              Math.max(audienceMin, Math.min(audienceMax, audienceMin + (audienceMax - audienceMin) * audienceNorm * crowdRand)),
            )
            eventIncome = Math.round(audienceCount * ticketPrice * (1 + sponsorEventBoost) + setupBonus.income)

            const baseFanDelta = Math.round(
              130 + productionWithSponsor.hype * 0.9 - productionWithSponsor.risk * 0.45 + sponsorFanBoost + setupBonus.fans + setupParticipantCount,
            )
            // Prestige: driven by match quality (ratings), wrestler popularity, event type bonuses, and hype/risk
            const matchSegs = configuredSegments.filter((seg) => MATCH_SEGMENT_TYPES.has(seg.segmentType))
            const allMatchParticipantIds = [...new Set(matchSegs.flatMap((seg) => seg.participantIds))]
            const allMatchParticipants = allMatchParticipantIds
              .map((id) => nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id))
              .filter((e) => e && e.role === 'wrestler')
            const avgWrestlerPopularity = allMatchParticipants.length > 0
              ? allMatchParticipants.reduce((sum, e) => sum + (Number(e.popularity) || 0), 0) / allMatchParticipants.length
              : 0
            const matchRatingBonus = matchSegs.reduce((sum, seg) => {
              const rating = Number(seg.matchRating)
              if (!Number.isFinite(rating)) return sum
              return sum + (rating - 5) * 0.4
            }, 0)
            const calculatedPrestigeDelta = Math.round(
              productionWithSponsor.hype / 36
              - productionWithSponsor.risk / 42
              + setupBonus.prestige
              + (avgWrestlerPopularity / 100) * 2
              + matchRatingBonus,
            )
            prestigeDelta = Math.round(calculatedPrestigeDelta / 5)
            moraleDelta = 1
            const matchSegmentsForRating = configuredSegments.filter((seg) => MATCH_SEGMENT_TYPES.has(seg.segmentType))
            const ratedMatchSegs = matchSegmentsForRating.filter((seg) => Number.isFinite(Number(seg.matchRating)))
            const overallRating = ratedMatchSegs.length > 0
              ? Number((ratedMatchSegs.reduce((sum, seg) => sum + Number(seg.matchRating), 0) / ratedMatchSegs.length).toFixed(1))
              : null
            const fanGrowthThreshold = {
              regularWeekly: 7.5,
              houseShow: 7.5,
              digitalOnly: 7.5,
              ppv: 8,
              oneTime: 8,
              megaLive: 8.5,
            }[eventType] ?? 7.5
            const fansShouldGrow = overallRating !== null && overallRating > fanGrowthThreshold
            fanDelta = fansShouldGrow ? Math.max(baseFanDelta, 0) : -Math.max(baseFanDelta, 0)
            lastOutcome = {
              type: 'success',
              eventName: productionWithSponsor.name,
              eventType: productionWithSponsor.type,
              hype: productionWithSponsor.hype,
              overallRating,
              audience: audienceCount,
              income: eventIncome,
              fanDelta,
              prestigeDelta,
              segments: configuredSegments.map((seg) => {
                const isTagTeamSeg = seg.matchType === 'tagTeam'
                const segWinnerTeamIds = Array.isArray(seg.winnerTeamIds) ? seg.winnerTeamIds : []
                const winnerName = isTagTeamSeg
                  ? segWinnerTeamIds.map((id) => nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id)?.name).filter(Boolean).join(' & ') || null
                  : nextActiveEmployeesWithPerformance.find((e) => e.employeeId === seg.winnerEmployeeId)?.name || null
                return {
                  segmentType: seg.segmentType,
                  matchType: seg.matchType || null,
                  winnerEmployeeId: isTagTeamSeg ? null : (seg.winnerEmployeeId || null),
                  winnerTeamIds: isTagTeamSeg ? segWinnerTeamIds : [],
                  winnerName,
                  matchRating: seg.matchRating,
                  promoRatingAdjustment: Number.isFinite(Number(seg.promoRatingAdjustment))
                    ? Number(seg.promoRatingAdjustment)
                    : null,
                  promoRatingAdjustmentType: seg.promoRatingAdjustmentType || null,
                  promoRatingAdjustmentRule: seg.promoRatingAdjustmentRule || null,
                  promoRatingCapHit: Boolean(seg.promoRatingCapHit),
                  interviewPopularityChanges: seg.interviewPopularityChanges || [],
                  participantDetails: seg.participantIds
                    .map((id) => nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id))
                    .filter(Boolean)
                    .map((employee) => ({
                      employeeId: employee.employeeId,
                      name: employee.name,
                      role: employee.role,
                      gender: employee.gender,
                      imageUrl: employee.imageUrl || null,
                    })),
                  participants: seg.participantIds
                    .map((id) => nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id)?.name)
                    .filter(Boolean),
                }
              }),
              setup: {
                totalSegments: productionWithSponsor.maxMatches,
                configuredSegments: configuredSegments.length,
                uniqueParticipants: setupParticipantCount,
                segments: configuredSegments.map((segment) => ({
                  segmentType: segment.segmentType,
                  participants: segment.participantIds
                    .map((participantId) => nextActiveEmployeesWithPerformance.find((employee) => employee.employeeId === participantId)?.name)
                    .filter(Boolean),
                })),
              },
            }
          }

          const nextActiveEmployeesWithStats = shouldRunEvent
            ? applyMatchStats(nextActiveEmployeesWithPerformance, configuredSegments, state.calendar.day, productionWithSponsor.name)
            : nextActiveEmployeesWithPerformance
          const nextTitlesBeforeHappiness = shouldRunEvent
            ? applyTitleMatchResults(state.roster.titles, configuredSegments, nextActiveEmployeesWithStats, state.calendar.day)
            : state.roster.titles

          const happinessOutcome = applyHappinessAndDeparture({
            employees: nextActiveEmployeesWithStats,
            prevTitles: state.roster.titles,
            nextTitles: nextTitlesBeforeHappiness,
            currentDay: state.calendar.day,
            existingHiringLocks: state.market.hiringLocks,
          })

          const nextActiveEmployeesFinal = happinessOutcome.employees
          const remainingEmployeeIds = new Set(nextActiveEmployeesFinal.map((employee) => employee.employeeId))
          const nextTitles = sanitizeTitlesForActiveEmployees(nextTitlesBeforeHappiness, remainingEmployeeIds)

          const existingTeams = Array.isArray(state.roster.teams) ? state.roster.teams : []
          const activeEmployeeIds = new Set(nextActiveEmployeesFinal.map((e) => e.employeeId))
          const prunedTeams = existingTeams.map((team) => ({
            ...team,
            memberIds: team.memberIds.filter((id) => activeEmployeeIds.has(id)),
          }))
          const nextTeams = shouldRunEvent
            ? detectAutoTeams({
                employees: nextActiveEmployeesFinal,
                prevTitles: state.roster.titles,
                nextTitles,
                currentDay: state.calendar.day,
                existingTeams: prunedTeams,
              })
            : prunedTeams

          // --- Income breakdown ---
          const subscriptionFee = Number(state.finances.subscriptionFee) || GAME_CONFIG.economy.webSubscription.defaultFee
          const minSubFee = GAME_CONFIG.economy.webSubscription.minFee
          const maxSubFee = GAME_CONFIG.economy.webSubscription.maxFee
          const normalizedSubFee = Math.max(0, Math.min(1, (subscriptionFee - minSubFee) / (maxSubFee - minSubFee)))
          const subscriberRate =
            GAME_CONFIG.economy.webSubscription.maxRate
            - normalizedSubFee * (GAME_CONFIG.economy.webSubscription.maxRate - GAME_CONFIG.economy.webSubscription.minRate)
          const websiteSubscriptionIncome = Math.round(
            state.stats.fans * subscriberRate * subscriptionFee / GAME_CONFIG.economy.webSubscription.billingDays,
          )

          // Merchandise: title holders always + popular event participants
          const titleHolderIdSet = new Set(
            (state.roster.titles || [])
              .filter((t) => t.isActive !== false)
              .flatMap((t) =>
                t.division === 'doubles'
                  ? (Array.isArray(t.holderEmployeeIds) ? t.holderEmployeeIds : [])
                  : (t.holderEmployeeId ? [t.holderEmployeeId] : []),
              ),
          )
          const titleHolderMerch = nextActiveEmployees.reduce((sum, emp) => {
            if (!titleHolderIdSet.has(emp.employeeId)) return sum
            return sum + Math.round((Number(emp.popularity) || 0) * GAME_CONFIG.economy.income.titleHolderMerchMultiplier)
          }, 0)
          let eventParticipantMerch = 0
          if (shouldRunEvent) {
            const participantIdSet = new Set(configuredSegments.flatMap((seg) => seg.participantIds))
            nextActiveEmployeesWithPerformance.forEach((emp) => {
              if (emp.role !== 'wrestler') return
              if (!participantIdSet.has(emp.employeeId)) return
              const pop = Number(emp.popularity) || 0
              if (pop >= GAME_CONFIG.economy.income.eventPopularMerchMinPopularity) {
                eventParticipantMerch += Math.round(pop * GAME_CONFIG.economy.income.eventPopularMerchMultiplier)
              }
            })
          }
          const merchandiseIncome = titleHolderMerch + eventParticipantMerch

          // 3rd party income: 3% daily chance
          const thirdPartyIncome = Math.random() < GAME_CONFIG.economy.income.thirdPartyChance
            ? Math.round(
                GAME_CONFIG.economy.income.thirdPartyMin
                + Math.random() * (GAME_CONFIG.economy.income.thirdPartyMax - GAME_CONFIG.economy.income.thirdPartyMin),
            )
            : 0

          // --- Expense breakdown ---
          const eventCostExpense = shouldRunEvent
            ? (GAME_CONFIG.eventCost[productionWithSponsor.type] || 0)
            : 0
          const operatingCost = Math.round(
            GAME_CONFIG.economy.expense.operatingBase
            + state.stats.prestige * GAME_CONFIG.economy.expense.operatingPrestigeMultiplier,
          )
          const otherCost = Math.round(
            GAME_CONFIG.economy.expense.otherMin
            + Math.random() * (GAME_CONFIG.economy.expense.otherMax - GAME_CONFIG.economy.expense.otherMin),
          )

          const sponsorIncomeDailyValue = normalizedSponsors
            .filter((sponsor) => !sponsor.eventScoped)
            .reduce((sum, sponsor) => sum + sponsor.dailyPayout, 0)

          const income = sponsorIncomeDailyValue + eventIncome + merchandiseIncome + websiteSubscriptionIncome + thirdPartyIncome
          const expenses = perMatchSalaryExpenses + titleHolderMatchBonus + staffMatchExpenses + eventCostExpense + operatingCost + otherCost
          const delta = income - expenses
          const nextCash = state.finances.cash + delta
          const nextFans = Math.max(0, state.stats.fans + fanDelta)
          const nextPrestige = Math.max(0, state.stats.prestige + prestigeDelta)
          const nextMorale = Math.max(0, Math.min(100, state.stats.morale + moraleDelta))
          const nextCustomEvents = state.events.customEvents
          const nextSponsors = normalizedSponsors.filter((sponsor) => {
            if (sponsor.eventScoped) {
              return !(shouldRunEvent && isSponsorableEventType)
            }

            return sponsor.remainingDays > 1
          }).map((sponsor) => {
            if (sponsor.eventScoped) {
              return sponsor
            }

            return {
              ...sponsor,
              remainingDays: sponsor.remainingDays - 1,
            }
          })
          const nextHistoryEntry = {
            day: nextCalendar.day,
            week: nextCalendar.week,
            cash: nextCash,
            delta,
            fans: nextFans,
            prestige: nextPrestige,
            employees: nextActiveEmployees.length,
            eventOutcomeType: lastOutcome?.type || null,
            totalIncome: income,
            totalExpenses: expenses,
            incomeBreakdown: {
              sponsor: sponsorIncomeDailyValue,
              event: eventIncome,
              merchandise: merchandiseIncome,
              thirdParty: thirdPartyIncome,
              webSubscription: websiteSubscriptionIncome,
            },
            expenseBreakdown: {
              wrestlerPayroll: perMatchSalaryExpenses + titleHolderMatchBonus,
              staffCost: staffMatchExpenses,
              eventCost: eventCostExpense,
              operatingCost,
              otherCost,
            },
          }
          const timeline = [...state.history.timeline, nextHistoryEntry].slice(-45)

          // Patch lastOutcome with full day breakdown for event result summary
          if (lastOutcome) {
            lastOutcome = {
              ...lastOutcome,
              incomeBreakdown: {
                eventGate: eventIncome,
                merchandise: merchandiseIncome,
                sponsor: sponsorIncomeDailyValue,
                thirdParty: thirdPartyIncome,
                webSubscription: websiteSubscriptionIncome,
              },
              expenseBreakdown: {
                eventCost: eventCostExpense,
                wrestlerPayroll: perMatchSalaryExpenses + titleHolderMatchBonus,
                staffCost: staffMatchExpenses,
                operatingCost,
                otherCost,
              },
              totalDayIncome: income,
              totalDayExpenses: expenses,
            }
          }

          // Build ledger: separate entries for notable transactions + daily close
          let nextLedger = state.finances.ledger

          if (perMatchSalaryExpenses > 0 || titleHolderMatchBonus > 0) {
            const total = perMatchSalaryExpenses + titleHolderMatchBonus
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-match-payroll`,
              day: nextCalendar.day,
              type: 'expense',
              category: 'matchPayroll',
              amount: total,
              note: `Wrestler match fees (${perMatchPayoutCount} appearances)${titleHolderMatchBonus > 0 ? ` + title holder bonuses ($${titleHolderMatchBonus.toLocaleString()})` : ''}`,
            })
          }

          if (staffMatchExpenses > 0) {
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-staff-payroll`,
              day: nextCalendar.day,
              type: 'expense',
              category: 'staffPayroll',
              amount: staffMatchExpenses,
              note: `Staff match fees (${staffMatchPayoutCount} staff)`,
            })
          }

          if (eventCostExpense > 0) {
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-event-cost`,
              day: nextCalendar.day,
              type: 'expense',
              category: 'eventCost',
              amount: eventCostExpense,
              note: `Event production cost (${productionWithSponsor?.type || 'event'})`,
            })
          }

          if (thirdPartyIncome > 0) {
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-third-party`,
              day: nextCalendar.day,
              type: 'income',
              category: 'thirdPartyIncome',
              amount: thirdPartyIncome,
              note: 'Third-party rights & participation fee',
            })
          }

          nextLedger = appendLedger(nextLedger, {
            id: `tx-${Date.now()}-daily-close`,
            day: nextCalendar.day,
            type: delta >= 0 ? 'income' : 'expense',
            category: 'dailyClose',
            amount: Math.abs(delta),
            note: `Daily close | Income $${income.toLocaleString()} (event $${eventIncome.toLocaleString()}, merch $${merchandiseIncome.toLocaleString()}, web $${websiteSubscriptionIncome.toLocaleString()}) | Expenses $${expenses.toLocaleString()} (ops $${operatingCost.toLocaleString()}, other $${otherCost.toLocaleString()})`,
          })

          return {
            calendar: nextCalendar,
            events: {
              ...state.events,
              customEvents: nextCustomEvents,
              bookedEvent: buildBookedEventProjection(nextCalendar.day, nextCustomEvents, state.calendar.startDateIso),
              lastOutcome,
              eventLog: lastOutcome
                ? [
                    ...state.events.eventLog,
                    {
                      ...lastOutcome,
                      day: state.calendar.day,
                      week: state.calendar.week,
                      id: `event-${state.calendar.day}-${Date.now()}`,
                    },
                  ].slice(-100)
                : state.events.eventLog,
              eventPreparation: (shouldRunEvent && prep?.eventId === prepEventId) ? null : state.events.eventPreparation,
            },
            history: {
              timeline,
            },
            finances: {
              ...state.finances,
              cash: nextCash,
              lastIncome: income,
              lastExpenses: expenses,
              lastDelta: delta,
              ledger: nextLedger,
            },
            stats: {
              ...state.stats,
              fans: nextFans,
              prestige: nextPrestige,
              morale: nextMorale,
            },
            roster: {
              ...state.roster,
              employees: nextActiveEmployeesFinal,
              sponsors: nextSponsors,
              titles: nextTitles,
              teams: nextTeams,
            },
            market: {
              ...state.market,
              employeeCandidates: syncEmployeeCandidates({
                employees: nextActiveEmployeesFinal,
                currentCandidates: state.market.employeeCandidates,
                currentDay: nextCalendar.day,
                hiringLocks: happinessOutcome.hiringLocks,
              }),
              hiringLocks: happinessOutcome.hiringLocks,
            },
          }
        })
      },
    }),
    {
      name: 'wrestling-tycoon-save-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const typedPersistedState = persistedState || {}
        const restoredDay = Number(typedPersistedState?.calendar?.day) || currentState.calendar.day
        const restoredStartDateIso = typedPersistedState?.calendar?.startDateIso || currentState.calendar.startDateIso
        const persistedTitles = typedPersistedState?.roster?.titles
        const hasPersistedTitles = Array.isArray(persistedTitles) && persistedTitles.length > 0
        const persistedTitlesById = hasPersistedTitles
          ? new Map(persistedTitles.map((title) => [title.titleId, title]))
          : new Map()
        const mergedTitles = [
          ...currentState.roster.titles.map((defaultTitle) => {
            const persistedTitle = persistedTitlesById.get(defaultTitle.titleId)
            return persistedTitle ? normalizeTitleRecord({ ...defaultTitle, ...persistedTitle }) : normalizeTitleRecord(defaultTitle)
          }),
          ...Array.from(persistedTitlesById.values()).filter(
            (persistedTitle) => !currentState.roster.titles.some((defaultTitle) => defaultTitle.titleId === persistedTitle.titleId),
          ).map((title) => normalizeTitleRecord(title)),
        ]
        const normalizedPersistedSponsors = normalizeSponsors(typedPersistedState?.roster?.sponsors)
        const persistedCustomEvents = Array.isArray(typedPersistedState?.events?.customEvents)
          ? typedPersistedState.events.customEvents
          : []
        const sanitizedPersistedCustomEvents = persistedCustomEvents
          .map((event) => {
            if (!EVENT_TYPE_CONFIG[event?.type] || event.type === 'regularWeekly') {
              return null
            }

            const fallbackScheduledWeek = Number(event?.scheduledWeek) || 1
            const scheduledDay = Number.isInteger(Number(event?.scheduledDay))
              ? Number(event.scheduledDay)
              : getScheduledDayFromSpecificDate({
                  specificDate: event?.specificDate,
                  startDateIso: restoredStartDateIso,
                  fallbackScheduledWeek,
                })
            const scheduledWeek = getWeekFromDay(scheduledDay)

            const restoredWeek = getWeekFromDay(Number(typedPersistedState?.calendar?.day) || currentState.calendar.day)
            const weekOffset = scheduledWeek - restoredWeek
            const fallbackDate = new Date()
            fallbackDate.setDate(fallbackDate.getDate() + weekOffset * 7)

            const persistedSpecificDate = parseIsoDateLocal(event?.specificDate)
            const specificDate = persistedSpecificDate && !Number.isNaN(persistedSpecificDate.getTime())
              ? event.specificDate
              : toIsoDateLocal(fallbackDate)

            return {
              eventId: event.eventId || `custom-event-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              type: event.type,
              name: (event.name || EVENT_TYPE_CONFIG[event.type].label).trim(),
              imageUrl: typeof event.imageUrl === 'string' ? event.imageUrl : '',
              maxMatches: clampMatchesByType(event.type, Number(event.maxMatches)),
              scheduledWeek,
              scheduledDay,
              month: getMonthFromWeek(scheduledWeek),
              year: getYearFromWeek(scheduledWeek),
              specificDate,
              isRecurringAnnually: Boolean(event.isRecurringAnnually),
              isSystem: event.type === 'regularWeekly',
              createdAt: Number(event.createdAt) || Date.now(),
            }
          })
          .filter(Boolean)
        const preloadedSystemEvents = createPreloadedCustomEvents(restoredStartDateIso)
        const preloadedById = new Map(preloadedSystemEvents.map((event) => [event.eventId, event]))
        const persistedEventIds = new Set(sanitizedPersistedCustomEvents.map((event) => event.eventId))
        const normalizedPersistedCustomEvents = sanitizedPersistedCustomEvents.map((event) => {
          const preloaded = preloadedById.get(event.eventId)
          if (!preloaded) {
            return event
          }

          return {
            ...event,
            imageUrl: event.imageUrl || preloaded.imageUrl || '',
          }
        })
        const mergedCustomEvents = sortCustomEventsBySchedule([
          ...normalizedPersistedCustomEvents,
          ...preloadedSystemEvents.filter((event) => !persistedEventIds.has(event.eventId)),
        ])

        const restoredCalendar = {
          ...currentState.calendar,
          ...typedPersistedState?.calendar,
          startDateIso: restoredStartDateIso,
          isEventDay: isRegularWeeklyEventDay(restoredStartDateIso, restoredDay),
        }
        const normalizedPersistedEmployees = filterActiveEmployees(
          normalizePersistedEmployees(typedPersistedState?.roster?.employees || [], restoredDay),
          restoredDay,
        )
        const mergedFinances = {
          ...currentState.finances,
          ...typedPersistedState?.finances,
          ticketFees: {
            ...currentState.finances.ticketFees,
            ...(typedPersistedState?.finances?.ticketFees || {}),
          },
        }
        const normalizedHiringLocks = pruneExpiredHiringLocks(
          typedPersistedState?.market?.hiringLocks || {},
          restoredDay,
        )

        return {
          ...currentState,
          ...typedPersistedState,
          calendar: restoredCalendar,
          roster: {
            ...currentState.roster,
            ...typedPersistedState?.roster,
            employees: normalizedPersistedEmployees,
            sponsors: normalizedPersistedSponsors,
            titles: hasPersistedTitles ? mergedTitles : currentState.roster.titles,
            teams: Array.isArray(typedPersistedState?.roster?.teams)
              ? typedPersistedState.roster.teams
              : [],
          },
          events: {
            ...currentState.events,
            ...typedPersistedState?.events,
            regularWeeklyEvent: currentState.events.regularWeeklyEvent,
            customEvents: mergedCustomEvents,
            bookedEvent: buildBookedEventProjection(restoredDay, mergedCustomEvents, restoredStartDateIso),
          },
          ai: {
            ...currentState.ai,
            ...(typedPersistedState?.ai || {}),
            showEnableModal: Boolean(typedPersistedState?.ai?.showEnableModal),
            error: typedPersistedState?.ai?.status === 'error' ? String(typedPersistedState?.ai?.error || '') : '',
          },
          finances: mergedFinances,
          market: {
            ...currentState.market,
            ...typedPersistedState?.market,
            employeeCandidates: syncEmployeeCandidates({
              employees: normalizedPersistedEmployees,
              currentCandidates: typedPersistedState?.market?.employeeCandidates || [],
              currentDay: restoredDay,
              hiringLocks: normalizedHiringLocks,
            }),
            hiringLocks: normalizedHiringLocks,
          },
        }
      },
      partialize: (state) => ({
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
        ai: state.ai,
      }),
    },
  ),
)
