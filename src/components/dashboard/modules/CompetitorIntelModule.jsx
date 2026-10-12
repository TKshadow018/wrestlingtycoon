import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import styles from './CompetitorIntelModule.module.scss'

const formatSignedNumber = (value) => {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) {
    return '0'
  }

  const rounded = Math.round(numeric)
  if (rounded === 0) {
    return '0'
  }

  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function CompetitorIntelModule() {
  const { t } = useTranslation()
  const headlines = useGameStore((state) => state.events.competitorHeadlines || [])

  const latest = headlines[headlines.length - 1] || null
  const recent = useMemo(() => [...headlines].reverse().slice(0, 14), [headlines])

  const metrics = useMemo(() => {
    if (headlines.length === 0) {
      return {
        averageFanImpact: 0,
        averagePrestigeImpact: 0,
        positiveNights: 0,
        negativeNights: 0,
      }
    }

    const fanTotal = headlines.reduce((sum, item) => sum + Number(item.fanImpact || 0), 0)
    const prestigeTotal = headlines.reduce((sum, item) => sum + Number(item.prestigeImpact || 0), 0)
    const positiveNights = headlines.filter((item) => Number(item.fanImpact || 0) >= 0).length

    return {
      averageFanImpact: Math.round(fanTotal / headlines.length),
      averagePrestigeImpact: Number((prestigeTotal / headlines.length).toFixed(2)),
      positiveNights,
      negativeNights: headlines.length - positiveNights,
    }
  }, [headlines])

  if (headlines.length === 0) {
    return (
      <section className={styles.moduleBody}>
        <p className={styles.empty}>{t('dashboard.competitorIntel.empty')}</p>
      </section>
    )
  }

  return (
    <section className={styles.moduleBody}>
      <div className={styles.kpiGrid}>
        <article>
          <h4>{t('dashboard.competitorIntel.averageFanImpact')}</h4>
          <p className={metrics.averageFanImpact >= 0 ? styles.positive : styles.negative}>
            {formatSignedNumber(metrics.averageFanImpact)}
          </p>
        </article>
        <article>
          <h4>{t('dashboard.competitorIntel.averagePrestigeImpact')}</h4>
          <p className={metrics.averagePrestigeImpact >= 0 ? styles.positive : styles.negative}>
            {formatSignedNumber(metrics.averagePrestigeImpact)}
          </p>
        </article>
        <article>
          <h4>{t('dashboard.competitorIntel.winningNights')}</h4>
          <p>{metrics.positiveNights}</p>
        </article>
        <article>
          <h4>{t('dashboard.competitorIntel.losingNights')}</h4>
          <p>{metrics.negativeNights}</p>
        </article>
      </div>

      {latest ? (
        <article className={styles.latestCard}>
          <h4>{t('dashboard.competitorIntel.latestHeadline')}</h4>
          <p>{latest.headline}</p>
        </article>
      ) : null}

      <div className={styles.list}>
        {recent.map((item, index) => (
          <article key={item.id || `${item.day}-${index}`} className={styles.itemCard}>
            <div className={styles.rowTop}>
              <strong>
                {t('dashboard.competitorIntel.dayLabel', { day: item.day })}
              </strong>
              <span>{item.rivalName}</span>
            </div>
            <p className={styles.headline}>{item.headline}</p>
            <div className={styles.rowBottom}>
              <span className={Number(item.fanImpact || 0) >= 0 ? styles.positive : styles.negative}>
                {t('dashboard.competitorIntel.fanImpact', { value: formatSignedNumber(item.fanImpact) })}
              </span>
              <span className={Number(item.prestigeImpact || 0) >= 0 ? styles.positive : styles.negative}>
                {t('dashboard.competitorIntel.prestigeImpact', { value: formatSignedNumber(item.prestigeImpact) })}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default CompetitorIntelModule