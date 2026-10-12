import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import matchTypeCatalog from '../../../data/matchTypes.json'
import {
  DEFAULT_CAREER_ARC_UNLOCKS,
  getUnlockedCareerArcItems,
} from '../../../data/careerArcUnlocks'
import { calculateRanking } from '../../../utils/wrestlerRank'
import styles from './EventSetupModal.module.scss'

// ─── Segment type definitions ─────────────────────────────────────────────────
const SEGMENT_TYPES = [
  { value: 'match',      label: 'Match',       hasReferee: true,  announcerMode: 'none' },
  { value: 'mainEvent',  label: 'Main Event',  hasReferee: true,  announcerMode: 'required' },
  { value: 'titleMatch', label: 'Title Match', hasReferee: true,  announcerMode: 'optional' },
  { value: 'interview',  label: 'Interview',   hasReferee: false, announcerMode: 'required' },
  { value: 'promo',      label: 'Promo',       hasReferee: false, announcerMode: 'optional' },
]

const getSegmentConfig = (segmentType) =>
  SEGMENT_TYPES.find((s) => s.value === segmentType) ?? SEGMENT_TYPES[0]

const buildInitialSegment = (index) => ({
  id: `segment-${index + 1}`,
  segmentType: 'match',
  promoSegmentId: DEFAULT_CAREER_ARC_UNLOCKS.promoSegments[0],
  matchType: 'singles',
  matchStipulation: 'singles',
  wrestlerIds: [],
  team1Ids: [],
  team2Ids: [],
  refereeId: null,
  announcerId: null,
  titleId: null,
  cashInByEmployeeId: null,
})

const buildInitialSegments = (totalSegments) =>
  Array.from({ length: Math.max(1, totalSegments) }, (_, i) => buildInitialSegment(i))

const getFallbackImage = (gender) =>
  gender === 'female' ? '/people/girl.png' : '/people/boy.png'

const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])
const DEFAULT_MATCH_STIPULATION = 'singles'
const MIN_MATCH_STAMINA_LOSS = 20
const MAX_MATCH_STAMINA_LOSS = 50

const clampMatchRating = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return Math.max(1, Math.min(10, Number(numeric.toFixed(1))))
}

const rollStaminaLoss = () => (
  Math.floor(Math.random() * (MAX_MATCH_STAMINA_LOSS - MIN_MATCH_STAMINA_LOSS + 1)) + MIN_MATCH_STAMINA_LOSS
)

const calculatePreviewMatchRating = (wrestlers = []) => {
  if (!Array.isArray(wrestlers) || wrestlers.length === 0) {
    return null
  }

  const averageSkill = wrestlers.reduce((sum, wrestler) => sum + (Number(wrestler?.skill) || 0), 0) / wrestlers.length
  const averageStamina = wrestlers.reduce((sum, wrestler) => sum + Math.max(0, Math.min(100, Number(wrestler?.stamina) || 0)), 0) / wrestlers.length
  const skillFactor = (averageSkill / 100) * 6.5
  const staminaFactor = (averageStamina / 100) * 2.5
  const randomFactor = (Math.random() * 2) - 1
  return clampMatchRating(1 + skillFactor + staminaFactor + randomFactor)
}

const buildCrowdFeedback = ({ matchRating, winnerName, wrestlers, t }) => {
  if (!Number.isFinite(matchRating)) {
    return []
  }

  const feedback = []
  if (matchRating >= 8.5) {
    feedback.push(t('dashboard.events.setup.execution.feedbackHot', 'The crowd was electric from bell to bell.'))
  } else if (matchRating >= 7) {
    feedback.push(t('dashboard.events.setup.execution.feedbackSolid', 'Fans stayed invested and reacted to the key moments.'))
  } else {
    feedback.push(t('dashboard.events.setup.execution.feedbackCold', 'The audience reaction was mixed in this segment.'))
  }

  if (winnerName) {
    feedback.push(t('dashboard.events.setup.execution.feedbackWinner', '{{name}} got one of the loudest reactions of the night.', { name: winnerName }))
  }

  const highPopularity = (wrestlers || []).find((wrestler) => Number(wrestler?.popularity ?? 0) >= 75)
  if (highPopularity) {
    feedback.push(t('dashboard.events.setup.execution.feedbackStarPower', '{{name}}\'s star power pulled the crowd in.', { name: highPopularity.name }))
  }

  return feedback.slice(0, 3)
}

const getTitleDivisionByMatchType = (matchType) =>
  matchType === 'tagTeam' ? 'doubles' : 'singles'

const getSegmentWrestlerIds = (segment) => {
  const matchType = segment?.matchType === 'tagTeam' ? 'tagTeam' : 'singles'
  const cashInId =
    segment?.segmentType === 'titleMatch' && typeof segment?.cashInByEmployeeId === 'string'
      ? segment.cashInByEmployeeId
      : null
  if (MATCH_SEGMENT_TYPES.has(segment?.segmentType) && matchType === 'tagTeam') {
    return Array.from(new Set([...(segment.team1Ids || []), ...(segment.team2Ids || []), cashInId].filter(Boolean)))
  }

  return Array.from(new Set([...(segment?.wrestlerIds || []), cashInId].filter(Boolean)))
}

const normalizeSegmentsForSubmit = (segments) => {
  return segments.map((segment) => ({
    segmentType: segment.segmentType,
    promoSegmentId: segment.segmentType === 'promo'
      ? segment.promoSegmentId || DEFAULT_CAREER_ARC_UNLOCKS.promoSegments[0]
      : null,
    matchType: MATCH_SEGMENT_TYPES.has(segment.segmentType)
      ? (segment.matchType === 'tagTeam' ? 'tagTeam' : 'singles')
      : null,
    matchStipulation: MATCH_SEGMENT_TYPES.has(segment.segmentType)
      ? (segment.matchStipulation || DEFAULT_MATCH_STIPULATION)
      : null,
    wrestlerIds: getSegmentWrestlerIds(segment),
    team1Ids: segment.matchType === 'tagTeam' ? segment.team1Ids : [],
    team2Ids: segment.matchType === 'tagTeam' ? segment.team2Ids : [],
    refereeId: segment.refereeId,
    announcerId: segment.announcerId,
    titleId: segment.segmentType === 'titleMatch' ? segment.titleId || null : null,
    cashInByEmployeeId: segment.segmentType === 'titleMatch' ? segment.cashInByEmployeeId || null : null,
    interviewPopularityChanges: segment.interviewPopularityChanges || [],
    participantIds: Array.from(
      new Set([...getSegmentWrestlerIds(segment), segment.refereeId, segment.announcerId].filter(Boolean)),
    ),
  }))
}

