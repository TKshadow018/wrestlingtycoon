import { clamp } from './utility'

const asMetric = (metrics, key) => {
  const value = Number(metrics?.[key])
  return Number.isFinite(value) ? value : 0
}

export const computeInterviewImpactPreview = ({ metrics = {}, forcedPreShow = false } = {}) => {
  const score = asMetric(metrics, 'score')
  const professionalism = asMetric(metrics, 'professionalism')
  const hype = asMetric(metrics, 'hype')
  const controversy = asMetric(metrics, 'controversy')
  const multiplier = forcedPreShow ? 1.35 : 1

  return {
    fansDelta: Math.round(((score * 18) + (hype * 4) + (professionalism * 2) - (controversy * 2)) * multiplier),
    prestigeDelta: Math.round(((score / 2) + (professionalism / 3) + (hype / 4) - (controversy / 4)) * multiplier),
  }
}

export const computeInterviewStoryEffects = ({ metrics = {}, answerCount } = {}) => {
  const requestedCount = Number(answerCount ?? metrics.answerCount)
  const count = Number.isFinite(requestedCount) && requestedCount > 0
    ? requestedCount
    : 1
  const professionalism = asMetric(metrics, 'professionalism')
  const hype = asMetric(metrics, 'hype')
  const controversy = asMetric(metrics, 'controversy')

  return {
    alignmentDelta: clamp(
      Math.round((controversy - (professionalism * 0.5) - (hype * 0.5)) / count),
      -5,
      5,
    ),
    rivalryHeatDelta: clamp(
      Math.round((controversy + (hype * 0.5) - (professionalism * 0.5)) / count),
      -5,
      8,
    ),
  }
}
