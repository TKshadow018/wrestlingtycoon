import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEventTemplates } from './eventTemplates'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createEventTemplates', () => {
  it('creates all base templates with bounded randomized fields and unique keys', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.spyOn(Date, 'now').mockReturnValue(1234)

    const templates = createEventTemplates()

    expect(templates).toHaveLength(5)
    expect(templates.map(({ eventId }) => eventId)).toEqual([
      'tv-night',
      'arena-show',
      'ppv',
      'street-fight',
      'championship',
    ])
    expect(templates.every(({ hype, risk }) => hype === 55 && risk === 8)).toBe(true)
    expect(templates.map(({ templateKey }) => templateKey)).toEqual([
      'tv-night-1234-100',
      'arena-show-1234-100',
      'ppv-1234-100',
      'street-fight-1234-100',
      'championship-1234-100',
    ])
  })
})
