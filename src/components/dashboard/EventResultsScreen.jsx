import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './EventResultsScreen.module.scss'

const FEMALE_FALLBACK = '/people/girl.png'
const MALE_FALLBACK = '/people/boy.png'

const getFallbackImage = (gender) => (gender === 'female' ? FEMALE_FALLBACK : MALE_FALLBACK)

const SEGMENT_TYPE_LABELS = {
  match: 'Match',
  mainEvent: 'Main Event',
  titleMatch: 'Title Match',
  interview: 'Interview',
  promo: 'Promo Segment',
}

const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])

const EVENT_TYPE_LABELS = {
  ppv: 'Pay-Per-View',
  megaLive: 'Mega Live Event',
  oneTime: 'Special Event',
  regularWeekly: 'Weekly Show',
  houseShow: 'House Show',
  digitalOnly: 'Digital Only',
}

function getRatingColor(rating) {
  if (!Number.isFinite(Number(rating))) return 'var(--text-faint)'
  const r = Number(rating)
  if (r >= 8.5) return '#4dd9d0'
  if (r >= 7) return '#a8e063'
  if (r >= 5) return '#f3c96a'
  if (r >= 3) return '#f07070'
  return '#b04040'
}

function getRatingLabel(rating) {
  if (!Number.isFinite(Number(rating))) return '—'
  const r = Number(rating)
  if (r >= 9) return 'Classic'
  if (r >= 8) return 'Excellent'
  if (r >= 7) return 'Good'
  if (r >= 5.5) return 'Average'
  if (r >= 4) return 'Below Average'
  return 'Poor'
}

function RatingStars({ rating }) {
  if (!Number.isFinite(Number(rating))) return null
  const pct = (Number(rating) / 10) * 100
  return (
    <div className={styles.ratingBar}>
      <div className={styles.ratingFill} style={{ width: `${pct}%`, background: getRatingColor(rating) }} />
    </div>
  )
}

function formatPromoAdjustment({ segment, t }) {
  if (segment?.promoRatingAdjustmentType !== 'bonus' && segment?.promoRatingAdjustmentType !== 'penalty') {
    return null
  }

  const delta = Number(segment?.promoRatingAdjustment)
  const hasDelta = Number.isFinite(delta)
  const absDelta = hasDelta ? Math.abs(delta).toFixed(1) : '0.0'

  if (segment.promoRatingAdjustmentType === 'bonus') {
    if (segment?.promoRatingCapHit && (!hasDelta || delta <= 0)) {
      return t(
        'dashboard.eventResults.promoBonusCapped',
        'Promoted match bonus applied (rating cap reached).',
      )
    }

    return t(
      'dashboard.eventResults.promoBonusApplied',
      '+{{delta}} promoted match bonus',
      { delta: absDelta },
    )
  }

  if (segment?.promoRatingCapHit && (!hasDelta || delta >= 0)) {
    return t(
      'dashboard.eventResults.promoPenaltyCapped',
      'Promoted-match penalty applied (rating floor reached).',
    )
  }

  return t(
    'dashboard.eventResults.promoPenaltyApplied',
    '-{{delta}} promoted-match penalty',
    { delta: absDelta },
  )
}

function WrestlerChip({ person, isWinner }) {
  const [imgSrc, setImgSrc] = useState(person.imageUrl || getFallbackImage(person.gender))
  return (
    <div className={`${styles.wrestlerChip} ${isWinner ? styles.chipWinner : ''}`}>
      <img
        className={styles.wrestlerAvatar}
        src={imgSrc}
        alt={person.name}
        onError={() => setImgSrc(getFallbackImage(person.gender))}
      />
      <span className={styles.wrestlerName}>{person.name}</span>
      {isWinner && <span className={styles.winnerBadge}>W</span>}
    </div>
  )
}

