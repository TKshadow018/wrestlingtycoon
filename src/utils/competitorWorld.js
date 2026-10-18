import { generatePerson } from 'faker-user'
import { COMPETITOR_HEADLINE_KEYS } from './competitorNews'

const STRATEGY_ORDER = ['talentAcquisition', 'counterProgramming', 'audienceExpansion']
const POOL_SIZE = 100
const MIN_ROSTER_SIZE = 20
const MAX_ROSTER_SIZE = 30
const WEEKLY_CARD_MATCH_LIMIT = 10
const SOUTH_ASIAN_ARCHETYPES = ['technician', 'powerhouse', 'high-flyer', 'showstopper']
const VALID_COUNTRY_KEYS = new Set(['india', 'bangladesh', 'pakistan', 'nepal', 'sriLanka', 'afghanistan'])

const SOUTH_ASIAN_COUNTRIES = [
  { fakerCountry: 'India', countryKey: 'india' },
  { fakerCountry: 'Bangladesh', countryKey: 'bangladesh' },
  { fakerCountry: 'Pakistan', countryKey: 'pakistan' },
  { fakerCountry: 'Nepal', countryKey: 'nepal' },
  { fakerCountry: 'SriLanka', countryKey: 'sriLanka' },
  { fakerCountry: 'Afghanistan', countryKey: 'afghanistan' },
]

const COMPETITOR_SEEDS = [
  {
    id: 'comp-1',
    nameKey: 'dashboard.competitorIntel.rivals.titanRingFederation',
    aggression: 1.1,
    strategyId: 'talentAcquisition',
  },
  {
    id: 'comp-2',
    nameKey: 'dashboard.competitorIntel.rivals.primeGrappleAlliance',
    aggression: 0.95,
    strategyId: 'counterProgramming',
  },
  {
    id: 'comp-3',
    nameKey: 'dashboard.competitorIntel.rivals.globalSlamNetwork',
    aggression: 1.05,
    strategyId: 'audienceExpansion',
  },
]
const COMPETITOR_IDS = new Set(COMPETITOR_SEEDS.map(({ id }) => id))
const OBSOLETE_COMPETITOR_IDS = new Set(['comp-south-asia'])
const COMPETITOR_HEADLINE_VALUE_KEYS = {
  'dashboard.competitorIntel.news.talentSigning': ['wrestlerName'],
  'dashboard.competitorIntel.news.pressureSuccess': [],
  'dashboard.competitorIntel.news.pressureFailure': [],
  'dashboard.competitorIntel.news.gimmickPressure': [],
  'dashboard.competitorIntel.news.audienceExpansion': [],
  'dashboard.competitorIntel.news.employeePoached': ['wrestlerName'],
  'dashboard.competitorIntel.news.rivalEvent': ['eventNumber', 'matchCount'],
  'dashboard.competitorIntel.news.rivalWeeklyEvent': ['eventNumber', 'matchCount'],
  'dashboard.competitorIntel.news.strategyShift': ['strategyId'],
  'dashboard.competitorIntel.news.gimmickCopied': ['archetypeId', 'wrestlerName'],
  'dashboard.competitorIntel.news.legacy': [],
}

export const COMPETITOR_STRATEGY_CATALOG = [
  {
    id: 'talentAcquisition',
    candidateSigningChance: 0.5,
    counterProgramMultiplier: 1,
    audiencePressure: 0,
  },
  {
    id: 'counterProgramming',
    candidateSigningChance: 0.2,
    counterProgramMultiplier: 1.35,
    audiencePressure: 0,
  },
  {
    id: 'audienceExpansion',
    candidateSigningChance: 0.3,
    counterProgramMultiplier: 1,
    audiencePressure: 7,
  },
]

const VALID_STRATEGY_IDS = new Set(COMPETITOR_STRATEGY_CATALOG.map(({ id }) => id))
const getRivalTitleTranslationKey = (titleId) => {
  const id = String(titleId || '')
  if (id.endsWith('-world')) {
    return 'dashboard.competitorIntel.rivalTitles.world'
  }
  if (id.endsWith('-tag-team')) {
    return 'dashboard.competitorIntel.rivalTitles.tagTeam'
  }
  return 'dashboard.competitorIntel.rivalTitles.unknown'
}

