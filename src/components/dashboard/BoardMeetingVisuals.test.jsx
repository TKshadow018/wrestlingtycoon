import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import BoardMeetingModal from './BoardMeetingModal'
import EventCalendar from './modules/EventCalendar'

const boardImages = {
  standard: '/Events/Board/board-meeting.jpeg',
  election: '/Events/Board/special-borad-meeting.jpeg',
}

const renderCalendar = (startDateIso) => renderToStaticMarkup(createElement(EventCalendar, {
  gameDay: 1,
  startDateIso,
  regularWeeklyEvent: { name: 'Weekly TV Show', type: 'regularWeekly', maxMatches: 5 },
  customEvents: [],
}))

const renderMeeting = (isJanuary) => renderToStaticMarkup(createElement(BoardMeetingModal, {
  meeting: {
    isJanuary,
    agendas: [],
    currentAgendaIndex: 0,
    financeReport: {
      operatingNet: 0,
      completedDays: 0,
      totalIncome: 0,
      totalExpenses: 0,
      cashOnHand: 0,
    },
    negativeFinanceMonths: 0,
    decisions: [],
    status: 'inProgress',
  },
  relation: 50,
  boardPresidentName: 'President',
  boardVicePresidentName: 'Vice President',
  managerName: 'Manager',
  onResolve: () => ({ ok: true }),
  onFinish: () => {},
}))

describe('board meeting event visuals', () => {
  it('shows the standard meeting image on non-January calendar meetings', () => {
    const html = renderCalendar('2026-02-01')

    expect(html).toContain(`src="${boardImages.standard}"`)
    expect(html).not.toContain(boardImages.election)
  })

  it('shows the election meeting image on the January calendar meeting', () => {
    const html = renderCalendar('2026-01-01')

    expect(html).toContain(`src="${boardImages.election}"`)
    expect(html).not.toContain(boardImages.standard)
  })

  it('shows the standard image in the event-day meeting modal', () => {
    expect(renderMeeting(false)).toContain(`src="${boardImages.standard}"`)
  })

  it('shows the election image in the January event-day meeting modal', () => {
    expect(renderMeeting(true)).toContain(`src="${boardImages.election}"`)
  })
})
