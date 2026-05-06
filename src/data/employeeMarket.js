import peopleData from './people'

const TIERS = ['Rookie', 'Solid', 'Elite']

const average = (values) => {
  if (!values.length) {
    return 0
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

const getTierBySkill = (skill) => {
  if (skill >= 82) return TIERS[2]
  if (skill >= 62) return TIERS[1]
  return TIERS[0]
}

const calculateWrestlerSkill = (person) => {
  const ability = person.wrestling_ability || {}

  return average([
    ability.strength || 0,
    ability.technics || 0,
    ability.high_fly_ability || 0,
    ability.leg_stamina || 0,
    ability.body_stamina || 0,
    ability.head_stamina || 0,
    person.popularity || 0,
  ])
}

const calculateRefereeSkill = (person) => {
  const ability = person.officiating_ability || {}

  return average([
    ability.rule_knowledge || 0,
    ability.decision_speed || 0,
    ability.positioning || 0,
    ability.composure || 0,
    person.popularity || 0,
  ])
}

const calculateManagerSkill = (person) => {
  const ability = person.management_ability || {}

  return average([
    ability.charisma || 0,
    ability.negotiation || 0,
    ability.promo_skill || 0,
    ability.strategy || 0,
    person.popularity || 0,
  ])
}

const calculateAnnouncerSkill = (person) => {
  const ability = person.broadcast_ability || {}

  return average([
    ability.voice_quality || 0,
    ability.hype_delivery || 0,
    ability.diction || 0,
    ability.ring_knowledge || 0,
    person.popularity || 0,
  ])
}

const calculateStaffSkill = (person) => {
  const ability = person.staff_ability || {}

  return average([
    ability.reliability || 0,
    ability.pressure_handling || 0,
    ability.teamwork || 0,
    ability.technical_skill || 0,
    person.popularity || 0,
  ])
}

const calculateSkill = (person) => {
  switch (person.role) {
    case 'wrestler':
      return calculateWrestlerSkill(person)
    case 'referee':
      return calculateRefereeSkill(person)
    case 'manager':
      return calculateManagerSkill(person)
    case 'announcer':
      return calculateAnnouncerSkill(person)
    case 'staff':
      return calculateStaffSkill(person)
    default:
      return person.popularity || 50
  }
}

const createContractTerms = (person) => {
  const monthlySalary = person.salary_demand?.monthly_wage || 0
  const signingBonus = person.salary_demand?.additional_bonus || Math.round(monthlySalary * 0.25)
  const contractLengthMonths = 12

  return {
    monthlySalary,
    perMatchSalary: person.salary_demand?.per_match_salary || 0,
    signingBonus,
    contractLengthMonths,
    negotiatedMonthlySalary: monthlySalary,
    negotiatedPerMatchSalary: person.salary_demand?.per_match_salary || 0,
    negotiatedSigningBonus: signingBonus,
    negotiatedContractLengthMonths: contractLengthMonths,
    lastOfferMonthlySalary: monthlySalary,
    lastOfferPerMatchSalary: person.salary_demand?.per_match_salary || 0,
    lastOfferSigningBonus: signingBonus,
    lastOfferContractLengthMonths: contractLengthMonths,
    maxDiscountPercent: 0,
    negotiationAttempted: false,
    negotiationLocked: false,
    offerAccepted: false,
  }
}

const toCandidate = (person, index) => {
  const skill = calculateSkill(person)
  const tier = getTierBySkill(skill)
  const contract = createContractTerms(person)

  return {
    ...person,
    image_url: person.image_url || null,
    candidateId: `candidate-${person.id}-${index}`,
    skill,
    tier,
    salary: contract.negotiatedMonthlySalary,
    signingBonus: contract.negotiatedSigningBonus,
    contract,
  }
}

const mergePersistedCandidateState = (freshCandidate, persistedCandidate) => {
  if (!persistedCandidate) {
    return freshCandidate
  }

  return {
    ...freshCandidate,
    salary: persistedCandidate.salary ?? freshCandidate.salary,
    signingBonus: persistedCandidate.signingBonus ?? freshCandidate.signingBonus,
    contract: persistedCandidate.contract
      ? {
          ...freshCandidate.contract,
          ...persistedCandidate.contract,
        }
      : freshCandidate.contract,
  }
}

const PEOPLE_POOL = [
  ...peopleData.wrestlers,
  ...peopleData.referees,
  ...peopleData.managers,
  ...peopleData.announcers,
  ...peopleData.staff,
]

export const createEmployeeCandidates = ({ hiredEmployees = [], previousCandidates = [] } = {}) => {
  const excludedIdSet = new Set(hiredEmployees.map((employee) => employee.personId).filter(Boolean))
  const excludedNameRoleSet = new Set(
    hiredEmployees
      .filter((employee) => !employee.personId)
      .map((employee) => `${employee.name}::${employee.role}`),
  )
  const previousCandidatesByPersonId = new Map(previousCandidates.map((candidate) => [candidate.id, candidate]))

  return PEOPLE_POOL.filter(
    (person) => !excludedIdSet.has(person.id) && !excludedNameRoleSet.has(`${person.name}::${person.role}`),
  )
    .map((person, index) => {
      const freshCandidate = toCandidate(person, index)
      const existingCandidate = previousCandidatesByPersonId.get(person.id)
      return mergePersistedCandidateState(freshCandidate, existingCandidate)
    })
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role.localeCompare(right.role)
      }

      return left.name.localeCompare(right.name)
    })
}
