import venueCatalog from './venue.json'

const promoStyles = [
  {
    id: 'spotlight',
    labelKey: 'dashboard.eventPreparation.promoStyles.spotlight',
    matchRatingBonus: 0,
  },
  {
    id: 'hometownBuzz',
    labelKey: 'dashboard.eventPreparation.promoStyles.hometownBuzz',
    matchRatingBonus: 0.1,
  },
  {
    id: 'nationalSpotlight',
    labelKey: 'dashboard.eventPreparation.promoStyles.nationalSpotlight',
    matchRatingBonus: 0.2,
  },
]

const promoSegments = [
  {
    id: 'standardPromo',
    labelKey: 'dashboard.events.setup.promoSegments.standardPromo',
    incomeBonus: 0,
    fanBonus: 0,
  },
  {
    id: 'contractSigning',
    labelKey: 'dashboard.events.setup.promoSegments.contractSigning',
    incomeBonus: 180,
    fanBonus: 8,
  },
  {
    id: 'faceOff',
    labelKey: 'dashboard.events.setup.promoSegments.faceOff',
    incomeBonus: 240,
    fanBonus: 14,
  },
  {
    id: 'videoPackage',
    labelKey: 'dashboard.events.setup.promoSegments.videoPackage',
    incomeBonus: 300,
    fanBonus: 7,
  },
]

const presentations = [
  {
    id: 'classic',
    labelKey: 'dashboard.eventPreparation.presentations.classic',
    themeClass: 'presentationClassic',
  },
  {
    id: 'championship',
    labelKey: 'dashboard.eventPreparation.presentations.championship',
    themeClass: 'presentationChampionship',
  },
  {
    id: 'retro',
    labelKey: 'dashboard.eventPreparation.presentations.retro',
    themeClass: 'presentationRetro',
  },
]

export const CAREER_ARC_UNLOCK_CATALOGS = {
  venues: venueCatalog,
  promoStyles,
  promoSegments,
  presentations,
}

export const CAREER_ARC_UNLOCK_CATEGORIES = Object.keys(CAREER_ARC_UNLOCK_CATALOGS)

export const DEFAULT_CAREER_ARC_UNLOCKS = {
  venues: venueCatalog.slice(0, 5).map((venue) => venue.id),
  promoStyles: ['spotlight'],
  promoSegments: ['standardPromo'],
  presentations: ['classic'],
}

export const getCareerArcUnlockItem = (category, id) => {
  const catalog = CAREER_ARC_UNLOCK_CATALOGS[category]
  if (!catalog) {
    throw new Error(`Unknown career arc unlock category: ${category}`)
  }

  return catalog.find((item) => item.id === id)
}

export const normalizeCareerArcUnlocks = (unlocks, { legacyVenueId = null } = {}) => {
  const normalized = Object.fromEntries(
    CAREER_ARC_UNLOCK_CATEGORIES.map((category) => {
      const catalogIds = new Set(CAREER_ARC_UNLOCK_CATALOGS[category].map((item) => item.id))
      const persistedIds = Array.isArray(unlocks?.[category]) ? unlocks[category] : []
      const ids = [
        ...DEFAULT_CAREER_ARC_UNLOCKS[category],
        ...persistedIds,
        ...(category === 'venues' && typeof legacyVenueId === 'string' ? [legacyVenueId] : []),
      ].filter((id) => typeof id === 'string' && catalogIds.has(id))

      return [category, [...new Set(ids)]]
    }),
  )

  return normalized
}

export const getUnlockedCareerArcItems = (category, unlocks) => {
  const catalog = CAREER_ARC_UNLOCK_CATALOGS[category]
  if (!catalog) {
    throw new Error(`Unknown career arc unlock category: ${category}`)
  }

  const normalizedUnlocks = normalizeCareerArcUnlocks(unlocks)
  const unlockedIds = new Set(normalizedUnlocks[category])
  return catalog.filter((item) => unlockedIds.has(item.id))
}

export const getNextCareerArcUnlocks = (unlocks) => {
  const normalizedUnlocks = normalizeCareerArcUnlocks(unlocks)

  return CAREER_ARC_UNLOCK_CATEGORIES
    .map((category) => {
      const unlockedIds = new Set(normalizedUnlocks[category])
      const nextItem = CAREER_ARC_UNLOCK_CATALOGS[category]
        .find((item) => !unlockedIds.has(item.id))

      return nextItem ? { category, id: nextItem.id } : null
    })
    .filter(Boolean)
}

export const applyCareerArcUnlocks = (unlocks, rewards) => {
  const normalized = normalizeCareerArcUnlocks(unlocks)
  if (!Array.isArray(rewards)) {
    throw new Error('Career arc unlock rewards must be an array')
  }

  const next = Object.fromEntries(
    CAREER_ARC_UNLOCK_CATEGORIES.map((category) => [category, [...normalized[category]]]),
  )

  rewards.forEach(({ category, id } = {}) => {
    if (!CAREER_ARC_UNLOCK_CATEGORIES.includes(category)) {
      return
    }
    if (!getCareerArcUnlockItem(category, id)) {
      return
    }
    if (!next[category].includes(id)) {
      next[category].push(id)
    }
  })

  return next
}