const parseIsoDateLocal = (isoDateString) => {
  if (!isoDateString) {
    return null
  }

  const [yearStr, monthStr, dayStr] = isoDateString.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

const formatGameDateFromDay = (startDateIso, day) => {
  const baseDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const buildPairKey = (leftId, rightId) => [leftId, rightId].sort().join('::')

const normalizeTeamParticipantIds = (participantIds = []) => (
  Array.from(new Set(participantIds.filter(Boolean))).sort()
)

const getAnnouncerMode = (segmentType) => getSegmentConfig(segmentType)?.announcerMode || 'none'
const showsAnnouncerSlot = (segmentType) => getAnnouncerMode(segmentType) !== 'none'
const requiresAnnouncer = (segmentType) => getAnnouncerMode(segmentType) === 'required'

const slugifyToken = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const getEmployeeId = (employee) => {
  if (employee?.employeeId != null) {
    const employeeId = String(employee.employeeId).trim()
    if (employeeId) {
      return employeeId
    }
  }

  if (employee?.id != null) {
    const id = String(employee.id).trim()
    if (id) {
      return id
    }
  }

  if (employee?.personId != null) {
    const personId = String(employee.personId).trim()
    if (personId) {
      return `legacy-${personId}`
    }
  }

  const roleToken = slugifyToken(employee?.role) || 'employee'
  const nameToken = slugifyToken(employee?.name) || 'unknown'
  const genderToken = slugifyToken(employee?.gender) || 'u'
  const dobToken = slugifyToken(employee?.dob) || 'na'
  return `legacy-${roleToken}-${nameToken}-${genderToken}-${dobToken}`
}

const sortEmployeesByRank = (employees = [], wrestlerRankById = new Map()) => {
  const list = Array.isArray(employees) ? [...employees] : []

  return list.sort((left, right) => {
    const leftRank = Number(wrestlerRankById.get(getEmployeeId(left)) || 0)
    const rightRank = Number(wrestlerRankById.get(getEmployeeId(right)) || 0)
    const leftIsWrestler = left.role === 'wrestler'
    const rightIsWrestler = right.role === 'wrestler'

    if (leftIsWrestler && rightIsWrestler) {
      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }
      return left.name.localeCompare(right.name)
    }

    if (leftIsWrestler && !rightIsWrestler) {
      return -1
    }

    if (!leftIsWrestler && rightIsWrestler) {
      return 1
    }

    return left.name.localeCompare(right.name)
  })
}

// ─── PersonCard ───────────────────────────────────────────────────────────────
function PersonCard({ employee, onRemove, onDragStart, isCashIn, currentRank }) {
  const { t } = useTranslation()
  const stamina = Number(employee?.stamina ?? 100)
  const isLowStaminaWrestler = employee.role === 'wrestler' && stamina < 10
  const showRankBadge = employee.role === 'wrestler' && Number.isFinite(Number(currentRank)) && Number(currentRank) > 0
  const employeeId = getEmployeeId(employee)

  return (
    <div
      className={`${styles.personCard} ${onDragStart ? styles.personCardDraggable : ''} ${onRemove ? styles.personCardAssigned : ''}`}
      draggable={Boolean(onDragStart && employeeId)}
      onDragStart={onDragStart && employeeId ? (e) => onDragStart(e, employeeId) : undefined}
    >
      <img
        className={styles.personAvatar}
        src={employee.imageUrl || getFallbackImage(employee.gender)}
        alt={employee.name}
        onError={(e) => {
          if (!e.currentTarget.dataset.fb) {
            e.currentTarget.dataset.fb = '1'
            e.currentTarget.src = getFallbackImage(employee.gender)
          }
        }}
      />
      {showRankBadge ? <span className={styles.personRankBadge}>#{Number(currentRank)}</span> : null}
      <div className={styles.personMetaOverlay}>
        <span className={styles.personName}>{employee.name}</span>
        {employee.role === 'wrestler' && (
          <span className={`${styles.personStamina} ${isLowStaminaWrestler ? styles.personStaminaLow : ''}`}>
            {t('dashboard.employees.stamina', { amount: stamina })}
          </span>
        )}
        {employee.role !== 'wrestler' && (
          <span className={styles.personRole}>{employee.role}</span>
        )}
      </div>
      {isCashIn && (
        <span className={styles.mitbBadge}>💰 Cash In</span>
      )}
      {onRemove && (
        <button type="button" className={styles.removeBtn} onClick={onRemove} aria-label="Remove">
          ×
        </button>
      )}
    </div>
  )
}

// ─── AvailablePool ────────────────────────────────────────────────────────────
function AvailablePool({ label, employees, blockedIds, cashInEmployeeId, wrestlerRankById }) {
  const available = sortEmployeesByRank(
    employees.filter((employee) => {
      const id = getEmployeeId(employee)
      return Boolean(id) && !blockedIds.includes(id)
    }),
    wrestlerRankById,
  )

  const handleDragStart = (e, employeeId) => {
    if (!employeeId) {
      return
    }

    e.dataTransfer.setData('text/plain', employeeId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className={styles.poolWrapper}>
      <span className={styles.zoneLabel}>{label}</span>
      <div className={styles.pool}>
        {available.length === 0 ? (
          <p className={styles.emptyHint}>None available</p>
        ) : (
          available.map((emp) => {
            const employeeId = getEmployeeId(emp)
            return (
            <PersonCard
              key={employeeId}
              employee={emp}
              onDragStart={handleDragStart}
              isCashIn={cashInEmployeeId != null && employeeId === cashInEmployeeId}
              currentRank={wrestlerRankById.get(employeeId) || null}
            />
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── DropZone ─────────────────────────────────────────────────────────────────
function DropZone({ label, subLabel, employees, onDrop, onRemove, maxSlots, hint, cashInEmployeeId, wrestlerRankById }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const isFull = maxSlots != null && employees.length >= maxSlots
  const sortedEmployees = sortEmployeesByRank(employees, wrestlerRankById)

  const handleDragOver = (e) => {
    if (isFull) return
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    if (isFull) return
    const id = e.dataTransfer.getData('text/plain')
    if (id) onDrop(id)
  }

  return (
    <div className={styles.dropZoneWrapper}>
      <span className={styles.zoneLabel}>
        {label}
        {maxSlots === 1 && <span className={styles.slotBadge}> · 1 slot</span>}
      </span>
      {subLabel ? <p className={styles.zoneSubLabel}>{subLabel}</p> : null}
      <div
        className={[
          styles.dropZone,
          isDragOver ? styles.dropZoneHover : '',
          isFull ? styles.dropZoneFull : '',
        ].filter(Boolean).join(' ')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {sortedEmployees.length === 0 ? (
          <p className={styles.dropHint}>{hint ?? 'Drag here'}</p>
        ) : (
          sortedEmployees.map((emp) => {
            const employeeId = getEmployeeId(emp)
            return (
            <PersonCard
              key={employeeId}
              employee={emp}
              onRemove={() => {
                if (employeeId) {
                  onRemove(employeeId)
                }
              }}
              isCashIn={cashInEmployeeId != null && employeeId === cashInEmployeeId}
              currentRank={wrestlerRankById.get(employeeId) || null}
            />
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── EventSetupModal ──────────────────────────────────────────────────────────
function EventSetupModal({ isOpen, eventConfig, employees, onClose, onSubmit }) {
  const { t } = useTranslation()
  const titles = useGameStore((state) => state.roster.titles)
  const teams = useGameStore((state) => state.roster.teams)
  const eventLog = useGameStore((state) => state.events.eventLog)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const progressionUnlocks = useGameStore((state) => state.progression.unlocks)
  const unlockedPromoSegments = getUnlockedCareerArcItems('promoSegments', progressionUnlocks)
  const totalSegments = Math.max(1, Number(eventConfig?.totalSegments) || 1)

  const [segments, setSegments] = useState(() => buildInitialSegments(totalSegments))
  const [activeIndex, setActiveIndex] = useState(0)
  const [phase, setPhase] = useState('setup')
  const [executionSegments, setExecutionSegments] = useState([])
  const [executionIndex, setExecutionIndex] = useState(0)
  const [executionResults, setExecutionResults] = useState({})
  const [showExecutionTransition, setShowExecutionTransition] = useState(false)
  const [executionMode, setExecutionMode] = useState('simulate')
  const [pendingExecutionMode, setPendingExecutionMode] = useState(null)
  const [executionChoice, setExecutionChoice] = useState({
    finishType: 'pin',
    riskLevel: 'balanced',
    winnerEmployeeId: null,
    winnerTeam: 'team1',
  })
  const [showExecutionChoicePanel, setShowExecutionChoicePanel] = useState(false)
  const [playSequence, setPlaySequence] = useState([])
  const [playSequenceIndex, setPlaySequenceIndex] = useState(0)
  const [playSequenceActive, setPlaySequenceActive] = useState(false)
  const [error, setError] = useState('')
  const [participantGenderFilter, setParticipantGenderFilter] = useState('all')
  const [participantSearch, setParticipantSearch] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedParticipantHistoryId, setSelectedParticipantHistoryId] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setSegments(buildInitialSegments(totalSegments))
    setActiveIndex(0)
    setPhase('setup')
    setExecutionSegments([])
    setExecutionIndex(0)
    setExecutionResults({})
    setShowExecutionTransition(false)
    setExecutionMode('simulate')
    setPendingExecutionMode(null)
    setExecutionChoice({
      finishType: 'pin',
      riskLevel: 'balanced',
      winnerEmployeeId: null,
      winnerTeam: 'team1',
    })
    setShowExecutionChoicePanel(false)
    setPlaySequence([])
    setPlaySequenceIndex(0)
    setPlaySequenceActive(false)
    setError('')
    setSelectedParticipantHistoryId(null)
    setHistoryOpen(false)
  }, [isOpen, totalSegments])

  // ── Role pools ──────────────────────────────────────────────────────────────
  const allEmployees = employees ?? []
  const wrestlerPool  = useMemo(() => allEmployees.filter((e) => e.role === 'wrestler'),  [allEmployees])
  const managerPool   = useMemo(() => allEmployees.filter((e) => e.role === 'manager'),   [allEmployees])
  const refereePool   = useMemo(() => allEmployees.filter((e) => e.role === 'referee'),   [allEmployees])
  const announcerPool = useMemo(() => allEmployees.filter((e) => e.role === 'announcer'), [allEmployees])

  const wrestlerRankById = useMemo(() => {
    const maleRanked = calculateRanking(wrestlerPool.filter((employee) => employee.gender === 'male'))
    const femaleRanked = calculateRanking(wrestlerPool.filter((employee) => employee.gender === 'female'))
    const rankMap = new Map()

    maleRanked.forEach((employee) => {
      rankMap.set(getEmployeeId(employee), employee.rank)
    })
    femaleRanked.forEach((employee) => {
      rankMap.set(getEmployeeId(employee), employee.rank)
    })

    return rankMap
  }, [wrestlerPool])

  const findById = useCallback((id) => allEmployees.find((employee) => getEmployeeId(employee) === id), [allEmployees])

  const findTeamForParticipants = useCallback((participantIds) => {
    const normalizedIds = normalizeTeamParticipantIds(participantIds)
    if (normalizedIds.length < 2) {
      return null
    }

    const exactTeam = (teams || []).find((team) => {
      const teamIds = normalizeTeamParticipantIds(team.memberIds || [])
      if (teamIds.length !== normalizedIds.length) {
        return false
      }
      return teamIds.every((id, index) => id === normalizedIds[index])
    })

    if (exactTeam) {
      return exactTeam
    }

    return (teams || []).find((team) => {
      const teamIds = new Set(team.memberIds || [])
      return normalizedIds.every((id) => teamIds.has(id))
    }) || null
  }, [teams])

  const formatTagSideLabel = useCallback((participantIds = []) => {
    const members = participantIds.map((id) => findById(id)).filter(Boolean)
    const memberNames = members.map((employee) => employee.name).join(' & ')
    const matchingTeam = findTeamForParticipants(participantIds)
    if (!matchingTeam || !memberNames) {
      return memberNames
    }
    return `${matchingTeam.name} (${memberNames})`
  }, [findById, findTeamForParticipants])

  // ── Active segment ──────────────────────────────────────────────────────────
  const segment = segments[activeIndex]
  if (!segment) return null

  const segCfg      = getSegmentConfig(segment.segmentType)
  const isNonMatch  = segment.segmentType === 'interview' || segment.segmentType === 'promo'
  const isMatchSegment = MATCH_SEGMENT_TYPES.has(segment.segmentType)
  const isTagTeamMatch = isMatchSegment && segment.matchType === 'tagTeam'
  const partPool    = isNonMatch ? [...wrestlerPool, ...managerPool] : wrestlerPool
  const titleForGenderCheck = segment.segmentType === 'titleMatch' && segment.titleId
    ? (titles || []).find((t) => t.titleId === segment.titleId) || null
    : null
  const participantPool = partPool.filter((employee) => {
    const matchesGender = participantGenderFilter === 'all' || employee.gender === participantGenderFilter
    const normalizedSearch = participantSearch.trim().toLowerCase()
    const matchesSearch = !normalizedSearch || employee.name.toLowerCase().includes(normalizedSearch)
    const matchesTitleGender = !titleForGenderCheck || (
      titleForGenderCheck.isWomenOnly ? employee.gender === 'female' : employee.gender === 'male'
    )
    return matchesGender && matchesSearch && matchesTitleGender
  })
  const activeTitles = useMemo(() => (titles || []).filter((title) => title.isActive), [titles])
  const moneyInTheBankTitle = useMemo(
    () => (titles || []).find((title) =>
      title.titleId === 'money-in-the-bank' || /money\s*in\s*the\s*bank/i.test(title.name || ''),
    ) || null,
    [titles],
  )
  const availableTitlesForSegment = useMemo(() => {
    if (segment.segmentType !== 'titleMatch') {
      return activeTitles
    }

    const requiredDivision = getTitleDivisionByMatchType(segment.matchType)
    return activeTitles.filter((title) => title.division === requiredDivision)
  }, [activeTitles, segment.matchType, segment.segmentType])
  const selectedTitle = useMemo(
    () => availableTitlesForSegment.find((title) => title.titleId === segment.titleId) || null,
    [availableTitlesForSegment, segment.titleId],
  )
  const selectedTitleHolder = useMemo(() => {
    if (!selectedTitle?.holderEmployeeId) {
      return null
    }

    return allEmployees.find((employee) => employee.employeeId === selectedTitle.holderEmployeeId) || null
  }, [allEmployees, selectedTitle])
  const moneyInTheBankHolder = useMemo(() => {
    if (!moneyInTheBankTitle?.holderEmployeeId) {
      return null
    }

    const holder = allEmployees.find((employee) => employee.employeeId === moneyInTheBankTitle.holderEmployeeId) || null
    return holder?.role === 'wrestler' ? holder : null
  }, [allEmployees, moneyInTheBankTitle])
  const canShowCashInOption =
    segment.segmentType === 'titleMatch' &&
    segment.matchType !== 'tagTeam' &&
    Boolean(moneyInTheBankHolder)
  const showTitleHolderWarning =
    segment.segmentType === 'titleMatch' &&
    selectedTitle &&
    selectedTitleHolder &&
    !getSegmentWrestlerIds(segment).includes(selectedTitleHolder.employeeId)

  useEffect(() => {
    if (segment.segmentType !== 'titleMatch') {
      return
    }

    const isCurrentTitleAllowed = availableTitlesForSegment.some((title) => title.titleId === segment.titleId)
    if (isCurrentTitleAllowed) {
      return
    }

    const fallbackTitleId = availableTitlesForSegment[0]?.titleId || null
    setSegments((prev) => prev.map((item) => (
      item.id === segment.id
        ? { ...item, titleId: fallbackTitleId }
        : item
    )))
  }, [availableTitlesForSegment, segment.id, segment.segmentType, segment.titleId])

  useEffect(() => {
    if (!canShowCashInOption && segment.cashInByEmployeeId) {
      patchSegment({ cashInByEmployeeId: null })
      return
    }

    if (
      canShowCashInOption &&
      segment.cashInByEmployeeId &&
      segment.cashInByEmployeeId !== moneyInTheBankHolder?.employeeId
    ) {
      patchSegment({ cashInByEmployeeId: null })
    }
  }, [canShowCashInOption, moneyInTheBankHolder?.employeeId, segment.cashInByEmployeeId])

  useEffect(() => {
    if (segment.segmentType !== 'titleMatch' || !segment.titleId) return
    const title = (titles || []).find((t) => t.titleId === segment.titleId)
    if (!title) return
    const requiredGender = title.isWomenOnly ? 'female' : 'male'
    const isInvalid = (id) => {
      const emp = allEmployees.find((e) => e.employeeId === id)
      return emp && emp.role === 'wrestler' && emp.gender !== requiredGender
    }
    const filteredWrestlerIds = (segment.wrestlerIds || []).filter((id) => !isInvalid(id))
    const filteredTeam1 = (segment.team1Ids || []).filter((id) => !isInvalid(id))
    const filteredTeam2 = (segment.team2Ids || []).filter((id) => !isInvalid(id))
    const cashInId = segment.cashInByEmployeeId
    const filteredCashIn = cashInId && isInvalid(cashInId) ? null : cashInId
    const changed =
      filteredWrestlerIds.length !== (segment.wrestlerIds || []).length ||
      filteredTeam1.length !== (segment.team1Ids || []).length ||
      filteredTeam2.length !== (segment.team2Ids || []).length ||
      filteredCashIn !== cashInId
    if (changed) {
      setSegments((prev) => prev.map((s) => s.id !== segment.id ? s : {
        ...s,
        wrestlerIds: filteredWrestlerIds,
        team1Ids: filteredTeam1,
        team2Ids: filteredTeam2,
        cashInByEmployeeId: filteredCashIn,
      }))
    }
  }, [segment.titleId, segment.segmentType])

  const assignedWrestlers  = getSegmentWrestlerIds(segment).map(findById).filter(Boolean)
  const assignedTeam1 = (segment.team1Ids || []).map(findById).filter(Boolean)
  const assignedTeam2 = (segment.team2Ids || []).map(findById).filter(Boolean)
  const assignedTeam1Label = formatTagSideLabel(segment.team1Ids || [])
  const assignedTeam2Label = formatTagSideLabel(segment.team2Ids || [])
  const assignedReferee    = segment.refereeId   ? [findById(segment.refereeId)].filter(Boolean)   : []
  const assignedAnnouncer  = segment.announcerId ? [findById(segment.announcerId)].filter(Boolean) : []
  const selectedSegmentParticipants = getSegmentWrestlerIds(segment).map(findById).filter(Boolean)

  const pairHistoryLookup = useMemo(() => {
    if (selectedSegmentParticipants.length < 2) {
      return new Map()
    }

    const selectedById = new Map(selectedSegmentParticipants.map((employee) => [employee.employeeId, employee]))
    const selectedPairKeys = new Set()

    for (let i = 0; i < selectedSegmentParticipants.length; i += 1) {
      for (let j = i + 1; j < selectedSegmentParticipants.length; j += 1) {
        selectedPairKeys.add(buildPairKey(selectedSegmentParticipants[i].employeeId, selectedSegmentParticipants[j].employeeId))
      }
    }

    const lookup = new Map()

    ;(eventLog || []).forEach((eventEntry) => {
      ;(eventEntry?.segments || []).forEach((segmentEntry) => {
        const participantIds = Array.from(
          new Set(
            (segmentEntry?.participantDetails || [])
              .map((participant) => participant?.employeeId)
              .filter(Boolean),
          ),
        )

        for (let i = 0; i < participantIds.length; i += 1) {
          for (let j = i + 1; j < participantIds.length; j += 1) {
            const leftId = participantIds[i]
            const rightId = participantIds[j]
            const pairKey = buildPairKey(leftId, rightId)

            if (!selectedPairKeys.has(pairKey)) {
              continue
            }

            const previous = lookup.get(pairKey)
            const eventDay = Number(eventEntry?.day) || 0
            const nextCount = (previous?.count || 0) + 1
            const nextLastDay = Math.max(previous?.lastDay || 0, eventDay)
            const leftName = selectedById.get(leftId)?.name || leftId
            const rightName = selectedById.get(rightId)?.name || rightId

            lookup.set(pairKey, {
              pairKey,
              ids: [leftId, rightId],
              names: `${leftName} & ${rightName}`,
              count: nextCount,
              lastDay: nextLastDay,
            })
          }
        }
      })
    })

    return lookup
  }, [eventLog, selectedSegmentParticipants])

  const pairHistoryMatches = useMemo(
    () => Array.from(pairHistoryLookup.values()).sort((a, b) => b.lastDay - a.lastDay),
    [pairHistoryLookup],
  )

  const participantsWithPairHistory = useMemo(() => {
    const highlighted = new Set()
    pairHistoryMatches.forEach((pair) => {
      pair.ids.forEach((id) => highlighted.add(id))
    })
    return highlighted
  }, [pairHistoryMatches])

  const selectedHistoryParticipant = useMemo(
    () => selectedSegmentParticipants.find((employee) => employee.employeeId === selectedParticipantHistoryId) || null,
    [selectedParticipantHistoryId, selectedSegmentParticipants],
  )

  const selectedParticipantLastFiveMatches = useMemo(() => {
    const history = Array.isArray(selectedHistoryParticipant?.matchStats?.matchHistory)
      ? selectedHistoryParticipant.matchStats.matchHistory
      : []

    return [...history]
      .sort((a, b) => (Number(b.day) || 0) - (Number(a.day) || 0))
      .slice(0, 5)
  }, [selectedHistoryParticipant])

  useEffect(() => {
    if (selectedSegmentParticipants.length === 0) {
      setSelectedParticipantHistoryId(null)
      return
    }

    const stillSelected = selectedSegmentParticipants.some(
      (employee) => employee.employeeId === selectedParticipantHistoryId,
    )

    if (!stillSelected) {
      setSelectedParticipantHistoryId(selectedSegmentParticipants[0].employeeId)
    }
  }, [selectedParticipantHistoryId, selectedSegmentParticipants])

  const blockedInSegment = [
    ...getSegmentWrestlerIds(segment),
    segment.refereeId,
    segment.announcerId,
  ].filter(Boolean)

  // ── Segment mutations ───────────────────────────────────────────────────────
  const availableMatchStipulations = useMemo(() => {
    if (!Array.isArray(matchTypeCatalog) || matchTypeCatalog.length === 0) {
      return [{ id: DEFAULT_MATCH_STIPULATION, name: 'Singles' }]
    }

    return matchTypeCatalog
      .map((entry) => ({
        id: typeof entry?.id === 'string' ? entry.id : '',
        name: typeof entry?.name === 'string' ? entry.name : '',
      }))
      .filter((entry) => entry.id && entry.name)
  }, [])

  const activeMatchStipulation = useMemo(() => {
    const requestedId = segment.matchStipulation || DEFAULT_MATCH_STIPULATION
    const selected = availableMatchStipulations.find((entry) => entry.id === requestedId)
    return selected || availableMatchStipulations[0] || { id: DEFAULT_MATCH_STIPULATION, name: 'Singles' }
  }, [availableMatchStipulations, segment.matchStipulation])

  const patchSegment = (patch) => {
    setError('')
    setSegments((prev) => prev.map((s) => (s.id === segment.id ? { ...s, ...patch } : s)))
  }

  const handleTypeChange = (value) => {
    const cfg = getSegmentConfig(value)
    const nextMatchType = MATCH_SEGMENT_TYPES.has(value) ? (segment.matchType || 'singles') : null
    const nextTitleDivision = getTitleDivisionByMatchType(nextMatchType)
    const nextTitleId = value === 'titleMatch'
      ? ((activeTitles.find((title) => title.titleId === segment.titleId && title.division === nextTitleDivision)?.titleId)
        || activeTitles.find((title) => title.division === nextTitleDivision)?.titleId
        || null)
      : null

    patchSegment({
      segmentType: value,
      promoSegmentId: value === 'promo'
        ? segment.promoSegmentId || DEFAULT_CAREER_ARC_UNLOCKS.promoSegments[0]
        : null,
      matchType: nextMatchType,
      matchStipulation: MATCH_SEGMENT_TYPES.has(value)
        ? (segment.matchStipulation || DEFAULT_MATCH_STIPULATION)
        : null,
      refereeId:   cfg.hasReferee   ? segment.refereeId   : null,
      announcerId: showsAnnouncerSlot(value) ? segment.announcerId : null,
      titleId: nextTitleId,
      cashInByEmployeeId: value === 'titleMatch' ? segment.cashInByEmployeeId : null,
      team1Ids: MATCH_SEGMENT_TYPES.has(value) ? segment.team1Ids || [] : [],
      team2Ids: MATCH_SEGMENT_TYPES.has(value) ? segment.team2Ids || [] : [],
    })
  }

  const handleMatchTypeChange = (value) => {
    if (!MATCH_SEGMENT_TYPES.has(segment.segmentType)) {
      return
    }

    const nextTitleDivision = getTitleDivisionByMatchType(value)
    const nextTitleId = segment.segmentType === 'titleMatch'
      ? ((activeTitles.find((title) => title.titleId === segment.titleId && title.division === nextTitleDivision)?.titleId)
        || activeTitles.find((title) => title.division === nextTitleDivision)?.titleId
        || null)
      : segment.titleId

    if (value === 'tagTeam') {
      const source = getSegmentWrestlerIds(segment)
      const halfway = Math.ceil(source.length / 2)
      patchSegment({
        matchType: 'tagTeam',
        titleId: nextTitleId,
        cashInByEmployeeId: null,
        team1Ids: source.slice(0, halfway),
        team2Ids: source.slice(halfway),
      })
      return
    }

    patchSegment({
      matchType: 'singles',
      titleId: nextTitleId,
      cashInByEmployeeId: segment.cashInByEmployeeId,
      wrestlerIds: getSegmentWrestlerIds(segment),
      team1Ids: [],
      team2Ids: [],
    })
  }

  const handleMatchStipulationChange = (value) => {
    if (!MATCH_SEGMENT_TYPES.has(segment.segmentType)) {
      return
    }

    patchSegment({ matchStipulation: value || DEFAULT_MATCH_STIPULATION })
  }

  const handleTitleChange = (titleId) => {
    patchSegment({ titleId: titleId || null })
  }

  const handleDropWrestler = (id, team = null) => {
    if (getSegmentWrestlerIds(segment).includes(id)) return

    const wrestler = findById(id)
    const isMatchType = MATCH_SEGMENT_TYPES.has(segment.segmentType)
    const wrestlerStamina = Number(wrestler?.stamina ?? 100)

    if (isMatchType && wrestler?.role === 'wrestler' && wrestlerStamina < 10) {
      setError(
        t('dashboard.events.setup.validation.staminaTooLowMatch', {
          name: wrestler.name,
          minimum: 10,
        }),
      )
      return
    }

    if (isTagTeamMatch) {
      if (team === 'team1') {
        patchSegment({ team1Ids: [...(segment.team1Ids || []), id] })
      } else if (team === 'team2') {
        patchSegment({ team2Ids: [...(segment.team2Ids || []), id] })
      }
      return
    }

    const newWrestlerIds = [...getSegmentWrestlerIds(segment), id]
    patchSegment({ wrestlerIds: newWrestlerIds })
  }

  const handleRemoveWrestler = (id, team = null) => {
    if (isTagTeamMatch && team === 'team1') {
      patchSegment({ team1Ids: (segment.team1Ids || []).filter((x) => x !== id) })
      return
    }

    if (segment.cashInByEmployeeId === id) {
      patchSegment({ cashInByEmployeeId: null })
      return
    }

    if (isTagTeamMatch && team === 'team2') {
      patchSegment({ team2Ids: (segment.team2Ids || []).filter((x) => x !== id) })
      return
    }

    patchSegment({ wrestlerIds: getSegmentWrestlerIds(segment).filter((x) => x !== id) })
  }

  const handleDropReferee     = (id) => patchSegment({ refereeId: id })
  const handleRemoveReferee   = ()   => patchSegment({ refereeId: null })
  const handleDropAnnouncer   = (id) => patchSegment({ announcerId: id })
  const handleRemoveAnnouncer = ()   => patchSegment({ announcerId: null })
  const handleCashInToggle = (checked) => {
    if (!canShowCashInOption || !moneyInTheBankHolder) {
      patchSegment({ cashInByEmployeeId: null })
      return
    }

    patchSegment({ cashInByEmployeeId: checked ? moneyInTheBankHolder.employeeId : null })
  }

  const multiMatchWarnings = useMemo(() => {
    const appearances = new Map()

    segments.forEach((item) => {
      if (!MATCH_SEGMENT_TYPES.has(item.segmentType)) {
        return
      }

      getSegmentWrestlerIds(item).forEach((employeeId) => {
        const employee = findById(employeeId)
        if (!employee || employee.role !== 'wrestler') {
          return
        }

        appearances.set(employeeId, (appearances.get(employeeId) || 0) + 1)
      })
    })

    return Array.from(appearances.entries())
      .filter(([, count]) => count > 1)
      .map(([employeeId, count]) => {
        const employee = findById(employeeId)
        return t('dashboard.events.setup.validation.multiMatchStaminaWarning', {
          name: employee?.name || 'Wrestler',
          count,
        })
      })
  }, [segments, findById, t])

  const validateSetup = () => {
    for (const currentSegment of segments) {
      const currentConfig = getSegmentConfig(currentSegment.segmentType)
      const requiresMultipleParticipants = MATCH_SEGMENT_TYPES.has(currentSegment.segmentType)
      const currentWrestlerIds = getSegmentWrestlerIds(currentSegment)

      if (requiresMultipleParticipants) {
        const lowStaminaWrestler = currentWrestlerIds
          .map((id) => findById(id))
          .find((employee) => employee?.role === 'wrestler' && Number(employee?.stamina ?? 100) < 10)

        if (lowStaminaWrestler) {
          return t('dashboard.events.setup.validation.staminaTooLowMatch', {
            name: lowStaminaWrestler.name,
            minimum: 10,
          })
        }
      }

      if (requiresMultipleParticipants && currentSegment.matchType === 'tagTeam') {
        if ((currentSegment.team1Ids || []).length < 1 || (currentSegment.team2Ids || []).length < 1) {
          return t('dashboard.events.setup.validation.tagTeamNeedTeamMembers', 'Tag team matches require participants in both Team 1 and Team 2.')
        }
      } else if (requiresMultipleParticipants && currentWrestlerIds.length < 2) {
        return t('dashboard.events.setup.validation.needTwoWrestlers', 'Match segments require at least two participants.')
      }

      if (!requiresMultipleParticipants && currentWrestlerIds.length < 1) {
        return t('dashboard.events.setup.validation.needOneParticipant', 'This segment requires at least one participant.')
      }

      if (currentConfig.hasReferee && !currentSegment.refereeId) {
        return t('dashboard.events.setup.validation.refereeRequired', 'A referee is required for this segment.')
      }

      if (requiresAnnouncer(currentSegment.segmentType) && !currentSegment.announcerId) {
        return t('dashboard.events.setup.validation.announcerRequired', 'An announcer is required for this segment.')
      }
    }

    return ''
  }

  const handleSetupSubmit = (e) => {
    e.preventDefault()
    const validationError = validateSetup()

    if (validationError) {
      setError(validationError)
      return
    }

    setExecutionSegments(normalizeSegmentsForSubmit(segments))
    setExecutionIndex(0)
    setExecutionResults({})
    setShowExecutionTransition(false)
    setExecutionMode('simulate')
    setPendingExecutionMode(null)
    setExecutionChoice({
      finishType: 'pin',
      riskLevel: 'balanced',
      winnerEmployeeId: null,
      winnerTeam: 'team1',
    })
    setShowExecutionChoicePanel(false)
    setPlaySequence([])
    setPlaySequenceIndex(0)
    setPlaySequenceActive(false)
    setPhase('execution')
    setError('')
  }

  const executionSegment = executionSegments[executionIndex]

  const executionParticipants = executionSegment
    ? executionSegment.participantIds.map(findById).filter(Boolean)
    : []

  const executionWrestlers = executionSegment
    ? executionSegment.wrestlerIds.map(findById).filter(Boolean)
    : []

  const executionTransitionLabel = useMemo(() => {
    if (!executionSegment) {
      return ''
    }

    const isTagTeam = executionSegment.matchType === 'tagTeam'
    if (isTagTeam) {
      const team1Label = formatTagSideLabel(executionSegment.team1Ids || [])
      const team2Label = formatTagSideLabel(executionSegment.team2Ids || [])
      if (team1Label && team2Label) {
        return `${team1Label} VS ${team2Label}`
      }
    }

    const wrestlerNames = executionWrestlers.map((employee) => employee.name)
    if (wrestlerNames.length >= 2) {
      return wrestlerNames.join(' VS ')
    }

    return t('dashboard.events.setup.execution.transitionFallback', 'Segment Participants')
  }, [executionSegment, executionWrestlers, formatTagSideLabel, t])

  const getExecutionChoiceNarrative = () => {
    if (!executionSegment) {
      return []
    }

    const winnerLabel = executionSegment.matchType === 'tagTeam'
      ? (executionChoice.winnerTeam === 'team2' ? t('dashboard.events.setup.execution.team2', 'Team 2') : t('dashboard.events.setup.execution.team1', 'Team 1'))
      : (executionWrestlers.find((employee) => employee.employeeId === executionChoice.winnerEmployeeId)?.name || executionWrestlers[0]?.name || 'The competitor')

    const finishLabel = executionChoice.finishType === 'submission'
      ? t('dashboard.events.setup.execution.finishes.submission', 'submission')
      : executionChoice.finishType === 'countout'
        ? t('dashboard.events.setup.execution.finishes.countout', 'count-out')
        : executionChoice.finishType === 'dq'
          ? t('dashboard.events.setup.execution.finishes.dq', 'disqualification')
          : t('dashboard.events.setup.execution.finishes.pin', 'pinfall')

    const riskLabel = executionChoice.riskLevel === 'risky'
      ? t('dashboard.events.setup.execution.risks.risky', 'risky')
      : executionChoice.riskLevel === 'chaotic'
        ? t('dashboard.events.setup.execution.risks.chaotic', 'chaotic')
        : t('dashboard.events.setup.execution.risks.balanced', 'balanced')

    return [
      t('dashboard.events.setup.execution.playNarrativeLine1', '{{winner}} is pushing the pace with a {{finish}} finish.', { winner: winnerLabel, finish: finishLabel }),
      t('dashboard.events.setup.execution.playNarrativeLine2', 'The crowd is reacting to the {{risk}} tempo and the danger level is rising.', { risk: riskLabel }),
    ]
  }

  const getMomentumState = (choice, sequenceLength = 4, beatIndex = 0) => {
    const base = choice?.riskLevel === 'chaotic' ? 74 : choice?.riskLevel === 'risky' ? 62 : 48
    const finishBoost = choice?.finishType === 'submission' ? 8 : choice?.finishType === 'countout' ? 5 : choice?.finishType === 'dq' ? 6 : 2
    const beatBoost = Math.min(16, beatIndex * 4 + sequenceLength * 3)
    const momentum = Math.min(100, base + finishBoost + beatBoost)
    const label = momentum >= 80
      ? t('dashboard.events.setup.execution.momentumHot', 'Crowd is on fire')
      : momentum >= 60
        ? t('dashboard.events.setup.execution.momentumBuilding', 'Momentum is building')
        : t('dashboard.events.setup.execution.momentumSteady', 'The pace is steady')
    const color = momentum >= 80 ? '#ff8a00' : momentum >= 60 ? '#ffd166' : '#4ecdc4'

    return { momentum, label, color }
  }

  const buildPlaySequence = () => {
    if (!executionSegment) {
      return []
    }

    const winnerLabel = executionSegment.matchType === 'tagTeam'
      ? (executionChoice.winnerTeam === 'team2' ? t('dashboard.events.setup.execution.team2', 'Team 2') : t('dashboard.events.setup.execution.team1', 'Team 1'))
      : (executionWrestlers.find((employee) => employee.employeeId === executionChoice.winnerEmployeeId)?.name || executionWrestlers[0]?.name || 'The competitor')

    const finishLabel = executionChoice.finishType === 'submission'
      ? t('dashboard.events.setup.execution.finishes.submission', 'submission')
      : executionChoice.finishType === 'countout'
        ? t('dashboard.events.setup.execution.finishes.countout', 'count-out')
        : executionChoice.finishType === 'dq'
          ? t('dashboard.events.setup.execution.finishes.dq', 'disqualification')
          : t('dashboard.events.setup.execution.finishes.pin', 'pinfall')

    const riskLabel = executionChoice.riskLevel === 'risky'
      ? t('dashboard.events.setup.execution.risks.risky', 'risky')
      : executionChoice.riskLevel === 'chaotic'
        ? t('dashboard.events.setup.execution.risks.chaotic', 'chaotic')
        : t('dashboard.events.setup.execution.risks.balanced', 'balanced')

    const sequenceLength = 4
    const baseBeats = Array.from({ length: sequenceLength }, (_, index) => {
      const momentumState = getMomentumState(executionChoice, sequenceLength, index)
      const isFinalBeat = index === sequenceLength - 1
      const title = index === 0
        ? t('dashboard.events.setup.execution.playBeatOpening', 'The bell rings')
        : index === 1
          ? t('dashboard.events.setup.execution.playBeatMomentum', 'Momentum swing')
          : index === 2
            ? t('dashboard.events.setup.execution.playBeatNearFall', 'Near fall')
            : t('dashboard.events.setup.execution.playBeatFinish', 'Finish line')
      const detail = index === 0
        ? t('dashboard.events.setup.execution.playBeatOpeningDetail', '{{winner}} starts fast and the crowd is already reacting.', { winner: winnerLabel })
        : index === 1
          ? (executionChoice.riskLevel === 'chaotic'
            ? t('dashboard.events.setup.execution.playBeatMomentumChaotic', 'The pace turns wild and every exchange feels dangerous.')
            : executionChoice.riskLevel === 'risky'
              ? t('dashboard.events.setup.execution.playBeatMomentumRisky', 'The pressure rises as the pace gets more aggressive.')
              : t('dashboard.events.setup.execution.playBeatMomentumBalanced', 'The rhythm stays controlled, but the tension is building.'))
          : index === 2
            ? t('dashboard.events.setup.execution.playBeatNearFallDetail', 'A dramatic {{finish}} attempt nearly changes the whole segment.', { finish: finishLabel })
            : t('dashboard.events.setup.execution.playBeatFinishDetail', '{{winner}} survives the {{risk}} tempo and forces the final moment.', { winner: winnerLabel, risk: riskLabel })
      const crowdLine = isFinalBeat
        ? t('dashboard.events.setup.execution.crowdFinal', 'The arena erupts as the final stretch begins.')
        : t('dashboard.events.setup.execution.crowdBeat', 'The crowd chants louder as the pace rises.')

      return {
        title,
        detail,
        crowdLine,
        momentum: momentumState.momentum,
        momentumLabel: momentumState.label,
      }
    })

    return baseBeats
  }

  const handlePlaySegmentClick = () => {
    if (!executionSegment) {
      return
    }

    const nextWinnerEmployeeId = executionWrestlers[0]?.employeeId || null
    setExecutionChoice((current) => ({
      ...current,
      winnerEmployeeId: nextWinnerEmployeeId,
      winnerTeam: current.winnerTeam || 'team1',
    }))
    setPendingExecutionMode('play')
    setShowExecutionTransition(true)
  }

  const handleSimulateSegmentClick = () => {
    if (!executionSegment) {
      return
    }

    setPendingExecutionMode('simulate')
    setShowExecutionTransition(true)
  }

  const confirmExecutionTransition = () => {
    setShowExecutionTransition(false)

    if (pendingExecutionMode === 'play') {
      setExecutionMode('play')
      setShowExecutionChoicePanel(true)
      return
    }

    setExecutionMode('simulate')
    setShowExecutionChoicePanel(false)
    setPlaySequence([])
    setPlaySequenceIndex(0)
    setPlaySequenceActive(false)
    simulateCurrentSegment({ mode: 'simulate', choice: executionChoice })
  }

  const resolveExecutionChoice = () => {
    setShowExecutionChoicePanel(false)
    const sequence = buildPlaySequence()
    setPlaySequence(sequence)
    setPlaySequenceIndex(0)
    setPlaySequenceActive(sequence.length > 0)
  }

  const advancePlaySequence = () => {
    if (!playSequence.length) {
      return
    }

    if (playSequenceIndex < playSequence.length - 1) {
      setPlaySequenceIndex((index) => index + 1)
      return
    }

    setPlaySequenceActive(false)
    simulateCurrentSegment({ mode: 'play', choice: executionChoice, playSequence })
  }

  const simulateCurrentSegment = (options = {}) => {
    if (!executionSegment) {
      return
    }

    const mode = options.mode || executionMode
    const choice = options.choice || executionChoice
    const isMatchSegment = ['match', 'mainEvent', 'titleMatch'].includes(executionSegment.segmentType)

    if (executionSegment.segmentType === 'interview') {
      const wrestler = executionWrestlers.find((employee) => employee.role === 'wrestler')
      const popularitySwing = Math.floor(Math.random() * 8) + 3
      const delta = Math.random() < 0.5 ? -popularitySwing : popularitySwing
      const resultText = wrestler
        ? (delta >= 0
            ? t('dashboard.events.setup.execution.interviewPopularityUp', '{{name}} gained {{delta}} popularity from this interview.', { name: wrestler.name, delta })
            : t('dashboard.events.setup.execution.interviewPopularityDown', '{{name}} lost {{delta}} popularity from this interview.', { name: wrestler.name, delta: Math.abs(delta) }))
        : t('dashboard.events.setup.execution.resultNoWinner', 'Segment complete.')

      setExecutionResults((current) => ({
        ...current,
        [executionIndex]: {
          winnerTeamIds: [],
          winnerName: '',
          winnerEmployeeId: null,
          matchRating: null,
          staminaLossById: {},
          crowdFeedback: [],
          interviewPopularityChanges: wrestler ? [{ employeeId: wrestler.employeeId, delta }] : [],
          message: resultText,
        },
      }))

      return
    }

    const isTagTeam = executionSegment.matchType === 'tagTeam'

    if (isTagTeam && isMatchSegment) {
      const team1 = (executionSegment.team1Ids || []).map(findById).filter(Boolean)
      const team2 = (executionSegment.team2Ids || []).map(findById).filter(Boolean)
      const winningTeam = mode === 'play' && choice.winnerTeam === 'team2'
        ? team2
        : team1
      const fallback = team1.length > 0 ? team1 : team2
      const finalTeam = winningTeam.length > 0 ? winningTeam : fallback
      const winnerTeamIds = finalTeam.map((e) => e.employeeId)
      const winnerTeamNames = formatTagSideLabel(winnerTeamIds)
      const wrestlerParticipants = executionWrestlers.filter((employee) => employee.role === 'wrestler')
      const baseMatchRating = calculatePreviewMatchRating(wrestlerParticipants)
      const finishBonus = choice.finishType === 'submission' ? 0.7 : choice.finishType === 'countout' ? 0.3 : choice.finishType === 'dq' ? 0.4 : 0.2
      const riskBonus = choice.riskLevel === 'risky' ? 0.5 : choice.riskLevel === 'chaotic' ? 0.8 : 0.1
      const sequenceBonus = Array.isArray(options.playSequence) ? Math.min(0.9, options.playSequence.length * 0.12) : 0
      const playBeatCount = Array.isArray(options.playSequence) ? options.playSequence.length : 0
      const sequenceDrain = playBeatCount > 0 ? playBeatCount * 2 : 0
      const matchRating = clampMatchRating(baseMatchRating + finishBonus + riskBonus + sequenceBonus)
      const staminaLossById = wrestlerParticipants.reduce((acc, wrestler) => {
        const baseLoss = rollStaminaLoss()
        const extraLoss = choice.riskLevel === 'risky' ? 5 : choice.riskLevel === 'chaotic' ? 10 : 0
        acc[wrestler.employeeId] = Math.min(50, baseLoss + extraLoss + sequenceDrain)
        return acc
      }, {})
      const resultText = winnerTeamNames
        ? t('dashboard.events.setup.execution.resultTagWinner', '{{names}} win the match!', { names: winnerTeamNames })
        : t('dashboard.events.setup.execution.resultNoWinner', 'Segment complete.')

      const momentumState = Array.isArray(options.playSequence) && options.playSequence.length > 0
        ? options.playSequence[options.playSequence.length - 1]
        : getMomentumState(choice, 4, 3)
      const crowdCommentary = Array.isArray(options.playSequence) && options.playSequence.length > 0
        ? options.playSequence.map((beat) => beat.crowdLine)
        : buildCrowdFeedback({
            matchRating,
            winnerName: winnerTeamNames,
            wrestlers: wrestlerParticipants,
            t,
          })

      setExecutionResults((current) => ({
        ...current,
        [executionIndex]: {
          winnerTeamIds,
          winnerName: winnerTeamNames,
          winnerEmployeeId: null,
          matchRating,
          staminaLossById,
          crowdFeedback: buildCrowdFeedback({
            matchRating,
            winnerName: winnerTeamNames,
            wrestlers: wrestlerParticipants,
            t,
          }),
          crowdCommentary,
          momentumScore: momentumState?.momentum ?? null,
          momentumLabel: momentumState?.momentumLabel ?? '',
          interviewPopularityChanges: [],
          message: resultText,
        },
      }))
      return
    }

    const resultCandidates = executionWrestlers.length > 0 ? executionWrestlers : executionParticipants
    const preferredWinner = mode === 'play' && choice.winnerEmployeeId
      ? resultCandidates.find((employee) => employee.employeeId === choice.winnerEmployeeId) || null
      : null
    const winnerCandidate = preferredWinner || (isMatchSegment
      ? resultCandidates[Math.floor(Math.random() * resultCandidates.length)]
      : null)
    const wrestlerParticipants = executionWrestlers.filter((employee) => employee.role === 'wrestler')
    const baseMatchRating = isMatchSegment ? calculatePreviewMatchRating(wrestlerParticipants) : null
    const finishBonus = choice.finishType === 'submission' ? 0.7 : choice.finishType === 'countout' ? 0.3 : choice.finishType === 'dq' ? 0.4 : 0.2
    const riskBonus = choice.riskLevel === 'risky' ? 0.5 : choice.riskLevel === 'chaotic' ? 0.8 : 0.1
    const sequenceBonus = Array.isArray(options.playSequence) ? Math.min(0.9, options.playSequence.length * 0.12) : 0
    const playBeatCount = Array.isArray(options.playSequence) ? options.playSequence.length : 0
    const sequenceDrain = playBeatCount > 0 ? playBeatCount * 2 : 0
    const matchRating = isMatchSegment ? clampMatchRating(baseMatchRating + finishBonus + riskBonus + sequenceBonus) : null
    const staminaLossById = isMatchSegment
      ? wrestlerParticipants.reduce((acc, wrestler) => {
        const baseLoss = rollStaminaLoss()
        const extraLoss = choice.riskLevel === 'risky' ? 5 : choice.riskLevel === 'chaotic' ? 10 : 0
        acc[wrestler.employeeId] = Math.min(50, baseLoss + extraLoss + sequenceDrain)
        return acc
      }, {})
      : {}
    const resultText = winnerCandidate
      ? t('dashboard.events.setup.execution.resultWinner', '{{name}} stood tall in this segment.', { name: winnerCandidate.name })
      : t('dashboard.events.setup.execution.resultNoWinner', 'Segment complete.')

    const momentumState = Array.isArray(options.playSequence) && options.playSequence.length > 0
      ? options.playSequence[options.playSequence.length - 1]
      : getMomentumState(choice, 4, 3)
    const crowdCommentary = Array.isArray(options.playSequence) && options.playSequence.length > 0
      ? options.playSequence.map((beat) => beat.crowdLine)
      : (isMatchSegment
        ? buildCrowdFeedback({
            matchRating,
            winnerName: winnerCandidate?.name || '',
            wrestlers: wrestlerParticipants,
            t,
          })
        : [])

    setExecutionResults((current) => ({
      ...current,
      [executionIndex]: {
        winnerTeamIds: [],
        winnerName: winnerCandidate?.name || '',
        winnerEmployeeId: winnerCandidate?.employeeId || null,
        matchRating,
        staminaLossById,
        crowdFeedback: isMatchSegment
          ? buildCrowdFeedback({
              matchRating,
              winnerName: winnerCandidate?.name || '',
              wrestlers: wrestlerParticipants,
              t,
            })
          : [],
        crowdCommentary,
        momentumScore: momentumState?.momentum ?? null,
        momentumLabel: momentumState?.momentumLabel ?? '',
        interviewPopularityChanges: [],
        message: resultText,
      },
    }))
  }

  const finishEventExecution = () => {
    const finalSegments = executionSegments.map((seg, index) => ({
      ...seg,
      winnerEmployeeId: executionResults[index]?.winnerEmployeeId ?? null,
      winnerTeamIds: executionResults[index]?.winnerTeamIds ?? [],
      matchRating: clampMatchRating(executionResults[index]?.matchRating),
      staminaLossById: executionResults[index]?.staminaLossById || {},
      interviewPopularityChanges: executionResults[index]?.interviewPopularityChanges || [],
    }))
    onSubmit({ segments: finalSegments })
  }

  if (!isOpen) return null

  return (
    <section className={styles.page}>
      {showExecutionTransition && phase === 'execution' && executionSegment ? (
        <div className={styles.executionTransitionOverlay}>
          <div className={styles.executionTransitionCard}>
            <p className={styles.executionTransitionLabel}>{t('dashboard.events.setup.execution.transitionTitle', 'Upcoming Segment')}</p>
            <h5>{executionTransitionLabel}</h5>
            <p className={styles.executionTransitionSubtext}>
              {t(
                'dashboard.events.setup.execution.transitionType',
                'Type: {{type}}',
                { type: t(`dashboard.events.setup.segmentTypes.${executionSegment.segmentType}`, executionSegment.segmentType) },
              )}
            </p>
            <button type="button" className={styles.primaryBtn} onClick={confirmExecutionTransition}>
              {t('dashboard.events.setup.execution.startSegment', 'Start Segment')}
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.modal}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <h3 className={styles.eventTitle}>{eventConfig?.eventName}</h3>
            <span className={styles.eventTypeBadge}>{eventConfig?.eventType}</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* ── Segment navigation ──────────────────────────────────────────── */}
        <div className={styles.segNav}>
          <button
            type="button"
            className={styles.navArrow}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
            disabled={activeIndex === 0}
            aria-label="Previous segment"
          >
            ‹
          </button>
          <div className={styles.segTitle}>
            <span>{t('dashboard.events.setup.segmentLabel', 'Segment {{index}}', { index: activeIndex + 1 })}</span>
            <span className={styles.segCount}>{activeIndex + 1} / {totalSegments}</span>
          </div>
          <button
            type="button"
            className={styles.navArrow}
            onClick={() => setActiveIndex((i) => Math.min(totalSegments - 1, i + 1))}
            disabled={activeIndex === totalSegments - 1}
            aria-label="Next segment"
          >
            ›
          </button>
        </div>

        {/* ── Dot stepper ─────────────────────────────────────────────────── */}
        <div className={styles.dots}>
          {segments.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.dot} ${i === activeIndex ? styles.dotActive : ''}`}
              onClick={() => setActiveIndex(i)}
              aria-label={`Segment ${i + 1}`}
            />
          ))}
        </div>

        {phase === 'setup' ? (
        <form onSubmit={handleSetupSubmit}>
          <div className={styles.body}>

            {/* ── Segment type selector ────────────────────────────────────── */}
            <div className={styles.typeRow}>
              {SEGMENT_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.typeChip} ${segment.segmentType === opt.value ? styles.typeChipActive : ''}`}
                  onClick={() => handleTypeChange(opt.value)}
                >
                  {t(`dashboard.events.setup.segmentTypes.${opt.value}`, opt.label)}
                </button>
              ))}
            </div>

            {isMatchSegment && (
              <div className={styles.matchTypeRow}>
                <span className={styles.matchTypeLabel}>{t('dashboard.events.setup.participantFormat', 'Participant Format')}</span>
                <div className={styles.matchTypeChips}>
                  <button
                    type="button"
                    className={`${styles.typeChip} ${(segment.matchType || 'singles') === 'singles' ? styles.typeChipActive : ''}`}
                    onClick={() => handleMatchTypeChange('singles')}
                  >
                    {t('dashboard.events.setup.matchTypes.singles', 'Singles')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.typeChip} ${segment.matchType === 'tagTeam' ? styles.typeChipActive : ''}`}
                    onClick={() => handleMatchTypeChange('tagTeam')}
                  >
                    {t('dashboard.events.setup.matchTypes.tagTeam', 'Tag Team')}
                  </button>
                </div>
              </div>
            )}

            {isMatchSegment && (
              <div className={styles.matchTypeRow}>
                <span className={styles.matchTypeLabel}>{t('dashboard.events.setup.matchTypeSelection', 'Match Type Selection')}</span>
                <select
                  className={styles.matchTypeSelect}
                  value={activeMatchStipulation.id}
                  onChange={(event) => handleMatchStipulationChange(event.target.value)}
                >
                  {availableMatchStipulations.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {segment.segmentType === 'promo' && (
              <div className={styles.matchTypeRow}>
                <span className={styles.matchTypeLabel}>
                  {t('dashboard.events.setup.promoSegmentStyle')}
                </span>
                <select
                  className={styles.matchTypeSelect}
                  value={segment.promoSegmentId || DEFAULT_CAREER_ARC_UNLOCKS.promoSegments[0]}
                  onChange={(event) => patchSegment({ promoSegmentId: event.target.value })}
                >
                  {unlockedPromoSegments.map((promoSegment) => (
                    <option key={promoSegment.id} value={promoSegment.id}>
                      {t(promoSegment.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {segment.segmentType === 'titleMatch' && (
              <div className={styles.titleSelectorRow}>
                <span className={styles.titleSelectorLabel}>{t('dashboard.events.setup.titleBelt', 'Title Belt')}</span>
                <div className={styles.titleBeltGrid}>
                  {availableTitlesForSegment.map((title) => (
                    <button
                      key={title.titleId}
                      type="button"
                      className={`${styles.titleBeltCard} ${segment.titleId === title.titleId ? styles.titleBeltCardActive : ''}`}
                      onClick={() => handleTitleChange(title.titleId)}
                    >
                      <img src={title.image} alt={title.name} loading="lazy" />
                      <span>{title.name}</span>
                    </button>
                  ))}
                </div>

                {availableTitlesForSegment.length === 0 ? (
                  <p className={styles.warning}>
                    {t('dashboard.events.setup.validation.noTitlesForMatchType', 'No active titles available for this match type.')}
                  </p>
                ) : null}

                {showTitleHolderWarning ? (
                  <p className={styles.warning}>
                    {t('dashboard.events.setup.validation.titleHolderMissingWarning', {
                      title: selectedTitle.name,
                      holder: selectedTitleHolder.name,
                    })}
                  </p>
                ) : null}

                {canShowCashInOption ? (
                  <label className={styles.cashInToggle}>
                    <input
                      type="checkbox"
                      checked={segment.cashInByEmployeeId === moneyInTheBankHolder.employeeId}
                      onChange={(event) => handleCashInToggle(event.target.checked)}
                    />
                    <span>
                      {t('dashboard.events.setup.cashInOption', {
                        name: moneyInTheBankHolder.name,
                      })}
                    </span>
                  </label>
                ) : null}
              </div>
            )}

            {/* ── Role assignment rows ─────────────────────────────────────── */}
            <div className={styles.assignmentGrid}>

              {/* Wrestlers / Participants */}
              <div className={styles.poolFilterRow}>
                <label className={styles.poolFilterField}>
                  <span>{t('dashboard.events.setup.poolGenderFilter', 'Gender')}</span>
                  <select
                    value={participantGenderFilter}
                    onChange={(event) => setParticipantGenderFilter(event.target.value)}
                  >
                    <option value="all">{t('dashboard.events.setup.genderOptions.all', 'All')}</option>
                    <option value="male">{t('dashboard.events.setup.genderOptions.male', 'Male')}</option>
                    <option value="female">{t('dashboard.events.setup.genderOptions.female', 'Female')}</option>
                  </select>
                </label>
                <label className={styles.poolFilterField}>
                  <span>{t('dashboard.events.setup.poolSearch', 'Search')}</span>
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(event) => setParticipantSearch(event.target.value)}
                    placeholder={t('dashboard.events.setup.poolSearchPlaceholder', 'Search wrestler')}
                  />
                </label>
              </div>

              {isTagTeamMatch ? (
                <div className={styles.assignRowTriple}>
                  <AvailablePool
                    label={isNonMatch
                      ? t('dashboard.events.setup.poolParticipants', 'Wrestlers & Managers')
                      : t('dashboard.events.setup.poolWrestlers', 'Wrestlers')}
                    employees={participantPool}
                    blockedIds={blockedInSegment}
                    cashInEmployeeId={segment.cashInByEmployeeId}
                    wrestlerRankById={wrestlerRankById}
                  />
                  <DropZone
                    label={t('dashboard.events.setup.zoneTeam1Participants', 'Team 1 Participants')}
                    subLabel={assignedTeam1Label}
                    employees={assignedTeam1}
                    onDrop={(id) => handleDropWrestler(id, 'team1')}
                    onRemove={(id) => handleRemoveWrestler(id, 'team1')}
                    hint={t('dashboard.events.setup.dragHintTeam1Participants', 'Drag team 1 wrestlers here')}
                    cashInEmployeeId={segment.cashInByEmployeeId}
                    wrestlerRankById={wrestlerRankById}
                  />
                  <DropZone
                    label={t('dashboard.events.setup.zoneTeam2Participants', 'Team 2 Participants')}
                    subLabel={assignedTeam2Label}
                    employees={assignedTeam2}
                    onDrop={(id) => handleDropWrestler(id, 'team2')}
                    onRemove={(id) => handleRemoveWrestler(id, 'team2')}
                    hint={t('dashboard.events.setup.dragHintTeam2Participants', 'Drag team 2 wrestlers here')}
                    cashInEmployeeId={segment.cashInByEmployeeId}
                    wrestlerRankById={wrestlerRankById}
                  />
                </div>
              ) : (
              <div className={styles.assignRow}>
                <AvailablePool
                  label={isNonMatch
                    ? t('dashboard.events.setup.poolParticipants', 'Wrestlers & Managers')
                    : t('dashboard.events.setup.poolWrestlers', 'Wrestlers')}
                  employees={participantPool}
                  blockedIds={blockedInSegment}
                  cashInEmployeeId={segment.cashInByEmployeeId}
                  wrestlerRankById={wrestlerRankById}
                />
                <DropZone
                  label={t('dashboard.events.setup.zoneParticipants', 'Participants')}
                  employees={assignedWrestlers}
                  onDrop={handleDropWrestler}
                  onRemove={handleRemoveWrestler}
                  hint={t('dashboard.events.setup.dragHintParticipants', 'Drag wrestlers here')}
                  cashInEmployeeId={segment.cashInByEmployeeId}
                  wrestlerRankById={wrestlerRankById}
                />
              </div>
              )}

              {/* Referee — match / mainEvent / titleMatch only */}
              {segCfg.hasReferee && (
                <div className={styles.assignRow}>
                  <AvailablePool
                    label={t('dashboard.events.setup.poolReferees', 'Referees')}
                    employees={refereePool}
                    blockedIds={blockedInSegment}
                    wrestlerRankById={wrestlerRankById}
                  />
                  <DropZone
                    label={t('dashboard.events.setup.zoneReferee', 'Referee')}
                    employees={assignedReferee}
                    onDrop={handleDropReferee}
                    onRemove={handleRemoveReferee}
                    maxSlots={1}
                    hint={t('dashboard.events.setup.dragHintReferee', 'Drag referee here')}
                    wrestlerRankById={wrestlerRankById}
                  />
                </div>
              )}

              {/* Announcer — mainEvent / titleMatch only */}
              {showsAnnouncerSlot(segment.segmentType) && (
                <div className={styles.assignRow}>
                  <AvailablePool
                    label={t(
                      segment.segmentType === 'promo' || segment.segmentType === 'titleMatch'
                        ? 'dashboard.events.setup.poolInterviewersOptional'
                        : 'dashboard.events.setup.poolAnnouncers',
                      segment.segmentType === 'promo' || segment.segmentType === 'titleMatch'
                        ? 'Interviewers (Optional)'
                        : 'Announcers',
                    )}
                    employees={announcerPool}
                    blockedIds={blockedInSegment}
                    wrestlerRankById={wrestlerRankById}
                  />
                  <DropZone
                    label={t(
                      segment.segmentType === 'promo' || segment.segmentType === 'titleMatch'
                        ? 'dashboard.events.setup.zoneInterviewerOptional'
                        : 'dashboard.events.setup.zoneAnnouncer',
                      segment.segmentType === 'promo' || segment.segmentType === 'titleMatch'
                        ? 'Interviewer (Optional)'
                        : 'Announcer',
                    )}
                    employees={assignedAnnouncer}
                    onDrop={handleDropAnnouncer}
                    onRemove={handleRemoveAnnouncer}
                    maxSlots={1}
                    hint={t(
                      segment.segmentType === 'promo' || segment.segmentType === 'titleMatch'
                        ? 'dashboard.events.setup.dragHintInterviewerOptional'
                        : 'dashboard.events.setup.dragHintAnnouncer',
                      segment.segmentType === 'promo' || segment.segmentType === 'titleMatch'
                        ? 'Drag interviewer here (optional)'
                        : 'Drag announcer here',
                    )}
                    wrestlerRankById={wrestlerRankById}
                  />
                </div>
              )}

            </div>

            <div className={styles.participantInsightsSection}>
              <div className={styles.participantInsightsHeader}>
                <h4>{t('dashboard.events.setup.participantInsightsTitle', 'Participant Match Insights')}</h4>
                <p>{t('dashboard.events.setup.participantInsightsHint', 'Select a participant and click to view their last 5 matches.')}</p>
              </div>

              {selectedSegmentParticipants.length === 0 ? (
                <p className={styles.participantInsightsEmpty}>
                  {t('dashboard.events.setup.participantInsightsEmpty', 'Assign participants to this segment to view history insights.')}
                </p>
              ) : (
                <div className={styles.participantInsightsGrid}>
                  <div className={styles.participantHistoryButtons}>
                    {selectedSegmentParticipants.map((employee) => {
                      const isActive = selectedParticipantHistoryId === employee.employeeId
                      const isPairMatched = participantsWithPairHistory.has(employee.employeeId)
                      return (
                        <button
                          key={employee.employeeId}
                          type="button"
                          className={`${styles.participantHistoryButton} ${isActive ? styles.participantHistoryButtonActive : ''} ${isPairMatched ? styles.participantHistoryButtonPair : ''}`}
                          onClick={() => setSelectedParticipantHistoryId(employee.employeeId)}
                        >
                          <span>{employee.name}</span>
                          {isPairMatched ? <em>{t('dashboard.events.setup.pairHistoryTag', 'Past pair match')}</em> : null}
                        </button>
                      )
                    })}

                    {pairHistoryMatches.length > 0 ? (
                      <div className={styles.pairHistorySummary}>
                        <p>{t('dashboard.events.setup.pairHistorySummaryTitle', 'Previous pairings in your history:')}</p>
                        <div className={styles.pairHistoryTags}>
                          {pairHistoryMatches.map((pair) => (
                            <span key={pair.pairKey} className={styles.pairHistoryTag}>
                              {pair.names} ({pair.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.participantHistoryPanel}>
                    <h5>
                      {selectedHistoryParticipant
                        ? t('dashboard.events.setup.participantLastFive', '{{name}} - Last 5 Matches', { name: selectedHistoryParticipant.name })
                        : t('dashboard.events.setup.participantLastFiveEmpty', 'Last 5 Matches')}
                    </h5>

                    {selectedParticipantLastFiveMatches.length === 0 ? (
                      <p className={styles.participantHistoryEmpty}>
                        {t('dashboard.events.setup.participantNoHistory', 'No match history yet for this participant.')}
                      </p>
                    ) : (
                      <div className={styles.participantHistoryList}>
                        {selectedParticipantLastFiveMatches.map((entry, index) => {
                          const opponentDetails = Array.isArray(entry.otherParticipantDetails)
                            ? entry.otherParticipantDetails
                            : []
                          const opponentNames = Array.isArray(entry.opponent) && entry.opponent.length > 0
                            ? entry.opponent
                            : opponentDetails.map((participant) => participant.name)

                          return (
                            <article key={`${entry.eventName || 'event'}-${entry.day || index}-${index}`} className={styles.participantHistoryRow}>
                              <div>
                                <strong>{entry.eventName || t('dashboard.employees.unknownEvent', 'Unknown Event')}</strong>
                                <p>{formatGameDateFromDay(startDateIso, entry.day)}</p>
                              </div>
                              <div>
                                <span>{t(`dashboard.events.setup.segmentTypes.${entry.segmentType}`, entry.segmentType)}</span>
                                <small>
                                  {t('dashboard.events.setup.participantResult', 'Result: {{result}}', {
                                    result: t(`dashboard.employees.results.${entry.result || 'nodecision'}`),
                                  })}
                                </small>
                                <small>
                                  {t('dashboard.events.setup.participantOpponents', 'Opponents: {{names}}', {
                                    names: opponentNames.length > 0
                                      ? opponentNames.join(', ')
                                      : t('dashboard.events.setup.participantOpponentsUnknown', 'Unknown'),
                                  })}
                                </small>
                                {opponentDetails.length > 0 ? (
                                  <div className={styles.participantOpponentPhotos}>
                                    {opponentDetails.map((participant, photoIndex) => (
                                      <div
                                        key={`${entry.eventName || 'event'}-${entry.day || index}-${participant.employeeId || participant.name || photoIndex}`}
                                        className={styles.participantOpponentPhotoChip}
                                        title={participant.name}
                                      >
                                        <img
                                          src={participant.imageUrl || getFallbackImage(participant.gender)}
                                          alt={participant.name}
                                          loading="lazy"
                                          onError={(event) => {
                                            if (!event.currentTarget.dataset.fb) {
                                              event.currentTarget.dataset.fb = '1'
                                              event.currentTarget.src = getFallbackImage(participant.gender)
                                            }
                                          }}
                                        />
                                        <em>{participant.name}</em>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Previous events history ──────────────────────────────────── */}
          {eventLog.length > 0 && (
            <div className={styles.historySection}>
              <button
                type="button"
                className={styles.historyToggle}
                onClick={() => setHistoryOpen((v) => !v)}
              >
                {t('dashboard.events.setup.history.title', 'Previous Events ({{count}})', { count: eventLog.length })}
                <span className={styles.historyToggleArrow}>{historyOpen ? '▲' : '▼'}</span>
              </button>
              {historyOpen && (
                <div className={styles.historyList}>
                  {[...eventLog].reverse().map((entry) => (
                    <div key={entry.id} className={styles.historyEntry}>
                      <div className={styles.historyEntryHeader}>
                        <span className={styles.historyEntryName}>{entry.eventName}</span>
                        <span className={styles.historyEntryDay}>
                          {formatGameDateFromDay(startDateIso, entry.day)}
                        </span>
                      </div>
                      {Array.isArray(entry.segments) && entry.segments.length > 0 && (
                        <ul className={styles.historySegmentList}>
                          {entry.segments.map((seg, idx) => {
                            const isMatch = ['match', 'mainEvent', 'titleMatch'].includes(seg.segmentType)
                            const historyParticipants = (() => {
                              if (seg.matchType === 'tagTeam') {
                                const team1Label = formatTagSideLabel(seg.team1Ids || [])
                                const team2Label = formatTagSideLabel(seg.team2Ids || [])
                                if (team1Label && team2Label) {
                                  return `${team1Label} VS ${team2Label}`
                                }
                              }

                              if (Array.isArray(seg.participantDetails) && seg.participantDetails.length > 0) {
                                return seg.participantDetails
                                  .filter((participant) => participant.role === 'wrestler')
                                  .map((participant) => participant.name)
                                  .join(', ')
                              }

                              return ''
                            })()

                            return (
                              <li key={idx} className={styles.historySegmentItem}>
                                <span className={styles.historySegType}>
                                  {seg.segmentType === 'promo' && seg.promoSegmentId
                                    ? t(`dashboard.events.setup.promoSegments.${seg.promoSegmentId}`)
                                    : t(`dashboard.events.setup.segmentTypes.${seg.segmentType}`, seg.segmentType)}
                                </span>
                                {isMatch && (
                                  <span className={styles.historySegResult}>
                                    {seg.winnerName
                                      ? t('dashboard.events.setup.history.winner', '→ {{name}}', { name: seg.winnerName })
                                      : t('dashboard.matchResults.noDecision', 'No Decision')}
                                  </span>
                                )}
                                {historyParticipants && (
                                  <span className={styles.historySegParticipants}>
                                    {historyParticipants}
                                  </span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {multiMatchWarnings.length > 0 ? (
            <div className={styles.warningList}>
              {multiMatchWarnings.map((warningText) => (
                <p key={warningText} className={styles.warning}>{warningText}</p>
              ))}
            </div>
          ) : null}

          <div className={styles.footer}>
            <button type="button" className={styles.secondaryBtn} onClick={onClose}>
              {t('dashboard.events.cancel', 'Cancel')}
            </button>
            {activeIndex < totalSegments - 1 ? (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setActiveIndex((i) => i + 1)}
              >
                {t('dashboard.events.setup.next', 'Next')} ›
              </button>
            ) : (
              <button type="submit" className={styles.primaryBtn}>
                {t('dashboard.events.setup.submit', 'Start Matches')}
              </button>
            )}
          </div>
        </form>
        ) : (
        <section className={styles.executionSection}>
          <div className={styles.executionHeader}>
            <h4>{t('dashboard.events.setup.execution.title', 'Match In Progress')}</h4>
            <p>
              {t('dashboard.events.setup.segmentLabel', 'Segment {{index}}', { index: executionIndex + 1 })}
              {' · '}
              {executionSegment ? t(`dashboard.events.setup.segmentTypes.${executionSegment.segmentType}`, executionSegment.segmentType) : ''}
            </p>
          </div>

          <div className={styles.executionRoster}>
            <p className={styles.executionRosterLabel}>{t('dashboard.events.setup.execution.wrestlers', 'Wrestlers')}</p>
            <div className={styles.executionImageGrid}>
              {executionWrestlers.length > 0 ? (
                executionWrestlers.map((employee) => (
                  <article className={styles.executionImageCard} key={employee.employeeId}>
                    <img
                      src={employee.imageUrl || getFallbackImage(employee.gender)}
                      alt={employee.name}
                      onError={(event) => {
                        if (!event.currentTarget.dataset.fb) {
                          event.currentTarget.dataset.fb = '1'
                          event.currentTarget.src = getFallbackImage(employee.gender)
                        }
                      }}
                    />
                    {executionSegment?.cashInByEmployeeId === employee.employeeId && (
                      <span className={styles.mitbBadgeExecution}>💰 Cash In</span>
                    )}
                    {(
                      executionResults[executionIndex]?.winnerEmployeeId === employee.employeeId
                      || (executionResults[executionIndex]?.winnerTeamIds || []).includes(employee.employeeId)
                    ) && (
                      <span className={styles.winnerBadgeExecution}>Winner</span>
                    )}
                    <p>{employee.name}</p>
                    {employee.role === 'wrestler' && (
                      <span className={`${styles.executionStamina} ${Number(employee.stamina ?? 100) < 10 ? styles.personStaminaLow : ''}`}>
                        {t('dashboard.employees.stamina', { amount: Number(employee.stamina ?? 100) })}
                      </span>
                    )}
                    {Number(executionResults[executionIndex]?.staminaLossById?.[employee.employeeId] || 0) > 0 && (
                      <span className={styles.executionStaminaLoss}>
                        {t('dashboard.events.setup.execution.staminaLoss', 'Stamina Loss: -{{amount}}', {
                          amount: Number(executionResults[executionIndex].staminaLossById[employee.employeeId] || 0),
                        })}
                      </span>
                    )}
                  </article>
                ))
              ) : (
                <p className={styles.emptyHint}>{t('dashboard.events.setup.execution.noWrestlers', 'No wrestlers assigned in this segment.')}</p>
              )}
            </div>
          </div>

          {executionParticipants.length > 0 ? (
            <div className={styles.executionParticipantsRow}>
              <p className={styles.executionRosterLabel}>{t('dashboard.events.setup.execution.allParticipants', 'All Participants')}</p>
              <div className={styles.executionParticipantsChips}>
                {executionParticipants.map((employee) => (
                  <span key={employee.employeeId}>{employee.name}</span>
                ))}
              </div>
            </div>
          ) : null}

          {executionResults[executionIndex]?.message ? (
            <p className={styles.executionResult}>{executionResults[executionIndex].message}</p>
          ) : null}

          {Number.isFinite(Number(executionResults[executionIndex]?.matchRating)) ? (
            <div className={styles.executionInsightsCard}>
              <div className={styles.executionInsightsHeader}>
                <strong>
                  {t('dashboard.events.setup.execution.matchRating', 'Match Rating')}: {Number(executionResults[executionIndex].matchRating).toFixed(1)} / 10
                </strong>
              </div>
              {Number.isFinite(Number(executionResults[executionIndex]?.momentumScore)) ? (
                <div className={styles.executionFeedbackList}>
                  <p>{t('dashboard.events.setup.execution.momentumResult', 'Momentum')}</p>
                  <div style={{ background: '#2d2d2d', borderRadius: '999px', overflow: 'hidden', height: '8px' }}>
                    <div style={{ width: `${Number(executionResults[executionIndex].momentumScore)}%`, height: '100%', background: '#4ecdc4', transition: 'width 0.2s ease' }} />
                  </div>
                  <p style={{ color: '#ffd166' }}>{executionResults[executionIndex].momentumLabel}</p>
                </div>
              ) : null}
              {(executionResults[executionIndex]?.crowdFeedback || []).length > 0 ? (
                <div className={styles.executionFeedbackList}>
                  <p>{t('dashboard.events.setup.execution.peopleFeedback', 'People Feedback')}</p>
                  <ul>
                    {executionResults[executionIndex].crowdFeedback.map((line, index) => (
                      <li key={`${executionIndex}-feedback-${index}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {(executionResults[executionIndex]?.crowdCommentary || []).length > 0 ? (
                <div className={styles.executionFeedbackList}>
                  <p>{t('dashboard.events.setup.execution.crowdCommentary', 'Crowd Commentary')}</p>
                  <ul>
                    {executionResults[executionIndex].crowdCommentary.map((line, index) => (
                      <li key={`${executionIndex}-crowd-${index}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {showExecutionChoicePanel && executionSegment && executionMode === 'play' ? (
            <div className={styles.executionInsightsCard}>
              <div className={styles.executionInsightsHeader}>
                <strong>{t('dashboard.events.setup.execution.playOptionsTitle', 'Play the segment')}</strong>
              </div>
              <div className={styles.executionFeedbackList}>
                {getExecutionChoiceNarrative().map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              {executionSegment.matchType === 'tagTeam' ? (
                <div className={styles.matchTypeRow}>
                  <span className={styles.matchTypeLabel}>{t('dashboard.events.setup.execution.chooseWinner', 'Choose the winner')}</span>
                  <div className={styles.matchTypeChips}>
                    <button
                      type="button"
                      className={`${styles.typeChip} ${executionChoice.winnerTeam === 'team1' ? styles.typeChipActive : ''}`}
                      onClick={() => setExecutionChoice((current) => ({ ...current, winnerTeam: 'team1' }))}
                    >
                      {t('dashboard.events.setup.execution.team1', 'Team 1')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.typeChip} ${executionChoice.winnerTeam === 'team2' ? styles.typeChipActive : ''}`}
                      onClick={() => setExecutionChoice((current) => ({ ...current, winnerTeam: 'team2' }))}
                    >
                      {t('dashboard.events.setup.execution.team2', 'Team 2')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.matchTypeRow}>
                  <span className={styles.matchTypeLabel}>{t('dashboard.events.setup.execution.chooseWinner', 'Choose the winner')}</span>
                  <div className={styles.matchTypeChips}>
                    {executionWrestlers.length > 0 ? executionWrestlers.map((employee) => (
                      <button
                        key={employee.employeeId}
                        type="button"
                        className={`${styles.typeChip} ${executionChoice.winnerEmployeeId === employee.employeeId ? styles.typeChipActive : ''}`}
                        onClick={() => setExecutionChoice((current) => ({ ...current, winnerEmployeeId: employee.employeeId }))}
                      >
                        {employee.name}
                      </button>
                    )) : (
                      <span>{t('dashboard.events.setup.execution.noWrestlers', 'No wrestlers assigned in this segment.')}</span>
                    )}
                  </div>
                </div>
              )}
              <div className={styles.matchTypeRow}>
                <span className={styles.matchTypeLabel}>{t('dashboard.events.setup.execution.chooseFinish', 'Choose the finish')}</span>
                <div className={styles.matchTypeChips}>
                  {['pin', 'submission', 'countout', 'dq'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.typeChip} ${executionChoice.finishType === option ? styles.typeChipActive : ''}`}
                      onClick={() => setExecutionChoice((current) => ({ ...current, finishType: option }))}
                    >
                      {t(`dashboard.events.setup.execution.finishes.${option}`, option)}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.matchTypeRow}>
                <span className={styles.matchTypeLabel}>{t('dashboard.events.setup.execution.chooseRisk', 'Choose the pace')}</span>
                <div className={styles.matchTypeChips}>
                  {['balanced', 'risky', 'chaotic'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.typeChip} ${executionChoice.riskLevel === option ? styles.typeChipActive : ''}`}
                      onClick={() => setExecutionChoice((current) => ({ ...current, riskLevel: option }))}
                    >
                      {t(`dashboard.events.setup.execution.risks.${option}`, option)}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className={styles.primaryBtn} onClick={resolveExecutionChoice}>
                {t('dashboard.events.setup.execution.resolve', 'Resolve Segment')}
              </button>
            </div>
          ) : null}

          {executionMode === 'play' && playSequenceActive && playSequence[playSequenceIndex] ? (
            <div className={styles.executionInsightsCard}>
              <div className={styles.executionInsightsHeader}>
                <strong>{t('dashboard.events.setup.execution.playByPlayTitle', 'Play-by-play')}</strong>
              </div>
              <div className={styles.executionFeedbackList}>
                <p><strong>{playSequence[playSequenceIndex].title}</strong></p>
                <p>{playSequence[playSequenceIndex].detail}</p>
                <p>{playSequence[playSequenceIndex].crowdLine}</p>
                <p>{t('dashboard.events.setup.execution.playByPlayProgress', 'Beat {{current}} of {{total}}', { current: playSequenceIndex + 1, total: playSequence.length })}</p>
                <div style={{ marginTop: '0.5rem', background: '#2d2d2d', borderRadius: '999px', overflow: 'hidden', height: '8px' }}>
                  <div style={{ width: `${playSequence[playSequenceIndex].momentum}%`, height: '100%', background: '#ff8a00', transition: 'width 0.2s ease' }} />
                </div>
                <p style={{ marginTop: '0.35rem', color: '#ffd166' }}>{playSequence[playSequenceIndex].momentumLabel}</p>
              </div>
              <button type="button" className={styles.primaryBtn} onClick={advancePlaySequence}>
                {playSequenceIndex < playSequence.length - 1
                  ? t('dashboard.events.setup.execution.advanceBeat', 'Advance Beat')
                  : t('dashboard.events.setup.execution.resolveSegment', 'Resolve Segment')}
              </button>
            </div>
          ) : null}

          <div className={styles.footer}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setPhase('setup')}>
              {t('dashboard.events.setup.execution.backToSetup', 'Back to Setup')}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setExecutionIndex((index) => Math.max(0, index - 1))}
              disabled={executionIndex === 0}
            >
              {t('dashboard.events.setup.execution.previous', 'Previous Match')}
            </button>
            <button type="button" className={styles.primaryBtn} onClick={handlePlaySegmentClick}>
              {t('dashboard.events.setup.execution.play', 'Play Segment')}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={handleSimulateSegmentClick}>
              {t('dashboard.events.setup.execution.simulate', 'Simulate Segment')}
            </button>
            {executionIndex < executionSegments.length - 1 ? (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setExecutionIndex((index) => Math.min(executionSegments.length - 1, index + 1))}
              >
                {t('dashboard.events.setup.execution.next', 'Next Match')}
              </button>
            ) : (
              <button type="button" className={styles.primaryBtn} onClick={finishEventExecution}>
                {t('dashboard.events.setup.execution.finish', 'Finish Event')}
              </button>
            )}
          </div>
        </section>
        )}

      </div>
    </section>
  )
}

export default EventSetupModal
