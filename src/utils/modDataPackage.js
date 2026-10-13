import {
  DEFAULT_WRESTLER_ARCHETYPES,
  normalizeWrestlerArchetypes,
} from '../data/wrestlerArchetypes'

const MOD_PACKAGE_TYPE = 'wrestling-tycoon-mod-package'
const MOD_PACKAGE_VERSION = 1

const ALLOWED_TITLE_DIVISIONS = new Set(['singles', 'doubles'])
const ALLOWED_SPONSOR_TYPES = new Set([
  'title',
  'ring',
  'eventMain',
  'eventMinor',
  'dress',
  'asset',
  'digital',
  'experience',
  'media',
])
const ALLOWED_ARCHETYPE_ALIGNMENTS = new Set(['face', 'heel', 'tweener', 'neutral'])
const WRESTLING_ABILITY_FIELDS = [
  'strength',
  'technics',
  'high_fly_ability',
  'leg_stamina',
  'body_stamina',
  'head_stamina',
]

const toSafeString = (value, fallback = '') => {
  const normalized = String(value ?? fallback).trim()
  return normalized
}

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const clampPercent = (value, fallback = 50) => Math.round(clamp(toNumber(value, fallback), 0, 100))

const normalizeWrestlerArchetypeEntry = (entry, index) => {
  const archetypeId = toSafeString(entry?.archetypeId || `mod-archetype-${index + 1}`)
  const name = toSafeString(entry?.name)
  if (!name) {
    return null
  }

  return {
    archetypeId,
    name,
    description: toSafeString(entry?.description),
    alignment: ALLOWED_ARCHETYPE_ALIGNMENTS.has(entry?.alignment) ? entry.alignment : 'neutral',
    style: toSafeString(entry?.style || 'showman'),
  }
}

const normalizeWrestlerRosterEntry = (entry, index, validArchetypeIds) => {
  const personId = toSafeString(entry?.personId || entry?.id || `mod-wrestler-${index + 1}`)
  const name = toSafeString(entry?.name || entry?.ring_name)
  if (!name || (entry?.role && entry.role !== 'wrestler')) {
    return null
  }

  const ability = entry?.wrestling_ability && typeof entry.wrestling_ability === 'object'
    ? entry.wrestling_ability
    : {}
  const salaryDemand = entry?.salary_demand && typeof entry.salary_demand === 'object'
    ? entry.salary_demand
    : {}
  const archetypeId = validArchetypeIds.has(entry?.archetypeId) ? entry.archetypeId : 'showstopper'

  return {
    id: personId,
    personId,
    name,
    ring_name: toSafeString(entry?.ring_name || name),
    role: 'wrestler',
    gender: entry?.gender === 'female' ? 'female' : 'male',
    country: toSafeString(entry?.country || 'modded'),
    image_url: toSafeString(entry?.image_url),
    popularity: clampPercent(entry?.popularity),
    has_money_amount: Math.round(Math.max(0, toNumber(entry?.has_money_amount, 0))),
    archetypeId,
    salary_demand: {
      monthly_wage: Math.round(Math.max(0, toNumber(salaryDemand.monthly_wage, entry?.salary))),
      per_match_salary: Math.round(Math.max(0, toNumber(salaryDemand.per_match_salary, 0))),
      additional_bonus: Math.round(Math.max(0, toNumber(salaryDemand.additional_bonus, 0))),
    },
    wrestling_ability: Object.fromEntries(
      WRESTLING_ABILITY_FIELDS.map((field) => [field, clampPercent(ability[field])]),
    ),
    signature_moves: Array.isArray(entry?.signature_moves)
      ? entry.signature_moves.filter((move) => typeof move === 'string' && move.trim()).slice(0, 8)
      : [],
    finisher_moves: Array.isArray(entry?.finisher_moves)
      ? entry.finisher_moves.filter((move) => typeof move === 'string' && move.trim()).slice(0, 4)
      : [],
  }
}

const normalizeVenueEntry = (entry, index) => {
  const id = toSafeString(entry?.id || `mod-venue-${index + 1}`)
  const name = toSafeString(entry?.name)
  if (!name) {
    return null
  }

  return {
    id,
    name,
    location: toSafeString(entry?.location || 'Unknown'),
    capacity: Math.round(clamp(toNumber(entry?.capacity, 1000), 100, 200000)),
    rentFee: Math.round(Math.max(0, toNumber(entry?.rentFee, 0))),
    facilities: Math.round(clamp(toNumber(entry?.facilities, 1), 1, 5)),
    isIndoor: Boolean(entry?.isIndoor),
  }
}

