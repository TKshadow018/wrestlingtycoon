const asNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const GAME_CONFIG = {
  version: import.meta.env.VITE_GAME_VERSION || '0.1.0',
  startDateIso: import.meta.env.VITE_GAME_START_DATE || '',
  startingCash: asNumber(import.meta.env.VITE_GAME_STARTING_CASH, 500000),
  eventCycleDays: asNumber(import.meta.env.VITE_EVENT_CYCLE_DAYS, 7),
  startingFans: asNumber(import.meta.env.VITE_GAME_STARTING_FANS, 1000),
  startingMorale: asNumber(import.meta.env.VITE_GAME_STARTING_MORALE, 60),
  economy: {
    webSubscription: {
      defaultFee: asNumber(import.meta.env.VITE_WEB_SUBSCRIPTION_DEFAULT_FEE, 9.99),
      minFee: asNumber(import.meta.env.VITE_WEB_SUBSCRIPTION_MIN_FEE, 2),
      maxFee: asNumber(import.meta.env.VITE_WEB_SUBSCRIPTION_MAX_FEE, 50),
      minRate: asNumber(import.meta.env.VITE_WEB_SUBSCRIPTION_MIN_RATE, 0.0401),
      maxRate: asNumber(import.meta.env.VITE_WEB_SUBSCRIPTION_MAX_RATE, 0.1099),
      billingDays: asNumber(import.meta.env.VITE_WEB_SUBSCRIPTION_BILLING_DAYS, 30),
    },
    audience: {
      fanScaleMax: asNumber(import.meta.env.VITE_AUDIENCE_FAN_SCALE_MAX, 10000),
      prestigeScaleMax: asNumber(import.meta.env.VITE_AUDIENCE_PRESTIGE_SCALE_MAX, 100),
      fansWeight: asNumber(import.meta.env.VITE_AUDIENCE_FANS_WEIGHT, 0.55),
      prestigeWeight: asNumber(import.meta.env.VITE_AUDIENCE_PRESTIGE_WEIGHT, 0.45),
      randomMin: asNumber(import.meta.env.VITE_AUDIENCE_RANDOM_MIN, 0.7),
      randomMax: asNumber(import.meta.env.VITE_AUDIENCE_RANDOM_MAX, 1.3),
      byEventType: {
        regularWeekly: {
          min: asNumber(import.meta.env.VITE_AUDIENCE_REGULAR_MIN, 200),
          max: asNumber(import.meta.env.VITE_AUDIENCE_REGULAR_MAX, 5000),
          ticketPrice: asNumber(import.meta.env.VITE_TICKET_PRICE_REGULAR, 25),
        },
        houseShow: {
          min: asNumber(import.meta.env.VITE_AUDIENCE_HOUSE_MIN, 200),
          max: asNumber(import.meta.env.VITE_AUDIENCE_HOUSE_MAX, 5000),
          ticketPrice: asNumber(import.meta.env.VITE_TICKET_PRICE_HOUSE, 20),
        },
        digitalOnly: {
          min: asNumber(import.meta.env.VITE_AUDIENCE_DIGITAL_MIN, 200),
          max: asNumber(import.meta.env.VITE_AUDIENCE_DIGITAL_MAX, 5000),
          ticketPrice: asNumber(import.meta.env.VITE_TICKET_PRICE_DIGITAL, 5),
        },
        ppv: {
          min: asNumber(import.meta.env.VITE_AUDIENCE_PPV_MIN, 5000),
          max: asNumber(import.meta.env.VITE_AUDIENCE_PPV_MAX, 20000),
          ticketPrice: asNumber(import.meta.env.VITE_TICKET_PRICE_PPV, 45),
        },
        oneTime: {
          min: asNumber(import.meta.env.VITE_AUDIENCE_ONE_TIME_MIN, 5000),
          max: asNumber(import.meta.env.VITE_AUDIENCE_ONE_TIME_MAX, 20000),
          ticketPrice: asNumber(import.meta.env.VITE_TICKET_PRICE_ONE_TIME, 45),
        },
        megaLive: {
          min: asNumber(import.meta.env.VITE_AUDIENCE_MEGA_MIN, 15000),
          max: asNumber(import.meta.env.VITE_AUDIENCE_MEGA_MAX, 80000),
          ticketPrice: asNumber(import.meta.env.VITE_TICKET_PRICE_MEGA, 65),
        },
      },
    },
    income: {
      thirdPartyChance: asNumber(import.meta.env.VITE_THIRD_PARTY_INCOME_CHANCE, 0.03),
      thirdPartyMin: asNumber(import.meta.env.VITE_THIRD_PARTY_INCOME_MIN, 1000),
      thirdPartyMax: asNumber(import.meta.env.VITE_THIRD_PARTY_INCOME_MAX, 20000),
      titleHolderMerchMultiplier: asNumber(import.meta.env.VITE_TITLE_HOLDER_MERCH_MULTIPLIER, 2.5),
      eventPopularMerchMultiplier: asNumber(import.meta.env.VITE_EVENT_POPULAR_MERCH_MULTIPLIER, 1.2),
      eventPopularMerchMinPopularity: asNumber(import.meta.env.VITE_EVENT_POPULAR_MERCH_MIN_POPULARITY, 50),
    },
    expense: {
      titleHolderMatchBonusMultiplier: asNumber(import.meta.env.VITE_TITLE_HOLDER_MATCH_BONUS_MULTIPLIER, 0.5),
      staffHeavyUsageThreshold: asNumber(import.meta.env.VITE_STAFF_HEAVY_USAGE_THRESHOLD, 2),
      staffHeavyUsageBonusMultiplier: asNumber(import.meta.env.VITE_STAFF_HEAVY_USAGE_BONUS_MULTIPLIER, 0.3),
      operatingBase: asNumber(import.meta.env.VITE_OPERATING_COST_BASE, 1500),
      operatingPrestigeMultiplier: asNumber(import.meta.env.VITE_OPERATING_COST_PRESTIGE_MULTIPLIER, 25),
      otherMin: asNumber(import.meta.env.VITE_OTHER_COST_MIN, 300),
      otherMax: asNumber(import.meta.env.VITE_OTHER_COST_MAX, 1500),
    },
  },
  eventCost: {
    regularWeekly: asNumber(import.meta.env.VITE_EVENT_COST_REGULAR, 2500),
    houseShow: asNumber(import.meta.env.VITE_EVENT_COST_HOUSE_SHOW, 5000),
    ppv: asNumber(import.meta.env.VITE_EVENT_COST_PPV, 15000),
    megaLive: asNumber(import.meta.env.VITE_EVENT_COST_MEGA, 25000),
    oneTime: asNumber(import.meta.env.VITE_EVENT_COST_ONE_TIME, 12000),
    digitalOnly: asNumber(import.meta.env.VITE_EVENT_COST_DIGITAL, 3000),
  },
}

export const MANAGEMENT_MODULES = [
  { id: 'manageEmployees' },
  { id: 'hireEmployees' },
  { id: 'manageEvents' },
  { id: 'manageTitles' },
  { id: 'statistics' },
  { id: 'matchResults' },
  { id: 'wrestlerRank' },
  { id: 'manageFinances' },
  { id: 'manageSponsors' },
]
