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

const toSafeString = (value, fallback = '') => {
  const normalized = String(value ?? fallback).trim()
  return normalized
}

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

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

  if (deduped.length === 0) {
    errors.push(`${name} has no valid entries.`)
    return null
  }

  return deduped
}

export const buildModDataPackageFromState = (state) => {
  const now = Date.now()

  return {
    type: MOD_PACKAGE_TYPE,
    version: MOD_PACKAGE_VERSION,
    createdAt: now,
    modules: {
      titles: (state?.roster?.titles || []).map((title) => normalizeTitleEntry(title, 0)).filter(Boolean),
      sponsorOffers: (state?.market?.sponsorOffers || [])
        .map((offer, index) => normalizeSponsorOfferEntry(offer, index, now))
        .filter(Boolean),
      eventTemplates: (state?.market?.eventTemplates || [])
        .map((eventTemplate, index) => normalizeEventTemplateEntry(eventTemplate, index, now))
        .filter(Boolean),
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

  const normalizedModules = {
    ...(titles ? { titles } : {}),
    ...(sponsorOffers ? { sponsorOffers } : {}),
    ...(eventTemplates ? { eventTemplates } : {}),
  }

  if (Object.keys(normalizedModules).length === 0) {
    errors.push('No valid modules found. Include at least one of: titles, sponsorOffers, eventTemplates.')
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