const normalizeTitleEntry = (entry, index) => {
  const titleId = toSafeString(entry?.titleId || `mod-title-${index + 1}`)
  const name = toSafeString(entry?.name)
  if (!name) {
    return null
  }

  const division = ALLOWED_TITLE_DIVISIONS.has(entry?.division)
    ? entry.division
    : 'singles'

  const holderEmployeeIds = Array.isArray(entry?.holderEmployeeIds)
    ? entry.holderEmployeeIds.filter((id) => typeof id === 'string').slice(0, 2)
    : []

  const holderEmployeeId = typeof entry?.holderEmployeeId === 'string'
    ? entry.holderEmployeeId
    : (holderEmployeeIds[0] || null)

  return {
    titleId,
    name,
    division,
    image: toSafeString(entry?.image || '/Belt/world.png'),
    isActive: Boolean(entry?.isActive),
    holderEmployeeId,
    holderEmployeeIds: division === 'doubles' ? holderEmployeeIds : [],
    prestige: Math.round(clamp(toNumber(entry?.prestige, 50), 0, 1000)),
    isWomenOnly: Boolean(entry?.isWomenOnly),
  }
}

const normalizeSponsorOfferEntry = (entry, index, now) => {
  const sponsorId = toSafeString(entry?.sponsorId || `mod-sponsor-${index + 1}`)
  const name = toSafeString(entry?.name)
  if (!name) {
    return null
  }

  const sponsorType = ALLOWED_SPONSOR_TYPES.has(entry?.sponsorType)
    ? entry.sponsorType
    : 'digital'

  return {
    offerId: toSafeString(entry?.offerId || `mod-offer-${sponsorId}-${now}-${index}`),
    sponsorId,
    name,
    sponsorType,
    reputation: Math.round(clamp(toNumber(entry?.reputation, 50), 0, 100)),
    marketRegion: toSafeString(entry?.marketRegion || 'Global'),
    brandFit: toSafeString(entry?.brandFit || 'Lifestyle'),
    tier: Math.round(clamp(toNumber(entry?.tier, 1), 1, 7)),
    dailyPayout: Math.round(Math.max(0, toNumber(entry?.dailyPayout, 0))),
    signingBonus: Math.round(Math.max(0, toNumber(entry?.signingBonus, 0))),
    eventMultiplier: Number(clamp(toNumber(entry?.eventMultiplier, 0), 0, 3).toFixed(2)),
    fanBoost: Math.round(Math.max(0, toNumber(entry?.fanBoost, 0))),
    trust: Math.round(clamp(toNumber(entry?.trust, 55), 0, 100)),
    contractWeeks: entry?.contractWeeks == null
      ? null
      : Math.max(1, Math.round(toNumber(entry.contractWeeks, 1))),
  }
}

const normalizeEventTemplateEntry = (entry, index, now) => {
  const eventId = toSafeString(entry?.eventId || `mod-event-${index + 1}`)
  const name = toSafeString(entry?.name)
  if (!name) {
    return null
  }

  return {
    eventId,
    name,
    productionScale: Math.round(clamp(toNumber(entry?.productionScale, 2), 1, 10)),
    popularityWeight: Number(clamp(toNumber(entry?.popularityWeight, 1), 0.2, 5).toFixed(2)),
    setupCost: Math.round(Math.max(0, toNumber(entry?.setupCost, 0))),
    hype: Math.round(clamp(toNumber(entry?.hype, 70), 0, 100)),
    risk: Math.round(clamp(toNumber(entry?.risk, 20), 0, 100)),
    templateKey: toSafeString(entry?.templateKey || `${eventId}-${now}-${index}`),
  }
}

