const MIN_HEEL_FACE_METER = 0
const MAX_HEEL_FACE_METER = 100
const DEFAULT_HEEL_FACE_METER = 50

const HEEL_FACE_STAGE_LABELS = [
  'Babyface',
  'Pure Babyface',
  'Fan Favorite',
  'Crowd Favorite',
  'Rising Face',
  'Neutral',
  'Tweener Heel',
  'Heel',
  'Dirty Heel',
  'Top Heel',
  'Super Heel',
]

export const clampHeelFaceMeter = (value) => {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return DEFAULT_HEEL_FACE_METER
  }

  return Math.max(MIN_HEEL_FACE_METER, Math.min(MAX_HEEL_FACE_METER, Math.round(numeric)))
}

export const getHeelFaceStageIndex = (value) => {
  const clampedValue = clampHeelFaceMeter(value)
  return Math.min(HEEL_FACE_STAGE_LABELS.length - 1, Math.floor(clampedValue / 10))
}

export const getHeelFaceStageLabel = (value) => {
  return HEEL_FACE_STAGE_LABELS[getHeelFaceStageIndex(value)] || 'Neutral'
}

export const DEFAULT_HEEL_FACE_METER_VALUE = DEFAULT_HEEL_FACE_METER
