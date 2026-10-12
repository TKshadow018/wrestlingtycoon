const MIN_RELATION = 0
const MAX_RELATION = 100
const INITIAL_RELATION = 60
const AGENDA_SIZE = 3

export const createInitialBoardState = ({
  boardPresidentName = '',
  boardVicePresidentName = '',
} = {}) => ({
  relation: INITIAL_RELATION,
  boardPresidentName,
  boardVicePresidentName,
  boardElectionHistory: [],
  consecutiveNegativeFinanceMonths: 0,
  lastMeetingDay: null,
  activeMeeting: null,
  meetingHistory: [],
  pendingMandates: [],
  mandateHistory: [],
  rejectionCounts: {},
  costRelief: {
    amount: 0,
    throughDay: 0,
  },
  managerDismissed: false,
  gameOverReason: null,
})

const clampRelation = (relation) => Math.max(MIN_RELATION, Math.min(MAX_RELATION, relation))

export const getRepeatedRejectionPenalty = (previousRejections) => (
  Math.min(6, Math.max(0, Math.floor(Number(previousRejections) || 0)) * 2)
)

export const assignRandomBoardAgendaPresenters = (
  agendas,
  boardMembers,
  managerName = '',
  random = Math.random,
) => {
  if (!Array.isArray(agendas) || !Array.isArray(boardMembers)) {
    throw new Error('Agendas and board members are required')
  }

  const eligibleMembers = boardMembers.filter((member) => (
    typeof member?.person_name === 'string'
    && member.person_name
    && member.person_name !== managerName
    && member.current_role !== 'General Manager'
  ))
  if (eligibleMembers.length === 0 && agendas.length > 0) {
    throw new Error('At least one non-manager board member is required to present agendas')
  }

  return agendas.map((agenda) => {
    const randomValue = Number(random())
    if (!Number.isFinite(randomValue)) {
      throw new Error('Board presenter random source must return a finite number')
    }
    const boundedValue = Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
    const presenter = eligibleMembers[Math.floor(boundedValue * eligibleMembers.length)]

    return {
      ...agenda,
      proposer: presenter,
      presenter,
    }
  })
}

export const resolveBoardElection = ({
  candidates,
  boardMembers,
  userChoiceId,
  random = Math.random,
}) => {
  if (!Array.isArray(candidates) || candidates.length < 2 || !Array.isArray(boardMembers)) {
    throw new Error('A board election requires at least two candidates and the board roster')
  }

  const candidateIds = new Set()
  const normalizedCandidates = candidates.map((candidate, index) => {
    const candidateId = String(candidate?.candidateId || candidate?.person_name || '')
    const share = Number(candidate?.company_shareholder_percentage)
    if (
      !candidateId
      || candidateIds.has(candidateId)
      || !Number.isFinite(share)
      || share < 0
    ) {
      throw new Error('Board election candidates must have unique ids and valid shareholdings')
    }
    if (candidate.current_role === 'General Manager' || candidate.isManager === true) {
      throw new Error('The General Manager cannot be a Board election candidate')
    }
    candidateIds.add(candidateId)
    return {
      candidateId,
      person_name: candidate.person_name || candidateId,
      current_role: candidate.current_role || '',
      company_shareholder_percentage: share,
      originalOrder: index,
      votes: candidateId === userChoiceId ? 1 : 0,
    }
  })

  if (!candidateIds.has(userChoiceId)) {
    throw new Error('The selected Board election candidate is not eligible')
  }

  const votes = {}
  const eligibleVoters = boardMembers.filter((member) => (
    typeof member?.person_name === 'string'
    && member.current_role !== 'General Manager'
  ))
  eligibleVoters.forEach((member) => {
    const randomValue = Number(random())
    if (!Number.isFinite(randomValue)) {
      throw new Error('Board election random source must return a finite number')
    }

    const boundedValue = Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
    const candidateIndex = Math.floor(boundedValue * normalizedCandidates.length)
    const selectedCandidate = normalizedCandidates[candidateIndex]
    selectedCandidate.votes += 1
    votes[member.person_name] = selectedCandidate.candidateId
  })

  const rankedCandidates = normalizedCandidates
    .sort((a, b) => (
      b.votes - a.votes
      || b.company_shareholder_percentage - a.company_shareholder_percentage
      || a.originalOrder - b.originalOrder
    ))
    .map(({ originalOrder, ...candidate }) => candidate)

  return {
    userChoiceId,
    votes,
    userVote: userChoiceId,
    rankedCandidates,
    president: rankedCandidates[0],
    vicePresident: rankedCandidates[1],
  }
}

