import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { GAME_CONFIG, GAME_DAYS_PER_MONTH, MANAGEMENT_MODULES } from '../config/gameConfig'
import { BOARD_CHAIR, BOARD_MEMBERS, BOARD_VICE_CHAIR } from '../data/board'
import {
  applyCareerArcUnlocks,
  DEFAULT_CAREER_ARC_UNLOCKS,
  getCareerArcUnlockItem,
  getNextCareerArcUnlocks,
  normalizeCareerArcUnlocks,
} from '../data/careerArcUnlocks'
import { createEmployeeCandidates } from '../data/employeeMarket'
import { createEventTemplates } from '../data/eventTemplates'
import { createSponsorOffers, SPONSOR_TYPE_CONFIG } from '../data/sponsorOffers'
import { clampHeelFaceMeter, DEFAULT_HEEL_FACE_METER_VALUE, computeHeelFaceShift, applyHeelFaceNeutralDecay } from '../utils/heelFaceMeter'
import { validateModDataPackage } from '../utils/modDataPackage'
import { buildBoardMeetingAgendaPool } from '../utils/boardMeetingAgendas'
import {
  applyBoardRelationChange,
  assignRandomBoardAgendaPresenters,
  conductWeightedBoardVote,
  createInitialBoardState,
  getRepeatedRejectionPenalty,
  normalizeBoardMeetingState,
  recordBoardFinancialPeriod,
  resolveBoardElection,
  resolveBoardMandates,
  rollBoardDismissal,
  selectBoardAgendas,
} from '../utils/boardMeetingSystem'
import { getBoardMeetingSchedule } from '../utils/boardMeetings'
import { getBoardEventAttendance } from '../utils/boardEventAttendance'
import {
  FACTION_STORY_BEATS,
  normalizeBackstageChemistry,
  normalizeFactions,
  normalizeFactionRivalries,
  resolveFactionStorylines,
  updateBackstageChemistry,
} from '../utils/backstageDynamics'
import {
  getGameDayDifference,
  normalizeGameDate,
  parseGameDate,
  resolveGameCalendarStartDate,
  toGameDateIso,
} from '../utils/gameCalendar'
import { generatePerson } from 'faker-user'
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

const parseStartDateIso = (startDateIso) => {
  const parsed = parseGameDate(normalizeGameDate(startDateIso))
  if (!parsed) {
    throw new Error(`Invalid game start date "${startDateIso}"`)
  }

  return parsed
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
    startDateIso,
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
  return Math.max(MIN_CONTRACT_LENGTH_MONTHS, Number(contractLengthMonths) || DEFAULT_CONTRACT_LENGTH_MONTHS) * GAME_DAYS_PER_MONTH
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

const getMonthlySalaryPaymentsDue = (employees = [], day) => employees.flatMap((employee) => {
  const startDay = Number(employee?.contract?.startDay)
  const endDay = Number(employee?.contract?.endDay)
  const salary = Number(employee?.contract?.monthlySalary ?? employee?.salary)
  const daysSinceStart = day - startDay

  if (
    !Number.isInteger(startDay)
    || !Number.isInteger(day)
    || !Number.isFinite(salary)
    || salary <= 0
    || daysSinceStart <= 0
    || daysSinceStart % GAME_DAYS_PER_MONTH !== 0
    || (Number.isInteger(endDay) && day >= endDay)
  ) {
    return []
  }

  return [{ employee, amount: Math.round(salary) }]
})

const normalizeEmployeeId = (employee, index) => {
  if (employee?.employeeId != null) {
    const employeeId = String(employee.employeeId).trim()
    if (employeeId) {
      return employeeId
    }
  }

  if (employee?.id != null) {
    const id = String(employee.id).trim()
    if (id) {
      return id
    }
  }

  if (employee?.personId != null) {
    const personId = String(employee.personId).trim()
    if (personId) {
      return `legacy-${personId}`
    }
  }

  const rolePart = typeof employee?.role === 'string' && employee.role.trim() ? employee.role : 'employee'
  const namePart = typeof employee?.name === 'string' && employee.name.trim()
    ? employee.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : 'unknown'
  const genderPart = typeof employee?.gender === 'string' && employee.gender.trim()
    ? employee.gender.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    : 'u'
  const dobPart = typeof employee?.dob === 'string' && employee.dob.trim()
    ? employee.dob.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    : 'na'

  return `legacy-${rolePart}-${namePart || 'unknown'}-${genderPart}-${dobPart}-${index}`
}

const normalizePersistedEmployees = (employees = [], day = 1) => {
  return (employees || []).map((employee, index) => {
    const employeeId = normalizeEmployeeId(employee, index)
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
      employeeId,
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
      activeMoraleDemand: employee?.activeMoraleDemand && typeof employee.activeMoraleDemand === 'object'
        ? employee.activeMoraleDemand
        : null,
      promisedTitleShotByDay: Number.isInteger(employee?.promisedTitleShotByDay)
        ? employee.promisedTitleShotByDay
        : null,
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
  activeMoraleDemand: null,
  promisedTitleShotByDay: null,
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
    factions: [],
    backstageChemistry: {},
  }

  return {
    gameStatus: {
      hasStarted: false,
      version: GAME_CONFIG.version,
      isGameOver: false,
      gameOverReason: null,
    },
    profile: {
      playerName: '',
      companyName: '',
      ownerName: '',
      generalManagerName: '',
      homeCountry: '',
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
      rivalries: [],
      factionRivalries: [],
      competitorHeadlines: [],
      eventPreparation: null,
    },
    history: {
      timeline: [],
    },
    progression: {
      currentArc: null,
      history: [],
      unlocks: normalizeCareerArcUnlocks(),
    },
    boardMeeting: createInitialBoardState({
      boardPresidentName: BOARD_CHAIR.person_name,
      boardVicePresidentName: BOARD_VICE_CHAIR.person_name,
    }),
    onboardingChallenge: null,
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
      lastInterviewImpact: null,
    },
  }
}

const buildGeneratedManagementProfile = ({ preferredCountry }) => {
  const preferredCountryList = preferredCountry ? [preferredCountry] : undefined

  try {
    const representative = generatePerson({
      country: preferredCountryList,
      minAge: 38,
      maxAge: 68,
    })

    return {
      homeCountry: representative?.country || 'UnitedStates',
    }
  } catch {
    return {
      homeCountry: 'UnitedStates',
    }
  }
}

const getBoardMeetingFinanceReport = (state) => {
  const boardState = normalizeBoardMeetingState(state.boardMeeting)
  const startDay = Number.isInteger(boardState.lastMeetingDay)
    ? boardState.lastMeetingDay
    : 1
  const periodEntries = (state.history.timeline || []).filter((entry) => (
    Number(entry?.day) > startDay && Number(entry?.day) <= state.calendar.day
  ))
  const operatingNet = periodEntries.reduce((sum, entry) => sum + (Number(entry?.delta) || 0), 0)

  return {
    startDay,
    endDay: state.calendar.day,
    completedDays: periodEntries.length,
    totalIncome: periodEntries.reduce((sum, entry) => sum + (Number(entry?.totalIncome) || 0), 0),
    totalExpenses: periodEntries.reduce((sum, entry) => sum + (Number(entry?.totalExpenses) || 0), 0),
    operatingNet,
    cashOnHand: Number(state.finances.cash) || 0,
  }
}

const isBoardMeetingScheduledForDay = ({ startDateIso, customEvents, day }) => (
  getBoardMeetingSchedule({
    startDateIso,
    customEvents,
    throughDate: getGameDateFromDay(startDateIso, day),
  }).some((meeting) => meeting.scheduledDay === day)
)

const getNextBoardMeetingDay = ({ startDateIso, customEvents, currentDay }) => {
  const futureDate = getGameDateFromDay(startDateIso, currentDay + 180)
  const nextMeeting = getBoardMeetingSchedule({
    startDateIso,
    customEvents,
    throughDate: futureDate,
  }).find((meeting) => meeting.scheduledDay > currentDay)

  return nextMeeting?.scheduledDay || currentDay + GAME_DAYS_PER_MONTH
}

const getBoardMeetingAgendaPool = (state, financialReport, isJanuary) => {
  const wrestlers = (state.roster.employees || [])
    .filter((employee) => employee.role === 'wrestler')
    .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))
  const activeTitle = (state.roster.titles || []).find(
    (title) => title.isActive !== false && title.division !== 'doubles',
  )
  const currentHolderIds = activeTitle
    ? normalizeTitleHolderIds(activeTitle)
    : []
  const replacementWrestler = wrestlers.find((wrestler) => !currentHolderIds.includes(wrestler.employeeId))
  const upcomingEvent = state.events.bookedEvent || null
  const activeSponsors = normalizeSponsors(state.roster.sponsors)
  const sponsorToReview = [...activeSponsors]
    .sort((a, b) => Number(a.trust || 0) - Number(b.trust || 0))[0] || null
  const sponsorOffer = (state.market.sponsorOffers || []).find((offer) => {
    const sponsorType = offer.sponsorType || DEFAULT_SPONSOR_TYPE
    const typeConfig = SPONSOR_TYPE_CONFIG[sponsorType]
    if (!typeConfig) {
      return false
    }

    const activeCount = activeSponsors.filter((sponsor) => sponsor.sponsorType === sponsorType).length
    if (activeCount >= typeConfig.maxActive) {
      return false
    }
    if (typeConfig.eventScoped && !SPONSORABLE_EVENT_TYPES.includes(upcomingEvent?.type)) {
      return false
    }
    if (typeConfig.eventScoped && !SPONSORABLE_EVENT_TYPES.includes(upcomingEvent?.type)) {
      return false
    }

    return !getSponsorSignRestrictionReason({
      offer,
      lastOutcome: state.events.lastOutcome,
    })
  })

  return buildBoardMeetingAgendaPool({
    financialIsNegative: financialReport.operatingNet < 0,
    isJanuary,
    financialReport,
    boardMembers: BOARD_MEMBERS,
    sponsorOffer: sponsorOffer || null,
    activeSponsors,
    sponsorToReview,
    upcomingEvent,
    lastOutcome: state.events.lastOutcome,
    titleChange: activeTitle && replacementWrestler
      ? {
          titleId: activeTitle.titleId,
          titleName: activeTitle.name,
          currentHolderIds,
          targetEmployeeId: replacementWrestler.employeeId,
          targetName: replacementWrestler.name,
        }
      : null,
    wrestlerPush: wrestlers[0]
      ? {
          employeeId: wrestlers[0].employeeId,
          name: wrestlers[0].name,
        }
      : null,
    pendingMandates: state.boardMeeting.pendingMandates,
  })
}

const COMPETITOR_COMPANIES = [
  { id: 'comp-1', name: 'Titan Ring Federation', aggression: 1.1 },
  { id: 'comp-2', name: 'Prime Grapple Alliance', aggression: 0.95 },
  { id: 'comp-3', name: 'Global Slam Network', aggression: 1.05 },
]

const runCompetitorPressure = ({ overallRating, rivalryHeatScore, eventType, day }) => {
  const competitionConfig = GAME_CONFIG.competition
  const rival = COMPETITOR_COMPANIES[Math.floor(Math.random() * COMPETITOR_COMPANIES.length)]
  const rating = Number.isFinite(Number(overallRating)) ? Number(overallRating) : 6
  const volatility = eventType === 'megaLive' || eventType === 'ppv'
    ? competitionConfig.pressureEventVolatilityMajor
    : competitionConfig.pressureEventVolatilityMinor
  const rivalryEdge = Math.min(
    competitionConfig.pressureMaxRivalryEdge,
    1 + (Math.max(0, rivalryHeatScore) / competitionConfig.pressureRivalryScale),
  )
  const performanceEdge = (rating - competitionConfig.pressureBaseRating) * competitionConfig.pressureSwingScale
  const randomDrift = competitionConfig.pressureRandomMin
    + (Math.random() * (competitionConfig.pressureRandomMax - competitionConfig.pressureRandomMin))
  const swing = Math.round((performanceEdge + randomDrift) * volatility * rivalryEdge * rival.aggression)

  const fanImpact = Math.round(swing)
  const prestigeImpact = Math.max(
    competitionConfig.prestigeMin,
    Math.min(competitionConfig.prestigeMax, Math.round(fanImpact / competitionConfig.prestigeDivisor)),
  )

  const headline = fanImpact >= 0
    ? `${rival.name} failed to outdraw your show this week.`
    : `${rival.name} stole spotlight momentum with a hot competing card.`

  return {
    day,
    rivalName: rival.name,
    fanImpact,
    prestigeImpact,
    headline,
  }
}

const runCompetitorWorldSimulation = ({
  day,
  shouldRunEvent,
  lastOutcome,
  employees = [],
  marketCandidates = [],
}) => {
  const rival = COMPETITOR_COMPANIES[Math.floor(Math.random() * COMPETITOR_COMPANIES.length)]
  let fanImpact = 0
  let prestigeImpact = 0
  let poachedEmployeeId = null
  let signedCandidateId = null
  const newsItems = []

  const wrestlerCandidates = (marketCandidates || []).filter((candidate) => candidate?.role === 'wrestler')
  if (wrestlerCandidates.length > 0 && Math.random() < 0.35) {
    const signedCandidate = wrestlerCandidates[Math.floor(Math.random() * wrestlerCandidates.length)]
    signedCandidateId = signedCandidate.candidateId
    const prospectImpact = Math.max(6, Math.round((Number(signedCandidate.popularity || 35) / 100) * 24))
    fanImpact -= prospectImpact
    newsItems.push({
      day,
      rivalName: rival.name,
      fanImpact: -prospectImpact,
      prestigeImpact: 0,
      headline: `${rival.name} signed prospect ${signedCandidate.name} ahead of your talent team.`,
    })
  }

  if (shouldRunEvent && lastOutcome) {
    const rating = Number(lastOutcome.overallRating || 6)
    const baseCounterSwing = rating >= 8.3 ? -8 : rating >= 7.2 ? -18 : -32
    const randomness = Math.round((Math.random() * 14) - 7)
    const counterSwing = Math.round((baseCounterSwing + randomness) * rival.aggression)
    fanImpact += counterSwing
    prestigeImpact += Math.round(counterSwing / 60)
    newsItems.push({
      day,
      rivalName: rival.name,
      fanImpact: counterSwing,
      prestigeImpact: Math.round(counterSwing / 60),
      headline: counterSwing >= 0
        ? `${rival.name} failed to dent your night despite heavy counter-programming.`
        : `${rival.name} counter-programmed with a strong card and stole momentum.`,
    })
  }

  const vulnerableWrestlers = (employees || []).filter(
    (employee) => employee?.role === 'wrestler' && Number(employee?.happiness || 0) <= 16,
  )
  if (vulnerableWrestlers.length > 0 && Math.random() < 0.28) {
    const target = vulnerableWrestlers[Math.floor(Math.random() * vulnerableWrestlers.length)]
    poachedEmployeeId = target.employeeId
    const poachImpact = Math.max(14, Math.round((Number(target.popularity || 40) / 100) * 42))
    fanImpact -= poachImpact
    prestigeImpact -= 1
    newsItems.push({
      day,
      rivalName: rival.name,
      fanImpact: -poachImpact,
      prestigeImpact: -1,
      headline: `${rival.name} poached unhappy star ${target.name} from your roster.`,
    })
  }

  return {
    fanImpact: Math.max(-180, Math.min(140, Math.round(fanImpact))),
    prestigeImpact: Math.max(-3, Math.min(2, Math.round(prestigeImpact))),
    poachedEmployeeId,
    signedCandidateId,
    newsItems,
  }
}

const CAREER_ARC_LENGTH_DAYS = 56

