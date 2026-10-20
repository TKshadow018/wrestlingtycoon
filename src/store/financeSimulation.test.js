import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CONFIG, GAME_DAYS_PER_MONTH } from '../config/gameConfig'
import { getGameDateFromDay, toGameDateIso } from '../utils/gameCalendar'
import { getWrestlerPrestigeRequirement } from '../utils/wrestlerUnlocks'

const testStorage = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => testStorage.get(key) ?? null,
  setItem: (key, value) => testStorage.set(key, String(value)),
  removeItem: (key) => testStorage.delete(key),
  clear: () => testStorage.clear(),
})

const { useGameStore } = await import('./useGameStore')

const START_DATE_ISO = '2026-10-11'

const startSimulation = () => {
  useGameStore.getState().resetGame()
  const startResult = useGameStore.getState().startGame({
    playerName: 'Finance Simulator',
    companyName: 'Test Promotion',
  })

  if (!startResult.ok) {
    throw new Error('Unable to start finance simulation')
  }

  useGameStore.setState((state) => ({
    calendar: {
      ...state.calendar,
      day: 1,
      week: 1,
      startDateIso: START_DATE_ISO,
      isEventDay: false,
    },
    events: {
      ...state.events,
      customEvents: [],
    },
  }))
}

const simulateDays = (count) => {
  for (let index = 0; index < count; index += 1) {
    useGameStore.getState().proceedTimeline()
  }

  return useGameStore.getState()
}

describe('promotion finance simulator', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    startSimulation()
  })

  afterEach(() => {
    useGameStore.getState().resetGame()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('simulates the rescue challenge window and shows the cash target is missed without event revenue', () => {
    const initialState = useGameStore.getState()
    const startingCash = initialState.finances.cash
    const cashFlowTarget = initialState.onboardingChallenge.objectives.stabilize.targetOperatingCashFlow
    const endingState = simulateDays(21)
    const cashGain = endingState.finances.cash - startingCash

    expect(endingState.calendar.day).toBe(22)
    expect(endingState.calendar.startDateIso).toBe(START_DATE_ISO)
    expect(cashGain).toBeLessThan(0)
    expect(endingState.onboardingChallenge.objectives.stabilize.currentOperatingCashFlow).toBeLessThan(cashFlowTarget)
    expect(endingState.onboardingChallenge.status).toBe('failed')
  })

  it('starts new games on the configured calendar date and preserves it when advancing', () => {
    useGameStore.getState().resetGame()
    const result = useGameStore.getState().startGame({
      playerName: 'Calendar Test',
      companyName: 'Date Test Promotion',
    })

    expect(result.ok).toBe(true)
    const startDateIso = useGameStore.getState().calendar.startDateIso
    const nextDate = getGameDateFromDay(startDateIso, 1)
    nextDate.setDate(nextDate.getDate() + 1)
    if (GAME_CONFIG.startDateIso) {
      expect(startDateIso).toBe(GAME_CONFIG.startDateIso)
      expect(toGameDateIso(getGameDateFromDay(startDateIso, 1))).toBe(startDateIso)
    }

    useGameStore.getState().proceedTimeline()

    expect(useGameStore.getState().calendar.day).toBe(2)
    expect(useGameStore.getState().calendar.startDateIso).toBe(startDateIso)
    expect(toGameDateIso(getGameDateFromDay(startDateIso, 2))).toBe(toGameDateIso(nextDate))
  })

  it('excludes one-time roster hiring costs from the operating cash flow objective', () => {

    for (const role of ['wrestler', 'wrestler', 'staff']) {
      const state = useGameStore.getState()
      const candidate = state.market.employeeCandidates.find(
        (employee) => employee.role === role
          && getWrestlerPrestigeRequirement(
            employee,
            state.stats.prestige,
            state.progression.unlockedWrestlerIds,
          ) === null,
      )

      expect(candidate).toBeDefined()

      const hiringResult = useGameStore.getState().hireEmployee(candidate.candidateId, { skipNegotiation: true })

      expect(hiringResult.ok).toBe(true)
    }

    const challenge = useGameStore.getState().onboardingChallenge
    expect(challenge.objectives.rosterBuild.completed).toBe(false)
    expect(challenge.objectives.stabilize.currentOperatingCashFlow).toBe(0)
  })

  it('charges recurring monthly salary on the 30-day contract anniversary', () => {
    const initialState = useGameStore.getState()
    const candidate = initialState.market.employeeCandidates.find(
      (employee) => employee.role === 'wrestler'
        && Number(employee.contract?.monthlySalary || employee.salary) > 0
        && getWrestlerPrestigeRequirement(
          employee,
          initialState.stats.prestige,
          initialState.progression.unlockedWrestlerIds,
        ) === null,
    )

    expect(candidate).toBeDefined()

    const monthlySalary = Number(candidate.contract?.monthlySalary || candidate.salary)
    const hiringResult = useGameStore.getState().hireEmployee(candidate.candidateId, { skipNegotiation: true })
    expect(hiringResult.ok).toBe(true)
    expect(useGameStore.getState().finances.cash).toBe(initialState.finances.cash - monthlySalary)

    const employeeStartDay = useGameStore.getState().calendar.day
    const endingState = simulateDays(GAME_DAYS_PER_MONTH)
    const recurringSalaryPayments = endingState.finances.ledger.filter(
      (entry) => entry.category === 'monthlyPayroll',
    )

    expect(recurringSalaryPayments).toHaveLength(1)
    expect(recurringSalaryPayments[0].day).toBe(employeeStartDay + GAME_DAYS_PER_MONTH)
    expect(recurringSalaryPayments[0].amount).toBe(monthlySalary)
    expect(endingState.history.timeline.at(-1).expenseBreakdown.monthlyPayroll).toBe(monthlySalary)
  })
})