export const normalizeBoardMeetingState = (boardState, initialBoardState = createInitialBoardState()) => {
  const defaults = createInitialBoardState(initialBoardState)
  const saved = boardState && typeof boardState === 'object' ? boardState : {}
  const relation = Number(saved.relation)
  const negativeFinanceMonths = Number(saved.consecutiveNegativeFinanceMonths)

  return {
    ...defaults,
    ...saved,
    relation: Number.isFinite(relation) ? clampRelation(relation) : defaults.relation,
    boardPresidentName: String(saved.boardPresidentName || defaults.boardPresidentName),
    boardVicePresidentName: String(saved.boardVicePresidentName || defaults.boardVicePresidentName),
    boardElectionHistory: Array.isArray(saved.boardElectionHistory) ? saved.boardElectionHistory : [],
    consecutiveNegativeFinanceMonths: Number.isInteger(negativeFinanceMonths)
      ? Math.max(0, negativeFinanceMonths)
      : 0,
    lastMeetingDay: Number.isInteger(saved.lastMeetingDay) ? saved.lastMeetingDay : null,
    activeMeeting: saved.activeMeeting && typeof saved.activeMeeting === 'object' ? saved.activeMeeting : null,
    meetingHistory: Array.isArray(saved.meetingHistory) ? saved.meetingHistory : [],
    pendingMandates: Array.isArray(saved.pendingMandates) ? saved.pendingMandates : [],
    mandateHistory: Array.isArray(saved.mandateHistory) ? saved.mandateHistory : [],
    rejectionCounts: saved.rejectionCounts && typeof saved.rejectionCounts === 'object'
      ? saved.rejectionCounts
      : {},
    costRelief: {
      amount: Math.max(0, Number(saved.costRelief?.amount) || 0),
      throughDay: Math.max(0, Number(saved.costRelief?.throughDay) || 0),
    },
    managerDismissed: Boolean(saved.managerDismissed),
    gameOverReason: typeof saved.gameOverReason === 'string' ? saved.gameOverReason : null,
  }
}

const normalizeAgendaPool = (agendaPool) => {
  const uniqueAgendas = new Map()

  ;(Array.isArray(agendaPool) ? agendaPool : []).forEach((agenda) => {
    const weight = Number(agenda?.weight ?? 1)
    if (
      typeof agenda?.id !== 'string'
      || !agenda.id
      || !Number.isFinite(weight)
      || weight <= 0
      || uniqueAgendas.has(agenda.id)
    ) {
      return
    }

    uniqueAgendas.set(agenda.id, { ...agenda, weight })
  })

  return [...uniqueAgendas.values()]
}

const drawWeightedAgendaIndex = (pool, random) => {
  const totalWeight = pool.reduce((sum, agenda) => sum + agenda.weight, 0)
  const randomValue = Number(random())
  if (!Number.isFinite(randomValue)) {
    throw new Error('Agenda random source must return a finite number')
  }

  const boundedValue = Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
  const target = boundedValue * totalWeight
  let weightCursor = 0

  for (let index = 0; index < pool.length; index += 1) {
    weightCursor += pool[index].weight
    if (target < weightCursor) {
      return index
    }
  }

  return pool.length - 1
}

