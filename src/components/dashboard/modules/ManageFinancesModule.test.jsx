// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'

const testStorage = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => testStorage.get(key) ?? null,
  setItem: (key, value) => testStorage.set(key, String(value)),
  removeItem: (key) => testStorage.delete(key),
  clear: () => testStorage.clear(),
})

const { useGameStore } = await import('../../../store/useGameStore')
const { default: ManageFinancesModule } = await import('./ManageFinancesModule')

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
})

const makeEventGateBreakdown = ({ day, eventName, eventId }) => ({
  eventId,
  eventName,
  eventType: 'ppv',
  day,
  attendance: 100,
  attendanceCalculation: {
    minAudience: 50,
    maxAudience: 200,
    fans: 1000,
    fanScaleMax: 5000,
    prestige: 40,
    prestigeScaleMax: 100,
    fanFactor: 0.2,
    prestigeFactor: 0.4,
    fansWeight: 0.7,
    prestigeWeight: 0.3,
    audienceNorm: 0.26,
    crowdFactor: 1,
  },
  ticketPrice: 40,
  ticketRevenue: 4000,
  sponsorMultiplier: 0.1,
  sponsorBoostAmount: 400,
  baseGateRevenue: 4400,
  sponsorBreakdown: [{
    sponsorId: `sponsor-${eventId}`,
    name: 'Summit Sponsor',
    sponsorType: 'eventMain',
    scope: 'event',
    trust: 70,
    trustFactor: 1,
    eventMultiplier: 0.1,
    effectiveMultiplier: 0.1,
  }],
  boardAttendance: {
    personName: 'Morgan Hale',
    role: 'Board Director',
    gateBonusPercent: 5,
    gateBonusAmount: 220,
  },
  boardBonusAmount: 220,
  segmentBonuses: [
    {
      segmentNumber: 1,
      segmentType: 'match',
      promoSegmentId: null,
      segmentTypeIncome: 180,
      promoBonusIncome: 0,
      totalIncome: 180,
    },
    {
      segmentNumber: 2,
      segmentType: 'promo',
      promoSegmentId: 'contractSigning',
      segmentTypeIncome: 120,
      promoBonusIncome: 35,
      totalIncome: 155,
    },
  ],
  segmentBonusTotal: 335,
  audienceSegments: [
    {
      key: 'casual',
      labelKey: 'dashboard.eventResults.audienceSegmentLabels.casual',
      attendance: 50,
      sharePercent: 50,
      satisfaction: 70,
      fanImpact: 10,
      spendMultiplier: 1,
    },
    {
      key: 'hardcore',
      labelKey: 'dashboard.eventResults.audienceSegmentLabels.hardcore',
      attendance: 50,
      sharePercent: 50,
      satisfaction: 80,
      fanImpact: 15,
      spendMultiplier: 1.2,
    },
  ],
  weightedSpendMultiplier: 1.1,
  audienceSpendAdjustment: 32,
  total: 4987,
})

const seedTimeline = (eventGateBreakdowns) => {
  useGameStore.getState().resetGame()
  useGameStore.setState((state) => ({
    calendar: {
      ...state.calendar,
      day: 6,
      week: 1,
      startDateIso: '2026-06-01',
    },
    history: {
      ...state.history,
      timeline: eventGateBreakdowns.map((eventGateBreakdown) => ({
        day: eventGateBreakdown.day,
        week: 1,
        cash: 500000,
        totalIncome: eventGateBreakdown.total,
        totalExpenses: 0,
        incomeBreakdown: {
          sponsor: 0,
          event: eventGateBreakdown.total,
          merchandise: 0,
          thirdParty: 0,
          webSubscription: 0,
        },
        expenseBreakdown: {},
        eventGateBreakdown,
      })),
    },
  }))
}

