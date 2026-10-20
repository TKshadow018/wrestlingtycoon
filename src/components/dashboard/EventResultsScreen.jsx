import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MATCH_MOMENT_ACTIONS, MATCH_PROP_OPTIONS } from '../../data/matchPlanning'
import venueCatalog from '../../data/venue.json'
import { getCareerArcUnlockItem } from '../../data/careerArcUnlocks'
import { localizeCompetitorHeadline } from '../../utils/competitorNews'
import MatchRatingBreakdown from './MatchRatingBreakdown'
import MatchHealthSummary from './MatchHealthSummary'
import { getEventTypeKey, isRegularWeeklyEvent } from '../../utils/eventDisplay'
import styles from './EventResultsScreen.module.scss'

const FEMALE_FALLBACK = '/people/girl.png'
const MALE_FALLBACK = '/people/boy.png'

const getFallbackImage = (gender) => (gender === 'female' ? FEMALE_FALLBACK : MALE_FALLBACK)

const SEGMENT_TYPE_KEYS = {
  match: 'dashboard.segments.match',
  mainEvent: 'dashboard.segments.mainEvent',
  titleMatch: 'dashboard.segments.titleMatch',
  interview: 'dashboard.segments.interview',
  promo: 'dashboard.segments.promo',
}

const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])

const EVENT_TYPE_KEYS = {
  ppv: 'dashboard.eventTypes.ppv',
  megaLive: 'dashboard.eventTypes.megaLive',
  oneTime: 'dashboard.eventTypes.oneTime',
  regularWeekly: 'dashboard.eventTypes.regularWeekly',
  houseShow: 'dashboard.eventTypes.houseShow',
  digitalOnly: 'dashboard.eventTypes.digitalOnly',
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

function getRatingLabel(rating, t) {
  if (!Number.isFinite(Number(rating))) return '—'
  const r = Number(rating)
  const labelKey = r >= 9
    ? 'classic'
    : r >= 8
      ? 'excellent'
      : r >= 7
        ? 'good'
        : r >= 5.5
          ? 'average'
          : r >= 4
            ? 'belowAverage'
            : 'poor'
  return t(`dashboard.eventResults.ratingLabels.${labelKey}`)
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

function formatSignedValue(value, isMoney = false) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) {
    return isMoney ? '$0' : '0'
  }

  const abs = Math.abs(Math.round(numeric)).toLocaleString()
  if (isMoney) {
    return numeric > 0 ? `+$${abs}` : `-$${abs}`
  }

  return numeric > 0 ? `+${abs}` : `-${abs}`
}

function PostmortemFactor({ factor, isMoney = false, t }) {
  const impactClass = factor?.impact === 'positive'
    ? styles.factorPositive
    : factor?.impact === 'negative'
      ? styles.factorNegative
      : styles.factorNeutral

  return (
    <li className={styles.factorItem}>
      <span className={styles.factorLabel}>
        {t(factor?.labelKey || 'dashboard.eventResults.postmortemFactors.unknown', {
          ...factor?.labelValues,
          rating: factor?.labelValues?.rating ?? t('dashboard.eventResults.notAvailable'),
        })}
      </span>
      <span className={`${styles.factorValue} ${impactClass}`}>
        {formatSignedValue(factor.value, isMoney)}
      </span>
    </li>
  )
}

