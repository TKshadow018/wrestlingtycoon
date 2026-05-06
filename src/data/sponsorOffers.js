import sponsorCatalog from './sponsor.json'

const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

export const SPONSOR_TYPE_CONFIG = {
  title: { labelKey: 'title', maxActive: 1, eventScoped: false },
  ring: { labelKey: 'ring', maxActive: 1, eventScoped: false },
  eventMain: { labelKey: 'eventMain', maxActive: 1, eventScoped: true },
  eventMinor: { labelKey: 'eventMinor', maxActive: 1, eventScoped: true },
  dress: { labelKey: 'dress', maxActive: 3, eventScoped: false },
  asset: { labelKey: 'asset', maxActive: 3, eventScoped: false },
  digital: { labelKey: 'digital', maxActive: 5, eventScoped: false },
  experience: { labelKey: 'experience', maxActive: 1, eventScoped: false },
  media: { labelKey: 'media', maxActive: 1, eventScoped: false },
}

export const SPONSOR_TYPE_ORDER = [
  'title',
  'ring',
  'eventMain',
  'eventMinor',
  'dress',
  'asset',
  'digital',
  'experience',
  'media',
]

const shuffle = (items) => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInRange(0, index)
    const temp = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = temp
  }
  return copy
}

const clampTier = (tier) => {
  const numericTier = Number(tier)
  if (!Number.isFinite(numericTier)) {
    return 1
  }

  return Math.max(1, Math.min(7, Math.round(numericTier)))
}

const toOffer = (sponsor, idx) => {
  const sponsorType = SPONSOR_TYPE_CONFIG[sponsor.category] ? sponsor.category : 'digital'
  const isEventScoped = SPONSOR_TYPE_CONFIG[sponsorType].eventScoped
  const tier = clampTier(sponsor.tier || 1)
  const contractWeeks = isEventScoped ? null : randomInRange(1, 260)
  const dailyPayout = 900 + tier * 1250 + randomInRange(0, 900)
  const signingBonus = 2500 + tier * 2200 + randomInRange(0, 2200)
  const eventMultiplier = Number((0.03 + tier * 0.025 + randomInRange(0, 4) / 100).toFixed(2))
  const fanBoost = 4 + tier * 2 + Math.floor((sponsor.reputation || 50) / 20)

  return {
    offerId: `sponsor-${sponsor.id}-${Date.now()}-${idx}`,
    sponsorId: sponsor.id,
    name: sponsor.company_name,
    sponsorType,
    reputation: sponsor.reputation,
    marketRegion: sponsor.market_region,
    brandFit: sponsor.brand_fit,
    tier,
    dailyPayout,
    signingBonus,
    eventMultiplier,
    fanBoost,
    contractWeeks,
  }
}

export const createSponsorOffers = (count = 10, options = {}) => {
  const requiredTier = clampTier(options?.requiredTier || 1)
  const source = Array.isArray(sponsorCatalog) ? sponsorCatalog : []
  const tierPool = source.filter((sponsor) => clampTier(sponsor?.tier || 1) === requiredTier)
  const fallbackPool = tierPool.length > 0 ? tierPool : source
  const selected = shuffle(fallbackPool).slice(0, count)

  return selected.map((sponsor, idx) => toOffer(sponsor, idx))
}
