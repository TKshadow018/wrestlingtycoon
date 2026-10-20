import { clamp } from './utility'

export const STAFF_DEPARTMENTS = [
  'production',
  'medical',
  'talentRelations',
  'logistics',
]

const roundTo = (value, places = 4) => Number(value.toFixed(places))

export const normalizeStaffDepartment = (department) => (
  STAFF_DEPARTMENTS.includes(department) ? department : null
)

const readAbilityScore = (employee, abilityKeys) => {
  const ability = employee?.staffAbility || {}
  const scores = abilityKeys
    .map((key) => Number(ability[key]))
    .filter(Number.isFinite)

  if (scores.length) {
    return scores.reduce((sum, score) => sum + clamp(score, 0, 100), 0) / scores.length
  }

  const skill = Number(employee?.skill)
  return Number.isFinite(skill) ? clamp(skill, 0, 100) : 0
}

const sumDepartmentEffect = (employees, department, abilityKeys, contribution, cap) => {
  const total = employees
    .filter((employee) => employee?.role === 'staff' && normalizeStaffDepartment(employee.staffDepartment) === department)
    .reduce((sum, employee) => sum + readAbilityScore(employee, abilityKeys) * contribution / 100, 0)

  return roundTo(Math.min(cap, total))
}

export const getStaffDepartmentEffects = (employees = []) => {
  const assignedStaff = Array.isArray(employees) ? employees : []
  const talentRelationsCoverage = assignedStaff
    .filter((employee) => employee?.role === 'staff' && employee.staffDepartment === 'talentRelations')
    .reduce((sum, employee) => {
      const teamwork = readAbilityScore(employee, ['teamwork'])
      return sum + (teamwork > 0 ? Math.ceil(teamwork / 50) : 0)
    }, 0)

  return {
    productionCostReduction: sumDepartmentEffect(assignedStaff, 'production', ['technical_skill'], 0.05, 0.1),
    medicalInjuryDurationReduction: sumDepartmentEffect(assignedStaff, 'medical', ['technical_skill'], 0.1, 0.15),
    talentRelationsCoverage: Math.min(4, talentRelationsCoverage),
    logisticsOperatingCostReduction: sumDepartmentEffect(assignedStaff, 'logistics', ['reliability'], 0.05, 0.1),
  }
}

const getAverageAbility = (employee, abilityKeys) => {
  const ability = employee || {}
  const scores = abilityKeys
    .map((key) => Number(ability[key]))
    .filter(Number.isFinite)
    .map((score) => clamp(score, 0, 100))

  if (scores.length) {
    return scores.reduce((sum, score) => sum + score, 0) / scores.length
  }

  const skill = Number(employee?.skill)
  return Number.isFinite(skill) ? clamp(skill, 0, 100) : 0
}

const makeContribution = (employee, role, ratingAdjustment = 0, fanImpact = 0) => ({
  role,
  employeeId: employee.employeeId,
  name: employee.name || employee.employeeId,
  ratingAdjustment: roundTo(ratingAdjustment, 2),
  fanImpact,
})

export const getSegmentStaffEffects = (segment = {}, employees = []) => {
  const employeeList = Array.isArray(employees) ? employees : []
  const employeesById = new Map(employeeList.map((employee) => [employee.employeeId, employee]))
  const participantIds = new Set([
    ...(Array.isArray(segment.participantIds) ? segment.participantIds : []),
    ...(Array.isArray(segment.wrestlerIds) ? segment.wrestlerIds : []),
    segment.refereeId,
    segment.announcerId,
  ].filter(Boolean))
  const isMatch = ['match', 'mainEvent', 'titleMatch'].includes(segment.segmentType)
  const contributions = []

  if (isMatch && segment.refereeId) {
    const referee = employeesById.get(segment.refereeId)
    if (referee?.role === 'referee') {
      const skill = getAverageAbility(referee.officiatingAbility, [
        'rule_knowledge', 'decision_speed', 'positioning', 'composure',
      ])
      const adjustment = clamp((skill - 50) / 200, 0, 0.25)
      if (adjustment > 0) {
        contributions.push(makeContribution(referee, 'referee', adjustment))
      }
    }
  }

  if (segment.announcerId) {
    const announcer = employeesById.get(segment.announcerId)
    if (announcer?.role === 'announcer') {
      const skill = getAverageAbility(announcer.broadcastAbility, [
        'voice_quality', 'hype_delivery', 'diction', 'ring_knowledge',
      ])
      const adjustment = isMatch ? clamp((skill - 50) / 250, 0, 0.2) : 0
      const fanImpact = Math.min(2, Math.round(skill / 50))
      if (adjustment > 0 || fanImpact > 0) {
        contributions.push(makeContribution(announcer, 'announcer', adjustment, fanImpact))
      }
    }
  }

  if (['promo', 'interview'].includes(segment.segmentType)) {
    const bookedWrestlers = [...participantIds]
      .map((employeeId) => employeesById.get(employeeId))
      .filter((employee) => employee?.role === 'wrestler')
    const bookedManagerIds = new Set(
      [...participantIds].filter((employeeId) => employeesById.get(employeeId)?.role === 'manager'),
    )
    const creditedManagerIds = new Set()

    bookedWrestlers.forEach((wrestler) => {
      if (
        !wrestler.managerId
        || !bookedManagerIds.has(wrestler.managerId)
        || creditedManagerIds.has(wrestler.managerId)
      ) {
        return
      }

      const manager = employeesById.get(wrestler.managerId)
      if (!manager || manager.role !== 'manager') {
        return
      }
      creditedManagerIds.add(manager.employeeId)

      const skill = getAverageAbility(manager.managementAbility, ['charisma', 'promo_skill'])
      const fanImpact = Math.min(2, Math.round(skill / 50))
      if (fanImpact > 0) {
        contributions.push(makeContribution(manager, 'manager', 0, fanImpact))
      }
    })
  }

  let remainingFanImpact = 4
  const cappedContributions = contributions
    .map((contribution) => {
      const appliedFanImpact = Math.min(contribution.fanImpact, remainingFanImpact)
      remainingFanImpact -= appliedFanImpact
      return { ...contribution, fanImpact: appliedFanImpact }
    })
    .filter((contribution) => contribution.ratingAdjustment > 0 || contribution.fanImpact > 0)
  const ratingAdjustment = roundTo(
    cappedContributions.reduce((sum, contribution) => sum + contribution.ratingAdjustment, 0),
    2,
  )
  const fanImpact = cappedContributions.reduce((sum, contribution) => sum + contribution.fanImpact, 0)

  return { ratingAdjustment, fanImpact, contributions: cappedContributions }
}
