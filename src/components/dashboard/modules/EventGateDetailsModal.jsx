import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getGameDateFromDay } from '../../../utils/gameCalendar'
import styles from './ManageFinancesModule.module.scss'

const formatAmt = (value) => {
  const amount = Number(value)
  return `$${(Number.isFinite(amount) ? Math.round(amount) : 0).toLocaleString()}`
}

const formatPercent = (value) => `${((Number(value) || 0) * 100).toFixed(2).replace(/\.?0+$/, '')}%`
const formatMultiplier = (value) => `${(Number(value) || 0).toFixed(3).replace(/\.?0+$/, '')}×`

function EventGateDetailsModal({ selection, startDateIso, onClose }) {
  const { t } = useTranslation()
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!selection) return undefined

    previousFocusRef.current = selection.returnFocusTo || document.activeElement
    closeButtonRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        const firstElement = focusableElements?.[0]
        const lastElement = focusableElements?.[focusableElements.length - 1]

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [onClose, selection])

  if (!selection) return null

  const { breakdowns, periodLabel, amount, untrackedAmount = 0 } = selection
  const sponsorScopeLabel = (scope) => t(
    scope === 'event'
      ? 'dashboard.finances.gateDetails.eventSponsor'
      : 'dashboard.finances.gateDetails.recurringSponsor',
  )
  const formatEventDate = (day) => {
    if (!startDateIso) {
      return t('dashboard.finances.gateDetails.dayFallback', { day })
    }

    try {
      return getGameDateFromDay(startDateIso, Number(day)).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return t('dashboard.finances.gateDetails.dayFallback', { day })
    }
  }

  return (
    <div className={styles.gateModalOverlay} role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className={styles.gateModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-gate-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.gateModalHeader}>
          <div>
            <p className={styles.gateModalEyebrow}>{t('dashboard.finances.gateDetails.period', { period: periodLabel })}</p>
            <h3 id="event-gate-dialog-title">{t('dashboard.finances.gateDetails.title')}</h3>
          </div>
        </header>

        <div className={styles.gateModalBody}>
          {breakdowns.map((breakdown, index) => (
            <article className={styles.gateEventCard} key={`${breakdown.eventId || breakdown.day}-${index}`}>
              <header className={styles.gateEventHeader}>
                <div>
                  <h4>{breakdown.eventName || t('dashboard.finances.gateDetails.unnamedEvent')}</h4>
                  <p>
                    {formatEventDate(breakdown.day)}
                    {' · '}
                    {t(`dashboard.finances.eventTypes.${breakdown.eventType}`, {
                      defaultValue: t('dashboard.eventResults.eventTypeFallback'),
                    })}
                  </p>
                </div>
                <strong>{formatAmt(breakdown.total)}</strong>
              </header>

              {breakdown.attendanceCalculation && (
                <section className={styles.gateAttendanceSection}>
                  <h5>{t('dashboard.finances.gateDetails.attendanceTitle')}</h5>
                  <p className={styles.gateAttendanceFormula}>
                    {t('dashboard.finances.gateDetails.attendanceFormula', {
                      count: Number(breakdown.attendance || 0).toLocaleString(),
                      minimum: Number(breakdown.attendanceCalculation.minAudience || 0).toLocaleString(),
                      maximum: Number(breakdown.attendanceCalculation.maxAudience || 0).toLocaleString(),
                      score: formatPercent(breakdown.attendanceCalculation.audienceNorm),
                      crowd: formatMultiplier(breakdown.attendanceCalculation.crowdFactor),
                    })}
                  </p>
                  <div className={styles.gateAttendanceGrid}>
                    <p>
                      <span>{t('dashboard.finances.gateDetails.fanContribution')}</span>
                      <strong>
                        {Number(breakdown.attendanceCalculation.fans || 0).toLocaleString()}
                        {' / '}
                        {Number(breakdown.attendanceCalculation.fanScaleMax || 0).toLocaleString()}
                        {' × '}
                        {formatPercent(breakdown.attendanceCalculation.fansWeight)}
                        {' = '}
                        {formatPercent(
                          breakdown.attendanceCalculation.fanFactor
                          * breakdown.attendanceCalculation.fansWeight,
                        )}
                      </strong>
                    </p>
                    <p>
                      <span>{t('dashboard.finances.gateDetails.prestigeContribution')}</span>
                      <strong>
                        {Number(breakdown.attendanceCalculation.prestige || 0).toLocaleString()}
                        {' / '}
                        {Number(breakdown.attendanceCalculation.prestigeScaleMax || 0).toLocaleString()}
                        {' × '}
                        {formatPercent(breakdown.attendanceCalculation.prestigeWeight)}
                        {' = '}
                        {formatPercent(
                          breakdown.attendanceCalculation.prestigeFactor
                          * breakdown.attendanceCalculation.prestigeWeight,
                        )}
                      </strong>
                    </p>
                    <p>
                      <span>{t('dashboard.finances.gateDetails.weightedAudienceScore')}</span>
                      <strong>{formatPercent(breakdown.attendanceCalculation.audienceNorm)}</strong>
                    </p>
                    <p>
                      <span>{t('dashboard.finances.gateDetails.randomCrowdFactor')}</span>
                      <strong>{formatMultiplier(breakdown.attendanceCalculation.crowdFactor)}</strong>
                    </p>
                  </div>
                </section>
              )}

              <div className={styles.gateFormulaList}>
                <div className={styles.gateFormulaRow}>
                  <span>{t('dashboard.finances.gateDetails.ticketRevenue')}</span>
                  <small>
                    {t('dashboard.finances.gateDetails.ticketFormula', {
                      count: Number(breakdown.attendance || 0).toLocaleString(),
                      price: formatAmt(breakdown.ticketPrice),
                    })}
                  </small>
                  <strong>{formatAmt(breakdown.ticketRevenue)}</strong>
                </div>
                <div className={styles.gateFormulaRow}>
                  <span>{t('dashboard.finances.gateDetails.sponsorBoost')}</span>
                  <small>{t('dashboard.finances.gateDetails.sponsorFormula', { multiplier: formatPercent(breakdown.sponsorMultiplier) })}</small>
                  <strong>{formatAmt(breakdown.sponsorBoostAmount)}</strong>
                </div>
                <div className={`${styles.gateFormulaRow} ${styles.gateSubTotal}`}>
                  <span>{t('dashboard.finances.gateDetails.baseGate')}</span>
                  <small>{t('dashboard.finances.gateDetails.baseGateFormula')}</small>
                  <strong>{formatAmt(breakdown.baseGateRevenue)}</strong>
                </div>
                <div className={styles.gateFormulaRow}>
                  <span>{t('dashboard.finances.gateDetails.boardBonus')}</span>
                  <small>
                    {breakdown.boardAttendance
                      ? t('dashboard.finances.gateDetails.boardAttended', {
                          name: breakdown.boardAttendance.personName,
                          percent: formatPercent((Number(breakdown.boardAttendance.gateBonusPercent) || 0) / 100),
                        })
                      : t('dashboard.finances.gateDetails.boardNotPresent')}
                  </small>
                  <strong>{formatAmt(breakdown.boardBonusAmount)}</strong>
                </div>
                <div className={styles.gateFormulaRow}>
                  <span>{t('dashboard.finances.gateDetails.segmentBonuses')}</span>
                  <small>{t('dashboard.finances.gateDetails.segmentCount', { count: breakdown.segmentBonuses?.length || 0 })}</small>
                  <strong>{formatAmt(breakdown.segmentBonusTotal)}</strong>
                </div>
                <div className={styles.gateFormulaRow}>
                  <span>{t('dashboard.finances.gateDetails.audienceAdjustment')}</span>
                  <small>{t('dashboard.finances.gateDetails.audienceFormula', {
                    count: Number(breakdown.attendance || 0).toLocaleString(),
                    price: formatAmt(breakdown.ticketPrice),
                    multiplier: formatMultiplier(breakdown.weightedSpendMultiplier),
                  })}</small>
                  <strong>{formatAmt(breakdown.audienceSpendAdjustment)}</strong>
                </div>
                <div className={`${styles.gateFormulaRow} ${styles.gateTotal}`}>
                  <span>{t('dashboard.finances.gateDetails.eventGateTotal')}</span>
                  <small>{t('dashboard.finances.gateDetails.totalFormula')}</small>
                  <strong>{formatAmt(breakdown.total)}</strong>
                </div>
              </div>

              <section className={styles.gateDetailSection}>
                <h5>{t('dashboard.finances.gateDetails.sponsorsTitle')}</h5>
                {breakdown.sponsorBreakdown?.length ? (
                  <div className={styles.gateTableWrap}>
                    <table className={styles.gateDetailsTable}>
                      <thead>
                        <tr>
                          <th>{t('dashboard.finances.gateDetails.sponsor')}</th>
                          <th>{t('dashboard.finances.gateDetails.sponsorType')}</th>
                          <th>{t('dashboard.finances.gateDetails.trust')}</th>
                          <th>{t('dashboard.finances.gateDetails.trustFactor')}</th>
                          <th>{t('dashboard.finances.gateDetails.multiplier')}</th>
                          <th>{t('dashboard.finances.gateDetails.effectiveMultiplier')}</th>
                          <th>{t('dashboard.finances.gateDetails.gateImpact')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.sponsorBreakdown.map((sponsor, sponsorIndex) => (
                          <tr key={`${sponsor.sponsorId || sponsor.name}-${sponsorIndex}`}>
                            <td>{sponsor.name}</td>
                            <td>{sponsorScopeLabel(sponsor.scope)}</td>
                            <td>{`${Number(sponsor.trust) || 0}/100`}</td>
                            <td>{formatMultiplier(sponsor.trustFactor)}</td>
                            <td>{formatPercent(sponsor.eventMultiplier)}</td>
                            <td>{formatPercent(sponsor.effectiveMultiplier)}</td>
                            <td>{formatAmt(sponsor.gateBoostAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className={styles.gateEmpty}>{t('dashboard.finances.gateDetails.noSponsors')}</p>
                )}
              </section>

              <section className={styles.gateDetailSection}>
                <h5>{t('dashboard.finances.gateDetails.segmentBonuses')}</h5>
                {breakdown.segmentBonuses?.length ? (
                  <div className={styles.gateTableWrap}>
                    <table className={styles.gateDetailsTable}>
                      <thead>
                        <tr>
                          <th>{t('dashboard.finances.gateDetails.segment')}</th>
                          <th>{t('dashboard.finances.gateDetails.segmentTypeBonus')}</th>
                          <th>{t('dashboard.finances.gateDetails.promoFormatBonus')}</th>
                          <th>{t('dashboard.finances.gateDetails.segmentTotal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.segmentBonuses.map((segment, segmentIndex) => (
                          <tr key={`${segment.segmentNumber}-${segmentIndex}`}>
                            <td>
                              {t('dashboard.finances.gateDetails.segmentLabel', {
                                number: segment.segmentNumber,
                                type: t(`dashboard.segments.${segment.segmentType}`, {
                                  defaultValue: t('dashboard.segments.unknown'),
                                }),
                              })}
                              {segment.promoSegmentId && (
                                <small>
                                  {t(`dashboard.events.setup.promoSegments.${segment.promoSegmentId}`, {
                                    defaultValue: t('dashboard.segments.promo'),
                                  })}
                                </small>
                              )}
                            </td>
                            <td>{formatAmt(segment.segmentTypeIncome)}</td>
                            <td>{formatAmt(segment.promoBonusIncome)}</td>
                            <td>{formatAmt(segment.totalIncome)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className={styles.gateEmpty}>{t('dashboard.finances.gateDetails.noSegmentBonuses')}</p>
                )}
              </section>

              <section className={styles.gateDetailSection}>
                <h5>{t('dashboard.finances.gateDetails.audienceTitle')}</h5>
                <div className={styles.gateTableWrap}>
                  <table className={styles.gateDetailsTable}>
                    <thead>
                      <tr>
                        <th>{t('dashboard.finances.gateDetails.audienceSegment')}</th>
                        <th>{t('dashboard.finances.gateDetails.attendees')}</th>
                        <th>{t('dashboard.finances.gateDetails.share')}</th>
                        <th>{t('dashboard.finances.gateDetails.spendMultiplier')}</th>
                        <th>{t('dashboard.finances.gateDetails.satisfaction')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(breakdown.audienceSegments || []).map((segment) => (
                        <tr key={segment.key}>
                          <td>{t(segment.labelKey || `dashboard.eventResults.audienceSegmentLabels.${segment.key}`)}</td>
                          <td>{Number(segment.attendance || 0).toLocaleString()}</td>
                          <td>{formatPercent((Number(segment.sharePercent) || 0) / 100)}</td>
                          <td>{formatMultiplier(segment.spendMultiplier)}</td>
                          <td>{formatPercent((Number(segment.satisfaction) || 0) / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </article>
          ))}

          {untrackedAmount !== 0 && (
            <p className={styles.gateArchiveNote}>
              {t('dashboard.finances.gateDetails.archivedAmount', { amount: formatAmt(untrackedAmount) })}
            </p>
          )}
        </div>

        <footer className={styles.gateModalFooter}>
          <span>{t('dashboard.finances.gateDetails.selectedAmount')}</span>
          <strong>{formatAmt(amount)}</strong>
        </footer>
      </section>
    </div>
  )
}

export default EventGateDetailsModal