function SegmentCard({ segment, index, visible, t }) {
  const isMatch = MATCH_SEGMENT_TYPES.has(segment.segmentType)
  const isTagTeam = segment.matchType === 'tagTeam'

  const wrestlers = (segment.participantDetails || []).filter((p) => p.role === 'wrestler')
  const others = (segment.participantDetails || []).filter((p) => p.role !== 'wrestler')

  const isWinner = (person) => {
    if (!isMatch) return false
    if (isTagTeam) return (segment.winnerTeamIds || []).includes(person.employeeId)
    return segment.winnerEmployeeId === person.employeeId
  }

  const avgPop = wrestlers.length > 0
    ? Math.round(wrestlers.reduce((s, w) => s + (Number(w.popularity) || 0), 0) / wrestlers.length)
    : null
  const promoAdjustmentText = isMatch ? formatPromoAdjustment({ segment, t }) : null
  const promoAdjustmentType = segment?.promoRatingAdjustmentType

  return (
    <div
      className={`${styles.segCard} ${visible ? styles.segCardVisible : ''}`}
      style={{ animationDelay: `${0.5 + index * 0.12}s` }}
    >
      <div className={styles.segHeader}>
        <span className={styles.segIndex}>#{index + 1}</span>
        <span className={styles.segType}>{SEGMENT_TYPE_LABELS[segment.segmentType] || segment.segmentType}</span>
        {isMatch && segment.matchType === 'tagTeam' && (
          <span className={styles.segSubtype}>Tag Team</span>
        )}
        {isMatch && segment.winnerName && (
          <span className={styles.winnerLabel}>
            Winner: <strong>{segment.winnerName}</strong>
          </span>
        )}
      </div>

      <div className={styles.segBody}>
        <div className={styles.participantsRow}>
          {wrestlers.map((p) => (
            <WrestlerChip key={p.employeeId} person={p} isWinner={isWinner(p)} />
          ))}
          {others.map((p) => (
            <div key={p.employeeId} className={styles.helperChip}>
              <span className={styles.helperRole}>{p.role}</span>
              <span className={styles.helperName}>{p.name}</span>
            </div>
          ))}
        </div>

        {isMatch && (
          <div className={styles.segStats}>
            {Number.isFinite(Number(segment.matchRating)) && (
              <div className={styles.statBlock}>
                <span className={styles.statLabel}>Match Rating</span>
                <span className={styles.statValue} style={{ color: getRatingColor(segment.matchRating) }}>
                  {Number(segment.matchRating).toFixed(1)}
                  <span className={styles.ratingDesc}> — {getRatingLabel(segment.matchRating)}</span>
                </span>
                <RatingStars rating={segment.matchRating} />
                {promoAdjustmentText && (
                  <span
                    className={[
                      styles.promoAdjustment,
                      promoAdjustmentType === 'bonus' ? styles.promoAdjustmentBonus : '',
                      promoAdjustmentType === 'penalty' ? styles.promoAdjustmentPenalty : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {promoAdjustmentText}
                  </span>
                )}
              </div>
            )}
            {avgPop !== null && (
              <div className={styles.statBlock}>
                <span className={styles.statLabel}>Avg. Popularity</span>
                <span className={styles.statValue}>{avgPop}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventResultsScreen({ outcome, onContinue }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [segsVisible, setSegsVisible] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    const segTimer = setTimeout(() => setSegsVisible(true), 600)
    return () => {
      cancelAnimationFrame(id)
      clearTimeout(segTimer)
    }
  }, [])

  if (!outcome) return null

  const {
    eventName,
    eventType,
    hype,
    overallRating,
    income,
    expenses,
    fanDelta,
    prestigeDelta,
    segments = [],
  } = outcome

  const eventTypeLabel = EVENT_TYPE_LABELS[eventType] || 'Event'
  const net = (income || 0) - (expenses || 0)
  const matchSegs = segments.filter((s) => MATCH_SEGMENT_TYPES.has(s.segmentType))

  const bestMatch = matchSegs.reduce((best, seg, idx) => {
    if (!Number.isFinite(Number(seg.matchRating))) return best
    if (!best) return { seg, idx }
    const bRating = Number(best.seg.matchRating)
    const sRating = Number(seg.matchRating)
    if (sRating > bRating || (sRating === bRating && idx > best.idx)) return { seg, idx }
    return best
  }, null)

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`}>
      <div className={styles.scanlines} aria-hidden="true" />

      <div className={styles.content} ref={scrollRef}>
        {/* Header */}
        <div className={`${styles.typeBadge} ${visible ? styles.animate1 : ''}`}>
          {eventTypeLabel}
        </div>

        <h1 className={`${styles.eventName} ${visible ? styles.animate2 : ''}`}>
          {eventName || t('dashboard.eventResults.defaultName', 'Event Results')}
        </h1>

        <div className={`${styles.divider} ${visible ? styles.animate3 : ''}`} />

        {/* Overall stats row */}
        <div className={`${styles.summaryRow} ${visible ? styles.animate3 : ''}`}>
          {overallRating !== null && overallRating !== undefined && (
            <div className={styles.summaryBlock}>
              <span className={styles.summaryLabel}>{t('dashboard.eventResults.overallRating', 'Event Rating')}</span>
              <span className={styles.summaryBig} style={{ color: getRatingColor(overallRating) }}>
                {overallRating.toFixed(1)}
              </span>
              <span className={styles.summaryDesc}>{getRatingLabel(overallRating)}</span>
              <RatingStars rating={overallRating} />
            </div>
          )}
          {hype !== undefined && (
            <div className={styles.summaryBlock}>
              <span className={styles.summaryLabel}>{t('dashboard.eventResults.hype', 'Event Hype')}</span>
              <span className={styles.summaryBig}>{hype}</span>
            </div>
          )}
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.matches', 'Matches')}</span>
            <span className={styles.summaryBig}>{matchSegs.length}</span>
          </div>
          <div className={`${styles.summaryBlock} ${prestigeDelta > 0 ? styles.positive : prestigeDelta < 0 ? styles.negative : ''}`}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.prestige', 'Prestige')}</span>
            <span className={styles.summaryBig}>
              {prestigeDelta > 0 ? `+${prestigeDelta}` : prestigeDelta < 0 ? `${prestigeDelta}` : '±0'}
            </span>
          </div>
          <div className={`${styles.summaryBlock} ${fanDelta > 0 ? styles.positive : fanDelta < 0 ? styles.negative : ''}`}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.fans', 'Fans')}</span>
            <span className={styles.summaryBig}>
              {fanDelta > 0 ? `+${fanDelta.toLocaleString()}` : fanDelta?.toLocaleString()}
            </span>
          </div>
          <div className={`${styles.summaryBlock} ${net > 0 ? styles.positive : net < 0 ? styles.negative : ''}`}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.revenue', 'Event Revenue')}</span>
            <span className={styles.summaryBig}>
              {net > 0 ? `+$${net.toLocaleString()}` : `-$${Math.abs(net).toLocaleString()}`}
            </span>
          </div>
        </div>

        <div className={`${styles.divider} ${visible ? styles.animate3 : ''}`} />

        {/* Segments */}
        <div className={`${styles.segmentsSection} ${visible ? styles.animate4 : ''}`}>
          <div className={styles.segmentsSectionHeader}>
            <p className={styles.sectionLabel}>
              {t('dashboard.eventResults.segmentsLabel', 'Segments')} ({segments.length})
            </p>
            {bestMatch && (
              <div className={styles.bestMatchBadge} style={{ borderColor: getRatingColor(bestMatch.seg.matchRating) }}>
                <span className={styles.bestMatchCrown}>★</span>
                <div className={styles.bestMatchInfo}>
                  <span className={styles.bestMatchLabel}>Match of the Night</span>
                  <span className={styles.bestMatchRating} style={{ color: getRatingColor(bestMatch.seg.matchRating) }}>
                    {Number(bestMatch.seg.matchRating).toFixed(1)}
                    <em className={styles.bestMatchDesc}> — {getRatingLabel(bestMatch.seg.matchRating)}</em>
                  </span>
                  <span className={styles.bestMatchName}>
                    {(bestMatch.seg.participantDetails || [])
                      .filter((p) => p.role === 'wrestler')
                      .map((p) => p.name)
                      .join(' vs ')}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className={styles.segmentsList}>
            {segments.map((seg, i) => (
              <SegmentCard key={seg.id || i} segment={seg} index={i} visible={segsVisible} t={t} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className={`${styles.ctaRow} ${visible ? styles.animate5 : ''}`}>
          <button type="button" className={styles.continueBtn} onClick={onContinue}>
            {t('dashboard.eventResults.continue', 'Continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EventResultsScreen
