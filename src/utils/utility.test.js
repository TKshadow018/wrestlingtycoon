import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomInRange } from './utility'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('randomInRange', () => {
  it('selects uniformly across an unmodified inclusive range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(randomInRange(2, 4)).toBe(4)
  })

  it('applies weight multipliers, exclusions, and explicit weights', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(randomInRange(1, 4, [
      { type: 'exclude', min: 1, max: 1 },
      { type: 'setWeight', min: 2, max: 2, weight: 5 },
      { type: 'multiplyWeight', min: 3, max: 3, by: 2 },
    ])).toBe(2)

    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(randomInRange(1, 3, [
      { type: 'multiplyWeight', min: 1, max: 3, by: 0 },
      { type: 'setWeight', min: 3, max: 3, weight: 4 },
    ])).toBe(3)
  })

  it('rejects unknown modifiers and returns undefined when every value is excluded', () => {
    expect(() => randomInRange(1, 1, [{ type: 'unknown', min: 1, max: 1 }]))
      .toThrow('Unknown modifier: unknown')
    expect(randomInRange(1, 2, [{ type: 'exclude', min: 1, max: 2 }])).toBeUndefined()
  })
})
