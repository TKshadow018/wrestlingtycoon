import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Sparkline from './Sparkline'
import { useGameStore } from '../../../store/useGameStore'
import styles from './StatisticsModule.module.scss'

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

const formatSigned = (value) => {
  if (value > 0) return `+${value}`
  return `${value}`
}

function StatisticsModule() {
  const { t } = useTranslation()
  const timeline = useGameStore((state) => state.history.timeline)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const payroll = useGameStore((state) => state.roster.employees.reduce((sum, employee) => sum + employee.salary, 0))

  const metrics = useMemo(() => {
    if (timeline.length === 0) {
      return {
        avgDailyDelta: 0,
        successfulEvents: 0,
        missedEvents: 0,
      }
    }

    const totalDelta = timeline.reduce((sum, item) => sum + item.delta, 0)
    const successfulEvents = timeline.filter((item) => item.eventOutcomeType === 'success').length
    const missedEvents = timeline.filter((item) => item.eventOutcomeType === 'missed').length

    return {
      avgDailyDelta: Math.round(totalDelta / timeline.length),
      successfulEvents,
      missedEvents,
    }
  }, [timeline])

  const recentEntries = timeline.slice(-8).reverse()
  const trendEntries = timeline.slice(-18)
  const cashSeries = trendEntries.map((entry) => entry.cash)
  const fanSeries = trendEntries.map((entry) => entry.fans)

  return (
    <section className={styles.moduleBody}>
      <div className={styles.kpiGrid}>
        <article>
          <p>{t('dashboard.statsPanel.avgDailyDelta')}</p>
          <h4>$ {metrics.avgDailyDelta.toLocaleString()}</h4>
        </article>
        <article>
          <p>{t('dashboard.statsPanel.currentPayroll')}</p>
          <h4>$ {payroll.toLocaleString()}</h4>
        </article>
        <article>
          <p>{t('dashboard.statsPanel.successfulEvents')}</p>
          <h4>{metrics.successfulEvents}</h4>
        </article>
        <article>
          <p>{t('dashboard.statsPanel.missedEvents')}</p>
          <h4>{metrics.missedEvents}</h4>
        </article>
      </div>

      {trendEntries.length > 1 ? (
        <div className={styles.trendGrid}>
          <Sparkline values={cashSeries} label={t('dashboard.statsPanel.cashTrend')} />
          <Sparkline values={fanSeries} label={t('dashboard.statsPanel.fanTrend')} />
        </div>
      ) : null}

      {recentEntries.length === 0 ? (
        <p className={styles.emptyState}>{t('dashboard.statsPanel.empty')}</p>
      ) : (
        <div className={styles.timelineList}>
          {recentEntries.map((entry) => (
            <article key={`history-${entry.day}`} className={styles.timelineRow}>
              <div>
                <p>{formatGameDateFromDay(startDateIso, entry.day)}</p>
                <small>{t('dashboard.statsPanel.employees', { count: entry.employees })}</small>
              </div>
              <div>
                <p>{t('dashboard.statsPanel.cash', { amount: entry.cash.toLocaleString() })}</p>
                <small>{t('dashboard.statsPanel.delta', { value: formatSigned(entry.delta.toLocaleString()) })}</small>
              </div>
              <div>
                <p>{t('dashboard.statsPanel.fans', { fans: entry.fans.toLocaleString() })}</p>
                <small>{t('dashboard.statsPanel.prestige', { prestige: entry.prestige })}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default StatisticsModule
