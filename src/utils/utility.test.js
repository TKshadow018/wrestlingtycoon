import { afterEach, describe, expect, it, vi } from 'vitest'
import { average, clamp, createStableKey, formatNumber, randomInRange } from './utility'

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

describe('shared utility functions', () => {
  it('clamps values to inclusive bounds', () => {
    expect(clamp(-2, 0, 10)).toBe(0)
    expect(clamp(12, 0, 10)).toBe(10)
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('averages values and returns zero for an empty list', () => {
    expect(average([2, 4, 6])).toBe(4)
    expect(average([])).toBe(0)
  })

  it('creates a sorted key without mutating the input', () => {
    const ids = ['b', 'a']

    expect(createStableKey(ids)).toBe('a::b')
    expect(ids).toEqual(['b', 'a'])
    expect(createStableKey(['b', 'a'], '|')).toBe('a|b')
  })

  it('formats numbers using the requested locale', () => {
    expect(formatNumber(1234567, 'en-US')).toBe('1,234,567')
    expect(formatNumber(1234567, 'de-DE')).toBe('1.234.567')
  })
})
