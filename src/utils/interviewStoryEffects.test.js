import { describe, expect, it } from 'vitest'
import { computeInterviewImpactPreview, computeInterviewStoryEffects } from './interviewStoryEffects'

describe('interview story effects', () => {
  it('calculates bounded audience impact consistently, including the pre-show bonus', () => {
    const metrics = { score: 6, professionalism: 4, hype: 5, controversy: 2 }
    const regular = computeInterviewImpactPreview({ metrics })
    const preShow = computeInterviewImpactPreview({ metrics, forcedPreShow: true })

    expect(regular).toEqual({ fansDelta: 132, prestigeDelta: 5 })
    expect(preShow).toEqual({ fansDelta: 178, prestigeDelta: 7 })
  })

  it('turns a focused provocative interview toward Heel and intensifies its rivalry', () => {
    expect(computeInterviewStoryEffects({
      metrics: { professionalism: 0, hype: 0, controversy: 12, answerCount: 3 },
      answerCount: 3,
    })).toEqual({
      alignmentDelta: 4,
      rivalryHeatDelta: 4,
    })
  })

  it('rewards measured professional answers with Face alignment and lower rivalry heat', () => {
    expect(computeInterviewStoryEffects({
      metrics: { professionalism: 12, hype: 0, controversy: 0, answerCount: 3 },
      answerCount: 3,
    })).toEqual({
      alignmentDelta: -2,
      rivalryHeatDelta: -2,
    })
  })

  it('clamps accumulated totals and prevents invalid counts from affecting the result', () => {
    expect(computeInterviewStoryEffects({
      metrics: { professionalism: -100, hype: 100, controversy: 500, answerCount: 0 },
      answerCount: 0,
    })).toEqual({
      alignmentDelta: 5,
      rivalryHeatDelta: 8,
    })
  })
})
