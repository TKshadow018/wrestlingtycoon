import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import styles from './MatchResultsModule.module.scss'

const parseIsoDateLocal = (isoDateString) => {
  if (!isoDateString) return null
  const [yearStr, monthStr, dayStr] = isoDateString.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const formatGameDateFromDay = (startDateIso, day) => {
  const baseDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const FEMALE_FALLBACK_IMAGE = '/people/girl.png'
const MALE_FALLBACK_IMAGE = '/people/boy.png'

const SEGMENT_TYPE_LABELS = {
  match: 'Match',
  mainEvent: 'Main Event',
  titleMatch: 'Title Match',
  interview: 'Interview',
  promo: 'Promo',
}

function ParticipantImageCard({ participant, isWinner, winnerBadgeLabel }) {
  const imageSrc = participant.imageUrl || (participant.gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)

  return (
    <div className={`${styles.participantCard} ${isWinner ? styles.participantCardWinner : ''}`}>
      <div className={styles.participantImageWrap}>
        <img
          className={styles.participantImage}
          src={imageSrc}
          alt={participant.name}
          loading="lazy"
        />
        {isWinner && <span className={styles.winnerBadge}>{winnerBadgeLabel}</span>}
      </div>
      <div className={styles.participantName}>{participant.name}</div>
    </div>
  )
}

function SegmentRow({ segment, index }) {
  const { t } = useTranslation()
  const isMatchType = ['match', 'mainEvent', 'titleMatch'].includes(segment.segmentType)
  const isTagTeam = segment.matchType === 'tagTeam'
  const winnerTeamIds = Array.isArray(segment.winnerTeamIds) ? segment.winnerTeamIds : []
  const hasWinnerById = isTagTeam ? winnerTeamIds.length > 0 : Boolean(segment.winnerEmployeeId)

  const isParticipantWinner = (participant) => {
    if (isTagTeam) return winnerTeamIds.includes(participant.employeeId)
    if (hasWinnerById) return participant.employeeId === segment.winnerEmployeeId
    return Boolean(segment.winnerName && participant.name === segment.winnerName)
  }

  const participantDetails = Array.isArray(segment.participantDetails) && segment.participantDetails.length > 0
    ? segment.participantDetails
    : (segment.participants || []).map((name) => ({
        employeeId: name,
        name,
        gender: 'male',
        role: 'wrestler',
        imageUrl: null,
      }))
  const wrestlerParticipants = participantDetails.filter((participant) => participant.role === 'wrestler')
  const refereeParticipant = participantDetails.find((participant) => participant.role === 'referee')
  const announcerParticipant = participantDetails.find((participant) => participant.role === 'announcer')
  const otherSupportParticipants = participantDetails.filter(
    (participant) => participant.role !== 'wrestler' && participant.role !== 'referee' && participant.role !== 'announcer'
  )

  // Find manager for each wrestler (if exists in participantDetails)
  const wrestlerManagers = wrestlerParticipants.map((wrestler) => {
    const managerByRole = participantDetails.find((p) => p.role === 'manager' && p.parentWrestlerId === wrestler.employeeId)
    return { wrestler, manager: managerByRole || null }
  })

  const participantCount = wrestlerParticipants.length
  const rowWidth = participantCount > 0 ? `calc(100% / ${participantCount})` : '100%'

  return (
    <div className={styles.segmentRow}>
      <div className={styles.segmentIndex}>{index + 1}</div>
      <div className={styles.segmentContent}>
        <span className={`${styles.segmentType} ${styles[`type_${segment.segmentType}`]}`}>
          {SEGMENT_TYPE_LABELS[segment.segmentType] || segment.segmentType}
        </span>

        {wrestlerParticipants.length > 0 ? (
          <>
            {/* Row 1: Wrestlers with dynamic width */}
            <div className={styles.wrestlerRowContainer}>
              {wrestlerParticipants.map((participant) => {
                const isWinner = isParticipantWinner(participant)

                return (
                  <div
                    key={`${segment.segmentType}-wrestler-${participant.employeeId}`}
                    className={styles.wrestlerColumn}
                    style={{ flex: '1 1 0' }}
                  >
                    <ParticipantImageCard
                      participant={participant}
                      isWinner={Boolean(isWinner)}
                      winnerBadgeLabel={t('dashboard.matchResults.winnerBadge')}
                    />
                  </div>
                )
              })}
            </div>

            {/* Row 2: Support staff with positioning */}
            {(refereeParticipant || announcerParticipant || otherSupportParticipants.length > 0) && (
              <div className={styles.supportRowContainer}>
                <div className={styles.supportRowContent}>
                  {/* Left side: Managers under their wrestlers */}
                  <div className={styles.managerPositioningArea}>
                    {wrestlerManagers.map((item) => {
                      if (!item.manager) return null
                      const isWinner = isParticipantWinner(item.manager)

                      return (
                        <div
                          key={`${segment.segmentType}-manager-${item.manager.employeeId}`}
                          className={`${styles.supportCard} ${isWinner ? styles.supportCardWinner : ''}`}
                        >
                          <img
                            className={styles.supportImage}
                            src={item.manager.imageUrl || (item.manager.gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)}
                            alt={item.manager.name}
                            loading="lazy"
                          />
                          <span className={styles.supportName}>{item.manager.name}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Center: Other support staff */}
                  {otherSupportParticipants.length > 0 && (
                    <div className={styles.otherSupportArea}>
                      {otherSupportParticipants.map((participant) => {
                        const isWinner = isParticipantWinner(participant)

                        return (
                          <div
                            key={`${segment.segmentType}-support-${participant.employeeId}`}
                            className={`${styles.supportCard} ${isWinner ? styles.supportCardWinner : ''}`}
                          >
                            <img
                              className={styles.supportImage}
                              src={participant.imageUrl || (participant.gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)}
                              alt={participant.name}
                              loading="lazy"
                            />
                            <span className={styles.supportName}>{participant.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Right side: Referee positioned at rightmost */}
                  {refereeParticipant && (
                    <div className={styles.refereePositioningArea}>
                      <div className={`${styles.supportCard} ${isParticipantWinner(refereeParticipant) ? styles.supportCardWinner : ''}`}>
                        <img
                          className={styles.supportImage}
                          src={refereeParticipant.imageUrl || (refereeParticipant.gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)}
                          alt={refereeParticipant.name}
                          loading="lazy"
                        />
                        <span className={styles.supportName}>{refereeParticipant.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Announcer below or separately */}
                {announcerParticipant && (
                  <div className={styles.announcerRow}>
                    <div className={`${styles.supportCard} ${isParticipantWinner(announcerParticipant) ? styles.supportCardWinner : ''}`}>
                      <img
                        className={styles.supportImage}
                        src={announcerParticipant.imageUrl || (announcerParticipant.gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)}
                        alt={announcerParticipant.name}
                        loading="lazy"
                      />
                      <span className={styles.supportName}>{announcerParticipant.name}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        {wrestlerParticipants.length === 0 && participantDetails.length === 0 ? (
          <div className={styles.segmentParticipants}>
            {t('dashboard.matchResults.noParticipants')}
          </div>
        ) : null}

        {isMatchType && (
          <>
            <div className={styles.segmentWinner}>
              {segment.winnerName
                ? t('dashboard.matchResults.winner', { name: segment.winnerName })
                : t('dashboard.matchResults.noDecision')}
            </div>
            {Number.isFinite(segment.matchRating) ? (
              <div className={styles.segmentRating}>
                {t('dashboard.matchResults.matchRating', { rating: segment.matchRating.toFixed(1) })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, isExpanded, onToggle, startDateIso }) {
  const { t } = useTranslation()
  const segmentCount = event.segments?.length || 0
  const matchCount = event.segments?.filter((s) =>
    ['match', 'mainEvent', 'titleMatch'].includes(s.segmentType),
  ).length || 0

  return (
    <div className={styles.eventCard}>
      <button
        type="button"
        className={styles.eventHeader}
        onClick={onToggle}
      >
        <div className={styles.eventHeaderLeft}>
          <span className={styles.eventName}>{event.eventName}</span>
          <span className={styles.eventMeta}>
            {formatGameDateFromDay(startDateIso, event.day)}
          </span>
        </div>
        <div className={styles.eventHeaderRight}>
          <span className={styles.eventStat}>
            {t('dashboard.matchResults.segmentCount', { count: segmentCount })}
          </span>
          <span className={styles.eventStat}>
            {t('dashboard.matchResults.matchCount', { count: matchCount })}
          </span>
          <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}>▶</span>
        </div>
      </button>

      {isExpanded && (
        <div className={styles.eventBody}>
          <div className={styles.eventSummaryRow}>
            <span className={styles.summaryItem}>
              {t('dashboard.matchResults.income', { amount: event.income?.toLocaleString() || '0' })}
            </span>
            <span className={styles.summaryItem}>
              {t('dashboard.matchResults.fans', { delta: event.fanDelta >= 0 ? `+${event.fanDelta}` : event.fanDelta })}
            </span>
            <span className={styles.summaryItem}>
              {t('dashboard.matchResults.prestige', { delta: event.prestigeDelta >= 0 ? `+${event.prestigeDelta}` : event.prestigeDelta })}
            </span>
          </div>

          {event.segments && event.segments.length > 0 ? (
            <div className={styles.segmentList}>
              {event.segments.map((seg, i) => (
                <SegmentRow key={i} segment={seg} index={i} />
              ))}
            </div>
          ) : (
            <p className={styles.noSegments}>{t('dashboard.matchResults.noSegments')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function MatchResultsModule() {
  const { t } = useTranslation()
  const eventLog = useGameStore((state) => state.events.eventLog)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const [expandedId, setExpandedId] = useState(null)

  const sortedLog = [...(eventLog || [])].reverse()

  const toggle = (id) => setExpandedId((current) => (current === id ? null : id))

  if (sortedLog.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{t('dashboard.matchResults.empty')}</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.eventList}>
        {sortedLog.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            isExpanded={expandedId === event.id}
            onToggle={() => toggle(event.id)}
            startDateIso={startDateIso}
          />
        ))}
      </div>
    </div>
  )
}

export default MatchResultsModule