const clampRating = (value, fallback = 50) => {
  const numeric = Number(value)
  return Math.max(0, Math.min(100, Number.isFinite(numeric) ? Math.round(numeric) : fallback))
}

const getWrestlerScore = (wrestler) => (
  Number(wrestler?.skill || 0) + Number(wrestler?.popularity || 0)
)

const getCountryKeyFromSavedData = (wrestler, index = 0) => {
  if (VALID_COUNTRY_KEYS.has(wrestler?.countryKey)) {
    return wrestler.countryKey
  }

  const legacyCountryKeys = {
    India: 'india',
    Bangladesh: 'bangladesh',
    Pakistan: 'pakistan',
    Nepal: 'nepal',
    SriLanka: 'sriLanka',
    'Sri Lanka': 'sriLanka',
    Afghanistan: 'afghanistan',
  }
  return legacyCountryKeys[wrestler?.country]
    || SOUTH_ASIAN_COUNTRIES[index % SOUTH_ASIAN_COUNTRIES.length].countryKey
}

const toRivalWrestler = (wrestler, index, fallbackId) => {
  if (!wrestler || typeof wrestler !== 'object') {
    return null
  }

  const { promotionId: savedPromotionId, ...languageNeutralWrestler } = wrestler
  delete languageNeutralWrestler.country
  const employeeId = String(wrestler.employeeId || wrestler.personId || fallbackId).trim()
  const name = String(wrestler.name || '').trim()
  if (!employeeId || !name) {
    return null
  }

  return {
    ...languageNeutralWrestler,
    ...(COMPETITOR_IDS.has(savedPromotionId) ? { promotionId: savedPromotionId } : {}),
    employeeId,
    personId: String(wrestler.personId || employeeId),
    name,
    role: 'wrestler',
    gender: wrestler.gender === 'female' ? 'female' : 'male',
    age: Math.max(18, Math.round(Number(wrestler.age) || 25)),
    countryKey: getCountryKeyFromSavedData(wrestler, index),
    popularity: clampRating(wrestler.popularity),
    skill: clampRating(wrestler.skill),
    archetypeId: String(wrestler.archetypeId || SOUTH_ASIAN_ARCHETYPES[index % SOUTH_ASIAN_ARCHETYPES.length]),
    wins: Math.max(0, Math.round(Number(wrestler.wins) || 0)),
    losses: Math.max(0, Math.round(Number(wrestler.losses) || 0)),
  }
}

const createGeneratedWrestler = (index, employeeId) => {
  const locale = SOUTH_ASIAN_COUNTRIES[index % SOUTH_ASIAN_COUNTRIES.length]
  let person
  try {
    person = generatePerson({
      country: locale.fakerCountry,
      gender: 'male',
      minAge: 21,
      maxAge: 38,
      custom: [
        { field: 'popularity', type: 'integer', min: 42, max: 90 },
        { field: 'skill', type: 'integer', min: 48, max: 95 },
      ],
    })
  } catch {
    // Use the fallback values below if profile generation fails.
  }

  return toRivalWrestler({
    employeeId,
    personId: employeeId,
    name: person?.name || employeeId,
    role: 'wrestler',
    gender: person?.gender || 'male',
    age: person?.age || 25,
    countryKey: locale.countryKey,
    popularity: person?.popularity,
    skill: person?.skill,
    archetypeId: SOUTH_ASIAN_ARCHETYPES[index % SOUTH_ASIAN_ARCHETYPES.length],
    wins: 0,
    losses: 0,
  }, index, employeeId)
}

const normalizeWrestlerPool = (wrestlerPool) => {
  const pool = []
  const seenIds = new Set()

  ;(Array.isArray(wrestlerPool) ? wrestlerPool : []).forEach((wrestler, index) => {
    const normalized = toRivalWrestler(wrestler, index, `south-asian-wrestler-${index + 1}`)
    if (!normalized || seenIds.has(normalized.employeeId) || pool.length >= POOL_SIZE) {
      return
    }
    seenIds.add(normalized.employeeId)
    pool.push(normalized)
  })

  for (let index = pool.length; index < POOL_SIZE; index += 1) {
    let employeeId = `south-asian-wrestler-${String(index + 1).padStart(3, '0')}`
    let suffix = 1
    while (seenIds.has(employeeId)) {
      employeeId = `south-asian-wrestler-${String(index + 1).padStart(3, '0')}-${suffix}`
      suffix += 1
    }
    pool.push(createGeneratedWrestler(index, employeeId))
    seenIds.add(employeeId)
  }

  return pool
}

