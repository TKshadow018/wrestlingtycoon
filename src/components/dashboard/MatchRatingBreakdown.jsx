import { useTranslation } from 'react-i18next'
import { sanitizeRatingBreakdown } from '../../utils/matchRating'
import { MATCH_PLAN_DIAGNOSTIC_CODES } from '../../data/matchPlanning'
import styles from './EventResultsScreen.module.scss'

const FACTORS = [
  'performerCapability', 'eventExecution', 'matchStructure',
  'varietyAndPacing', 'finishCoherence', 'riskManagement',
]

export default function MatchRatingBreakdown({ breakdown, planWarnings = [], promoAdjustment = 0, chemistryAdjustment = 0 }) {
  const { t } = useTranslation()
  const normalized = sanitizeRatingBreakdown(breakdown)
  if (!normalized) return null
  const warningCodes = [...new Set([
    ...normalized.warnings,
    ...(Array.isArray(planWarnings) ? planWarnings : []).map((entry) => typeof entry === 'string' ? entry : entry?.code),
  ].filter((code) => MATCH_PLAN_DIAGNOSTIC_CODES.includes(code)))]
  return (
    <section className={styles.segmentPlan} aria-label={t('matchPlanner.breakdown')}>
      <strong>{t('matchPlanner.breakdown')}</strong>
      <dl className={styles.breakdownGrid}>
        {FACTORS.map((factor) => (
          <div key={factor}>
            <dt>{t(`matchPlanner.factors.${factor}`)}</dt>
            <dd>
              <meter min="0" max="10" value={normalized[factor]} aria-label={t(`matchPlanner.factors.${factor}`)} />
              <span>{normalized[factor].toFixed(1)}</span>
            </dd>
          </div>
        ))}
        <div>
          <dt>{t('matchPlanner.factors.contextAdjustment')}</dt>
          <dd>{normalized.contextAdjustment.toFixed(1)}</dd>
        </div>
        {[['promotion', promoAdjustment], ['chemistry', chemistryAdjustment]].map(([key, value]) => Number(value) ? (
          <div key={key}>
            <dt>{t(`matchPlanner.factors.${key}`)}</dt>
            <dd>{Number(value).toFixed(1)}</dd>
          </div>
        ) : null)}
      </dl>
      {warningCodes.length ? <ul>
        {warningCodes.map((code) => <li key={code}>{t(`matchPlanner.diagnostics.${code}`)}</li>)}
      </ul> : null}
    </section>
  )
}
