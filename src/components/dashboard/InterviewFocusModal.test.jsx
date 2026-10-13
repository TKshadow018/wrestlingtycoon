import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import InterviewFocusModal from './InterviewFocusModal'

describe('InterviewFocusModal', () => {
  it('shows the featured wrestler and rival selectors before starting the interview', () => {
    const html = renderToStaticMarkup(createElement(InterviewFocusModal, {
      isOpen: true,
      wrestlers: [
        { employeeId: 'ace', name: 'Ace', popularity: 90 },
        { employeeId: 'blaze', name: 'Blaze', popularity: 80 },
      ],
      onStart: () => {},
      onCancel: () => {},
    }))

    expect(html).toContain('Interview Focus')
    expect(html).toContain('Featured Wrestler')
    expect(html).toContain('Rival')
    expect(html).toContain('Start Interview')
    expect(html).toContain('value="ace"')
    expect(html).toContain('value="blaze"')
    expect(html).toContain('Ace')
    expect(html).toContain('Blaze')
  })
})