const seedLegacyTimeline = () => {
  useGameStore.getState().resetGame()
  useGameStore.setState((state) => ({
    calendar: { ...state.calendar, day: 4, startDateIso: '2026-06-01' },
    history: {
      ...state.history,
      timeline: [{
        day: 3,
        week: 1,
        cash: 500100,
        totalIncome: 100,
        totalExpenses: 0,
        incomeBreakdown: {
          sponsor: 0,
          event: 100,
          merchandise: 0,
          thirdParty: 0,
          webSubscription: 0,
        },
        expenseBreakdown: {},
      }],
    },
  }))
}

describe('ManageFinancesModule event gate breakdown', () => {
  beforeEach(() => {
    testStorage.clear()
    seedTimeline([makeEventGateBreakdown({ day: 3, eventName: 'Festival of Grappling', eventId: 'gate-event-1' })])
  })

  it('opens a detailed modal from the selected Event Gate amount', () => {
    render(<ManageFinancesModule />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('dashboard.finances.tabs.income') }))

    const amountLabel = i18n.t('dashboard.finances.gateDetails.viewAmount', {
      period: 'Jun 3',
      amount: '$4,987',
    })
    const amountButton = screen.getByRole('button', { name: amountLabel })
    fireEvent.click(amountButton)

    expect(screen.getByRole('dialog', { name: i18n.t('dashboard.finances.gateDetails.title') })).toBeTruthy()
    expect(screen.getByText('Festival of Grappling')).toBeTruthy()
    expect(screen.getByText('Summit Sponsor')).toBeTruthy()
    expect(screen.getByText(/Morgan Hale attended/)).toBeTruthy()
    expect(screen.getByRole('heading', {
      level: 5,
      name: i18n.t('dashboard.finances.gateDetails.attendanceTitle'),
    })).toBeTruthy()
    expect(screen.getByText(i18n.t('dashboard.finances.gateDetails.ticketRevenue'))).toBeTruthy()
    expect(screen.getByText('$4,000')).toBeTruthy()
    expect(screen.getByRole('heading', {
      level: 5,
      name: i18n.t('dashboard.finances.gateDetails.segmentBonuses'),
    })).toBeTruthy()
    expect(screen.getByText(i18n.t('dashboard.eventResults.audienceSegmentLabels.hardcore'))).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('$4,987')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(amountButton)
  })

  it('opens all individual event details belonging to a monthly Event Gate amount', () => {
    const firstEvent = makeEventGateBreakdown({ day: 3, eventName: 'Festival of Grappling', eventId: 'gate-event-1' })
    const secondEvent = makeEventGateBreakdown({ day: 10, eventName: 'Summer Slam Night', eventId: 'gate-event-2' })
    seedTimeline([firstEvent, secondEvent])
    render(<ManageFinancesModule />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('dashboard.finances.tabs.income') }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('dashboard.finances.period.monthly') }))

    const amountLabel = i18n.t('dashboard.finances.gateDetails.viewAmount', {
      period: 'Jun 2026',
      amount: '$9,974',
    })
    fireEvent.click(screen.getByRole('button', { name: amountLabel }))

    expect(screen.getByText('Festival of Grappling')).toBeTruthy()
    expect(screen.getByText('Summer Slam Night')).toBeTruthy()
    for (const eventName of ['Festival of Grappling', 'Summer Slam Night']) {
      const eventCard = screen.getByText(eventName).closest('article')
      expect(eventCard.textContent).toContain('$4,987')
    }
    expect(screen.getByText('$9,974', { selector: 'strong' })).toBeTruthy()
  })

  it('labels legacy Event Gate amounts that do not have saved event details', () => {
    seedLegacyTimeline()
    render(<ManageFinancesModule />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('dashboard.finances.tabs.income') }))
    fireEvent.click(screen.getByRole('button', {
      name: i18n.t('dashboard.finances.gateDetails.viewAmount', {
        period: 'Jun 3',
        amount: '$100',
      }),
    }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(i18n.t('dashboard.finances.gateDetails.archivedAmount', { amount: '$100' }))).toBeTruthy()
    expect(screen.queryByText('Festival of Grappling')).toBeNull()
  })
})