const dedupeBy = (list, key) => {
  const seen = new Set()
  return list.filter((item) => {
    const value = item?.[key]
    if (!value || seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

const normalizeModuleArray = ({
  items,
  name,
  normalize,
  key,
  warnings,
  errors,
  allowEmpty = false,
}) => {
  if (items == null) {
    return null
  }

  if (!Array.isArray(items)) {
    errors.push(`${name} must be an array.`)
    return null
  }

  const normalized = items
    .map((entry, index) => normalize(entry, index))
    .filter(Boolean)

  if (normalized.length !== items.length) {
    warnings.push(`${name}: skipped ${items.length - normalized.length} invalid entries.`)
  }

  const deduped = dedupeBy(normalized, key)
  if (deduped.length !== normalized.length) {
    warnings.push(`${name}: removed ${normalized.length - deduped.length} duplicate entries by ${key}.`)
  }

  if (deduped.length === 0 && !allowEmpty) {
    errors.push(`${name} has no valid entries.`)
    return null
  }

  return deduped
}

export const buildModDataPackageFromState = (state) => {
  const now = Date.now()
  const archetypes = normalizeWrestlerArchetypes(
    state?.market?.wrestlerArchetypes || DEFAULT_WRESTLER_ARCHETYPES,
  )
  const validArchetypeIds = new Set(archetypes.map((archetype) => archetype.archetypeId))

  return {
    type: MOD_PACKAGE_TYPE,
    version: MOD_PACKAGE_VERSION,
    createdAt: now,
    modules: {
      titles: (state?.roster?.titles || [])
        .map((title, index) => normalizeTitleEntry(title, index))
        .filter(Boolean),
      sponsorOffers: (state?.market?.sponsorOffers || [])
        .map((offer, index) => normalizeSponsorOfferEntry(offer, index, now))
        .filter(Boolean),
      eventTemplates: (state?.market?.eventTemplates || [])
        .map((eventTemplate, index) => normalizeEventTemplateEntry(eventTemplate, index, now))
        .filter(Boolean),
      wrestlerArchetypes: archetypes.map(normalizeWrestlerArchetypeEntry).filter(Boolean),
      rosterData: (state?.market?.modWrestlers || [])
        .map((wrestler, index) => normalizeWrestlerRosterEntry(wrestler, index, validArchetypeIds))
        .filter(Boolean),
      venues: (state?.market?.modVenues || []).map(normalizeVenueEntry).filter(Boolean),
    },
  }
}

export const validateModDataPackage = (payload) => {
  const errors = []
  const warnings = []

  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      errors: ['Package must be a JSON object.'],
      warnings,
      data: null,
    }
  }

  const modules = payload.modules
  if (!modules || typeof modules !== 'object') {
    return {
      ok: false,
      errors: ['Package must include a modules object.'],
      warnings,
      data: null,
    }
  }

  const now = Date.now()

  const titles = normalizeModuleArray({
    items: modules.titles,
    name: 'titles',
    normalize: normalizeTitleEntry,
    key: 'titleId',
    warnings,
    errors,
  })

  const sponsorOffers = normalizeModuleArray({
    items: modules.sponsorOffers,
    name: 'sponsorOffers',
    normalize: (entry, index) => normalizeSponsorOfferEntry(entry, index, now),
    key: 'offerId',
    warnings,
    errors,
  })

  const eventTemplates = normalizeModuleArray({
    items: modules.eventTemplates,
    name: 'eventTemplates',
    normalize: (entry, index) => normalizeEventTemplateEntry(entry, index, now),
    key: 'templateKey',
    warnings,
    errors,
  })

  const wrestlerArchetypes = normalizeModuleArray({
    items: modules.wrestlerArchetypes,
    name: 'wrestlerArchetypes',
    normalize: normalizeWrestlerArchetypeEntry,
    key: 'archetypeId',
    warnings,
    errors,
    allowEmpty: true,
  })
  const archetypeCatalog = normalizeWrestlerArchetypes([
    ...DEFAULT_WRESTLER_ARCHETYPES,
    ...(wrestlerArchetypes || []),
  ])
  const validArchetypeIds = new Set(archetypeCatalog.map((archetype) => archetype.archetypeId))
  const rosterData = normalizeModuleArray({
    items: modules.rosterData,
    name: 'rosterData',
    normalize: (entry, index) => normalizeWrestlerRosterEntry(entry, index, validArchetypeIds),
    key: 'personId',
    warnings,
    errors,
    allowEmpty: true,
  })
  const venues = normalizeModuleArray({
    items: modules.venues,
    name: 'venues',
    normalize: normalizeVenueEntry,
    key: 'id',
    warnings,
    errors,
    allowEmpty: true,
  })

  const normalizedModules = {
    ...(titles ? { titles } : {}),
    ...(sponsorOffers ? { sponsorOffers } : {}),
    ...(eventTemplates ? { eventTemplates } : {}),
    ...(wrestlerArchetypes ? { wrestlerArchetypes } : {}),
    ...(rosterData ? { rosterData } : {}),
    ...(venues ? { venues } : {}),
  }

  const hasValidModuleEntries = Object.values(normalizedModules).some(
    (items) => Array.isArray(items) && items.length > 0,
  )
  if (!hasValidModuleEntries) {
    errors.push('No valid modules found. Include at least one of: titles, sponsorOffers, eventTemplates, wrestlerArchetypes, rosterData, venues.')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      type: MOD_PACKAGE_TYPE,
      version: MOD_PACKAGE_VERSION,
      createdAt: now,
      modules: normalizedModules,
    },
  }
}
