const MIN_HEEL_FACE_METER = 0
const MAX_HEEL_FACE_METER = 100
const DEFAULT_HEEL_FACE_METER = 50

const HEEL_FACE_STAGE_KEYS = [
  'babyface',
  'pureBabyface',
  'fanFavorite',
  'crowdFavorite',
  'risingFace',
  'neutral',
  'tweenerHeel',
  'heel',
  'dirtyHeel',
  'topHeel',
  'superHeel',
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
  return Math.min(HEEL_FACE_STAGE_KEYS.length - 1, Math.floor(clampedValue / 10))
}

export const getHeelFaceStageKey = (value) => {
  return HEEL_FACE_STAGE_KEYS[getHeelFaceStageIndex(value)] || 'neutral'
}

export const DEFAULT_HEEL_FACE_METER_VALUE = DEFAULT_HEEL_FACE_METER

// Thresholds used to classify opponents
const HEEL_THRESHOLD = 55
const FACE_THRESHOLD = 45

/**
 * Compute how much a wrestler's heel/face meter should shift after a match,
 * based on the opponent's alignment and match quality.
 *
 * Lower values = more Face, Higher values = more Heel.
 *
 * @param {number} opponentAvgMeter  - averaged heelFaceMeter of all opponents
 * @param {boolean} isWinner         - did this wrestler win the match?
 * @param {number} matchRating       - match rating on a 1-10 scale
 * @returns {number} shift amount (negative = toward Face, positive = toward Heel)
 */
export const computeHeelFaceShift = (opponentAvgMeter, isWinner, matchRating) => {
  const ratingMultiplier = Math.max(0.5, Math.min(2.0, (matchRating ?? 5) / 5))

  const opponentIsHeel = opponentAvgMeter > HEEL_THRESHOLD
  const opponentIsFace = opponentAvgMeter < FACE_THRESHOLD

  let baseShift = 0

  if (isWinner) {
    if (opponentIsHeel)  baseShift = -3  // beat a heel  → hero, crowd cheers
    else if (opponentIsFace) baseShift = +3  // beat a face  → villain, crowd boos
    else                 baseShift = -1  // beat neutral → slight face pop
  } else {
    if (opponentIsHeel)  baseShift = -1  // lost to a heel → sympathy, slight face
    else if (opponentIsFace) baseShift = +1  // lost to a face → deserved it, slight heel
    else                 baseShift = +1  // lost to neutral → slight heel
  }

  return Math.round(baseShift * ratingMultiplier)
}

/**
 * Apply one step of natural decay toward Neutral (50).
 * Called once per event week so alignment slowly drifts back without active booking.
 */
export const applyHeelFaceNeutralDecay = (value) => {
  const meter = clampHeelFaceMeter(value)
  if (meter > 50) return meter - 1
  if (meter < 50) return meter + 1
  return meter
}
