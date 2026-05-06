import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import styles from './ManageFinancesModule.module.scss'

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

const categoryKeyMap = {
  dailyClose: 'dailyClose',
  eventBooking: 'eventBooking',
  eventRefund: 'eventRefund',
  hiring: 'hiring',
  severance: 'severance',
  sponsorSigning: 'sponsorSigning',
}

function ManageFinancesModule() {
  const { t } = useTranslation()
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const cash = useGameStore((state) => state.finances.cash)
  const lastIncome = useGameStore((state) => state.finances.lastIncome)
  const lastExpenses = useGameStore((state) => state.finances.lastExpenses)
  const lastDelta = useGameStore((state) => state.finances.lastDelta)
  const ledger = useGameStore((state) => state.finances.ledger || [])

  const summaries = useMemo(() => {
    const totals = {
      dailyClose: 0,
      eventBooking: 0,
      eventRefund: 0,
      hiring: 0,
      severance: 0,
      sponsorSigning: 0,
    }

    ledger.forEach((entry) => {
      if (totals[entry.category] !== undefined) {
        totals[entry.category] += entry.amount
      }
    })

    return totals
  }, [ledger])

  const recentEntries = ledger.slice(-10).reverse()

  return (
    <section className={styles.moduleBody}>
      <div className={styles.kpiGrid}>
        <article>
          <p>{t('dashboard.finances.cashOnHand')}</p>
          <h4>$ {cash.toLocaleString()}</h4>
        </article>
        <article>
          <p>{t('dashboard.finances.lastIncome')}</p>
          <h4>$ {lastIncome.toLocaleString()}</h4>
        </article>
        <article>
          <p>{t('dashboard.finances.lastExpenses')}</p>
          <h4>$ {lastExpenses.toLocaleString()}</h4>
        </article>
        <article>
          <p>{t('dashboard.finances.lastDelta')}</p>
          <h4 className={lastDelta >= 0 ? styles.positive : styles.negative}>
            {lastDelta >= 0 ? '+' : '-'}$ {Math.abs(lastDelta).toLocaleString()}
          </h4>
        </article>
      </div>

      <div className={styles.summaryGrid}>
        {Object.entries(summaries).map(([category, amount]) => (
          <article key={category}>
            <p>{t(`dashboard.finances.categories.${categoryKeyMap[category]}`)}</p>
            <h5>$ {amount.toLocaleString()}</h5>
          </article>
        ))}
      </div>

      {recentEntries.length === 0 ? (
        <p className={styles.emptyState}>{t('dashboard.finances.empty')}</p>
      ) : (
        <div className={styles.ledgerList}>
          {recentEntries.map((entry) => (
            <article key={entry.id} className={styles.ledgerRow}>
              <div>
                <p>{formatGameDateFromDay(startDateIso, entry.day)}</p>
                <small>{t(`dashboard.finances.categories.${categoryKeyMap[entry.category]}`)}</small>
              </div>
              <div>
                <p>{entry.note}</p>
                <small>{entry.type === 'income' ? t('dashboard.finances.incomeTag') : t('dashboard.finances.expenseTag')}</small>
              </div>
              <div className={entry.type === 'income' ? styles.positive : styles.negative}>
                {entry.type === 'income' ? '+' : '-'}$ {entry.amount.toLocaleString()}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default ManageFinancesModule
