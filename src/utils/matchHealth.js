import { MATCH_MOMENT_ACTIONS, normalizeMatchPlan } from '../data/matchPlanning'
import { BACKSTAGE_INJURY_REASONS } from '../data/backstageInjuries'

export const MAX_MATCH_STAMINA_LOSS = 70
export const INJURY_STAMINA_THRESHOLD = 20
export const MIN_INJURY_DAYS = 7
export const MAX_INJURY_DAYS = 90
export const DAILY_STAMINA_RECOVERY = 10

const ACTIONS = new Map(MATCH_MOMENT_ACTIONS.map((action) => [action.id, action]))
const PROP_IMPACT = { chair: 4, table: 6, ladder: 7, kendoStick: 3, steelSteps: 6, announceTable: 8 }
const clampStamina = (value) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 100))

export const normalizeInjury = (raw) => {
  if (!Number.isInteger(raw?.occurredDay) || raw.occurredDay < 1
    || !Number.isInteger(raw.returnDay) || raw.returnDay <= raw.occurredDay) return null
  if (raw.type === 'backstage' && BACKSTAGE_INJURY_REASONS.includes(raw.reasonId)) {
    return {
      type: 'backstage',
      reasonId: raw.reasonId,
      occurredDay: raw.occurredDay,
      returnDay: raw.occurredDay + Math.max(14, Math.min(60, raw.returnDay - raw.occurredDay)),
    }
  }
  if (raw.type !== 'exhaustion') return null
  return {
    type: 'exhaustion',
    occurredDay: raw.occurredDay,
    returnDay: raw.occurredDay + Math.max(MIN_INJURY_DAYS, Math.min(MAX_INJURY_DAYS, raw.returnDay - raw.occurredDay)),
  }
}

export const isInjured = (employee, day) => {
  const injury = normalizeInjury(employee?.injury)
  return Boolean(injury && injury.returnDay > day)
}

export const recoverWrestlerHealth = (employee, day) => {
  if (employee.role !== 'wrestler') return employee
  return {
    ...employee,
    stamina: clampStamina(clampStamina(employee.stamina) + DAILY_STAMINA_RECOVERY),
    injury: isInjured(employee, day) ? normalizeInjury(employee.injury) : null,
  }
}

export const calculateMatchStaminaLoss = ({ wrestlers = [], plan } = {}) => {
  const ids = wrestlers.map((person) => person.employeeId)
  const normalized = normalizeMatchPlan({ ...plan, wrestlerIds: ids })
  const matchPlan = normalized.plan
  const errorsByMoment = new Set(normalized.errors.map((entry) => entry.momentId).filter(Boolean))
  const base = 12 + matchPlan.matchLengthMinutes * 0.4
    + ({ balanced: 0, risky: 4, chaotic: 8 }[matchPlan.riskLevel] || 0)
  const costs = new Map(ids.map((id) => [id, base]))
  for (const moment of matchPlan.plannedMoments) {
    if (errorsByMoment.has(moment.momentId)) continue
    const action = ACTIONS.get(moment.actionType)
    const propImpact = moment.propId ? PROP_IMPACT[moment.propId] : 0
    costs.set(moment.actorId, costs.get(moment.actorId) + 2 + action.intensity * 4 + action.risk * 2 + propImpact)
    if (moment.targetId) {
      costs.set(moment.targetId, costs.get(moment.targetId) + 1 + action.intensity * 3 + action.risk * 2 + propImpact * 1.5)
    }
  }
  return Object.fromEntries([...costs].map(([id, cost]) => [id, Math.min(MAX_MATCH_STAMINA_LOSS, Math.ceil(cost))]))
}

export const applyMatchHealth = ({
  wrestlers = [],
  plan,
  day,
  staminaLossById = {},
  medicalInjuryDurationReduction = 0,
  random = Math.random,
} = {}) => {
  const calculated = calculateMatchStaminaLoss({ wrestlers, plan })
  const actualLosses = {}
  const injuries = []
  const durationReduction = Math.max(0, Math.min(0.15, Number(medicalInjuryDurationReduction) || 0))
  const updated = wrestlers.map((person) => {
    const provided = staminaLossById[person.employeeId]
    const loss = typeof provided === 'number' && Number.isFinite(provided) && provided >= 0
      ? Math.min(MAX_MATCH_STAMINA_LOSS, Math.round(provided)) : calculated[person.employeeId]
    const before = clampStamina(person.stamina)
    const stamina = Math.max(0, before - loss)
    actualLosses[person.employeeId] = before - stamina
    let injury = normalizeInjury(person.injury)
    if (stamina < INJURY_STAMINA_THRESHOLD && !isInjured(person, day)) {
      const baseDuration = MIN_INJURY_DAYS + Math.min(MAX_INJURY_DAYS - MIN_INJURY_DAYS,
        Math.max(0, Math.floor(random() * (MAX_INJURY_DAYS - MIN_INJURY_DAYS + 1))))
      const duration = Math.max(MIN_INJURY_DAYS, Math.round(baseDuration * (1 - durationReduction)))
      injury = { type: 'exhaustion', occurredDay: day, returnDay: day + duration }
      injuries.push({ employeeId: person.employeeId, ...injury })
    }
    return { ...person, stamina, injury }
  })
  return { wrestlers: updated, staminaLossById: actualLosses, injuries }
}
