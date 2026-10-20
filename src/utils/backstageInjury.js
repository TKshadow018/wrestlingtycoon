import { BACKSTAGE_INJURY_REASONS } from '../data/backstageInjuries'
import { GAME_DAYS_PER_MONTH } from '../config/gameConfig'
import { isInjured, normalizeInjury } from './matchHealth'

export { BACKSTAGE_INJURY_REASONS }

export const INITIAL_BACKSTAGE_INJURY_DAYS = GAME_DAYS_PER_MONTH * 3
export const MIN_BACKSTAGE_INJURY_INTERVAL = 60
export const MAX_BACKSTAGE_INJURY_INTERVAL = 120
export const MIN_BACKSTAGE_INJURY_DURATION = 14
export const MAX_BACKSTAGE_INJURY_DURATION = 60

const BACKSTAGE_INJURY_REASON_SET = new Set(BACKSTAGE_INJURY_REASONS)
const boundedRandomIndex = (random, length) => Math.min(
  length - 1,
  Math.max(0, Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0)) * length)),
)

export const createBackstageInjuryState = () => ({
  daysUntilNext: INITIAL_BACKSTAGE_INJURY_DAYS,
  pending: null,
})

export const normalizeBackstageInjuryState = (raw) => {
  if (!raw || typeof raw !== 'object') return createBackstageInjuryState()
  const parsedDays = Number(raw.daysUntilNext)
  const daysUntilNext = Number.isFinite(parsedDays)
    ? Math.max(0, Math.min(MAX_BACKSTAGE_INJURY_INTERVAL, Math.floor(parsedDays)))
    : INITIAL_BACKSTAGE_INJURY_DAYS
  const pendingRaw = raw.pending
  const injury = pendingRaw && normalizeInjury({ ...pendingRaw, type: 'backstage' })
  const pending = injury
    && typeof pendingRaw.employeeId === 'string'
    && pendingRaw.employeeId
    && typeof pendingRaw.employeeName === 'string'
    && pendingRaw.employeeName.trim()
    && BACKSTAGE_INJURY_REASON_SET.has(pendingRaw.reasonId)
    ? {
        employeeId: pendingRaw.employeeId,
        employeeName: pendingRaw.employeeName.trim(),
        reasonId: pendingRaw.reasonId,
        occurredDay: injury.occurredDay,
        returnDay: injury.returnDay,
      }
    : null

  return { daysUntilNext, pending }
}

export const advanceBackstageInjury = ({
  state: rawState,
  employees = [],
  day,
  random = Math.random,
} = {}) => {
  const state = normalizeBackstageInjuryState(rawState)
  if (state.pending) return { state, employees, injury: state.pending }

  const daysUntilNext = Math.max(0, state.daysUntilNext - 1)
  if (daysUntilNext > 0) {
    return { state: { ...state, daysUntilNext }, employees, injury: null }
  }

  const eligibleWrestlers = employees.filter((employee) => (
    employee?.role === 'wrestler' && !isInjured(employee, day)
  ))
  if (eligibleWrestlers.length === 0) {
    return { state: { daysUntilNext: 0, pending: null }, employees, injury: null }
  }

  const selected = eligibleWrestlers[boundedRandomIndex(random, eligibleWrestlers.length)]
  const reasonId = BACKSTAGE_INJURY_REASONS[boundedRandomIndex(random, BACKSTAGE_INJURY_REASONS.length)]
  const duration = MIN_BACKSTAGE_INJURY_DURATION
    + boundedRandomIndex(random, MAX_BACKSTAGE_INJURY_DURATION - MIN_BACKSTAGE_INJURY_DURATION + 1)
  const injury = {
    type: 'backstage',
    reasonId,
    occurredDay: day,
    returnDay: day + duration,
  }
  const pending = {
    employeeId: selected.employeeId,
    employeeName: String(selected.name || ''),
    reasonId,
    occurredDay: injury.occurredDay,
    returnDay: injury.returnDay,
  }
  const interval = MIN_BACKSTAGE_INJURY_INTERVAL
    + boundedRandomIndex(random, MAX_BACKSTAGE_INJURY_INTERVAL - MIN_BACKSTAGE_INJURY_INTERVAL + 1)

  return {
    state: { daysUntilNext: interval, pending },
    employees: employees.map((employee) => (
      employee.employeeId === selected.employeeId ? { ...employee, injury } : employee
    )),
    injury: pending,
  }
}
