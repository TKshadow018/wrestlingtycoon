export const WRESTLER_PRESTIGE_UNLOCK_THRESHOLDS = [100, 300, 800, 1500]

const getCandidateId = (candidate) => candidate?.id || candidate?.personId || candidate?.candidateId

export const annotateWrestlerUnlockTiers = (candidates = []) => {
  const wrestlers = candidates.filter((candidate) => candidate?.role === 'wrestler')
  const lockedCount = Math.ceil(wrestlers.length / 2)
  const ranked = [...wrestlers].sort((left, right) => {
    const popularityDifference = (Number(right.popularity) || 0) - (Number(left.popularity) || 0)
    return popularityDifference || String(getCandidateId(left)).localeCompare(String(getCandidateId(right)))
  })
  const tierById = new Map(ranked.map((candidate, index) => {
    const tier = index < lockedCount
      ? Math.max(1, WRESTLER_PRESTIGE_UNLOCK_THRESHOLDS.length - Math.floor(index * WRESTLER_PRESTIGE_UNLOCK_THRESHOLDS.length / lockedCount))
      : 0
    return [getCandidateId(candidate), tier]
  }))

  return candidates.map((candidate) => (
    candidate?.role === 'wrestler'
      ? { ...candidate, wrestlerUnlockTier: tierById.get(getCandidateId(candidate)) || 0 }
      : candidate
  ))
}

export const getWrestlerPrestigeRequirement = (candidate, prestige, unlockedIds = []) => {
  if (candidate?.role !== 'wrestler' || Number(candidate.wrestlerUnlockTier) <= 0) {
    return null
  }
  if (unlockedIds.includes(getCandidateId(candidate))) {
    return null
  }

  const requiredPrestige = WRESTLER_PRESTIGE_UNLOCK_THRESHOLDS[Number(candidate.wrestlerUnlockTier) - 1]
  if (!requiredPrestige || Number(prestige) >= requiredPrestige) {
    return null
  }

  return requiredPrestige
}

export const getNextWrestlerGoalUnlock = (candidates = [], prestige = 0, unlockedIds = []) => {
  const nextCandidate = candidates
    .filter((candidate) => candidate?.role === 'wrestler')
    .filter((candidate) => getWrestlerPrestigeRequirement(candidate, prestige, unlockedIds) !== null)
    .sort((left, right) => (
      (Number(left.popularity) || 0) - (Number(right.popularity) || 0)
      || String(getCandidateId(left)).localeCompare(String(getCandidateId(right)))
    ))[0]

  return nextCandidate ? getCandidateId(nextCandidate) : null
}