const CAREER_ARC_TEMPLATES = [
  {
    key: 'audienceSurge',
    goals: { fanGain: 1800, prestigeGain: 6, cashGain: 120000 },
    reward: { cash: 60000, prestige: 2, sponsorTrust: 3 },
  },
  {
    key: 'prestigeChase',
    goals: { fanGain: 1100, prestigeGain: 9, cashGain: 140000 },
    reward: { cash: 50000, prestige: 3, sponsorTrust: 2 },
  },
  {
    key: 'profitStability',
    goals: { fanGain: 950, prestigeGain: 5, cashGain: 220000 },
    reward: { cash: 90000, prestige: 1, sponsorTrust: 4 },
  },
]

const pickCareerArcTemplate = () => {
  return CAREER_ARC_TEMPLATES[Math.floor(Math.random() * CAREER_ARC_TEMPLATES.length)]
}

const buildCareerArc = ({ startDay, stats, finances, unlocks = DEFAULT_CAREER_ARC_UNLOCKS }) => {
  const template = pickCareerArcTemplate()

  return {
    arcId: `career-arc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    templateKey: template.key,
    status: 'active',
    startDay,
    endDay: startDay + CAREER_ARC_LENGTH_DAYS - 1,
    startSnapshot: {
      fans: Number(stats?.fans || 0),
      prestige: Number(stats?.prestige || 0),
      cash: Number(finances?.cash || 0),
    },
    goals: template.goals,
    reward: {
      ...template.reward,
      unlockables: getNextCareerArcUnlocks(unlocks),
    },
    progress: {
      fanGain: 0,
      prestigeGain: 0,
      cashGain: 0,
    },
  }
}

const ensureProgressionShape = (progression, { legacyVenueId = null } = {}) => {
  const unlocks = normalizeCareerArcUnlocks(progression?.unlocks, { legacyVenueId })
  const currentArc = progression?.currentArc || null
  const currentReward = currentArc?.reward || {}

  return {
    currentArc: currentArc
      ? {
          ...currentArc,
          reward: {
            cash: 0,
            prestige: 0,
            sponsorTrust: 0,
            ...currentReward,
            unlockables: Array.isArray(currentReward.unlockables)
              ? currentReward.unlockables
              : getNextCareerArcUnlocks(unlocks),
          },
        }
      : null,
    history: Array.isArray(progression?.history) ? progression.history : [],
    unlocks,
  }
}

const normalizeEventPreparation = (eventPreparation, unlocks) => {
  if (!eventPreparation || typeof eventPreparation !== 'object') {
    return null
  }

  const normalizedUnlocks = normalizeCareerArcUnlocks(unlocks)
  const isUnlocked = (category, id) => (
    typeof id === 'string' && normalizedUnlocks[category].includes(id)
  )

  return {
    eventId: typeof eventPreparation.eventId === 'string' ? eventPreparation.eventId : null,
    venueId: isUnlocked('venues', eventPreparation.venueId) ? eventPreparation.venueId : null,
    promotedWrestlerIds: Array.isArray(eventPreparation.promotedWrestlerIds)
      ? eventPreparation.promotedWrestlerIds.filter((id) => typeof id === 'string')
      : [],
    promoStyleId: isUnlocked('promoStyles', eventPreparation.promoStyleId)
      ? eventPreparation.promoStyleId
      : DEFAULT_CAREER_ARC_UNLOCKS.promoStyles[0],
    presentationId: isUnlocked('presentations', eventPreparation.presentationId)
      ? eventPreparation.presentationId
      : DEFAULT_CAREER_ARC_UNLOCKS.presentations[0],
  }
}

const computeCareerArcProgress = (arc, nextStats, nextCash) => {
  const startFans = Number(arc?.startSnapshot?.fans || 0)
  const startPrestige = Number(arc?.startSnapshot?.prestige || 0)
  const startCash = Number(arc?.startSnapshot?.cash || 0)

  return {
    fanGain: Math.round(Number(nextStats?.fans || 0) - startFans),
    prestigeGain: Math.round(Number(nextStats?.prestige || 0) - startPrestige),
    cashGain: Math.round(Number(nextCash || 0) - startCash),
  }
}

const areCareerArcGoalsMet = (arc, progress) => {
  if (!arc?.goals) {
    return false
  }

  return (
    Number(progress?.fanGain || 0) >= Number(arc.goals.fanGain || 0)
    && Number(progress?.prestigeGain || 0) >= Number(arc.goals.prestigeGain || 0)
    && Number(progress?.cashGain || 0) >= Number(arc.goals.cashGain || 0)
  )
}

const ONBOARDING_CHALLENGE_DURATION_DAYS = 21

const buildOnboardingChallenge = ({ startDay, startFans, startCash }) => {
  return {
    challengeId: `onboarding-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    financeObjectiveVersion: 2,
    status: 'active',
    active: true,
    startDay,
    deadlineDay: startDay + ONBOARDING_CHALLENGE_DURATION_DAYS - 1,
    baselineFans: Number(startFans || 0),
    baselineCash: Number(startCash || 0),
    objectives: {
      rosterBuild: {
        targetWrestlers: 2,
        targetStaff: 1,
        currentWrestlers: 0,
        currentStaff: 0,
        completed: false,
      },
      firstShow: {
        targetSuccessfulEvents: 1,
        currentSuccessfulEvents: 0,
        completed: false,
      },
      stabilize: {
        targetFanGain: 350,
        targetOperatingCashFlow: 0,
        currentFanGain: 0,
        currentOperatingCashFlow: 0,
        completed: false,
      },
    },
    reward: {
      cash: 80000,
      prestige: 4,
    },
    penalty: {
      fans: -250,
      prestige: -3,
    },
  }
}

const progressOnboardingChallenge = ({
  challenge,
  day,
  employees,
  fans,
  successfulEventIncrement = 0,
  operatingCashFlowDelta = 0,
}) => {
  if (!challenge || challenge.status !== 'active') {
    return { challenge, resolution: null }
  }

  const rosterBuild = challenge.objectives?.rosterBuild || {}
  const firstShow = challenge.objectives?.firstShow || {}
  const stabilize = challenge.objectives?.stabilize || {}
  const wrestlerCount = (employees || []).filter((employee) => employee?.role === 'wrestler').length
  const staffCount = (employees || []).filter((employee) => employee?.role === 'staff').length
  const fanGain = Math.round(Number(fans || 0) - Number(challenge.baselineFans || 0))
  const operatingCashFlow = Math.round(
    Number(stabilize.currentOperatingCashFlow || 0) + Number(operatingCashFlowDelta || 0),
  )
  const nextSuccessfulEvents = Math.max(0, Number(firstShow.currentSuccessfulEvents || 0) + Number(successfulEventIncrement || 0))

  const nextChallenge = {
    ...challenge,
    objectives: {
      ...challenge.objectives,
      rosterBuild: {
        ...rosterBuild,
        currentWrestlers: wrestlerCount,
        currentStaff: staffCount,
        completed: wrestlerCount >= Number(rosterBuild.targetWrestlers || 0)
          && staffCount >= Number(rosterBuild.targetStaff || 0),
      },
      firstShow: {
        ...firstShow,
        currentSuccessfulEvents: nextSuccessfulEvents,
        completed: nextSuccessfulEvents >= Number(firstShow.targetSuccessfulEvents || 1),
      },
      stabilize: {
        ...stabilize,
        currentFanGain: fanGain,
        currentOperatingCashFlow: operatingCashFlow,
        completed: fanGain >= Number(stabilize.targetFanGain || 0)
          && operatingCashFlow >= Number(stabilize.targetOperatingCashFlow || 0),
      },
    },
  }

  const allObjectivesCompleted = Object.values(nextChallenge.objectives || {}).every((objective) => objective?.completed)
  if (allObjectivesCompleted) {
    return {
      challenge: {
        ...nextChallenge,
        status: 'completed',
        active: false,
        completedDay: day,
      },
      resolution: 'completed',
    }
  }

  if (day > Number(challenge.deadlineDay || day)) {
    return {
      challenge: {
        ...nextChallenge,
        status: 'failed',
        active: false,
        failedDay: day,
      },
      resolution: 'failed',
    }
  }

  return { challenge: nextChallenge, resolution: null }
}