export const selectBoardAgendas = ({
  agendaPool,
  financialIsNegative = false,
  requiredAgendaIds = [],
  random = Math.random,
}) => {
  const allAgendas = normalizeAgendaPool(agendaPool)
  const mandatoryAgendaIds = Array.from(new Set([
    ...requiredAgendaIds,
    ...(financialIsNegative ? ['financialReview'] : []),
  ]))
  if (!financialIsNegative && mandatoryAgendaIds.includes('financialReview')) {
    throw new Error('Financial Review is mandatory only when finances are negative')
  }
  const mandatoryAgendas = mandatoryAgendaIds.map((agendaId) => (
    allAgendas.find((agenda) => agenda.id === agendaId)
  ))

  if (mandatoryAgendas.some((agenda) => !agenda)) {
    throw new Error('Every required Board Meeting agenda must be available')
  }

  const selectedAgendas = mandatoryAgendas
  const mandatoryIds = new Set(mandatoryAgendaIds)
  const availableAgendas = allAgendas.filter((agenda) => (
    !mandatoryIds.has(agenda.id)
    && (financialIsNegative || agenda.id !== 'financialReview')
  ))
  const requiredRandomTopics = AGENDA_SIZE - selectedAgendas.length
  if (requiredRandomTopics < 0) {
    throw new Error('Board Meeting requires no more than three mandatory agenda topics')
  }
  if (availableAgendas.length < requiredRandomTopics) {
    throw new Error('Board Meeting requires three unique agenda topics')
  }

  const remainingAgendas = [...availableAgendas]
  while (selectedAgendas.length < AGENDA_SIZE) {
    const selectedIndex = drawWeightedAgendaIndex(remainingAgendas, random)
    selectedAgendas.push(remainingAgendas.splice(selectedIndex, 1)[0])
  }

  return selectedAgendas.sort((a, b) => (
    Number(a.id === 'boardElection') - Number(b.id === 'boardElection')
  ))
}

export const recordBoardFinancialPeriod = (boardState, { day, operatingNet }) => {
  if (!boardState || typeof boardState !== 'object') {
    throw new Error('Board state is required to record a financial period')
  }
  if (!Number.isInteger(day) || day < 1 || !Number.isFinite(operatingNet)) {
    throw new Error('A valid meeting day and operating net are required')
  }

  if (boardState.managerDismissed) {
    return { boardState, managerDismissed: true, applied: false }
  }
  if (boardState.lastMeetingDay === day) {
    return { boardState, managerDismissed: false, applied: false }
  }
  if (Number.isInteger(boardState.lastMeetingDay) && day < boardState.lastMeetingDay) {
    throw new Error('Board financial periods must be recorded in game-day order')
  }

  const consecutiveNegativeFinanceMonths = operatingNet < 0
    ? Math.max(0, Number(boardState.consecutiveNegativeFinanceMonths) || 0) + 1
    : 0
  const managerDismissed = consecutiveNegativeFinanceMonths >= 3

  return {
    boardState: {
      ...boardState,
      consecutiveNegativeFinanceMonths,
      lastMeetingDay: day,
      managerDismissed,
      gameOverReason: managerDismissed ? 'three-negative-finance-periods' : null,
    },
    managerDismissed,
    applied: true,
  }
}

export const getBoardDismissalChance = (relation) => {
  const numericRelation = Number(relation)
  if (!Number.isFinite(numericRelation)) {
    throw new Error('Board Relation must be a finite number')
  }

  const normalizedRelation = clampRelation(numericRelation)
  if (normalizedRelation < 10) {
    return 0.8
  }
  if (normalizedRelation < 25) {
    return 0.3
  }
  return 0
}

export const rollBoardDismissal = ({ relation, random = Math.random }) => {
  const dismissalChance = getBoardDismissalChance(relation)
  const randomValue = Number(random())
  if (!Number.isFinite(randomValue)) {
    throw new Error('Dismissal random source must return a finite number')
  }

  return randomValue >= 0 && randomValue < dismissalChance
}

export const applyBoardRelationChange = (boardState, relationDelta) => {
  const currentRelation = Number(boardState?.relation)
  const delta = Number(relationDelta)
  if (!Number.isFinite(currentRelation) || !Number.isFinite(delta)) {
    throw new Error('Board Relation and relation change must be finite numbers')
  }

  return {
    ...boardState,
    relation: clampRelation(currentRelation + delta),
  }
}

export const tallyWeightedBoardVote = (boardMembers, votes) => {
  if (!Array.isArray(boardMembers) || !votes || typeof votes !== 'object') {
    throw new Error('Board members and votes are required')
  }

  const validMembers = boardMembers.filter((member) => {
    const share = Number(member?.company_shareholder_percentage)
    return typeof member?.person_name === 'string' && Number.isFinite(share) && share > 0
  })
  const totalShare = validMembers.reduce(
    (sum, member) => sum + Number(member.company_shareholder_percentage),
    0,
  )
  const supportingShare = validMembers.reduce(
    (sum, member) => sum + (votes[member.person_name] === true
      ? Number(member.company_shareholder_percentage)
      : 0),
    0,
  )

  return {
    supportingShare,
    totalShare,
    supportPercent: totalShare > 0 ? (supportingShare / totalShare) * 100 : 0,
    passed: totalShare > 0 && supportingShare > totalShare / 2,
  }
}

