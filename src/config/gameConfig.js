const asNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const GAME_CONFIG = {
  version: import.meta.env.VITE_GAME_VERSION || '0.1.0',
  startingCash: asNumber(import.meta.env.VITE_GAME_STARTING_CASH, 500000),
  eventCycleDays: asNumber(import.meta.env.VITE_EVENT_CYCLE_DAYS, 7),
  startingFans: asNumber(import.meta.env.VITE_GAME_STARTING_FANS, 1000),
  startingMorale: asNumber(import.meta.env.VITE_GAME_STARTING_MORALE, 60),
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