const ensureOnboardingChallengeShape = (challenge, timeline = [], currentDay = 1) => {
  if (!challenge || typeof challenge !== 'object') {
    return null
  }

  const persistedStabilize = challenge.objectives?.stabilize || {}
  const {
    targetCashGain: legacyTargetCashGain,
    currentCashGain: legacyCurrentCashGain,
    ...stabilizeFields
  } = persistedStabilize
  const financeObjectiveVersion = Number(challenge.financeObjectiveVersion)
  const isLegacyFinanceObjective = !Number.isFinite(financeObjectiveVersion) || financeObjectiveVersion < 2
  const defaults = buildOnboardingChallenge({
    startDay: Number(challenge.startDay || 1),
    startFans: Number(challenge.baselineFans || GAME_CONFIG.startingFans),
    startCash: Number(challenge.baselineCash || GAME_CONFIG.startingCash),
  })
  const migratedOperatingCashFlow = (timeline || []).reduce((sum, entry) => {
    const entryDay = Number(entry?.day)
    if (entryDay <= Number(challenge.startDay || 1) || entryDay > Number(currentDay || 1)) {
      return sum
    }

    return sum + (Number(entry?.delta) || 0)
  }, 0)
  const persistedOperatingCashFlow = Number(persistedStabilize.currentOperatingCashFlow)
  const persistedOperatingTarget = Number(
    persistedStabilize.targetOperatingCashFlow ?? legacyTargetCashGain,
  )

  return {
    ...defaults,
    ...challenge,
    financeObjectiveVersion: 2,
    objectives: {
      ...defaults.objectives,
      ...(challenge.objectives || {}),
      rosterBuild: {
        ...defaults.objectives.rosterBuild,
        ...(challenge.objectives?.rosterBuild || {}),
      },
      firstShow: {
        ...defaults.objectives.firstShow,
        ...(challenge.objectives?.firstShow || {}),
      },
      stabilize: {
        ...defaults.objectives.stabilize,
        ...stabilizeFields,
        targetOperatingCashFlow: isLegacyFinanceObjective
          ? defaults.objectives.stabilize.targetOperatingCashFlow
          : (Number.isFinite(persistedOperatingTarget)
              ? persistedOperatingTarget
              : defaults.objectives.stabilize.targetOperatingCashFlow),
        currentOperatingCashFlow: isLegacyFinanceObjective
          ? Math.round(migratedOperatingCashFlow)
          : (Number.isFinite(persistedOperatingCashFlow)
              ? persistedOperatingCashFlow
              : Math.round(Number(legacyCurrentCashGain) || 0)),
      },
    },
    reward: {
      ...defaults.reward,
      ...(challenge.reward || {}),
    },
    penalty: {
      ...defaults.penalty,
      ...(challenge.penalty || {}),
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
  return parseGameDate(isoDateString)
}

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const getScheduledDayFromSpecificDate = ({ specificDate, startDateIso, fallbackScheduledWeek }) => {
  const parsedSpecificDate = parseIsoDateLocal(specificDate)
  const parsedStartDate = parseStartDateIso(startDateIso)
  let scheduledDay = getScheduledDayFromWeek(Number(fallbackScheduledWeek) || 1)

  if (parsedSpecificDate && !Number.isNaN(parsedSpecificDate.getTime())) {
    const specificDateStart = toStartOfDay(parsedSpecificDate)
    const diffDays = getGameDayDifference(parsedStartDate, specificDateStart)
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
  return toGameDateIso(date)
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
const RIVALRY_DECAY_PER_EVENT = 1
const RIVALRY_MAX_HEAT = 100
const RIVALRY_MIN_HEAT_TO_KEEP = 4
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
const MORALE_DEMAND_HAPPINESS_THRESHOLD = 22
const MORALE_DEMAND_RESPONSE_DAYS = 7
const MORALE_DEMAND_WALKOUT_THRESHOLD = 5
const MORALE_DEMAND_WALKOUT_OVERDUE_DAYS = 4
const MORALE_DEMAND_SALARY_RAISE_MULTIPLIER = 0.15
const MORALE_DEMAND_SALARY_RAISE_MIN = 1000
const MORALE_TITLE_PROMISE_WINDOW_DAYS = 21
const MORALE_TITLE_PROMISE_SUCCESS_BOOST = 6
const MORALE_TITLE_PROMISE_FAIL_PENALTY = -12
const DAILY_STAMINA_REGEN = 10
const MIN_MATCH_STAMINA_LOSS = 20
const MAX_MATCH_STAMINA_LOSS = 50
const MAX_MALE_WRESTLERS = Number(import.meta.env.VITE_ROSTER_MAX_SIZE_MALE)
const MAX_FEMALE_WRESTLERS = Number(import.meta.env.VITE_ROSTER_MAX_SIZE_FEMALE)

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

const buildRivalryPairKey = (leftId, rightId) => {
  return [leftId, rightId].sort().join('::')
}

const normalizeRivalries = (rivalries = []) => {
  if (!Array.isArray(rivalries)) {
    return []
  }

  return rivalries
    .map((rivalry) => {
      const ids = Array.isArray(rivalry?.wrestlerIds) ? rivalry.wrestlerIds.filter(Boolean).slice(0, 2) : []
      if (ids.length !== 2) {
        return null
      }

      const pairKey = buildRivalryPairKey(ids[0], ids[1])
      const names = Array.isArray(rivalry?.wrestlerNames)
        ? rivalry.wrestlerNames.filter(Boolean).slice(0, 2)
        : []

      return {
        pairKey,
        wrestlerIds: pairKey.split('::'),
        wrestlerNames: names,
        heat: Math.max(0, Math.min(RIVALRY_MAX_HEAT, Math.round(Number(rivalry?.heat) || 0))),
        lastEventDay: Number.isInteger(Number(rivalry?.lastEventDay)) ? Number(rivalry.lastEventDay) : null,
        lastSegmentType: typeof rivalry?.lastSegmentType === 'string' ? rivalry.lastSegmentType : null,
        lastRating: Number.isFinite(Number(rivalry?.lastRating)) ? Number(rivalry.lastRating) : null,
      }
    })
    .filter((rivalry) => rivalry && rivalry.heat > 0)
}

const getSegmentRivalryPairs = (segment, employeesById) => {
  if (!MATCH_SEGMENT_TYPES.has(segment?.segmentType)) {
    return []
  }

  const rating = Number(segment?.matchRating)
  const hasRating = Number.isFinite(rating)
  const baseGainByType = {
    match: 5,
    mainEvent: 7,
    titleMatch: 8,
  }
  const ratingBonus = hasRating ? Math.max(0, Math.min(3, Math.floor(rating - 5))) : 0
  const winnerBonus = segment?.winnerEmployeeId || (Array.isArray(segment?.winnerTeamIds) && segment.winnerTeamIds.length > 0) ? 1 : 0
  const heatGain = Math.max(1, baseGainByType[segment.segmentType] + ratingBonus + winnerBonus)

  const buildPair = (leftId, rightId) => {
    if (!leftId || !rightId || leftId === rightId) {
      return null
    }

    const left = employeesById.get(leftId)
    const right = employeesById.get(rightId)
    if (!left || !right || left.role !== 'wrestler' || right.role !== 'wrestler') {
      return null
    }

    return {
      pairKey: buildRivalryPairKey(leftId, rightId),
      wrestlerIds: [leftId, rightId],
      wrestlerNames: [left.name, right.name],
      heatGain,
      segmentType: segment.segmentType,
      rating: hasRating ? Number(rating.toFixed(1)) : null,
    }
  }

  if (segment.matchType === 'tagTeam') {
    const team1 = Array.isArray(segment.team1Ids) ? segment.team1Ids : []
    const team2 = Array.isArray(segment.team2Ids) ? segment.team2Ids : []
    const pairs = []

    team1.forEach((leftId) => {
      team2.forEach((rightId) => {
        const pair = buildPair(leftId, rightId)
        if (pair) pairs.push(pair)
      })
    })

    return pairs
  }

  const wrestlers = Array.from(new Set((segment.participantIds || [])
    .map((id) => employeesById.get(id))
    .filter((employee) => employee?.role === 'wrestler')
    .map((employee) => employee.employeeId)))

  const pairs = []
  for (let i = 0; i < wrestlers.length; i += 1) {
    for (let j = i + 1; j < wrestlers.length; j += 1) {
      const pair = buildPair(wrestlers[i], wrestlers[j])
      if (pair) pairs.push(pair)
    }
  }

  return pairs
}

const updateRivalriesAfterEvent = ({ existingRivalries = [], configuredSegments = [], employees = [], day }) => {
  const normalizedExisting = normalizeRivalries(existingRivalries)
  const rivalriesByPair = new Map(
    normalizedExisting.map((rivalry) => [
      rivalry.pairKey,
      {
        ...rivalry,
        heat: Math.max(0, rivalry.heat - RIVALRY_DECAY_PER_EVENT),
      },
    ]),
  )

  const employeesById = new Map((employees || []).map((employee) => [employee.employeeId, employee]))
  const eventPairHeatGain = new Map()

  configuredSegments.forEach((segment) => {
    const pairs = getSegmentRivalryPairs(segment, employeesById)
    pairs.forEach((pair) => {
      const existing = rivalriesByPair.get(pair.pairKey) || {
        pairKey: pair.pairKey,
        wrestlerIds: pair.wrestlerIds,
        wrestlerNames: pair.wrestlerNames,
        heat: 0,
        lastEventDay: null,
        lastSegmentType: null,
        lastRating: null,
      }

      const nextHeat = Math.min(RIVALRY_MAX_HEAT, existing.heat + pair.heatGain)
      rivalriesByPair.set(pair.pairKey, {
        ...existing,
        wrestlerNames: pair.wrestlerNames,
        heat: nextHeat,
        lastEventDay: day,
        lastSegmentType: pair.segmentType,
        lastRating: pair.rating,
      })

      eventPairHeatGain.set(pair.pairKey, (eventPairHeatGain.get(pair.pairKey) || 0) + pair.heatGain)
    })
  })

  const rivalries = Array.from(rivalriesByPair.values())
    .filter((rivalry) => rivalry.heat >= RIVALRY_MIN_HEAT_TO_KEEP)
    .sort((left, right) => right.heat - left.heat)
    .slice(0, 120)

  const rivalryHeatScore = Array.from(eventPairHeatGain.entries())
    .reduce((sum, [pairKey, gain]) => {
      const rivalry = rivalriesByPair.get(pairKey)
      const heatWeight = rivalry ? Math.round(rivalry.heat / 8) : 0
      return sum + gain + heatWeight
    }, 0)

  const rivalryHighlights = Array.from(eventPairHeatGain.entries())
    .map(([pairKey, gain]) => {
      const rivalry = rivalriesByPair.get(pairKey)
      if (!rivalry) return null
      return {
        pairKey,
        names: (rivalry.wrestlerNames || []).filter(Boolean).join(' vs '),
        heat: rivalry.heat,
        gain,
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.gain !== left.gain) {
        return right.gain - left.gain
      }
      return right.heat - left.heat
    })
    .slice(0, 3)

  return {
    rivalries,
    rivalryHeatScore,
    rivalryHighlights,
  }
}

const getImpact = (value) => {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

const buildEventPostmortem = ({
  overallRating,
  fanGrowthThreshold,
  setupBonus,
  sponsorFanBoost,
  sponsorEventBoost,
  rivalryFanBoost,
  audienceSegmentFanImpact,
  competitorFanImpact,
  rivalryPrestigeBoost,
  competitorPrestigeImpact,
  fanDelta,
  prestigeDelta,
  incomeBreakdown,
  expenseBreakdown,
  net,
}) => {
  const fanFactors = [
    {
      key: 'ratingGate',
      label: `Event rating gate (${Number.isFinite(overallRating) ? overallRating.toFixed(1) : 'N/A'} vs ${fanGrowthThreshold.toFixed(1)} threshold)`,
      impact: getImpact(fanDelta),
      value: fanDelta,
    },
    {
      key: 'cardVariety',
      label: 'Card segment variety bonus',
      impact: getImpact(setupBonus?.fans || 0),
      value: Math.round(setupBonus?.fans || 0),
    },
    {
      key: 'sponsorBuzz',
      label: 'Sponsor fan boost',
      impact: getImpact(Math.round(sponsorFanBoost || 0)),
      value: Math.round(sponsorFanBoost || 0),
    },
    {
      key: 'rivalryBuzz',
      label: 'Rivalry heat crowd reaction',
      impact: getImpact(Math.round(rivalryFanBoost || 0)),
      value: Math.round(rivalryFanBoost || 0),
    },
    {
      key: 'audienceMix',
      label: 'Audience segment fit bonus',
      impact: getImpact(Math.round(audienceSegmentFanImpact || 0)),
      value: Math.round(audienceSegmentFanImpact || 0),
    },
    {
      key: 'competitorHeat',
      label: 'Competitor pressure swing',
      impact: getImpact(Math.round(competitorFanImpact || 0)),
      value: Math.round(competitorFanImpact || 0),
    },
  ].filter((factor) => factor.value !== 0 || factor.key === 'ratingGate')

  const prestigeFactors = [
    {
      key: 'matchQuality',
      label: 'Match quality and card execution',
      impact: getImpact(prestigeDelta),
      value: prestigeDelta,
    },
    {
      key: 'setupPrestige',
      label: 'Segment setup prestige bonus',
      impact: getImpact(Math.round(setupBonus?.prestige || 0)),
      value: Math.round(setupBonus?.prestige || 0),
    },
    {
      key: 'rivalryPrestige',
      label: 'Rivalry momentum prestige boost',
      impact: getImpact(Math.round(rivalryPrestigeBoost || 0)),
      value: Math.round(rivalryPrestigeBoost || 0),
    },
    {
      key: 'competitorPrestige',
      label: 'Competitor prestige pressure',
      impact: getImpact(Math.round(competitorPrestigeImpact || 0)),
      value: Math.round(competitorPrestigeImpact || 0),
    },
  ].filter((factor) => factor.value !== 0 || factor.key === 'matchQuality')

  const moneyFactors = [
    {
      key: 'eventGate',
      label: 'Ticket gate and event takings',
      impact: getImpact(incomeBreakdown?.eventGate || 0),
      value: Math.round(incomeBreakdown?.eventGate || 0),
    },
    {
      key: 'sponsorRevenue',
      label: 'Sponsor revenue',
      impact: getImpact((incomeBreakdown?.sponsor || 0) + Math.round((sponsorEventBoost || 0) * 1000)),
      value: Math.round(incomeBreakdown?.sponsor || 0),
    },
    {
      key: 'payrollCost',
      label: 'Wrestler and staff payroll',
      impact: 'negative',
      value: -Math.round((expenseBreakdown?.wrestlerPayroll || 0) + (expenseBreakdown?.staffCost || 0)),
    },
    {
      key: 'monthlyPayroll',
      label: 'Recurring monthly payroll',
      impact: 'negative',
      value: -Math.round(expenseBreakdown?.monthlyPayroll || 0),
    },
    {
      key: 'productionCost',
      label: 'Production and operating costs',
      impact: 'negative',
      value: -Math.round((expenseBreakdown?.eventCost || 0) + (expenseBreakdown?.operatingCost || 0)),
    },
    {
      key: 'net',
      label: 'Net event impact',
      impact: getImpact(net),
      value: Math.round(net),
    },
  ]

  return {
    fanFactors,
    prestigeFactors,
    moneyFactors,
  }
}

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)))

const buildAudienceSegmentsBreakdown = ({
  eventType,
  audienceCount,
  configuredSegments,
  overallRating,
  hype,
  risk,
  rivalryHeatScore,
  sponsorFanBoost,
  ticketPrice,
}) => {
  const totalSegments = Math.max(1, configuredSegments.length)
  const promoInterviewCount = configuredSegments.filter((seg) => seg.segmentType === 'promo' || seg.segmentType === 'interview').length
  const titleMatchCount = configuredSegments.filter((seg) => seg.segmentType === 'titleMatch').length
  const mainEventCount = configuredSegments.filter((seg) => seg.segmentType === 'mainEvent').length

  const promoShare = promoInterviewCount / totalSegments
  const titleShare = titleMatchCount / totalSegments
  const mainEventShare = mainEventCount / totalSegments
  const qualityFactor = Number.isFinite(Number(overallRating)) ? Number(overallRating) / 10 : 0.55
  const riskControl = Math.max(0, Math.min(1, 1 - (Number(risk) || 0) / 100))

  const segmentBlueprints = [
    {
      key: 'casual',
      label: 'Casual',
      spendMultiplier: 1,
      rawScore: 45 + hype * 0.18 + promoShare * 20 + qualityFactor * 12 - risk * 0.08,
      satisfaction: clampPercent(48 + qualityFactor * 28 + promoShare * 18 + riskControl * 8),
    },
    {
      key: 'hardcore',
      label: 'Hardcore',
      spendMultiplier: 1.2,
      rawScore: 38 + qualityFactor * 30 + titleShare * 36 + mainEventShare * 18 + rivalryHeatScore * 0.12,
      satisfaction: clampPercent(42 + qualityFactor * 34 + titleShare * 20 + rivalryHeatScore * 0.18),
    },
    {
      key: 'family',
      label: 'Family',
      spendMultiplier: 0.85,
      rawScore: 40 + riskControl * 25 + promoShare * 14 + sponsorFanBoost * 0.28 - rivalryHeatScore * 0.08,
      satisfaction: clampPercent(44 + riskControl * 34 + promoShare * 12 - rivalryHeatScore * 0.1),
    },
    {
      key: 'online',
      label: 'Online',
      spendMultiplier: 0.7,
      rawScore: 36 + (eventType === 'digitalOnly' ? 24 : 0) + (eventType === 'ppv' ? 8 : 0) + promoShare * 16 + rivalryHeatScore * 0.18,
      satisfaction: clampPercent(40 + qualityFactor * 20 + promoShare * 18 + rivalryHeatScore * 0.15 + (eventType === 'digitalOnly' ? 15 : 0)),
    },
  ]

  const totalRawScore = Math.max(1, segmentBlueprints.reduce((sum, segment) => sum + Math.max(1, segment.rawScore), 0))
  let assignedAudience = 0

  const segments = segmentBlueprints.map((segment, index) => {
    const ratio = Math.max(0, Math.max(1, segment.rawScore) / totalRawScore)
    const attendance = index === segmentBlueprints.length - 1
      ? Math.max(0, audienceCount - assignedAudience)
      : Math.round(audienceCount * ratio)

    assignedAudience += attendance

    const fanImpact = Math.round((((segment.satisfaction - 55) / 45) * (attendance / Math.max(1, audienceCount))) * 120)

    return {
      key: segment.key,
      label: segment.label,
      attendance,
      sharePercent: clampPercent(ratio * 100),
      satisfaction: segment.satisfaction,
      fanImpact,
      spendMultiplier: segment.spendMultiplier,
    }
  })

  const fanImpactTotal = segments.reduce((sum, segment) => sum + segment.fanImpact, 0)
  const weightedSpendMultiplier = segments.reduce((sum, segment) => {
    const share = segment.attendance / Math.max(1, audienceCount)
    return sum + share * segment.spendMultiplier
  }, 0)

  const incomeAdjustment = Math.round(
    audienceCount * ticketPrice * (weightedSpendMultiplier - 1) * 0.08,
  )

  return {
    segments,
    fanImpactTotal,
    incomeAdjustment,
  }
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

const applyHeelFaceWeeklyDecay = (employees) => {
  return employees.map((employee) => {
    if (employee.role !== 'wrestler') return employee
    return {
      ...employee,
      heelFaceMeter: applyHeelFaceNeutralDecay(employee.heelFaceMeter ?? DEFAULT_HEEL_FACE_METER_VALUE),
    }
  })
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

      if (isMatchType && (isWinner || isLoser)) {
        // Gather opponent IDs for this match
        let opponentIds = []
        if (isTagTeam) {
          const myTeam = Array.isArray(seg.team1Ids) && seg.team1Ids.includes(employee.employeeId)
            ? seg.team1Ids
            : (Array.isArray(seg.team2Ids) && seg.team2Ids.includes(employee.employeeId) ? seg.team2Ids : [])
          const allTeamIds = [
            ...(Array.isArray(seg.team1Ids) ? seg.team1Ids : []),
            ...(Array.isArray(seg.team2Ids) ? seg.team2Ids : []),
          ]
          opponentIds = allTeamIds.filter((id) => !myTeam.includes(id))
        } else {
          opponentIds = seg.participantIds.filter((id) => {
            if (id === employee.employeeId) return false
            const p = employeesById.get(id)
            return p && !HELPER_ROLES.has(p.role)
          })
        }

        const opponentMeters = opponentIds.map((id) =>
          clampHeelFaceMeter(employeesById.get(id)?.heelFaceMeter ?? DEFAULT_HEEL_FACE_METER_VALUE),
        )
        const opponentAvgMeter =
          opponentMeters.length > 0
            ? opponentMeters.reduce((sum, m) => sum + m, 0) / opponentMeters.length
            : DEFAULT_HEEL_FACE_METER_VALUE

        nextHeelFaceMeter += computeHeelFaceShift(opponentAvgMeter, isWinner, seg.matchRating)
      }

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
        storyBeat: seg.storyBeat || null,
        sourceFactionId: seg.sourceFactionId || null,
        targetFactionId: seg.targetFactionId || null,
        betrayerId: seg.betrayerId || null,
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
    let nextMoraleDemand = employee?.activeMoraleDemand && typeof employee.activeMoraleDemand === 'object'
      ? employee.activeMoraleDemand
      : null
    let nextPromisedTitleShotByDay = Number.isInteger(employee?.promisedTitleShotByDay)
      ? employee.promisedTitleShotByDay
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
        if (nextPromisedTitleShotByDay) {
          nextHappiness += MORALE_TITLE_PROMISE_SUCCESS_BOOST
          nextPromisedTitleShotByDay = null
        }
      }

      if (nextPromisedTitleShotByDay && currentDay > nextPromisedTitleShotByDay) {
        nextHappiness += MORALE_TITLE_PROMISE_FAIL_PENALTY
        nextPromisedTitleShotByDay = null
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

    if (nextMoraleDemand) {
      const overdueDays = currentDay - Number(nextMoraleDemand.dueDay || currentDay)
      if (overdueDays > 0) {
        nextHappiness += overdueDays >= 6 ? -2 : -1
      }
    }

    const clampedHappiness = clampHappiness(nextHappiness)
    const overdueWalkout = Boolean(
      nextMoraleDemand
      && currentDay > Number(nextMoraleDemand.dueDay || currentDay)
      && (currentDay - Number(nextMoraleDemand.dueDay || currentDay)) >= MORALE_DEMAND_WALKOUT_OVERDUE_DAYS
      && clampedHappiness <= MORALE_DEMAND_WALKOUT_THRESHOLD,
    )
    if (clampedHappiness <= 0 || overdueWalkout) {
      departingEmployeeIds.add(employee.employeeId)
      if (typeof employee.personId === 'string') {
        nextHiringLocks[employee.personId] = currentDay + HAPPINESS_LOCKOUT_DAYS
      }
    }

    if (!nextMoraleDemand && clampedHappiness <= MORALE_DEMAND_HAPPINESS_THRESHOLD) {
      const shouldDemand = Math.random() < 0.35
      if (shouldDemand) {
        const wantsTitleShot = employee.role === 'wrestler' && Math.random() < 0.5
        const salaryRaiseAmount = Math.max(
          MORALE_DEMAND_SALARY_RAISE_MIN,
          Math.round(Number(employee?.contract?.monthlySalary || 0) * MORALE_DEMAND_SALARY_RAISE_MULTIPLIER),
        )
        nextMoraleDemand = {
          demandType: wantsTitleShot ? 'titleShot' : 'salaryRaise',
          requestedAmount: wantsTitleShot ? 0 : salaryRaiseAmount,
          createdDay: currentDay,
          dueDay: currentDay + MORALE_DEMAND_RESPONSE_DAYS,
        }
      }
    }

    return {
      ...employee,
      happiness: clampedHappiness,
      lastHappinessInactivityPenaltyDay: nextInactivityPenaltyDay,
      activeMoraleDemand: nextMoraleDemand,
      promisedTitleShotByDay: nextPromisedTitleShotByDay,
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

const sanitizeEventSetup = (eventSetup, activeEmployees, defaultMaxSegments, unlocks, factions) => {
  const maxSegments = Math.max(1, Number(eventSetup?.totalSegments) || Number(defaultMaxSegments) || 1)

  if (!Array.isArray(eventSetup?.segments) || eventSetup.segments.length === 0) {
    return []
  }

  const validEmployeeIds = new Set((activeEmployees || []).map((employee) => employee.employeeId))
  const normalizedUnlocks = normalizeCareerArcUnlocks(unlocks)

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
      const sourceFaction = (factions || []).find((faction) => faction.factionId === segment?.sourceFactionId)
      const targetFaction = (factions || []).find((faction) => faction.factionId === segment?.targetFactionId)
      const storyBeat = segmentType === 'promo'
        && FACTION_STORY_BEATS.includes(segment?.storyBeat)
        && sourceFaction
        && targetFaction
        && sourceFaction.factionId !== targetFaction.factionId
        && (
          segment.storyBeat !== 'betrayal'
          || sourceFaction.memberIds.includes(segment?.betrayerId)
        )
        ? segment.storyBeat
        : null

      return {
        id: `segment-${index + 1}`,
        segmentType,
        promoSegmentId: segmentType === 'promo'
          && normalizedUnlocks.promoSegments.includes(segment?.promoSegmentId)
          ? segment.promoSegmentId
          : (segmentType === 'promo' ? DEFAULT_CAREER_ARC_UNLOCKS.promoSegments[0] : null),
        storyBeat,
        sourceFactionId: storyBeat ? sourceFaction.factionId : null,
        targetFactionId: storyBeat ? targetFaction.factionId : null,
        betrayerId: storyBeat === 'betrayal' ? segment.betrayerId : null,
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
const MIN_FACTION_MEMBERS = 2
const MAX_FACTION_MEMBERS = 10
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
const MIN_SPONSOR_TRUST = 0
const MAX_SPONSOR_TRUST = 100
const HIGH_TIER_SPONSOR_MIN_TIER = 6
const HIGH_TIER_BRAND_SAFETY_MIN = 60
const HIGH_TIER_FAMILY_SHARE_MIN = 18
const SPONSOR_CRITICAL_TRUST_EXIT_THRESHOLD = 12

const clampSponsorTrust = (value, fallback = 55) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return Math.max(MIN_SPONSOR_TRUST, Math.min(MAX_SPONSOR_TRUST, Math.round(fallback)))
  }

  return Math.max(MIN_SPONSOR_TRUST, Math.min(MAX_SPONSOR_TRUST, Math.round(numeric)))
}

const getSponsorTrustFactor = (trust) => {
  const normalized = clampSponsorTrust(trust) / 100
  return 0.65 + normalized * 0.5
}

const getBrandFitTrustModifier = (brandFit = '', metrics = {}) => {
  const fit = String(brandFit || '').toLowerCase()
  const professionalism = Number(metrics.professionalism || 0)
  const hype = Number(metrics.hype || 0)
  const controversy = Number(metrics.controversy || 0)

  if (['tech', 'media', 'luxury', 'community'].includes(fit)) {
    return Math.round((professionalism / 4) - (controversy / 5))
  }

  if (['combat', 'entertainment', 'performance'].includes(fit)) {
    return Math.round((hype / 4) + (controversy / 8))
  }

  if (['lifestyle'].includes(fit)) {
    return Math.round((professionalism / 6) + (hype / 6) - (controversy / 10))
  }

  return Math.round((professionalism + hype - controversy) / 8)
}

const getEventSponsorProfile = (eventOutcome) => {
  const segments = Array.isArray(eventOutcome?.segments) ? eventOutcome.segments : []
  const audienceSegments = Array.isArray(eventOutcome?.audienceSegments) ? eventOutcome.audienceSegments : []
  const totalSegments = Math.max(1, segments.length)
  const violentSegments = segments.filter((segment) => (
    segment?.segmentType === 'match' || segment?.segmentType === 'mainEvent' || segment?.segmentType === 'titleMatch'
  )).length
  const promoSegments = segments.filter((segment) => (
    segment?.segmentType === 'promo' || segment?.segmentType === 'interview'
  )).length
  const familySegment = audienceSegments.find((segment) => segment?.key === 'family') || null
  const familyShare = Number(familySegment?.sharePercent || 0)

  const overallRating = Number(eventOutcome?.overallRating || 0)
  const hype = Number(eventOutcome?.hype || 0)
  const violentRatio = violentSegments / totalSegments
  const promoRatio = promoSegments / totalSegments
  const risk = Number(eventOutcome?.risk || 0)
  const scandalScore = Math.max(0, risk - 22) + Math.max(0, 7 - overallRating) * 6
  const starPower = Math.max(0, (overallRating - 5) * 18 + hype * 0.2)

  const brandSafetyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(64 + familyShare * 0.9 + promoRatio * 16 - violentRatio * 22 - scandalScore * 0.45),
    ),
  )

  return {
    familyShare,
    violentRatio,
    promoRatio,
    scandalScore,
    starPower,
    brandSafetyScore,
    hype,
  }
}

const getEventBrandFitTrustModifier = (brandFit = '', profile = {}) => {
  const fit = String(brandFit || '').toLowerCase()
  const brandSafety = Number(profile.brandSafetyScore || 0)
  const familyShare = Number(profile.familyShare || 0)
  const violentRatio = Number(profile.violentRatio || 0)
  const scandalScore = Number(profile.scandalScore || 0)
  const starPower = Number(profile.starPower || 0)

  if (['tech', 'media', 'luxury', 'community'].includes(fit)) {
    return Math.round((brandSafety - 55) / 8 + familyShare / 14 - scandalScore / 20)
  }

  if (['combat', 'entertainment', 'performance'].includes(fit)) {
    return Math.round(starPower / 32 + violentRatio * 4 - scandalScore / 36)
  }

  if (['lifestyle'].includes(fit)) {
    return Math.round((brandSafety - 50) / 10 + familyShare / 18 + starPower / 50 - scandalScore / 28)
  }

  return Math.round((brandSafety - 50) / 10)
}

const getSponsorSignRestrictionReason = ({ offer, lastOutcome }) => {
  const tier = Number(offer?.tier || 1)
  if (tier < HIGH_TIER_SPONSOR_MIN_TIER) {
    return null
  }

  if (!lastOutcome) {
    return 'needsTrackRecord'
  }

  const profile = getEventSponsorProfile(lastOutcome)
  if (profile.brandSafetyScore < HIGH_TIER_BRAND_SAFETY_MIN) {
    return 'brandSafety'
  }

  if (profile.familyShare < HIGH_TIER_FAMILY_SHARE_MIN) {
    return 'familyAudience'
  }

  return null
}

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
      trust: clampSponsorTrust(sponsor?.trust, sponsor?.reputation || 55),
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
    trust: clampSponsorTrust(sponsor?.trust, sponsor?.reputation || 55),
  }
}

const normalizeSponsors = (sponsors) => {
  if (!Array.isArray(sponsors)) {
    return []
  }

  return sponsors.map(normalizeSponsor)
}

const normalizeSponsorOfferForMarket = (offer, index) => {
  const sponsorType = SPONSOR_TYPE_CONFIG[offer?.sponsorType] ? offer.sponsorType : DEFAULT_SPONSOR_TYPE
  const isEventScoped = SPONSOR_TYPE_CONFIG[sponsorType].eventScoped
  const contractWeeks = isEventScoped
    ? null
    : Math.max(1, Math.round(Number(offer?.contractWeeks || 1)))

  return {
    offerId: String(offer?.offerId || `mod-offer-${Date.now()}-${index}`),
    sponsorId: String(offer?.sponsorId || `mod-sponsor-${index}`),
    name: String(offer?.name || 'Mod Sponsor Offer'),
    sponsorType,
    reputation: Math.max(0, Math.min(100, Math.round(Number(offer?.reputation || 50)))),
    marketRegion: String(offer?.marketRegion || 'Global'),
    brandFit: String(offer?.brandFit || 'Lifestyle'),
    tier: Math.max(1, Math.min(7, Math.round(Number(offer?.tier || 1)))),
    dailyPayout: Math.max(0, Math.round(Number(offer?.dailyPayout || 0))),
    signingBonus: Math.max(0, Math.round(Number(offer?.signingBonus || 0))),
    eventMultiplier: Number(Math.max(0, Math.min(3, Number(offer?.eventMultiplier || 0))).toFixed(2)),
    fanBoost: Math.max(0, Math.round(Number(offer?.fanBoost || 0))),
    trust: clampSponsorTrust(offer?.trust, offer?.reputation || 55),
    contractWeeks,
  }
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
    (set, get) => ({
      ...buildInitialState(),

      startGame: ({ playerName, companyName, preferredCountry = '' }) => {
        const cleanPlayerName = playerName.trim()
        const cleanCompanyName = companyName.trim()
        const cleanPreferredCountry = String(preferredCountry || '').trim()

        if (!cleanPlayerName || !cleanCompanyName) {
          return { ok: false }
        }

        const initialState = buildInitialState()
        const managementProfile = buildGeneratedManagementProfile({
          preferredCountry: cleanPreferredCountry || undefined,
        })

        const careerUnlocks = normalizeCareerArcUnlocks(initialState.progression.unlocks)
        const firstCareerArc = buildCareerArc({
          startDay: 1,
          stats: initialState.stats,
          finances: initialState.finances,
          unlocks: careerUnlocks,
        })
        const onboardingChallenge = buildOnboardingChallenge({
          startDay: 1,
          startFans: initialState.stats.fans,
          startCash: initialState.finances.cash,
        })

        set(() => ({
          ...initialState,
          gameStatus: {
            ...initialState.gameStatus,
            hasStarted: true,
          },
          profile: {
            playerName: cleanPlayerName,
            companyName: cleanCompanyName,
            ownerName: BOARD_CHAIR.person_name,
            generalManagerName: cleanPlayerName,
            homeCountry: managementProfile.homeCountry,
          },
          progression: {
            currentArc: firstCareerArc,
            history: [],
            unlocks: careerUnlocks,
          },
          onboardingChallenge,
        }))

        return { ok: true }
      },

      resetGame: () => {
        set(() => buildInitialState())
      },

      openBoardMeeting: () => {
        const state = get()
        const boardMeeting = normalizeBoardMeetingState(state.boardMeeting)
        const currentDay = Number(state.calendar.day)

        if (!state.gameStatus.hasStarted || state.gameStatus.isGameOver) {
          return { ok: false, reason: 'gameNotActive' }
        }
        if (boardMeeting.activeMeeting) {
          return { ok: true, meeting: boardMeeting.activeMeeting }
        }
        if (boardMeeting.lastMeetingDay === currentDay) {
          return { ok: false, reason: 'alreadyHeld' }
        }
        if (!isBoardMeetingScheduledForDay({
          startDateIso: state.calendar.startDateIso,
          customEvents: state.events.customEvents,
          day: currentDay,
        })) {
          return { ok: false, reason: 'notMeetingDay' }
        }

        const financeReport = getBoardMeetingFinanceReport(state)
        const financeResult = recordBoardFinancialPeriod(boardMeeting, {
          day: currentDay,
          operatingNet: financeReport.operatingNet,
        })
        const mandateResult = resolveBoardMandates(financeResult.boardState, {
          day: currentDay,
          operatingNet: financeReport.operatingNet,
        })
        const updatedBoardState = mandateResult.boardState

        if (financeResult.managerDismissed) {
          const meetingRecord = {
            meetingId: `board-meeting-${currentDay}`,
            day: currentDay,
            financeReport,
            decisions: [],
            status: 'managerDismissed',
            mandateOutcomes: mandateResult.outcomes,
          }
          set((currentState) => ({
            boardMeeting: {
              ...updatedBoardState,
              managerDismissed: true,
              meetingHistory: [...updatedBoardState.meetingHistory, meetingRecord].slice(-24),
            },
            gameStatus: {
              ...currentState.gameStatus,
              isGameOver: true,
              gameOverReason: 'three-negative-finance-periods',
            },
          }))
          return { ok: true, managerDismissed: true, meeting: meetingRecord }
        }

        const meetingDate = getGameDateFromDay(state.calendar.startDateIso, currentDay)
        const isJanuary = meetingDate.getMonth() === 0
        const agendaPool = getBoardMeetingAgendaPool(state, financeReport, isJanuary)
        const agendas = assignRandomBoardAgendaPresenters(
          selectBoardAgendas({
            agendaPool,
            financialIsNegative: financeReport.operatingNet < 0,
            requiredAgendaIds: isJanuary ? ['boardElection'] : [],
          }),
          BOARD_MEMBERS,
          state.profile.generalManagerName || state.profile.playerName,
        )
        const activeMeeting = {
          meetingId: `board-meeting-${currentDay}`,
          day: currentDay,
          financeReport,
          isJanuary,
          negativeFinanceMonths: updatedBoardState.consecutiveNegativeFinanceMonths,
          agendas,
          currentAgendaIndex: 0,
          decisions: [],
          mandateOutcomes: mandateResult.outcomes,
          status: 'inProgress',
        }

        set(() => ({
          boardMeeting: {
            ...updatedBoardState,
            activeMeeting,
          },
        }))
        return { ok: true, meeting: activeMeeting }
      },

      resolveBoardAgenda: ({ agendaId, choiceId, candidateId = null } = {}) => {
        const initialState = get()
        const boardMeeting = normalizeBoardMeetingState(initialState.boardMeeting)
        const activeMeeting = boardMeeting.activeMeeting
        const agenda = activeMeeting?.agendas?.[activeMeeting.currentAgendaIndex]

        if (!activeMeeting || activeMeeting.status !== 'inProgress' || !agenda) {
          return { ok: false, reason: 'noActiveAgenda' }
        }
        if (agenda.id !== agendaId) {
          return { ok: false, reason: 'agendaOutOfOrder' }
        }

        const choice = agenda.choices.find((candidate) => candidate.id === choiceId)
        if (!choice) {
          return { ok: false, reason: 'invalidChoice' }
        }
        const isBoardElectionVote = choice.effect === 'boardElectionVote'
        if (
          isBoardElectionVote
          && !(agenda.context?.candidates || []).some(
            (candidate) => candidate.person_name === candidateId,
          )
        ) {
          return { ok: false, reason: 'invalidElectionCandidate' }
        }
        const cashCost = Math.max(0, Number(choice.cashCost) || 0)
        if (cashCost > Number(initialState.finances.cash || 0)) {
          return { ok: false, reason: 'insufficientCash' }
        }

        const electionResult = isBoardElectionVote
          ? resolveBoardElection({
              candidates: agenda.context.candidates,
              boardMembers: BOARD_MEMBERS,
              userChoiceId: candidateId,
            })
          : null
        const voteResult = choice.requiresVote
          ? conductWeightedBoardVote({
              boardMembers: BOARD_MEMBERS,
              relation: boardMeeting.relation,
              proposerName: agenda.proposer?.person_name,
              supportChance: choice.supportChance,
            })
          : null
        let passed = electionResult !== null || !voteResult || voteResult.passed
        let externalActionResult = null

        if (passed && choice.effect === 'signSponsor') {
          externalActionResult = get().signSponsor(agenda.context?.sponsorOffer?.offerId)
          passed = Boolean(externalActionResult?.ok)
          if (!passed) {
            return {
              ok: false,
              reason: externalActionResult?.reason || 'sponsorSigningFailed',
              voteResult,
            }
          }
        }

        const previousRejections = Number(
          boardMeeting.rejectionCounts?.[agenda.proposer?.person_name],
        ) || 0
        const electionRelationDelta = electionResult
          ? electionResult.president.candidateId === candidateId
            ? 5
            : electionResult.vicePresident.candidateId === candidateId
              ? 2
              : -3
          : null
        const relationDelta = passed
          ? (electionRelationDelta ?? Number(choice.relationDelta || 0))
            - (choice.isRejection ? getRepeatedRejectionPenalty(previousRejections) : 0)
          : Number(choice.failedVoteRelationDelta ?? -2)
        let result = { ok: true, passed, voteResult, electionResult, relationDelta }

        set((state) => {
          const currentBoardMeeting = normalizeBoardMeetingState(state.boardMeeting)
          const currentMeeting = currentBoardMeeting.activeMeeting
          const currentAgenda = currentMeeting?.agendas?.[currentMeeting.currentAgendaIndex]
          if (!currentMeeting || currentAgenda?.id !== agendaId) {
            result = { ok: false, reason: 'meetingChanged' }
            return state
          }

          let nextRoster = state.roster
          let nextFinances = state.finances
          let nextStats = state.stats
          let nextBoardMeeting = applyBoardRelationChange(currentBoardMeeting, relationDelta)
          let nextMeeting = currentMeeting
          let effectMessageKey = passed ? 'decisionApplied' : 'motionRejected'

          if (passed && choice.isRejection && agenda.proposer?.person_name) {
            const proposerName = agenda.proposer.person_name
            nextBoardMeeting = {
              ...nextBoardMeeting,
              rejectionCounts: {
                ...nextBoardMeeting.rejectionCounts,
                [proposerName]: (Number(nextBoardMeeting.rejectionCounts?.[proposerName]) || 0) + 1,
              },
            }
          }

          if (passed && choice.effect === 'championChange') {
            const { titleId, targetEmployeeId } = agenda.context.titleChange
            const targetEmployee = state.roster.employees.find((employee) => employee.employeeId === targetEmployeeId)
            const updatedTitles = state.roster.titles.map((title) => {
              if (title.titleId !== titleId || !targetEmployee) {
                return normalizeTitleRecord(title)
              }

              const currentHolderIds = normalizeTitleHolderIds(title)
              const holderHistory = Array.isArray(title.holderHistory) ? [...title.holderHistory] : []
              if (currentHolderIds.length > 0) {
                holderHistory.push({
                  holderEmployeeIds: currentHolderIds,
                  holders: currentHolderIds.map((employeeId) => {
                    const holder = state.roster.employees.find((employee) => employee.employeeId === employeeId)
                    return {
                      employeeId,
                      name: holder?.name || employeeId,
                      gender: holder?.gender || null,
                      imageUrl: holder?.imageUrl || null,
                    }
                  }),
                  startDay: Number(title.currentHolderStartDay || state.calendar.day),
                  endDay: state.calendar.day,
                  daysHeld: Math.max(1, state.calendar.day - Number(title.currentHolderStartDay || state.calendar.day) + 1),
                })
              }

              return normalizeTitleRecord({
                ...title,
                holderEmployeeId: targetEmployeeId,
                holderEmployeeIds: [],
                currentHolderStartDay: state.calendar.day,
                holderHistory: holderHistory.slice(-120),
              })
            })
            nextRoster = { ...state.roster, titles: updatedTitles }
          }

          if (electionResult) {
            const electionRecord = {
              day: state.calendar.day,
              userChoiceId: electionResult.userChoiceId,
              votes: electionResult.votes,
              rankedCandidates: electionResult.rankedCandidates,
              president: electionResult.president,
              vicePresident: electionResult.vicePresident,
            }
            nextBoardMeeting = {
              ...nextBoardMeeting,
              boardPresidentName: electionResult.president.person_name,
              boardVicePresidentName: electionResult.vicePresident.person_name,
              boardElectionHistory: [
                ...(nextBoardMeeting.boardElectionHistory || []),
                electionRecord,
              ].slice(-12),
            }
            effectMessageKey = 'boardElectionRecorded'
          }

          if (passed && choice.effect === 'releaseSponsor' && agenda.context?.sponsorToReview) {
            const sponsorId = agenda.context.sponsorToReview.sponsorId
            nextRoster = {
              ...state.roster,
              sponsors: state.roster.sponsors.filter((sponsor) => sponsor.sponsorId !== sponsorId),
            }
          }

          if (passed && choice.effect === 'wrestlerPush') {
            const target = agenda.context.wrestlerPush
            const nextEvent = state.events.bookedEvent
            const deadlineDay = Math.max(
              state.calendar.day + 1,
              Number(nextEvent?.scheduledDay) || state.calendar.day + 30,
            )
            nextBoardMeeting = {
              ...nextBoardMeeting,
              pendingMandates: [
                ...nextBoardMeeting.pendingMandates,
                {
                  id: `${currentMeeting.meetingId}-push-${target.employeeId}`,
                  type: 'wrestlerPush',
                  employeeId: target.employeeId,
                  employeeName: target.name,
                  targetAppearances: 1,
                  appearances: 0,
                  createdDay: state.calendar.day,
                  deadlineDay,
                  successRelationDelta: 6,
                  failureRelationDelta: -8,
                },
              ],
            }
          }

          if (passed && choice.effect === 'eventRatingMandate') {
            const targetEvent = agenda.context.upcomingEvent
            nextBoardMeeting = {
              ...nextBoardMeeting,
              pendingMandates: [
                ...nextBoardMeeting.pendingMandates,
                {
                  id: `${currentMeeting.meetingId}-rating-${targetEvent.eventId}`,
                  type: 'eventRating',
                  eventId: targetEvent.eventId,
                  eventName: targetEvent.name,
                  targetRating: agenda.context.targetRating,
                  targetDay: targetEvent.scheduledDay,
                  deadlineDay: targetEvent.scheduledDay,
                  createdDay: state.calendar.day,
                  successRelationDelta: 6,
                  failureRelationDelta: -8,
                },
              ],
            }
          }

          if (passed && choice.effect === 'financialRecovery') {
            const deadlineDay = getNextBoardMeetingDay({
              startDateIso: state.calendar.startDateIso,
              customEvents: state.events.customEvents,
              currentDay: state.calendar.day,
            })
            nextBoardMeeting = {
              ...nextBoardMeeting,
              pendingMandates: [
                ...nextBoardMeeting.pendingMandates,
                {
                  id: `${currentMeeting.meetingId}-recovery`,
                  type: 'financialRecovery',
                  createdDay: state.calendar.day,
                  deadlineDay,
                  successRelationDelta: 6,
                  failureRelationDelta: -8,
                },
              ],
            }
          }

          if (passed && choice.effect === 'extendMandates') {
            nextBoardMeeting = {
              ...nextBoardMeeting,
              pendingMandates: nextBoardMeeting.pendingMandates.map((mandate) => ({
                ...mandate,
                deadlineDay: Number(mandate.deadlineDay || state.calendar.day) + 14,
              })),
            }
          }

          if (passed && choice.effect === 'cancelMandates') {
            nextBoardMeeting = {
              ...nextBoardMeeting,
              pendingMandates: [],
            }
          }

          if (passed && choice.effect === 'costControls') {
            nextBoardMeeting = {
              ...nextBoardMeeting,
              costRelief: {
                amount: Math.max(250, Number(nextBoardMeeting.costRelief?.amount) || 0),
                throughDay: Math.max(
                  state.calendar.day + 30,
                  Number(nextBoardMeeting.costRelief?.throughDay) || 0,
                ),
              },
            }
          }

          if (passed && ['eventInvestment', 'marketingInvestment', 'competitorResponse'].includes(choice.effect)) {
            const fanGain = choice.effect === 'marketingInvestment'
              ? 300
              : choice.effect === 'eventInvestment'
                ? 150
                : 75
            const prestigeGain = choice.effect === 'competitorResponse' ? 1 : 0
            const entry = {
              id: `tx-${Date.now()}-board-decision`,
              day: state.calendar.day,
              type: 'expense',
              category: 'boardDecision',
              amount: cashCost,
              note: `${agenda.id} approved by the board`,
            }
            nextFinances = {
              ...state.finances,
              cash: state.finances.cash - cashCost,
              lastExpenses: state.finances.lastExpenses + cashCost,
              lastDelta: state.finances.lastDelta - cashCost,
              ledger: cashCost > 0 ? appendLedger(state.finances.ledger, entry) : state.finances.ledger,
            }
            nextStats = {
              ...state.stats,
              fans: Math.max(0, state.stats.fans + fanGain),
              prestige: Math.max(0, state.stats.prestige + prestigeGain),
            }
          }

          const decision = {
            agendaId,
            agendaTitleKey: agenda.titleKey,
            choiceId,
            proposerName: agenda.proposer?.person_name || '',
            passed,
            relationDelta,
            voteResult,
            electionResult,
            candidateId,
            effectMessageKey: passed ? effectMessageKey : 'motionRejected',
          }
          const nextAgendas = currentMeeting.agendas.map((item) => (
            item.id === agendaId
              ? { ...item, status: 'resolved', selectedChoiceId: choiceId, voteResult, passed }
              : item
          ))
          const isElectionResultPending = Boolean(electionResult)
          const currentAgendaIndex = isElectionResultPending
            ? currentMeeting.currentAgendaIndex
            : currentMeeting.currentAgendaIndex + 1
          nextMeeting = {
            ...currentMeeting,
            agendas: nextAgendas,
            currentAgendaIndex,
            decisions: [...currentMeeting.decisions, decision],
            lastDecision: decision,
            status: isElectionResultPending
              ? 'electionResult'
              : currentAgendaIndex >= nextAgendas.length
                ? 'readyToClose'
                : 'inProgress',
          }

          result = {
            ok: true,
            passed,
            voteResult,
            electionResult,
            candidateId,
            relationDelta,
            effectMessageKey: decision.effectMessageKey,
          }

          return {
            ...(nextRoster !== state.roster ? { roster: nextRoster } : {}),
            ...(nextFinances !== state.finances ? { finances: nextFinances } : {}),
            ...(nextStats !== state.stats ? { stats: nextStats } : {}),
            boardMeeting: {
              ...nextBoardMeeting,
              activeMeeting: nextMeeting,
            },
          }
        })

        return result
      },

      acknowledgeBoardElectionResult: () => {
        let result = { ok: false, reason: 'noElectionResult' }

        set((state) => {
          const boardMeeting = normalizeBoardMeetingState(state.boardMeeting)
          const activeMeeting = boardMeeting.activeMeeting
          const lastDecision = activeMeeting?.decisions?.at(-1)
          if (
            !activeMeeting
            || activeMeeting.status !== 'electionResult'
            || !lastDecision?.electionResult
          ) {
            return state
          }

          const currentAgendaIndex = activeMeeting.currentAgendaIndex + 1
          const status = currentAgendaIndex >= activeMeeting.agendas.length
            ? 'readyToClose'
            : 'inProgress'
          result = { ok: true, currentAgendaIndex, status }

          return {
            boardMeeting: {
              ...boardMeeting,
              activeMeeting: {
                ...activeMeeting,
                currentAgendaIndex,
                status,
              },
            },
          }
        })

        return result
      },

      finishBoardMeeting: () => {
        let result = { ok: false, reason: 'noActiveMeeting' }

        set((state) => {
          const boardMeeting = normalizeBoardMeetingState(state.boardMeeting)
          const activeMeeting = boardMeeting.activeMeeting
          if (!activeMeeting || activeMeeting.status !== 'readyToClose') {
            return state
          }

          const managerDismissed = rollBoardDismissal({ relation: boardMeeting.relation })
          const gameOverReason = managerDismissed ? 'board-relation' : null
          const meetingRecord = {
            ...activeMeeting,
            status: managerDismissed ? 'managerDismissed' : 'completed',
            finalRelation: boardMeeting.relation,
            completedDay: state.calendar.day,
            gameOverReason,
          }
          const nextBoardMeeting = {
            ...boardMeeting,
            managerDismissed,
            gameOverReason,
            activeMeeting: null,
            meetingHistory: [...boardMeeting.meetingHistory, meetingRecord].slice(-24),
          }
          result = { ok: true, managerDismissed, gameOverReason }

          return {
            boardMeeting: nextBoardMeeting,
            gameStatus: managerDismissed
              ? {
                  ...state.gameStatus,
                  isGameOver: true,
                  gameOverReason,
                }
              : state.gameStatus,
          }
        })

        return result
      },

      applyModDataPackage: (modPackage) => {
        const validation = validateModDataPackage(modPackage)
        if (!validation.ok) {
          return {
            ok: false,
            errors: validation.errors,
            warnings: validation.warnings,
          }
        }

        set((state) => {
          const modules = validation.data?.modules || {}
          const nextTitles = Array.isArray(modules.titles)
            ? modules.titles.map((title) => normalizeTitleRecord(title))
            : state.roster.titles
          const nextSponsorOffers = Array.isArray(modules.sponsorOffers)
            ? modules.sponsorOffers.map((offer, index) => normalizeSponsorOfferForMarket(offer, index))
            : state.market.sponsorOffers
          const nextEventTemplates = Array.isArray(modules.eventTemplates)
            ? modules.eventTemplates.map((template, index) => ({
                eventId: String(template?.eventId || `mod-event-${index}`),
                name: String(template?.name || `Mod Event ${index + 1}`),
                productionScale: Math.max(1, Math.min(10, Math.round(Number(template?.productionScale || 2)))),
                popularityWeight: Number(Math.max(0.2, Math.min(5, Number(template?.popularityWeight || 1))).toFixed(2)),
                setupCost: Math.max(0, Math.round(Number(template?.setupCost || 0))),
                hype: Math.max(0, Math.min(100, Math.round(Number(template?.hype || 70)))),
                risk: Math.max(0, Math.min(100, Math.round(Number(template?.risk || 20)))),
                templateKey: String(template?.templateKey || `${template?.eventId || 'event'}-${Date.now()}-${index}`),
              }))
            : state.market.eventTemplates

          return {
            roster: {
              ...state.roster,
              titles: nextTitles,
            },
            market: {
              ...state.market,
              sponsorOffers: nextSponsorOffers,
              eventTemplates: nextEventTemplates,
            },
          }
        })

        return {
          ok: true,
          warnings: validation.warnings,
          modules: Object.keys(validation.data?.modules || {}),
        }
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

      applyInterviewConsequences: ({ metrics = {}, forcedPreShow = false } = {}) => {
        let result = {
          fansDelta: 0,
          prestigeDelta: 0,
          sponsorTrustDeltaAverage: 0,
          score: 0,
        }

        set((state) => {
          const normalizedSponsors = normalizeSponsors(state.roster.sponsors)
          const score = Number(metrics.score || 0)
          const professionalism = Number(metrics.professionalism || 0)
          const hype = Number(metrics.hype || 0)
          const controversy = Number(metrics.controversy || 0)
          const answerCount = Math.max(1, Number(metrics.answerCount || 1))
          const forcedMultiplier = forcedPreShow ? 1.35 : 1

          const fansDelta = Math.round(((score * 18) + (hype * 4) + (professionalism * 2) - (controversy * 2)) * forcedMultiplier)
          const prestigeDelta = Math.round(((score / 2) + (professionalism / 3) + (hype / 4) - (controversy / 4)) * forcedMultiplier)

          const sponsorTrustChanges = []
          const nextSponsors = normalizedSponsors.map((sponsor) => {
            const baseDelta = Math.round((score / 2) + (professionalism / 5) + (hype / 7) - (controversy / 6))
            const fitDelta = getBrandFitTrustModifier(sponsor.brandFit, { professionalism, hype, controversy })
            const trustDelta = Math.max(-10, Math.min(10, baseDelta + fitDelta))
            const nextTrust = clampSponsorTrust((sponsor.trust ?? sponsor.reputation ?? 55) + trustDelta)

            sponsorTrustChanges.push(nextTrust - (sponsor.trust ?? sponsor.reputation ?? 55))

            return {
              ...sponsor,
              trust: nextTrust,
            }
          })

          const avgTrustDelta = sponsorTrustChanges.length > 0
            ? Number((sponsorTrustChanges.reduce((sum, value) => sum + value, 0) / sponsorTrustChanges.length).toFixed(1))
            : 0

          result = {
            fansDelta,
            prestigeDelta,
            sponsorTrustDeltaAverage: avgTrustDelta,
            score,
          }

          return {
            stats: {
              ...state.stats,
              fans: Math.max(0, state.stats.fans + fansDelta),
              prestige: Math.max(0, state.stats.prestige + prestigeDelta),
            },
            roster: {
              ...state.roster,
              sponsors: nextSponsors,
            },
            ai: {
              ...state.ai,
              lastInterviewImpact: {
                day: state.calendar.day,
                score,
                answerCount,
                fansDelta,
                prestigeDelta,
                sponsorTrustDeltaAverage: avgTrustDelta,
              },
            },
            finances: {
              ...state.finances,
              ledger: appendLedger(state.finances.ledger, {
                id: `tx-${Date.now()}-media-interview`,
                day: state.calendar.day,
                type: fansDelta + prestigeDelta >= 0 ? 'income' : 'expense',
                category: 'dailyClose',
                amount: Math.abs(fansDelta * 5 + prestigeDelta * 40),
                note: `Media interview impact | score ${score >= 0 ? `+${score}` : score}, fans ${fansDelta >= 0 ? `+${fansDelta}` : fansDelta}, prestige ${prestigeDelta >= 0 ? `+${prestigeDelta}` : prestigeDelta}, avg sponsor trust ${avgTrustDelta >= 0 ? `+${avgTrustDelta}` : avgTrustDelta}`,
              }),
            },
          }
        })

        return result
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
        let result = { ok: false, reason: 'unknown' }

        set((state) => {
          const offer = state.market.sponsorOffers.find((item) => item.offerId === offerId)
          if (!offer) {
            result = { ok: false, reason: 'notFound' }
            return state
          }

          const sponsorType = offer.sponsorType || DEFAULT_SPONSOR_TYPE
          const typeConfig = SPONSOR_TYPE_CONFIG[sponsorType]
          if (!typeConfig) {
            result = { ok: false, reason: 'invalidType' }
            return state
          }

          const normalizedSponsors = normalizeSponsors(state.roster.sponsors)
          const occupiedSlots = normalizedSponsors.filter((item) => item.sponsorType === sponsorType).length

          if (occupiedSlots >= typeConfig.maxActive) {
            result = { ok: false, reason: 'slotFull' }
            return state
          }

          const hasSponsorableUpcomingEvent = Boolean(
            state.events.bookedEvent && SPONSORABLE_EVENT_TYPES.includes(state.events.bookedEvent.type),
          )

          if (typeConfig.eventScoped && !hasSponsorableUpcomingEvent) {
            result = { ok: false, reason: 'eventBookingRequired' }
            return state
          }

          const signRestrictionReason = getSponsorSignRestrictionReason({
            offer,
            lastOutcome: state.events.lastOutcome,
          })

          if (signRestrictionReason) {
            result = { ok: false, reason: signRestrictionReason }
            return state
          }

          const contractWeeks = typeConfig.eventScoped ? null : Math.max(1, offer.contractWeeks || 1)
          const signedSponsor = normalizeSponsor({
            ...offer,
            sponsorType,
            contractWeeks,
            remainingDays: contractWeeks ? contractWeeks * 7 : null,
            trust: clampSponsorTrust(offer.trust, offer.reputation || 55),
          })

          result = { ok: true }

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

        return result
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
          const nextEmployees = [...state.roster.employees, hiredEmployee]
          const challengeProgress = progressOnboardingChallenge({
            challenge: state.onboardingChallenge,
            day: state.calendar.day,
            employees: nextEmployees,
            fans: state.stats.fans,
            successfulEventIncrement: 0,
          })

          hireResult = { ok: true, reason: null }

          const hirePrestigeDelta = (hiredEmployee.role === 'wrestler' && hiredEmployee.skill >= 82)
            ? Math.round((hiredEmployee.skill - 80) / 3)
            : 0

          return {
            roster: {
              ...state.roster,
              employees: nextEmployees,
            },
            market: {
              ...state.market,
              employeeCandidates: syncEmployeeCandidates({
                employees: nextEmployees,
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
            onboardingChallenge: challengeProgress.challenge,
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
          const remainingEmployees = state.roster.employees.filter((item) => item.employeeId !== employeeId)
          const remainingFactions = normalizeFactions(state.roster.factions, remainingEmployees)
          const firePrestigeDelta = (employee.role === 'wrestler' && (employee.skill || 0) >= 82)
            ? -Math.round(((employee.skill || 0) - 80) / 3)
            : 0

          return {
            roster: {
              ...state.roster,
              employees: remainingEmployees,
              factions: remainingFactions,
              backstageChemistry: normalizeBackstageChemistry(
                state.roster.backstageChemistry,
                remainingEmployees,
              ),
            },
            market: {
              ...state.market,
              employeeCandidates: syncEmployeeCandidates({
                employees: remainingEmployees,
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
            events: {
              ...state.events,
              factionRivalries: normalizeFactionRivalries(
                state.events.factionRivalries,
                remainingFactions,
              ),
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

      resolveEmployeeMoraleDemand: (employeeId, decision) => {
        const normalizedDecision = decision === 'approve' ? 'approve' : 'reject'
        let result = { ok: false, reason: 'unknown' }

        set((state) => {
          const employee = state.roster.employees.find((item) => item.employeeId === employeeId)
          if (!employee) {
            result = { ok: false, reason: 'notFound' }
            return state
          }

          const demand = employee.activeMoraleDemand
          if (!demand || typeof demand !== 'object') {
            result = { ok: false, reason: 'noDemand' }
            return state
          }

          const demandType = demand.demandType === 'titleShot' ? 'titleShot' : 'salaryRaise'
          const demandAmount = Math.max(0, Math.round(Number(demand.requestedAmount || 0)))

          if (normalizedDecision === 'approve' && demandType === 'salaryRaise' && state.finances.cash < demandAmount) {
            result = { ok: false, reason: 'insufficientCash' }
            return state
          }

          let cashDelta = 0
          let lastIncomeDelta = 0
          let lastExpenseDelta = 0
          let happinessDelta = 0
          let titlePromiseByDay = employee.promisedTitleShotByDay || null
          let nextContract = employee.contract
          let ledger = state.finances.ledger

          if (normalizedDecision === 'approve') {
            if (demandType === 'salaryRaise') {
              cashDelta -= demandAmount
              lastExpenseDelta += demandAmount
              happinessDelta = 12
              nextContract = {
                ...employee.contract,
                monthlySalary: Math.max(0, Math.round((employee.contract?.monthlySalary || 0) * 1.1)),
                perMatchSalary: Math.max(0, Math.round((employee.contract?.perMatchSalary || 0) * 1.08)),
              }
              ledger = appendLedger(ledger, {
                id: `tx-${Date.now()}-morale-demand-approve`,
                day: state.calendar.day,
                type: 'expense',
                category: 'employeeRetention',
                amount: demandAmount,
                note: `Approved salary raise demand for ${employee.name}`,
              })
            } else {
              happinessDelta = 9
              titlePromiseByDay = state.calendar.day + MORALE_TITLE_PROMISE_WINDOW_DAYS
            }
          } else {
            happinessDelta = -10
          }

          const nextHappiness = clampHappiness((employee.happiness ?? DEFAULT_HAPPINESS) + happinessDelta)
          result = {
            ok: true,
            decision: normalizedDecision,
            demandType,
            nextHappiness,
          }

          return {
            roster: {
              ...state.roster,
              employees: state.roster.employees.map((item) => {
                if (item.employeeId !== employeeId) {
                  return item
                }

                return {
                  ...item,
                  happiness: nextHappiness,
                  contract: nextContract,
                  activeMoraleDemand: null,
                  promisedTitleShotByDay: titlePromiseByDay,
                }
              }),
            },
            finances: {
              ...state.finances,
              cash: state.finances.cash + cashDelta,
              lastIncome: state.finances.lastIncome + lastIncomeDelta,
              lastExpenses: state.finances.lastExpenses + lastExpenseDelta,
              lastDelta: state.finances.lastDelta + cashDelta,
              ledger,
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
            eventPreparation: normalizeEventPreparation(data, state.progression?.unlocks),
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

      createFaction: ({ name, memberIds } = {}) => {
        const cleanName = String(name || '').trim()
        if (!cleanName) {
          return { ok: false, reason: 'nameRequired' }
        }

        const uniqueIds = Array.from(new Set(Array.isArray(memberIds) ? memberIds : []))
        if (uniqueIds.length < MIN_FACTION_MEMBERS || uniqueIds.length > MAX_FACTION_MEMBERS) {
          return { ok: false, reason: 'memberCount' }
        }

        let result = { ok: false, reason: 'unknown' }
        set((state) => {
          const employeesById = new Map(state.roster.employees.map((employee) => [employee.employeeId, employee]))
          if (uniqueIds.some((id) => !['wrestler', 'manager'].includes(employeesById.get(id)?.role))) {
            result = { ok: false, reason: 'invalidMember' }
            return state
          }

          const factions = normalizeFactions(state.roster.factions, state.roster.employees)
          if (factions.some((faction) => faction.memberIds.some((id) => uniqueIds.includes(id)))) {
            result = { ok: false, reason: 'memberAssigned' }
            return state
          }

          const faction = {
            factionId: `faction-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            name: cleanName,
            memberIds: uniqueIds,
            formedDay: state.calendar.day,
          }
          result = { ok: true, faction }

          return {
            roster: {
              ...state.roster,
              factions: [...factions, faction],
            },
          }
        })

        return result
      },

      updateFaction: (factionId, { name, memberIds } = {}) => {
        const cleanName = String(name || '').trim()
        if (!cleanName) {
          return { ok: false, reason: 'nameRequired' }
        }

        const uniqueIds = Array.from(new Set(Array.isArray(memberIds) ? memberIds : []))
        if (uniqueIds.length < MIN_FACTION_MEMBERS || uniqueIds.length > MAX_FACTION_MEMBERS) {
          return { ok: false, reason: 'memberCount' }
        }

        let result = { ok: false, reason: 'unknown' }
        set((state) => {
          const factions = normalizeFactions(state.roster.factions, state.roster.employees)
          if (!factions.some((faction) => faction.factionId === factionId)) {
            result = { ok: false, reason: 'notFound' }
            return state
          }

          const employeesById = new Map(state.roster.employees.map((employee) => [employee.employeeId, employee]))
          if (uniqueIds.some((id) => !['wrestler', 'manager'].includes(employeesById.get(id)?.role))) {
            result = { ok: false, reason: 'invalidMember' }
            return state
          }

          const otherFactions = factions.filter((faction) => faction.factionId !== factionId)
          if (otherFactions.some((faction) => faction.memberIds.some((id) => uniqueIds.includes(id)))) {
            result = { ok: false, reason: 'memberAssigned' }
            return state
          }

          const updatedFactions = factions.map((faction) => (
            faction.factionId === factionId
              ? { ...faction, name: cleanName, memberIds: uniqueIds }
              : faction
          ))
          result = { ok: true }

          return {
            roster: {
              ...state.roster,
              factions: updatedFactions,
            },
          }
        })

        return result
      },

      deleteFaction: (factionId) => {
        let removed = false
        set((state) => {
          const factions = state.roster.factions || []
          const nextFactions = factions.filter((faction) => faction.factionId !== factionId)
          removed = nextFactions.length !== factions.length
          if (!removed) {
            return state
          }

          return {
            roster: {
              ...state.roster,
              factions: nextFactions,
            },
            events: {
              ...state.events,
              factionRivalries: (state.events.factionRivalries || [])
                .filter((rivalry) => !rivalry.factionIds?.includes(factionId)),
            },
          }
        })

        return { ok: removed }
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
          if (state.gameStatus.isGameOver) {
            return state
          }

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
            ? normalizedSponsors.reduce((sum, sponsor) => {
                const trustFactor = getSponsorTrustFactor(sponsor.trust)
                return sum + (sponsor.eventMultiplier * trustFactor)
              }, 0)
            : 0
          const sponsorFanBoost = isSponsorableEventType
            ? normalizedSponsors.reduce((sum, sponsor) => {
                const trustFactor = getSponsorTrustFactor(sponsor.trust)
                return sum + (sponsor.fanBoost * trustFactor)
              }, 0)
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
          let nextRivalries = normalizeRivalries(state.events.rivalries)
          let fanGrowthThresholdForPostmortem = 7.5
          let setupBonusForPostmortem = { income: 0, fans: 0, prestige: 0 }
          let sponsorFanBoostForPostmortem = 0
          let sponsorEventBoostForPostmortem = 0
          let rivalryFanBoostForPostmortem = 0
          let audienceSegmentFanImpactForPostmortem = 0
          let rivalryPrestigeBoostForPostmortem = 0
          let competitorFanImpactForPostmortem = 0
          let competitorPrestigeImpactForPostmortem = 0
          let rivalryHighlightsForPostmortem = []
          let competitorHeadline = null
          let audienceSegmentsForOutcome = []
          let sponsorTrustReactionsForOutcome = []
          let departedSponsorsForOutcome = []
          let competitorWorldNewsForOutcome = []
          let competitorPoachedEmployeeId = null
          let competitorSignedCandidateId = null
          let competitorWorldFanImpactForOutcome = 0
          let competitorWorldPrestigeImpactForOutcome = 0
          let boardAttendanceForOutcome = null

          const eventSetupSegments = shouldRunEvent
            ? sanitizeEventSetup(
                eventSetup,
                nextActiveEmployees,
                productionWithSponsor.maxMatches,
                state.progression?.unlocks,
                state.roster?.factions,
              )
            : []
          const performanceApplied = applyDailyPerformanceChanges(nextActiveEmployees, eventSetupSegments)
          const nextActiveEmployeesWithPerformance = performanceApplied.employees
          configuredSegments = performanceApplied.configuredSegments || []

          // Apply event preparation promotion bonus/penalty
          const prepEventId = dueCustomEvent?.eventId || 'regular-weekly-event'
          const prep = state.events.eventPreparation
          const matchedPreparation = shouldRunEvent && prep?.eventId === prepEventId
            ? normalizeEventPreparation(prep, state.progression?.unlocks)
            : null
          const promoStyle = getCareerArcUnlockItem(
            'promoStyles',
            matchedPreparation?.promoStyleId || DEFAULT_CAREER_ARC_UNLOCKS.promoStyles[0],
          )
          const promoStyleRatingBonus = Number(promoStyle?.matchRatingBonus) || 0

          if (matchedPreparation) {
            const promotedIds = matchedPreparation.promotedWrestlerIds
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
                const promoBonus = (hasQualifier ? 0.5 : 0.2) + promoStyleRatingBonus
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

          const backstageUpdate = shouldRunEvent
            ? updateBackstageChemistry({
                chemistry: state.roster.backstageChemistry,
                factions: state.roster.factions,
                employees: nextActiveEmployeesWithPerformance,
                segments: configuredSegments,
              })
            : {
                chemistry: state.roster.backstageChemistry || {},
                segments: configuredSegments,
                employeeHappinessDeltas: {},
              }
          configuredSegments = backstageUpdate.segments.map((segment) => {
            if (
              !MATCH_SEGMENT_TYPES.has(segment.segmentType)
              || !Number(segment.chemistryRatingAdjustment)
            ) {
              return segment
            }

            const baseRating = Number.isFinite(Number(segment.matchRating))
              ? Number(segment.matchRating)
              : calculateMatchRating(
                  (segment.wrestlerIds || [])
                    .map((id) => nextActiveEmployeesWithPerformance.find((employee) => employee.employeeId === id))
                    .filter((employee) => employee?.role === 'wrestler'),
                )
            const nextRating = Math.max(
              1,
              Math.min(10, Number((baseRating + segment.chemistryRatingAdjustment).toFixed(1))),
            )

            return {
              ...segment,
              matchRating: nextRating,
              chemistryRatingAdjustment: Number((nextRating - baseRating).toFixed(1)),
            }
          })
          const factionStorylineOutcome = shouldRunEvent
            ? resolveFactionStorylines({
                factions: state.roster.factions,
                factionRivalries: state.events.factionRivalries,
                employees: nextActiveEmployeesWithPerformance,
                segments: configuredSegments,
                day: state.calendar.day,
              })
            : null
          let nextFactions = factionStorylineOutcome?.factions
            || normalizeFactions(state.roster.factions, nextActiveEmployeesWithPerformance)
          let nextFactionRivalries = factionStorylineOutcome?.factionRivalries
            || (state.events.factionRivalries || [])

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
                const promoSegmentBonus = segment.segmentType === 'promo'
                  ? getCareerArcUnlockItem('promoSegments', segment.promoSegmentId)
                  : null
                return {
                  income: totals.income + typeBonus.income + (Number(promoSegmentBonus?.incomeBonus) || 0),
                  fans: totals.fans + typeBonus.fans + (Number(promoSegmentBonus?.fanBonus) || 0),
                  prestige: totals.prestige + typeBonus.prestige,
                }
              },
              { income: 0, fans: 0, prestige: 0 },
            )
            setupBonusForPostmortem = setupBonus
            sponsorFanBoostForPostmortem = sponsorFanBoost
            sponsorEventBoostForPostmortem = sponsorEventBoost

            const rivalryOutcome = updateRivalriesAfterEvent({
              existingRivalries: state.events.rivalries,
              configuredSegments,
              employees: nextActiveEmployeesWithPerformance,
              day: nextCalendar.day,
            })
            nextRivalries = rivalryOutcome.rivalries
            const factionRivalryHeatScore = Number(factionStorylineOutcome?.rivalryHeatScore) || 0
            const rivalryHeatScore = Math.max(0, (rivalryOutcome.rivalryHeatScore || 0) + factionRivalryHeatScore)
            const rivalryFanBoost = Math.min(180, Math.round(rivalryHeatScore * 0.9))
            const rivalryPrestigeBoost = Math.min(4, Math.round(rivalryHeatScore / 35))
            rivalryFanBoostForPostmortem = rivalryFanBoost
            rivalryPrestigeBoostForPostmortem = rivalryPrestigeBoost
            rivalryHighlightsForPostmortem = rivalryOutcome.rivalryHighlights

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
            const audienceSegmentBreakdown = buildAudienceSegmentsBreakdown({
              eventType,
              audienceCount,
              configuredSegments,
              overallRating: null,
              hype: productionWithSponsor.hype,
              risk: productionWithSponsor.risk,
              rivalryHeatScore,
              sponsorFanBoost,
              ticketPrice,
            })
            audienceSegmentsForOutcome = audienceSegmentBreakdown.segments
            audienceSegmentFanImpactForPostmortem = audienceSegmentBreakdown.fanImpactTotal

            const baseEventGateIncome = Math.round(
              audienceCount * ticketPrice * (1 + sponsorEventBoost),
            )
            boardAttendanceForOutcome = getBoardEventAttendance({
              eventType,
              boardMembers: BOARD_MEMBERS,
              boardPresidentName: state.boardMeeting?.boardPresidentName || BOARD_CHAIR.person_name,
              boardVicePresidentName: state.boardMeeting?.boardVicePresidentName || BOARD_VICE_CHAIR.person_name,
              baseGateRevenue: baseEventGateIncome,
            })
            eventIncome = Math.round(
              baseEventGateIncome
              + (boardAttendanceForOutcome?.gateBonusAmount || 0)
              + setupBonus.income
              + audienceSegmentBreakdown.incomeAdjustment,
            )

            const baseFanDelta = Math.round(
              130 + productionWithSponsor.hype * 0.9 - productionWithSponsor.risk * 0.45
              + sponsorFanBoost + setupBonus.fans + setupParticipantCount + rivalryFanBoost
              + audienceSegmentBreakdown.fanImpactTotal + (Number(factionStorylineOutcome?.fanImpact) || 0),
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
            prestigeDelta = Math.round(calculatedPrestigeDelta / 5) + rivalryPrestigeBoost
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
            fanGrowthThresholdForPostmortem = fanGrowthThreshold
            const competitorPressure = runCompetitorPressure({
              overallRating,
              rivalryHeatScore,
              eventType,
              day: state.calendar.day,
            })
            competitorHeadline = competitorPressure
            competitorFanImpactForPostmortem = competitorPressure.fanImpact
            competitorPrestigeImpactForPostmortem = competitorPressure.prestigeImpact
            const fansShouldGrow = overallRating !== null && overallRating > fanGrowthThreshold
            const adjustedBaseFanDelta = baseFanDelta + competitorPressure.fanImpact
            fanDelta = fansShouldGrow ? Math.max(adjustedBaseFanDelta, 0) : -Math.max(adjustedBaseFanDelta, 0)
            prestigeDelta += competitorPressure.prestigeImpact
            lastOutcome = {
              type: 'success',
              eventId: productionWithSponsor.eventId,
              venueId: matchedPreparation?.venueId || null,
              promoStyleId: matchedPreparation?.promoStyleId || DEFAULT_CAREER_ARC_UNLOCKS.promoStyles[0],
              presentationId: matchedPreparation?.presentationId || DEFAULT_CAREER_ARC_UNLOCKS.presentations[0],
              scheduledDay: productionWithSponsor.scheduledDay,
              eventName: productionWithSponsor.name,
              eventType: productionWithSponsor.type,
              hype: productionWithSponsor.hype,
              risk: productionWithSponsor.risk,
              overallRating,
              audience: audienceCount,
              audienceSegments: audienceSegmentsForOutcome,
              boardAttendance: boardAttendanceForOutcome,
              income: eventIncome,
              fanDelta,
              prestigeDelta,
              competitorPressure,
              rivalryHeatScore,
              rivalryHighlights: rivalryHighlightsForPostmortem,
              factionStories: factionStorylineOutcome?.storyOutcomes || [],
              segments: configuredSegments.map((seg) => {
                const isTagTeamSeg = seg.matchType === 'tagTeam'
                const segWinnerTeamIds = Array.isArray(seg.winnerTeamIds) ? seg.winnerTeamIds : []
                const winnerName = isTagTeamSeg
                  ? segWinnerTeamIds.map((id) => nextActiveEmployeesWithPerformance.find((e) => e.employeeId === id)?.name).filter(Boolean).join(' & ') || null
                  : nextActiveEmployeesWithPerformance.find((e) => e.employeeId === seg.winnerEmployeeId)?.name || null
                return {
                  segmentType: seg.segmentType,
                  promoSegmentId: seg.segmentType === 'promo' ? seg.promoSegmentId : null,
                  storyBeat: seg.storyBeat || null,
                  sourceFactionId: seg.sourceFactionId || null,
                  targetFactionId: seg.targetFactionId || null,
                  betrayerId: seg.betrayerId || null,
                  matchType: seg.matchType || null,
                  participantIds: Array.isArray(seg.participantIds) ? seg.participantIds : [],
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
                  chemistryRatingAdjustment: Number(seg.chemistryRatingAdjustment) || 0,
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
                  promoSegmentId: segment.segmentType === 'promo' ? segment.promoSegmentId : null,
                  participants: segment.participantIds
                    .map((participantId) => nextActiveEmployeesWithPerformance.find((employee) => employee.employeeId === participantId)?.name)
                    .filter(Boolean),
                })),
              },
            }

            const sponsorEventProfile = getEventSponsorProfile(lastOutcome)
            const sponsorsWithEventReputation = normalizedSponsors.map((sponsor) => {
              const baseRatingDelta = Math.round((Number(lastOutcome.overallRating || 0) - 6) * 1.1)
              const baseSafetyDelta = Math.round((Number(sponsorEventProfile.brandSafetyScore || 0) - 55) / 16)
              const fitDelta = getEventBrandFitTrustModifier(sponsor.brandFit, sponsorEventProfile)
              const highTierPenalty = Number(sponsor.tier || 1) >= HIGH_TIER_SPONSOR_MIN_TIER
                && Number(sponsorEventProfile.brandSafetyScore || 0) < HIGH_TIER_BRAND_SAFETY_MIN
                ? -3
                : 0
              const trustDelta = Math.max(-10, Math.min(10, baseRatingDelta + baseSafetyDelta + fitDelta + highTierPenalty))
              const previousTrust = Number(sponsor.trust ?? sponsor.reputation ?? 55)
              const nextTrust = clampSponsorTrust(previousTrust + trustDelta)

              sponsorTrustReactionsForOutcome.push({
                sponsorId: sponsor.sponsorId,
                name: sponsor.name,
                trustDelta,
                previousTrust,
                nextTrust,
              })

              return {
                ...sponsor,
                trust: nextTrust,
              }
            })

            normalizedSponsors.splice(0, normalizedSponsors.length, ...sponsorsWithEventReputation)
          }

          const nextActiveEmployeesWithStats = shouldRunEvent
            ? applyMatchStats(nextActiveEmployeesWithPerformance, configuredSegments, state.calendar.day, productionWithSponsor.name)
            : nextActiveEmployeesWithPerformance
          const nextActiveEmployeesWithDecay = shouldRunEvent
            ? applyHeelFaceWeeklyDecay(nextActiveEmployeesWithStats)
            : nextActiveEmployeesWithStats

          const competitorWorldResult = runCompetitorWorldSimulation({
            day: nextCalendar.day,
            shouldRunEvent,
            lastOutcome,
            employees: nextActiveEmployeesWithDecay,
            marketCandidates: state.market.employeeCandidates,
          })
          competitorWorldNewsForOutcome = competitorWorldResult.newsItems
          competitorPoachedEmployeeId = competitorWorldResult.poachedEmployeeId
          competitorSignedCandidateId = competitorWorldResult.signedCandidateId
          competitorWorldFanImpactForOutcome = competitorWorldResult.fanImpact
          competitorWorldPrestigeImpactForOutcome = competitorWorldResult.prestigeImpact
          fanDelta += competitorWorldResult.fanImpact
          prestigeDelta += competitorWorldResult.prestigeImpact

          const competitorAdjustedEmployees = competitorPoachedEmployeeId
            ? nextActiveEmployeesWithDecay.filter((employee) => employee.employeeId !== competitorPoachedEmployeeId)
            : nextActiveEmployeesWithDecay
          const chemistryAdjustedEmployees = competitorAdjustedEmployees.map((employee) => {
            const happinessDelta = Number(backstageUpdate.employeeHappinessDeltas[employee.employeeId]) || 0
            if (!happinessDelta || !shouldTrackHappiness(employee.role)) {
              return employee
            }

            return {
              ...employee,
              happiness: clampHappiness((employee.happiness ?? DEFAULT_HAPPINESS) + happinessDelta),
            }
          })

          const nextTitlesBeforeHappiness = shouldRunEvent
            ? applyTitleMatchResults(state.roster.titles, configuredSegments, nextActiveEmployeesWithDecay, state.calendar.day)
            : state.roster.titles

          const happinessOutcome = applyHappinessAndDeparture({
            employees: chemistryAdjustedEmployees,
            prevTitles: state.roster.titles,
            nextTitles: nextTitlesBeforeHappiness,
            currentDay: state.calendar.day,
            existingHiringLocks: state.market.hiringLocks,
          })

          let nextActiveEmployeesFinal = happinessOutcome.employees
          nextFactions = normalizeFactions(nextFactions, nextActiveEmployeesFinal)
          nextFactionRivalries = normalizeFactionRivalries(nextFactionRivalries, nextFactions)
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
          const costReliefAmount = Number(state.boardMeeting?.costRelief?.throughDay) >= nextCalendar.day
            ? Math.max(0, Number(state.boardMeeting?.costRelief?.amount) || 0)
            : 0
          const operatingCost = Math.max(0, Math.round(
            GAME_CONFIG.economy.expense.operatingBase
            + state.stats.prestige * GAME_CONFIG.economy.expense.operatingPrestigeMultiplier,
          ) - costReliefAmount)
          const monthlySalaryPayments = getMonthlySalaryPaymentsDue(nextActiveEmployees, nextCalendar.day)
          const monthlyPayrollExpenses = monthlySalaryPayments.reduce((sum, payment) => sum + payment.amount, 0)
          const otherCost = Math.round(
            GAME_CONFIG.economy.expense.otherMin
            + Math.random() * (GAME_CONFIG.economy.expense.otherMax - GAME_CONFIG.economy.expense.otherMin),
          )

          const sponsorIncomeDailyValue = normalizedSponsors
            .filter((sponsor) => !sponsor.eventScoped)
            .reduce((sum, sponsor) => {
              const trustFactor = getSponsorTrustFactor(sponsor.trust)
              return sum + Math.round(sponsor.dailyPayout * trustFactor)
            }, 0)

          const income = sponsorIncomeDailyValue + eventIncome + merchandiseIncome + websiteSubscriptionIncome + thirdPartyIncome
          const expenses = perMatchSalaryExpenses + titleHolderMatchBonus + staffMatchExpenses
            + monthlyPayrollExpenses + eventCostExpense + operatingCost + otherCost
          const delta = income - expenses
          let nextCash = state.finances.cash + delta
          let nextFans = Math.max(0, state.stats.fans + fanDelta)
          let nextPrestige = Math.max(0, state.stats.prestige + prestigeDelta)
          const nextMorale = Math.max(0, Math.min(100, state.stats.morale + moraleDelta))
          const nextCustomEvents = state.events.customEvents
          let nextSponsors = normalizedSponsors.filter((sponsor) => {
            if (sponsor.eventScoped) {
              return !(shouldRunEvent && isSponsorableEventType)
            }

            if (Number(sponsor.tier || 1) >= HIGH_TIER_SPONSOR_MIN_TIER && Number(sponsor.trust || 0) <= SPONSOR_CRITICAL_TRUST_EXIT_THRESHOLD) {
              departedSponsorsForOutcome.push(sponsor.name)
              return false
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

          const onboardingProgress = progressOnboardingChallenge({
            challenge: state.onboardingChallenge,
            day: nextCalendar.day,
            employees: nextActiveEmployeesFinal,
            fans: nextFans,
            successfulEventIncrement: shouldRunEvent && lastOutcome?.type === 'success' ? 1 : 0,
            operatingCashFlowDelta: delta,
          })
          const nextOnboardingChallenge = onboardingProgress.challenge
          const boardMandateProgress = resolveBoardMandates(state.boardMeeting, {
            day: nextCalendar.day,
            eventOutcome: lastOutcome,
          })

          if (onboardingProgress.resolution === 'completed') {
            const challengeReward = nextOnboardingChallenge?.reward || {}
            nextCash += Number(challengeReward.cash || 0)
            nextPrestige = Math.max(0, nextPrestige + Number(challengeReward.prestige || 0))
          }

          if (onboardingProgress.resolution === 'failed') {
            const challengePenalty = nextOnboardingChallenge?.penalty || {}
            nextFans = Math.max(0, nextFans + Number(challengePenalty.fans || 0))
            nextPrestige = Math.max(0, nextPrestige + Number(challengePenalty.prestige || 0))
          }

          const progressionState = ensureProgressionShape(state.progression)
          let activeArc = progressionState.currentArc
          let progressionHistory = progressionState.history
          let progressionUnlocks = progressionState.unlocks
          const progressionStats = {
            fans: nextFans,
            prestige: nextPrestige,
          }

          if (!activeArc || activeArc.status !== 'active') {
            activeArc = buildCareerArc({
              startDay: nextCalendar.day,
              stats: progressionStats,
              finances: { cash: nextCash },
              unlocks: progressionUnlocks,
            })
          }

          const arcProgress = computeCareerArcProgress(activeArc, progressionStats, nextCash)
          const goalsMet = areCareerArcGoalsMet(activeArc, arcProgress)
          const arcExpired = nextCalendar.day > Number(activeArc.endDay || 0)

          if (goalsMet) {
            const reward = activeArc.reward || { cash: 0, prestige: 0, sponsorTrust: 0 }
            nextCash += Number(reward.cash || 0)
            nextPrestige = Math.max(0, nextPrestige + Number(reward.prestige || 0))
            progressionUnlocks = applyCareerArcUnlocks(
              progressionUnlocks,
              Array.isArray(reward.unlockables) ? reward.unlockables : [],
            )
            nextSponsors = nextSponsors.map((sponsor) => ({
              ...sponsor,
              trust: clampSponsorTrust((sponsor.trust ?? sponsor.reputation ?? 55) + Number(reward.sponsorTrust || 0)),
            }))

            progressionHistory = [
              {
                ...activeArc,
                status: 'completed',
                completedDay: nextCalendar.day,
                progress: arcProgress,
              },
              ...progressionHistory,
            ].slice(0, 16)

            activeArc = buildCareerArc({
              startDay: nextCalendar.day,
              stats: { fans: nextFans, prestige: nextPrestige },
              finances: { cash: nextCash },
              unlocks: progressionUnlocks,
            })
          } else if (arcExpired) {
            progressionHistory = [
              {
                ...activeArc,
                status: 'failed',
                completedDay: nextCalendar.day,
                progress: arcProgress,
              },
              ...progressionHistory,
            ].slice(0, 16)

            activeArc = buildCareerArc({
              startDay: nextCalendar.day,
              stats: { fans: nextFans, prestige: nextPrestige },
              finances: { cash: nextCash },
              unlocks: progressionUnlocks,
            })
          } else {
            activeArc = {
              ...activeArc,
              progress: arcProgress,
            }
          }

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
              monthlyPayroll: monthlyPayrollExpenses,
              staffCost: staffMatchExpenses,
              eventCost: eventCostExpense,
              operatingCost,
              otherCost,
            },
          }
          const timeline = [...state.history.timeline, nextHistoryEntry].slice(-45)

          // Patch lastOutcome with full day breakdown for event result summary
          if (lastOutcome) {
            const netOutcome = income - expenses
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
                monthlyPayroll: monthlyPayrollExpenses,
                staffCost: staffMatchExpenses,
                operatingCost,
                otherCost,
              },
              totalDayIncome: income,
              totalDayExpenses: expenses,
              postmortem: buildEventPostmortem({
                overallRating: lastOutcome.overallRating,
                fanGrowthThreshold: fanGrowthThresholdForPostmortem,
                setupBonus: setupBonusForPostmortem,
                sponsorFanBoost: sponsorFanBoostForPostmortem,
                sponsorEventBoost: sponsorEventBoostForPostmortem,
                rivalryFanBoost: rivalryFanBoostForPostmortem,
                audienceSegmentFanImpact: audienceSegmentFanImpactForPostmortem,
                competitorFanImpact: competitorFanImpactForPostmortem,
                rivalryPrestigeBoost: rivalryPrestigeBoostForPostmortem,
                competitorPrestigeImpact: competitorPrestigeImpactForPostmortem,
                fanDelta,
                prestigeDelta,
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
                  monthlyPayroll: monthlyPayrollExpenses,
                  staffCost: staffMatchExpenses,
                  operatingCost,
                  otherCost,
                },
                net: netOutcome,
              }),
              rivalryHighlights: rivalryHighlightsForPostmortem,
              competitorPressure: competitorHeadline,
              sponsorTrustReactions: sponsorTrustReactionsForOutcome,
              departedSponsors: departedSponsorsForOutcome,
              competitorWorldImpact: {
                fanImpact: competitorWorldFanImpactForOutcome,
                prestigeImpact: competitorWorldPrestigeImpactForOutcome,
              },
              competitorWorldNews: competitorWorldNewsForOutcome,
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

          monthlySalaryPayments.forEach(({ employee, amount }) => {
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${nextCalendar.day}-${employee.employeeId}-monthly-payroll`,
              day: nextCalendar.day,
              type: 'expense',
              category: 'monthlyPayroll',
              amount,
              note: `Monthly salary payment for ${employee.name}`,
            })
          })

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
            note: `Daily close | Income $${income.toLocaleString()} (event $${eventIncome.toLocaleString()}, merch $${merchandiseIncome.toLocaleString()}, web $${websiteSubscriptionIncome.toLocaleString()}) | Expenses $${expenses.toLocaleString()} (monthly payroll $${monthlyPayrollExpenses.toLocaleString()}, ops $${operatingCost.toLocaleString()}, other $${otherCost.toLocaleString()})`,
          })

          if (goalsMet) {
            const reward = progressionHistory[0]?.reward || activeArc.reward || {}
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-career-arc-reward`,
              day: nextCalendar.day,
              type: 'income',
              category: 'careerArcReward',
              amount: Math.max(0, Number(reward.cash || 0)),
              note: `Career arc completed (${progressionHistory[0]?.templateKey || 'arc'}) reward payout`,
            })
          }

          if (departedSponsorsForOutcome.length > 0) {
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-sponsor-churn`,
              day: nextCalendar.day,
              type: 'expense',
              category: 'sponsorChurn',
              amount: 0,
              note: `Sponsors exited after poor brand fit: ${departedSponsorsForOutcome.join(', ')}`,
            })
          }

          if (competitorPoachedEmployeeId) {
            const poachedEmployee = nextActiveEmployeesWithDecay.find((employee) => employee.employeeId === competitorPoachedEmployeeId)
            if (poachedEmployee) {
              nextLedger = appendLedger(nextLedger, {
                id: `tx-${Date.now()}-competitor-poach`,
                day: nextCalendar.day,
                type: 'expense',
                category: 'competitorPoach',
                amount: 0,
                note: `Competitor poached ${poachedEmployee.name}`,
              })
            }
          }

          if (onboardingProgress.resolution === 'completed') {
            const challengeReward = nextOnboardingChallenge?.reward || {}
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-onboarding-success`,
              day: nextCalendar.day,
              type: 'income',
              category: 'careerArcReward',
              amount: Math.max(0, Number(challengeReward.cash || 0)),
              note: 'Onboarding rescue challenge completed bonus',
            })
          }

          if (onboardingProgress.resolution === 'failed') {
            const challengePenalty = nextOnboardingChallenge?.penalty || {}
            nextLedger = appendLedger(nextLedger, {
              id: `tx-${Date.now()}-onboarding-failed`,
              day: nextCalendar.day,
              type: 'expense',
              category: 'employeeRetention',
              amount: 0,
              note: `Onboarding rescue challenge failed (fans ${Number(challengePenalty.fans || 0)}, prestige ${Number(challengePenalty.prestige || 0)})`,
            })
          }

          const competitorFeedEntries = [
            ...(lastOutcome?.competitorPressure
              ? [{ ...lastOutcome.competitorPressure, id: `competitor-pressure-${state.calendar.day}-${Date.now()}` }]
              : []),
            ...((lastOutcome?.competitorWorldNews || []).map((entry, idx) => ({
              ...entry,
              id: `competitor-world-${state.calendar.day}-${idx}-${Date.now()}`,
            }))),
          ]

          const nextCompetitorHeadlines = competitorFeedEntries.length > 0
            ? [...state.events.competitorHeadlines, ...competitorFeedEntries].slice(-80)
            : state.events.competitorHeadlines

          const syncedCandidates = syncEmployeeCandidates({
            employees: nextActiveEmployeesFinal,
            currentCandidates: state.market.employeeCandidates,
            currentDay: nextCalendar.day,
            hiringLocks: happinessOutcome.hiringLocks,
          })
          const nextEmployeeCandidates = competitorSignedCandidateId
            ? syncedCandidates.filter((candidate) => candidate.candidateId !== competitorSignedCandidateId)
            : syncedCandidates

          return {
            calendar: nextCalendar,
            events: {
              ...state.events,
              customEvents: nextCustomEvents,
              bookedEvent: buildBookedEventProjection(nextCalendar.day, nextCustomEvents, state.calendar.startDateIso),
              lastOutcome,
              rivalries: nextRivalries,
              factionRivalries: nextFactionRivalries,
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
              competitorHeadlines: nextCompetitorHeadlines,
              eventPreparation: (shouldRunEvent && prep?.eventId === prepEventId) ? null : state.events.eventPreparation,
            },
            history: {
              timeline,
            },
            progression: {
              currentArc: activeArc,
              history: progressionHistory,
              unlocks: progressionUnlocks,
            },
            boardMeeting: boardMandateProgress.boardState,
            onboardingChallenge: nextOnboardingChallenge,
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
              factions: nextFactions,
              backstageChemistry: backstageUpdate.chemistry,
            },
            market: {
              ...state.market,
              employeeCandidates: nextEmployeeCandidates,
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
        const restoredStartDateIso = resolveGameCalendarStartDate({
          configuredStartDateIso: GAME_CONFIG.startDateIso,
          persistedStartDateIso: typedPersistedState?.calendar?.startDateIso,
          fallbackStartDateIso: currentState.calendar.startDateIso,
        })
        const isConfiguredStartDate = Boolean(GAME_CONFIG.startDateIso)
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
        const normalizedPersistedProfile = {
          ...currentState.profile,
          ...(typedPersistedState?.profile || {}),
          ownerName: BOARD_CHAIR.person_name,
          generalManagerName: String(
            typedPersistedState?.profile?.playerName
            || currentState.profile.playerName
            || '',
          ),
          homeCountry: String(typedPersistedState?.profile?.homeCountry || 'UnitedStates'),
        }
        const persistedCustomEvents = Array.isArray(typedPersistedState?.events?.customEvents)
          ? typedPersistedState.events.customEvents
          : []
        const sanitizedPersistedCustomEvents = persistedCustomEvents
          .map((event) => {
            if (!EVENT_TYPE_CONFIG[event?.type] || event.type === 'regularWeekly') {
              return null
            }

            const fallbackScheduledWeek = Number(event?.scheduledWeek) || 1
            const storedScheduledDay = Number(event?.scheduledDay)
            const scheduledDay = isConfiguredStartDate && Number.isInteger(storedScheduledDay) && storedScheduledDay >= 1
              ? storedScheduledDay
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
            const specificDate = isConfiguredStartDate && Number.isInteger(scheduledDay) && scheduledDay >= 1
              ? toIsoDateLocal(getGameDateFromDay(restoredStartDateIso, scheduledDay))
              : persistedSpecificDate && !Number.isNaN(persistedSpecificDate.getTime())
                ? toIsoDateLocal(persistedSpecificDate)
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

          if (isConfiguredStartDate) {
            return {
              ...preloaded,
              imageUrl: event.imageUrl || preloaded.imageUrl || '',
            }
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
        const normalizedPersistedFactions = normalizeFactions(
          typedPersistedState?.roster?.factions,
          normalizedPersistedEmployees,
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
        const restoredProgression = ensureProgressionShape(
          typedPersistedState?.progression,
          { legacyVenueId: typedPersistedState?.events?.eventPreparation?.venueId },
        )
        const restoredBoardMeeting = normalizeBoardMeetingState(
          typedPersistedState?.boardMeeting,
          currentState.boardMeeting,
        )
        const restoredOnboardingChallenge = ensureOnboardingChallengeShape(
          typedPersistedState?.onboardingChallenge,
          typedPersistedState?.history?.timeline || [],
          restoredDay,
        )
        const mergedStats = {
          ...currentState.stats,
          ...(typedPersistedState?.stats || {}),
        }
        const mergedProgression = {
          ...restoredProgression,
          currentArc: restoredProgression.currentArc || (
            typedPersistedState?.gameStatus?.hasStarted
              ? buildCareerArc({
                  startDay: restoredDay,
                  stats: mergedStats,
                  finances: mergedFinances,
                  unlocks: restoredProgression.unlocks,
                })
              : null
          ),
        }

        return {
          ...currentState,
          ...typedPersistedState,
          gameStatus: {
            ...currentState.gameStatus,
            ...(typedPersistedState?.gameStatus || {}),
            isGameOver: Boolean(typedPersistedState?.gameStatus?.isGameOver),
            gameOverReason: typedPersistedState?.gameStatus?.gameOverReason || null,
          },
          profile: normalizedPersistedProfile,
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
            factions: normalizedPersistedFactions,
            backstageChemistry: normalizeBackstageChemistry(
              typedPersistedState?.roster?.backstageChemistry,
              normalizedPersistedEmployees,
            ),
          },
          events: {
            ...currentState.events,
            ...typedPersistedState?.events,
            regularWeeklyEvent: currentState.events.regularWeeklyEvent,
            customEvents: mergedCustomEvents,
            bookedEvent: buildBookedEventProjection(restoredDay, mergedCustomEvents, restoredStartDateIso),
            eventPreparation: normalizeEventPreparation(
              typedPersistedState?.events?.eventPreparation,
              restoredProgression.unlocks,
            ),
            rivalries: normalizeRivalries(typedPersistedState?.events?.rivalries || currentState.events.rivalries),
            factionRivalries: normalizeFactionRivalries(
              typedPersistedState?.events?.factionRivalries || currentState.events.factionRivalries,
              normalizedPersistedFactions,
            ),
            competitorHeadlines: Array.isArray(typedPersistedState?.events?.competitorHeadlines)
              ? typedPersistedState.events.competitorHeadlines.slice(-60)
              : currentState.events.competitorHeadlines,
          },
          ai: {
            ...currentState.ai,
            ...(typedPersistedState?.ai || {}),
            showEnableModal: Boolean(typedPersistedState?.ai?.showEnableModal),
            error: typedPersistedState?.ai?.status === 'error' ? String(typedPersistedState?.ai?.error || '') : '',
          },
          onboardingChallenge: restoredOnboardingChallenge,
          boardMeeting: restoredBoardMeeting,
          finances: mergedFinances,
          progression: mergedProgression,
          stats: mergedStats,
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
        progression: state.progression,
        onboardingChallenge: state.onboardingChallenge,
        boardMeeting: state.boardMeeting,
        stats: state.stats,
        ui: state.ui,
        ai: state.ai,
      }),
    },
  ),
)
