import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import '../../i18n'
import InjuryStatus from './InjuryStatus'

it('shows remaining injury time even at full stamina, and hides it on the return day', () => {
  const employee = { stamina: 100, injury: { type: 'exhaustion', occurredDay: 1, returnDay: 15 } }
  expect(renderToStaticMarkup(createElement(InjuryStatus, { employee, day: 5 }))).toContain('Injured')
  expect(renderToStaticMarkup(createElement(InjuryStatus, { employee, day: 5 }))).toContain('10 days')
  expect(renderToStaticMarkup(createElement(InjuryStatus, { employee, day: 15 }))).toBe('')
})

it('shows the localized reason for a backstage injury', () => {
  const employee = {
    stamina: 100,
    injury: { type: 'backstage', reasonId: 'sprainedWrist', occurredDay: 1, returnDay: 25 },
  }

  expect(renderToStaticMarkup(createElement(InjuryStatus, { employee, day: 5 })))
    .toContain('Injured backstage: Sprained wrist')
})