export const conductWeightedBoardVote = ({
  boardMembers,
  relation,
  proposerName,
  supportChance = 0.5,
  random = Math.random,
}) => {
  const numericSupportChance = Number(supportChance)
  const numericRelation = Number(relation)
  if (!Number.isFinite(numericSupportChance) || !Number.isFinite(numericRelation)) {
    throw new Error('Vote support chance and Board Relation must be finite numbers')
  }

  const relationAdjustment = (clampRelation(numericRelation) - 50) / 250
  const baseSupport = Math.max(0, Math.min(1, numericSupportChance + relationAdjustment))
  const votes = Object.fromEntries(
    (Array.isArray(boardMembers) ? boardMembers : []).map((member) => {
      if (member.person_name === proposerName) {
        return [member.person_name, true]
      }

      const randomValue = Number(random())
      if (!Number.isFinite(randomValue)) {
        throw new Error('Board vote random source must return a finite number')
      }

      return [member.person_name, randomValue >= 0 && randomValue < baseSupport]
    }),
  )

  return {
    ...tallyWeightedBoardVote(boardMembers, votes),
    votes,
  }
}

export const resolveBoardMandates = (boardState, { day, eventOutcome = null, operatingNet }) => {
  const outcomes = []
  const pendingMandates = []
  let relationDelta = 0

  ;(boardState.pendingMandates || []).forEach((mandate) => {
    let nextMandate = mandate
    let resolvedStatus = null

    if (mandate.type === 'eventRating' && eventOutcome) {
      const matchesTargetEvent = mandate.eventId
        ? eventOutcome.eventId === mandate.eventId
        : day >= Number(mandate.targetDay || mandate.deadlineDay)

      if (matchesTargetEvent) {
        resolvedStatus = Number(eventOutcome.overallRating) >= Number(mandate.targetRating)
          ? 'completed'
          : 'failed'
      }
    } else if (
      mandate.type === 'financialRecovery'
      && day >= Number(mandate.deadlineDay || Number.MAX_SAFE_INTEGER)
      && Number.isFinite(operatingNet)
    ) {
      resolvedStatus = operatingNet >= 0 ? 'completed' : 'failed'
    } else if (mandate.type === 'wrestlerPush' && eventOutcome && day > Number(mandate.createdDay || 0)) {
      const appeared = (eventOutcome.segments || []).some(
        (segment) => (segment.participantIds || []).includes(mandate.employeeId),
      )
      const appearances = Number(mandate.appearances || 0) + (appeared ? 1 : 0)
      nextMandate = { ...mandate, appearances }
      if (appearances >= Number(mandate.targetAppearances || 1)) {
        resolvedStatus = 'completed'
      }
    }

    if (!resolvedStatus && day >= Number(mandate.deadlineDay || Number.MAX_SAFE_INTEGER)) {
      resolvedStatus = 'failed'
    }

    if (!resolvedStatus) {
      pendingMandates.push(nextMandate)
      return
    }

    const delta = resolvedStatus === 'completed'
      ? Number(mandate.successRelationDelta || 0)
      : Number(mandate.failureRelationDelta || 0)
    relationDelta += Number.isFinite(delta) ? delta : 0
    outcomes.push({
      ...nextMandate,
      status: resolvedStatus,
      resolvedDay: day,
      relationDelta: Number.isFinite(delta) ? delta : 0,
    })
  })

  const nextBoardState = {
    ...boardState,
    pendingMandates,
    mandateHistory: [...(boardState.mandateHistory || []), ...outcomes].slice(-50),
  }
  const boardStateWithRelation = relationDelta === 0
    ? nextBoardState
    : applyBoardRelationChange(nextBoardState, relationDelta)

  return {
    boardState: boardStateWithRelation,
    outcomes,
    relationDelta,
  }
}
