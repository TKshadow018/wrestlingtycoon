import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import '../../i18n'
import BackstageInjuryModal from './BackstageInjuryModal'

it('shows the wrestler, localized injury reason, and recovery duration', () => {
  const markup = renderToStaticMarkup(createElement(BackstageInjuryModal, {
    injury: {
      employeeId: 'wrestler-1',
      employeeName: 'Test Wrestler',
      reasonId: 'sprainedWrist',
      occurredDay: 10,
      returnDay: 34,
    },
    onDismiss: vi.fn(),
  }))

  expect(markup).toContain('role="dialog"')
  expect(markup).toContain('Test Wrestler')
  expect(markup).toContain('Sprained wrist')
  expect(markup).toContain('24 days')
})