const shuffle = (items) => {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

const randomInteger = (minimum, maximum) => (
  minimum + Math.floor(Math.random() * (maximum - minimum + 1))
)

const getRandomRosterAssignments = (companies, wrestlerPool) => {
  const shuffledPool = shuffle(wrestlerPool)
  let cursor = 0

  return companies.map((company, companyIndex) => {
    const companiesRemaining = companies.length - companyIndex - 1
    const maximumAvailable = shuffledPool.length - cursor - (companiesRemaining * MIN_ROSTER_SIZE)
    const rosterSize = randomInteger(MIN_ROSTER_SIZE, Math.min(MAX_ROSTER_SIZE, maximumAvailable))
    const rosterIds = shuffledPool
      .slice(cursor, cursor + rosterSize)
      .map(({ employeeId }) => employeeId)
    cursor += rosterSize
    return rosterIds
  })
}

const createInitialRivalChampions = (competitorId, roster) => {
  const ranked = [...roster].sort((left, right) => getWrestlerScore(right) - getWrestlerScore(left))
  const worldChampion = ranked[0]
  const tagTeamChampions = ranked.slice(1, 3)

  return [
    ...(worldChampion ? [{
      titleId: `${competitorId}-world`,
      titleKey: 'dashboard.competitorIntel.rivalTitles.world',
      championId: worldChampion.employeeId,
      championIds: [worldChampion.employeeId],
      championNames: [worldChampion.name],
      defenses: 0,
      lastDefendedDay: null,
    }] : []),
    ...(tagTeamChampions.length === 2 ? [{
      titleId: `${competitorId}-tag-team`,
      titleKey: 'dashboard.competitorIntel.rivalTitles.tagTeam',
      championId: tagTeamChampions[0].employeeId,
      championIds: tagTeamChampions.map(({ employeeId }) => employeeId),
      championNames: tagTeamChampions.map(({ name }) => name),
      defenses: 0,
      lastDefendedDay: null,
    }] : []),
  ]
}

const normalizeRivalChampions = (savedChampions, competitorId, roster) => {
  const defaults = createInitialRivalChampions(competitorId, roster)
  const rosterById = new Map(roster.map((wrestler) => [wrestler.employeeId, wrestler]))
  const savedByTitleId = new Map(
    (Array.isArray(savedChampions) ? savedChampions : [])
      .filter((champion) => typeof champion?.titleId === 'string')
      .map((champion) => [champion.titleId, champion]),
  )

  return defaults.map((defaultChampion) => {
    const saved = savedByTitleId.get(defaultChampion.titleId)
    if (!saved) {
      return defaultChampion
    }

    const savedIds = Array.isArray(saved.championIds) && saved.championIds.length > 0
      ? saved.championIds
      : [saved.championId].filter(Boolean)
    const championIds = Array.from(new Set(savedIds.map(String)))
      .filter((id) => rosterById.has(id))
    if (championIds.length !== defaultChampion.championIds.length) {
      return defaultChampion
    }

    return {
      ...defaultChampion,
      championId: championIds[0],
      championIds,
      championNames: championIds.map((id) => rosterById.get(id).name),
      defenses: Math.max(0, Math.round(Number(saved.defenses) || 0)),
      lastDefendedDay: Number.isInteger(Number(saved.lastDefendedDay))
        ? Number(saved.lastDefendedDay)
        : null,
    }
  })
}

const splitLegacyNameList = (names) => String(names || '').split(' & ').filter(Boolean)

const normalizeRivalMatch = (match, index, roster) => {
  const rosterById = new Map(roster.map((wrestler) => [wrestler.employeeId, wrestler]))
  const participantIds = (Array.isArray(match?.participantIds) ? match.participantIds : [])
    .map(String)
    .filter((id) => rosterById.has(id))
  const savedWinnerIds = Array.isArray(match?.winnerIds)
    ? match.winnerIds
    : [match?.winnerId].filter(Boolean)
  const winnerIds = savedWinnerIds.map(String).filter((id) => participantIds.includes(id))

  return {
    matchNumber: Math.max(1, Math.round(Number(match?.matchNumber) || index + 1)),
    matchType: match?.matchType === 'tagTeam' ? 'tagTeam' : 'singles',
    titleId: match?.titleId ? String(match.titleId) : null,
    titleKey: match?.titleId ? getRivalTitleTranslationKey(match.titleId) : null,
    participantIds,
    participantNames: participantIds.map((id) => rosterById.get(id).name),
    winnerIds,
    winnerId: winnerIds[0] || null,
    winnerNames: winnerIds.length > 0
      ? winnerIds.map((id) => rosterById.get(id).name)
      : splitLegacyNameList(match?.winnerName),
    matchRating: Math.max(1, Math.min(10, Number(match?.matchRating) || 5)),
  }
}

const normalizeRivalEvent = (event, roster) => {
  if (!event || typeof event !== 'object') {
    return null
  }

  const day = Math.max(1, Math.round(Number(event.day) || 1))
  const legacyEventNumber = String(event.eventName || '').match(/#(\d+)$/)?.[1]
  const matches = (Array.isArray(event.matches) ? event.matches : [])
    .map((match, index) => normalizeRivalMatch(match, index, roster))

  return {
    day,
    week: Math.max(1, Math.round(Number(event.week) || (Math.floor((day - 1) / 7) + 1))),
    eventNumber: Math.max(1, Math.round(Number(event.eventNumber || legacyEventNumber) || 1)),
    matchCount: matches.length,
    matches,
    championChanges: (Array.isArray(event.championChanges) ? event.championChanges : []).map((change) => ({
      titleKey: getRivalTitleTranslationKey(change?.titleId),
      previousChampionNames: Array.isArray(change?.previousChampionNames)
        ? change.previousChampionNames.map(String)
        : splitLegacyNameList(change?.previousChampionName),
      championNames: Array.isArray(change?.championNames)
        ? change.championNames.map(String)
        : splitLegacyNameList(change?.championName),
    })),
  }
}

const getNextRivalEventDay = (currentDay, lastEvent) => {
  const safeCurrentDay = Math.max(1, Math.floor(Number(currentDay) || 1))
  const latestCompletedDay = Math.max(safeCurrentDay, Math.floor(Number(lastEvent?.day) || 0))
  return (Math.floor(latestCompletedDay / 7) + 1) * 7
}

export const normalizeCompetitorHeadlines = (headlines) => (
  (Array.isArray(headlines) ? headlines : [])
    .filter((item) => item && typeof item === 'object' && !OBSOLETE_COMPETITOR_IDS.has(item.rivalId))
    .map((item) => {
      const languageNeutralItem = { ...item }
      delete languageNeutralItem.headline
      delete languageNeutralItem.rivalName
      delete languageNeutralItem.nameKey
      delete languageNeutralItem.rivalNameKey
      const headlineKey = COMPETITOR_HEADLINE_KEYS.has(item.headlineKey)
        ? item.headlineKey
        : 'dashboard.competitorIntel.news.legacy'
      const savedHeadlineValues = item.headlineValues && typeof item.headlineValues === 'object'
        ? item.headlineValues
        : {}
      const allowedValues = COMPETITOR_HEADLINE_VALUE_KEYS[headlineKey] || []
      const headlineValues = Object.fromEntries(allowedValues
        .filter((key) => ['string', 'number'].includes(typeof savedHeadlineValues[key]))
        .map((key) => [key, savedHeadlineValues[key]]))

      return {
        ...languageNeutralItem,
        headlineKey,
        headlineValues,
      }
    })
)

const toCopiedGimmick = (gimmick) => {
  const archetypeId = String(gimmick?.archetypeId || '').trim()
  const sourceWrestlerId = String(gimmick?.sourceWrestlerId || '').trim()
  if (!archetypeId || !sourceWrestlerId) {
    return null
  }

  return {
    archetypeId,
    sourceWrestlerId,
    sourceWrestlerName: String(gimmick?.sourceWrestlerName || sourceWrestlerId),
    copiedDay: Math.max(1, Math.round(Number(gimmick?.copiedDay) || 1)),
  }
}

export const createInitialCompetitorCompanies = () => COMPETITOR_SEEDS.map((company, index) => ({
  ...company,
  nextStrategyDay: 15 + (index * 7),
  lastStrategyChangeDay: null,
  copiedGimmicks: [],
  rosterIds: [],
  champions: [],
  nextEventDay: 7,
  eventsRun: 0,
  lastEvent: null,
  eventHistory: [],
}))

export const normalizeCompetitorCompanies = (companies, currentDay = 1) => {
  const savedById = new Map(
    (Array.isArray(companies) ? companies : [])
      .filter((company) => typeof company?.id === 'string' && !OBSOLETE_COMPETITOR_IDS.has(company.id))
      .map((company) => [company.id, company]),
  )
  const safeCurrentDay = Math.max(1, Math.floor(Number(currentDay) || 1))

  return COMPETITOR_SEEDS.map((seed, index) => {
    const saved = savedById.get(seed.id) || {}
    const strategyId = VALID_STRATEGY_IDS.has(saved.strategyId) ? saved.strategyId : seed.strategyId
    return {
      ...seed,
      nameKey: seed.nameKey,
      aggression: Math.max(0.5, Math.min(2, Number(saved.aggression) || seed.aggression)),
      strategyId,
      nextStrategyDay: Math.max(
        safeCurrentDay,
        Math.round(Number(saved.nextStrategyDay) || (15 + index * 7)),
      ),
      lastStrategyChangeDay: Number.isInteger(Number(saved.lastStrategyChangeDay))
        ? Number(saved.lastStrategyChangeDay)
        : null,
      copiedGimmicks: (Array.isArray(saved.copiedGimmicks) ? saved.copiedGimmicks : [])
        .map(toCopiedGimmick)
        .filter(Boolean),
      rosterIds: Array.isArray(saved.rosterIds)
        ? Array.from(new Set(saved.rosterIds.map(String)))
        : [],
      champions: Array.isArray(saved.champions) ? saved.champions : [],
      nextEventDay: Math.max(1, Math.round(Number(saved.nextEventDay) || 7)),
      eventsRun: Math.max(0, Math.round(Number(saved.eventsRun) || 0)),
      lastEvent: saved.lastEvent && typeof saved.lastEvent === 'object' ? saved.lastEvent : null,
      eventHistory: Array.isArray(saved.eventHistory) ? saved.eventHistory : [],
    }
  })
}

const isValidRosterAssignment = (rosterIdsByCompany, companies, wrestlerPool) => {
  const poolIds = new Set(wrestlerPool.map(({ employeeId }) => employeeId))
  const assignedIds = rosterIdsByCompany.flat()
  return rosterIdsByCompany.length === companies.length
    && rosterIdsByCompany.every((rosterIds) => (
      rosterIds.length >= MIN_ROSTER_SIZE
      && rosterIds.length <= MAX_ROSTER_SIZE
      && rosterIds.every((id) => poolIds.has(id))
    ))
    && new Set(assignedIds).size === assignedIds.length
}

const getSavedRosterAssignments = (companies, wrestlerPool) => {
  const savedAssignments = companies.map(({ rosterIds }) => rosterIds)
  if (isValidRosterAssignment(savedAssignments, companies, wrestlerPool)) {
    return savedAssignments
  }

  const assignmentsFromPool = companies.map((company) => wrestlerPool
    .filter((wrestler) => wrestler.promotionId === company.id)
    .map(({ employeeId }) => employeeId))
  return isValidRosterAssignment(assignmentsFromPool, companies, wrestlerPool)
    ? assignmentsFromPool
    : null
}

const applyRosterAssignments = (wrestlerPool, companies, rosterIdsByCompany) => {
  const assignmentByWrestlerId = new Map()
  companies.forEach((company, index) => {
    rosterIdsByCompany[index].forEach((employeeId) => assignmentByWrestlerId.set(employeeId, company.id))
  })

  const assignedPool = wrestlerPool.map((wrestler) => {
    const unassignedWrestler = { ...wrestler }
    delete unassignedWrestler.promotionId
    const promotionId = assignmentByWrestlerId.get(wrestler.employeeId)
    return promotionId ? { ...unassignedWrestler, promotionId } : unassignedWrestler
  })
  const wrestlerById = new Map(assignedPool.map((wrestler) => [wrestler.employeeId, wrestler]))
  const assignedCompanies = companies.map((company, index) => {
    const rosterIds = rosterIdsByCompany[index]
    const roster = rosterIds.map((id) => wrestlerById.get(id)).filter(Boolean)
    const champions = normalizeRivalChampions(company.champions, company.id, roster)
    const lastEvent = normalizeRivalEvent(company.lastEvent, roster)
    const eventHistory = (Array.isArray(company.eventHistory) ? company.eventHistory : [])
      .map((event) => normalizeRivalEvent(event, roster))
      .filter(Boolean)
      .slice(-8)

    return {
      ...company,
      rosterIds: roster.map(({ employeeId }) => employeeId),
      champions,
      nextEventDay: getNextRivalEventDay(Number(lastEvent?.day) || 1, lastEvent),
      eventsRun: Math.max(0, Math.round(Number(company.eventsRun) || 0)),
      lastEvent,
      eventHistory,
    }
  })

  return { companies: assignedCompanies, wrestlerPool: assignedPool }
}

export const createInitialCompetitorWorld = () => {
  const companies = createInitialCompetitorCompanies()
  const wrestlerPool = normalizeWrestlerPool([])
  const rosterIdsByCompany = getRandomRosterAssignments(companies, wrestlerPool)
  return applyRosterAssignments(wrestlerPool, companies, rosterIdsByCompany)
}

export const normalizeCompetitorWorld = (companies, wrestlerPool, currentDay = 1) => {
  const normalizedCompanies = normalizeCompetitorCompanies(companies, currentDay)
  const normalizedPool = normalizeWrestlerPool(wrestlerPool)
  const savedRosterAssignments = getSavedRosterAssignments(normalizedCompanies, normalizedPool)
  const rosterIdsByCompany = savedRosterAssignments
    || getRandomRosterAssignments(normalizedCompanies, normalizedPool)
  const world = applyRosterAssignments(normalizedPool, normalizedCompanies, rosterIdsByCompany)
  const safeCurrentDay = Math.max(1, Math.floor(Number(currentDay) || 1))

  return {
    ...world,
    companies: world.companies.map((company) => ({
      ...company,
      nextEventDay: getNextRivalEventDay(safeCurrentDay, company.lastEvent),
    })),
  }
}

const getSideScore = (side, rosterById) => side.reduce((total, id) => (
  total + getWrestlerScore(rosterById.get(id))
), 0)

const createMatchRating = (participantIds, rosterById) => {
  const averageAbility = participantIds.reduce((total, id) => {
    const wrestler = rosterById.get(id)
    return total + ((Number(wrestler?.skill || 0) + Number(wrestler?.popularity || 0)) / 2)
  }, 0) / Math.max(1, participantIds.length)

  return Math.max(3, Math.min(10, Number((4 + (averageAbility / 15)).toFixed(1))))
}

const simulateRivalWeeklyCard = (competitor, wrestlerById, eventDay) => {
  const roster = competitor.rosterIds.map((id) => wrestlerById.get(id)).filter(Boolean)
  const rosterIds = new Set(roster.map(({ employeeId }) => employeeId))
  let champions = competitor.champions.map((champion) => ({
    ...champion,
    championIds: [...champion.championIds],
    championNames: [...champion.championNames],
  }))
  const bookedIds = new Set()
  const matches = []
  const championChanges = []

  const addMatch = (sides, title = null) => {
    if (matches.length >= WEEKLY_CARD_MATCH_LIMIT || sides.some((side) => side.length === 0)) {
      return false
    }
    const participantIds = sides.flat()
    if (participantIds.some((id) => !rosterIds.has(id) || bookedIds.has(id))) {
      return false
    }

    const scores = sides.map((side) => getSideScore(side, wrestlerById) + (Math.random() * 16))
    const winnerSideIndex = scores[0] >= scores[1] ? 0 : 1
    const winnerIds = sides[winnerSideIndex]
    const loserIds = sides[1 - winnerSideIndex]
    const winnerNames = winnerIds.map((id) => wrestlerById.get(id).name)
    const loserNames = loserIds.map((id) => wrestlerById.get(id).name)
    participantIds.forEach((id) => bookedIds.add(id))
    winnerIds.forEach((id) => { wrestlerById.get(id).wins += 1 })
    loserIds.forEach((id) => { wrestlerById.get(id).losses += 1 })

    if (title) {
      const titleIndex = champions.findIndex((champion) => champion.titleId === title.titleId)
      if (titleIndex >= 0) {
        const currentChampionIds = champions[titleIndex].championIds
        const championsRetained = currentChampionIds.every((id) => winnerIds.includes(id))
        if (championsRetained) {
          champions[titleIndex] = {
            ...champions[titleIndex],
            defenses: champions[titleIndex].defenses + 1,
            lastDefendedDay: eventDay,
          }
        } else {
          const previousChampionNames = [...champions[titleIndex].championNames]
          champions[titleIndex] = {
            ...champions[titleIndex],
            championId: winnerIds[0],
            championIds: [...winnerIds],
            championNames: [...winnerNames],
            defenses: 0,
            lastDefendedDay: eventDay,
          }
          championChanges.push({
            titleId: title.titleId,
            titleKey: title.titleKey,
            previousChampionNames,
            championNames: winnerNames,
          })
        }
      }
    }

    matches.push({
      matchNumber: matches.length + 1,
      matchType: sides.every((side) => side.length === 2) ? 'tagTeam' : 'singles',
      titleId: title?.titleId || null,
      titleKey: title?.titleKey || null,
      participantIds,
      participantNames: participantIds.map((id) => wrestlerById.get(id).name),
      winnerIds: [...winnerIds],
      winnerId: winnerIds[0],
      winnerNames,
      loserNames,
      matchRating: createMatchRating(participantIds, wrestlerById),
    })
    return true
  }

  for (const title of [...champions]) {
    if (matches.length >= WEEKLY_CARD_MATCH_LIMIT) {
      break
    }
    const titleHolderIds = title.championIds.filter((id) => rosterIds.has(id))
    const otherTitleHolderIds = new Set(champions
      .filter((champion) => champion.titleId !== title.titleId)
      .flatMap(({ championIds }) => championIds))
    if (titleHolderIds.length === 1) {
      const challenger = roster
        .filter((wrestler) => (
          !bookedIds.has(wrestler.employeeId)
          && wrestler.employeeId !== titleHolderIds[0]
          && !otherTitleHolderIds.has(wrestler.employeeId)
        ))
        .sort((left, right) => getWrestlerScore(right) - getWrestlerScore(left))[0]
      if (challenger) {
        addMatch([[titleHolderIds[0]], [challenger.employeeId]], title)
      }
    } else if (titleHolderIds.length === 2) {
      const challengers = roster
        .filter((wrestler) => (
          !bookedIds.has(wrestler.employeeId)
          && !titleHolderIds.includes(wrestler.employeeId)
          && !otherTitleHolderIds.has(wrestler.employeeId)
        ))
        .sort((left, right) => getWrestlerScore(right) - getWrestlerScore(left))
        .slice(0, 2)
      if (challengers.length === 2 && titleHolderIds.every((id) => !bookedIds.has(id))) {
        addMatch([titleHolderIds, challengers.map(({ employeeId }) => employeeId)], title)
      }
    }
  }

  const remainingWrestlers = shuffle(roster.filter(({ employeeId }) => !bookedIds.has(employeeId)))
  for (let index = 0; index + 1 < remainingWrestlers.length && matches.length < WEEKLY_CARD_MATCH_LIMIT; index += 2) {
    addMatch([[remainingWrestlers[index].employeeId], [remainingWrestlers[index + 1].employeeId]])
  }

  const event = {
    day: eventDay,
    week: Math.floor((eventDay - 1) / 7) + 1,
    eventNumber: competitor.eventsRun + 1,
    matchCount: matches.length,
    matches,
    championChanges,
  }
  const nextCompany = {
    ...competitor,
    nextEventDay: eventDay + 7,
    eventsRun: competitor.eventsRun + 1,
    champions,
    lastEvent: event,
    eventHistory: [...competitor.eventHistory, event].slice(-8),
  }

  return {
    company: nextCompany,
    newsItem: {
      rivalId: competitor.id,
      day: eventDay,
      type: 'rivalWeeklyEvent',
      strategyId: competitor.strategyId,
      matchCount: matches.length,
      fanImpact: 0,
      prestigeImpact: 0,
      headlineKey: 'dashboard.competitorIntel.news.rivalWeeklyEvent',
      headlineValues: { eventNumber: event.eventNumber, matchCount: matches.length },
    },
  }
}

export const simulateWeeklyCompetitorEvents = (companies, wrestlerPool, day) => {
  if (!Number.isInteger(day) || day < 1) {
    throw new Error('A valid game day is required to simulate competitor events')
  }

  const world = normalizeCompetitorWorld(companies, wrestlerPool, day)
  if (day % 7 !== 0) {
    return { ...world, newsItems: [] }
  }

  const nextPool = world.wrestlerPool.map((wrestler) => ({ ...wrestler }))
  const wrestlerById = new Map(nextPool.map((wrestler) => [wrestler.employeeId, wrestler]))
  const newsItems = []
  const nextCompanies = world.companies.map((company) => {
    if (company.lastEvent?.day === day) {
      return company
    }
    const { company: simulatedCompany, newsItem } = simulateRivalWeeklyCard(company, wrestlerById, day)
    newsItems.push(newsItem)
    return simulatedCompany
  })

  return {
    companies: nextCompanies,
    wrestlerPool: nextPool,
    newsItems,
  }
}

export const getCompetitorStrategyModifiers = (strategyId, copiedGimmickCount = 0) => {
  const strategy = COMPETITOR_STRATEGY_CATALOG.find((item) => item.id === strategyId)
    || COMPETITOR_STRATEGY_CATALOG[0]
  return {
    ...strategy,
    gimmickCopyPressure: Math.min(8, Math.max(0, Math.round(Number(copiedGimmickCount) || 0)) * 2),
  }
}

export const advanceCompetitorStrategies = (companies, day) => {
  if (!Number.isInteger(day) || day < 1) {
    throw new Error('A valid game day is required to advance competitor strategies')
  }

  const newsItems = []
  const nextCompanies = normalizeCompetitorCompanies(companies, day).map((company) => {
    if (day < company.nextStrategyDay) {
      return company
    }

    const currentIndex = Math.max(0, STRATEGY_ORDER.indexOf(company.strategyId))
    const strategyId = STRATEGY_ORDER[(currentIndex + 1) % STRATEGY_ORDER.length]
    const nextStrategyDay = company.nextStrategyDay + 28
    newsItems.push({
      rivalId: company.id,
      day,
      type: 'strategyShift',
      strategyId,
      headlineKey: 'dashboard.competitorIntel.news.strategyShift',
      headlineValues: { strategyId },
      fanImpact: 0,
      prestigeImpact: 0,
    })

    return {
      ...company,
      strategyId,
      lastStrategyChangeDay: day,
      nextStrategyDay,
    }
  })

  return { companies: nextCompanies, newsItems }
}

export const applyCompetitorGimmickCopy = (companies, {
  competitorId,
  archetype,
  wrestler,
  day,
} = {}) => {
  const normalized = normalizeCompetitorCompanies(companies)
  const competitor = normalized.find((company) => company.id === competitorId)
  const archetypeId = String(archetype?.archetypeId || '').trim()
  const sourceWrestlerId = String(wrestler?.employeeId || '').trim()

  if (!competitor || !archetypeId || !sourceWrestlerId) {
    return { companies: normalized, newsItem: null }
  }
  if (competitor.copiedGimmicks.some((entry) => entry.archetypeId === archetypeId)) {
    return { companies: normalized, newsItem: null }
  }

  const copiedGimmick = {
    archetypeId,
    sourceWrestlerId,
    sourceWrestlerName: String(wrestler.name || sourceWrestlerId),
    copiedDay: day,
  }
  const nextCompanies = normalized.map((company) => (
    company.id === competitorId
      ? { ...company, copiedGimmicks: [...company.copiedGimmicks, copiedGimmick] }
      : company
  ))

  return {
    companies: nextCompanies,
    newsItem: {
      rivalId: competitor.id,
      day,
      type: 'gimmickCopy',
      copiedArchetypeId: archetypeId,
      sourceWrestlerId,
      sourceWrestlerName: String(wrestler.name || sourceWrestlerId),
      fanImpact: 0,
      prestigeImpact: 0,
      headlineKey: 'dashboard.competitorIntel.news.gimmickCopied',
      headlineValues: {
        archetypeId,
        wrestlerName: String(wrestler.name || sourceWrestlerId),
      },
    },
  }
}
