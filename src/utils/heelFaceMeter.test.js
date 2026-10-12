import { describe, expect, it } from 'vitest'
import {
  applyHeelFaceNeutralDecay,
  clampHeelFaceMeter,
  computeHeelFaceShift,
  getHeelFaceStageIndex,
  getHeelFaceStageLabel,
} from './heelFaceMeter'

describe('heel/face meter', () => {
  it('clamps and rounds numeric values while replacing non-finite values with neutral', () => {
    expect(clampHeelFaceMeter(-4)).toBe(0)
    expect(clampHeelFaceMeter(50.6)).toBe(51)
    expect(clampHeelFaceMeter(104)).toBe(100)
    expect(clampHeelFaceMeter('not a number')).toBe(50)
    expect(clampHeelFaceMeter(Number.POSITIVE_INFINITY)).toBe(50)
  })

  it('maps the meter to every alignment stage and its boundary values', () => {
    expect(getHeelFaceStageIndex(0)).toBe(0)
    expect(getHeelFaceStageLabel(9)).toBe('Babyface')
    expect(getHeelFaceStageLabel(10)).toBe('Pure Babyface')
    expect(getHeelFaceStageLabel(50)).toBe('Neutral')
    expect(getHeelFaceStageLabel(100)).toBe('Super Heel')
  })

  it('shifts winners and losers according to the opponent alignment', () => {
    expect(computeHeelFaceShift(56, true, 5)).toBe(-3)
    expect(computeHeelFaceShift(44, true, 5)).toBe(3)
    expect(computeHeelFaceShift(50, true, 5)).toBe(-1)
    expect(computeHeelFaceShift(56, false, 5)).toBe(-1)
    expect(computeHeelFaceShift(44, false, 5)).toBe(1)
    expect(computeHeelFaceShift(50, false, 5)).toBe(1)
  })

  it('bounds match-rating multipliers and applies gradual neutral decay', () => {
    expect(computeHeelFaceShift(80, true, 0)).toBe(-1)
    expect(computeHeelFaceShift(80, true, 10)).toBe(-6)
    expect(computeHeelFaceShift(80, true, undefined)).toBe(-3)
    expect(applyHeelFaceNeutralDecay(82)).toBe(81)
    expect(applyHeelFaceNeutralDecay(18)).toBe(19)
    expect(applyHeelFaceNeutralDecay(50)).toBe(50)
    expect(applyHeelFaceNeutralDecay('invalid')).toBe(50)
  })
})