function getSatisfactionLabel(value, t) {
  const numeric = Number(value)
  const labelKey = !Number.isFinite(numeric)
    ? 'unknown'
    : numeric >= 80
      ? 'veryHot'
      : numeric >= 65
        ? 'hot'
        : numeric >= 50
          ? 'mixedPositive'
          : numeric >= 35
            ? 'mixed'
            : 'cold'
  return t(`dashboard.eventResults.satisfactionLabels.${labelKey}`)
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
      return t('dashboard.eventResults.promoBonusCapped')
    }

    return t('dashboard.eventResults.promoBonusApplied', { delta: absDelta })
  }

  if (segment?.promoRatingCapHit && (!hasDelta || delta >= 0)) {
    return t('dashboard.eventResults.promoPenaltyCapped')
  }

  return t('dashboard.eventResults.promoPenaltyApplied', { delta: absDelta })
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
  const isMatch = MATCH_SEGMENT_TYPES.has(segment.segmentType) && !segment.cancelled
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
  const segmentLabel = segment.segmentType === 'promo' && segment.promoSegmentId
    ? t(`dashboard.events.setup.promoSegments.${segment.promoSegmentId}`, {
        defaultValue: t('dashboard.segments.promo'),
      })
    : t(SEGMENT_TYPE_KEYS[segment.segmentType] || 'dashboard.segments.unknown')
  const promoAdjustmentText = isMatch ? formatPromoAdjustment({ segment, t }) : null
  const promoAdjustmentType = segment?.promoRatingAdjustmentType
  const participantNameById = new Map((segment.participantDetails || []).map((person) => [person.employeeId, person.name]))
  const planMoments = Array.isArray(segment.plannedMoments) ? segment.plannedMoments : []
  const planProps = Array.isArray(segment.props) ? segment.props : []
  const usedProps = [...new Set(planMoments.filter((moment) => moment.actionType === 'usesProp' && moment.propId).map((moment) => moment.propId))]

  return (
    <div
      className={`${styles.segCard} ${visible ? styles.segCardVisible : ''}`}
      style={{ animationDelay: `${0.5 + index * 0.12}s` }}
    >
      <div className={styles.segHeader}>
        <span className={styles.segIndex}>#{index + 1}</span>
        <span className={styles.segType}>{segmentLabel}</span>
        {isMatch && segment.matchType === 'tagTeam' && (
          <span className={styles.segSubtype}>{t('dashboard.eventResults.tagTeam')}</span>
        )}
        {isMatch && Number(segment.chemistryRatingAdjustment) !== 0 && (
          <span className={styles.segSubtype}>
            {t('dashboard.eventResults.backstageChemistry', {
              value: formatSignedValue(segment.chemistryRatingAdjustment),
            })}
          </span>
        )}
        {isMatch && segment.winnerName && (
          <span className={styles.winnerLabel}>
            {t('dashboard.eventResults.winner')} <strong>{segment.winnerName}</strong>
          </span>
        )}
        {isMatch && Number(segment.matchLengthMinutes) > 0 && (
          <span className={styles.segSubtype}>
            {t(`dashboard.events.setup.execution.matchLengthOption${Number(segment.matchLengthMinutes) === 1 ? 'Singular' : ''}`, { minutes: segment.matchLengthMinutes })}
          </span>
        )}
      </div>

      <div className={styles.segBody}>
        {segment.cancelled ? <MatchHealthSummary segment={segment} className={styles.segmentPlan} /> : null}
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

        {Array.isArray(segment.staffContributions) && segment.staffContributions.length > 0 ? (
          <div className={styles.staffContributions}>
            {segment.staffContributions.map((contribution) => (
              <p key={`${contribution.role}-${contribution.employeeId}`}>
                {contribution.role === 'manager'
                  ? t('dashboard.eventResults.staffContributions.manager', {
                      name: contribution.name,
                      fans: formatSignedValue(contribution.fanImpact),
                    })
                  : contribution.role === 'referee'
                    ? t('dashboard.eventResults.staffContributions.referee', {
                        name: contribution.name,
                        rating: formatSignedValue(contribution.ratingAdjustment),
                      })
                    : t('dashboard.eventResults.staffContributions.announcer', {
                        name: contribution.name,
                        rating: formatSignedValue(contribution.ratingAdjustment),
                        fans: formatSignedValue(contribution.fanImpact),
                      })}
              </p>
            ))}
          </div>
        ) : null}

        {isMatch && (
          <div className={styles.segStats}>
            {Number.isFinite(Number(segment.matchRating)) && (
              <div className={styles.statBlock}>
                <span className={styles.statLabel}>{t('dashboard.eventResults.matchRating')}</span>
                <span className={styles.statValue} style={{ color: getRatingColor(segment.matchRating) }}>
                  {Number(segment.matchRating).toFixed(1)}
                  <span className={styles.ratingDesc}> — {getRatingLabel(segment.matchRating, t)}</span>
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
                <span className={styles.statLabel}>{t('dashboard.eventResults.averagePopularity')}</span>
                <span className={styles.statValue}>{avgPop}</span>
              </div>
            )}
          </div>
        )}

        {isMatch ? <MatchHealthSummary segment={segment} className={styles.segmentPlan} /> : null}
        {isMatch ? <MatchRatingBreakdown
          breakdown={segment.ratingBreakdown}
          planWarnings={segment.planWarnings}
          promoAdjustment={segment.promoRatingAdjustment}
          chemistryAdjustment={segment.chemistryRatingAdjustment}
        /> : null}
        {isMatch && (planProps.length > 0 || planMoments.length > 0) ? (
          <div className={styles.segmentPlan}>
            <div className={styles.segmentPlanHeader}>
              <strong>{t('dashboard.events.setup.execution.plannerTitle')}</strong>
              {planProps.length > 0 ? (
                <span>
                  {t('matchPlanner.selectedProps')}: {planProps.map((propId) => {
                    const prop = MATCH_PROP_OPTIONS.find((option) => option.id === propId)
                    return prop ? t(prop.labelKey) : t('dashboard.events.setup.execution.unknownProp')
                  }).join(', ')}
                </span>
              ) : null}
              <span>
                {t('matchPlanner.usedProps')}: {usedProps.length
                  ? usedProps.map((propId) => t(MATCH_PROP_OPTIONS.find((prop) => prop.id === propId)?.labelKey
                    || 'dashboard.events.setup.execution.unknownProp')).join(', ')
                  : t('matchPlanner.none')}
              </span>
            </div>
            {planMoments.length > 0 ? (
              <ul>
                {planMoments.map((moment) => {
                  const action = MATCH_MOMENT_ACTIONS.find((option) => option.id === moment.actionType)
                  const actionLabel = action ? t(action.labelKey) : t('dashboard.events.setup.execution.unknownAction')
                  const actorName = participantNameById.get(moment.actorId) || t('dashboard.events.setup.execution.unknownCompetitor')
                  const targetName = moment.targetId ? participantNameById.get(moment.targetId) : ''
                  return (
                    <li key={moment.momentId}>
                      {t('dashboard.events.setup.execution.resultMoment', {
                        minute: moment.atMinute,
                        action: actionLabel,
                        actor: actorName,
                        targetSuffix: targetName
                          ? t('dashboard.events.setup.execution.resultMomentTargetSuffix', { target: targetName })
                          : '',
                      })}
                      {moment.propId ? t('matchPlanner.withProp', {
                        prop: t(MATCH_PROP_OPTIONS.find((prop) => prop.id === moment.propId)?.labelKey
                          || 'dashboard.events.setup.execution.unknownProp'),
                      }) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
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
    venueId,
    promoStyleId,
    hype,
    overallRating,
    income,
    expenses,
    fanDelta,
    prestigeDelta,
    segments = [],
    rivalryHighlights = [],
    factionStories = [],
    audienceSegments = [],
    boardAttendance = null,
    postmortem,
    competitorPressure,
  } = outcome

  const normalizedEventType = getEventTypeKey(outcome)
  const eventTypeLabel = t(EVENT_TYPE_KEYS[normalizedEventType] || 'dashboard.eventTypes.unknown')
  const displayEventName = isRegularWeeklyEvent(outcome)
    ? eventTypeLabel
    : eventName || t('dashboard.eventResults.defaultName')
  const venue = venueCatalog.find((entry) => entry.id === venueId)
    || (outcome.venueName ? { name: outcome.venueName, location: outcome.venueLocation } : null)
  const promoStyle = promoStyleId ? getCareerArcUnlockItem('promoStyles', promoStyleId) : null
  const net = (income || 0) - (expenses || 0)
  const matchSegs = segments.filter((s) => MATCH_SEGMENT_TYPES.has(s.segmentType) && !s.cancelled)

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
          {displayEventName}
        </h1>
        {(venue || (promoStyle && promoStyle.id !== 'spotlight')) && (
          <p className={styles.eventMeta}>
            {venue
              ? t('dashboard.eventResults.eventVenue', {
                  venue: venue.name,
                  location: venue.location,
                })
              : ''}
            {venue && promoStyle?.id !== 'spotlight' ? ' · ' : ''}
            {promoStyle && promoStyle.id !== 'spotlight'
              ? t('dashboard.eventResults.promoCampaign', {
                  name: t(promoStyle.labelKey),
                })
              : ''}
          </p>
        )}

        <div className={`${styles.divider} ${visible ? styles.animate3 : ''}`} />

        {/* Overall stats row */}
        <div className={`${styles.summaryRow} ${visible ? styles.animate3 : ''}`}>
          {overallRating !== null && overallRating !== undefined && (
            <div className={styles.summaryBlock}>
              <span className={styles.summaryLabel}>{t('dashboard.eventResults.overallRating')}</span>
              <span className={styles.summaryBig} style={{ color: getRatingColor(overallRating) }}>
                {overallRating.toFixed(1)}
              </span>
              <span className={styles.summaryDesc}>{getRatingLabel(overallRating, t)}</span>
              <RatingStars rating={overallRating} />
            </div>
          )}
          {hype !== undefined && (
            <div className={styles.summaryBlock}>
              <span className={styles.summaryLabel}>{t('dashboard.eventResults.hype')}</span>
              <span className={styles.summaryBig}>{hype}</span>
            </div>
          )}
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.matches')}</span>
            <span className={styles.summaryBig}>{matchSegs.length}</span>
          </div>
          <div className={`${styles.summaryBlock} ${prestigeDelta > 0 ? styles.positive : prestigeDelta < 0 ? styles.negative : ''}`}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.prestige')}</span>
            <span className={styles.summaryBig}>
              {prestigeDelta > 0 ? `+${prestigeDelta}` : prestigeDelta < 0 ? `${prestigeDelta}` : '±0'}
            </span>
          </div>
          <div className={`${styles.summaryBlock} ${fanDelta > 0 ? styles.positive : fanDelta < 0 ? styles.negative : ''}`}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.fans')}</span>
            <span className={styles.summaryBig}>
              {fanDelta > 0 ? `+${fanDelta.toLocaleString()}` : fanDelta?.toLocaleString()}
            </span>
          </div>
          <div className={`${styles.summaryBlock} ${net > 0 ? styles.positive : net < 0 ? styles.negative : ''}`}>
            <span className={styles.summaryLabel}>{t('dashboard.eventResults.revenue')}</span>
            <span className={styles.summaryBig}>
              {net > 0 ? `+$${net.toLocaleString()}` : `-$${Math.abs(net).toLocaleString()}`}
            </span>
          </div>
        </div>

        {boardAttendance && (
          <article className={`${styles.boardAttendanceCard} ${visible ? styles.animate4 : ''}`}>
            <img
              className={styles.boardAttendancePhoto}
              src={boardAttendance.imageUrl}
              alt={boardAttendance.personName}
            />
            <div className={styles.boardAttendanceCopy}>
              <p className={styles.boardAttendanceLabel}>
                {t('dashboard.eventResults.boardMemberPresent')}
              </p>
              <h2>{boardAttendance.personName}</h2>
              <p>{boardAttendance.role}</p>
              <strong>
                {t('dashboard.eventResults.boardGateBonus', {
                  percent: boardAttendance.gateBonusPercent,
                  amount: `$${Number(boardAttendance.gateBonusAmount || 0).toLocaleString()}`,
                })}
              </strong>
            </div>
          </article>
        )}

        <div className={`${styles.divider} ${visible ? styles.animate3 : ''}`} />

        {(postmortem || rivalryHighlights.length > 0 || factionStories.length > 0 || competitorPressure) && (
          <section className={`${styles.postmortemSection} ${visible ? styles.animate4 : ''}`}>
            <p className={styles.sectionLabel}>{t('dashboard.eventResults.postmortemTitle')}</p>

            <div className={styles.postmortemGrid}>
              <article className={styles.postmortemCard}>
                <h3>{t('dashboard.eventResults.postmortemFans')}</h3>
                <ul>
                  {(postmortem?.fanFactors || []).map((factor) => (
                    <PostmortemFactor key={`fan-${factor.key}`} factor={factor} t={t} />
                  ))}
                </ul>
              </article>

              <article className={styles.postmortemCard}>
                <h3>{t('dashboard.eventResults.postmortemPrestige')}</h3>
                <ul>
                  {(postmortem?.prestigeFactors || []).map((factor) => (
                    <PostmortemFactor key={`prestige-${factor.key}`} factor={factor} t={t} />
                  ))}
                </ul>
              </article>

              <article className={styles.postmortemCard}>
                <h3>{t('dashboard.eventResults.postmortemMoney')}</h3>
                <ul>
                  {(postmortem?.moneyFactors || []).map((factor) => (
                    <PostmortemFactor key={`money-${factor.key}`} factor={factor} isMoney t={t} />
                  ))}
                </ul>
              </article>

              {audienceSegments.length > 0 && (
                <article className={styles.postmortemCard}>
                  <h3>{t('dashboard.eventResults.audienceSegments')}</h3>
                  <ul>
                    {audienceSegments.map((segment) => (
                      <li key={segment.key} className={styles.audienceSegmentItem}>
                        <div className={styles.audienceSegmentMain}>
                          <span className={styles.audienceSegmentLabel}>
                            {t(segment.labelKey || `dashboard.eventResults.audienceSegmentLabels.${segment.key}`, {
                              defaultValue: t('dashboard.eventResults.postmortemFactors.unknown'),
                            })}
                          </span>
                          <span className={styles.audienceSegmentAttendance}>
                            {Number(segment.attendance || 0).toLocaleString()} ({Number(segment.sharePercent || 0)}%)
                          </span>
                        </div>
                        <div className={styles.audienceSegmentMeta}>
                          <span>
                            {t('dashboard.eventResults.audienceSatisfaction')}: {getSatisfactionLabel(segment.satisfaction, t)} ({segment.satisfaction})
                          </span>
                          <span className={Number(segment.fanImpact || 0) >= 0 ? styles.factorPositive : styles.factorNegative}>
                            {t('dashboard.eventResults.audienceFanImpact')}: {Number(segment.fanImpact || 0) >= 0 ? '+' : ''}{Number(segment.fanImpact || 0)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              )}

              {(postmortem?.recommendations || []).length > 0 && (
                <article className={styles.recommendationCard}>
                  <h3>{t('dashboard.eventResults.recommendations.title')}</h3>
                  <ul>
                    {postmortem.recommendations.map((recommendation) => {
                      const formatLabel = t(
                        `dashboard.events.setup.matchTypes.${recommendation.format}`,
                        { defaultValue: t('dashboard.segments.unknown') },
                      )
                      return (
                        <li key={recommendation.id}>
                          <strong>{t(recommendation.titleKey, { format: formatLabel })}</strong>
                          <p>
                            {t(recommendation.messageKey, {
                              format: formatLabel,
                              share: recommendation.currentSharePercent,
                              recentShows: recommendation.repeatedEvents,
                            })}
                          </p>
                          <small>{t(recommendation.actionKey)}</small>
                        </li>
                      )
                    })}
                  </ul>
                </article>
              )}
            </div>

            {rivalryHighlights.length > 0 && (
              <article className={styles.rivalryCard}>
                <h3>{t('dashboard.eventResults.rivalryTitle')}</h3>
                <ul className={styles.rivalryList}>
                  {rivalryHighlights.map((item) => (
                    <li key={item.pairKey} className={styles.rivalryItem}>
                      <span className={styles.rivalryNames}>{item.names || t('dashboard.eventResults.rivalryUnknown')}</span>
                      <span className={styles.rivalryHeat}>
                        {t('dashboard.eventResults.rivalryGain', { gain: item.gain })}
                        {' · '}
                        {t('dashboard.eventResults.rivalryTotal', { heat: item.heat })}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            )}

            {factionStories.length > 0 && (
              <article className={styles.rivalryCard}>
                <h3>{t('dashboard.eventResults.factionStoriesTitle')}</h3>
                <ul className={styles.rivalryList}>
                  {factionStories.map((story, index) => (
                    <li
                      key={`${story.sourceFactionId}-${story.targetFactionId}-${story.action}-${index}`}
                      className={styles.rivalryItem}
                    >
                      <span className={styles.rivalryNames}>
                        {t(`dashboard.eventResults.factionStory${story.action.charAt(0).toUpperCase()}${story.action.slice(1)}`, {
                          defaultValue: t('dashboard.eventResults.factionStoryUnknown'),
                          source: story.sourceFactionName,
                          target: story.targetFactionName,
                          member: story.betrayedEmployeeName || '',
                          heat: story.heatGain,
                          fans: story.fanImpact,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            )}

            {competitorPressure && (
              <article className={styles.rivalryCard}>
                <h3>{t('dashboard.eventResults.competitorTitle')}</h3>
                <ul className={styles.rivalryList}>
                  <li className={styles.rivalryItem}>
                    <span className={styles.rivalryNames}>
                      {localizeCompetitorHeadline(competitorPressure, t)}
                    </span>
                    <span className={styles.rivalryHeat}>
                      {t('dashboard.eventResults.competitorFans', {
                        value: formatSignedValue(competitorPressure.fanImpact),
                      })}
                      {' · '}
                      {t('dashboard.eventResults.competitorPrestige', {
                        value: formatSignedValue(competitorPressure.prestigeImpact),
                      })}
                    </span>
                  </li>
                </ul>
              </article>
            )}
          </section>
        )}

        {/* Segments */}
        <div className={`${styles.segmentsSection} ${visible ? styles.animate4 : ''}`}>
          <div className={styles.segmentsSectionHeader}>
            <p className={styles.sectionLabel}>
              {t('dashboard.eventResults.segmentsLabel')} ({segments.length})
            </p>
            {bestMatch && (
              <div className={styles.bestMatchBadge} style={{ borderColor: getRatingColor(bestMatch.seg.matchRating) }}>
                <span className={styles.bestMatchCrown}>★</span>
                <div className={styles.bestMatchInfo}>
                  <span className={styles.bestMatchLabel}>{t('dashboard.eventResults.matchOfTheNight')}</span>
                  <span className={styles.bestMatchRating} style={{ color: getRatingColor(bestMatch.seg.matchRating) }}>
                    {Number(bestMatch.seg.matchRating).toFixed(1)}
                    <em className={styles.bestMatchDesc}> — {getRatingLabel(bestMatch.seg.matchRating, t)}</em>
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
            {t('dashboard.eventResults.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EventResultsScreen
