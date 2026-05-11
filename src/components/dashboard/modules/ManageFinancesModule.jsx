import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GAME_CONFIG } from '../../../config/gameConfig'
import { useGameStore } from '../../../store/useGameStore'
import styles from './ManageFinancesModule.module.scss'

// ─── Color palettes ────────────────────────────────────────────────────────────
const INCOME_COLORS = {
  sponsor: '#72e0b3',
  event: '#7eb3ff',
  merchandise: '#f0b050',
  thirdParty: '#c084fc',
  webSubscription: '#60c8c8',
}

const EXPENSE_COLORS = {
  wrestlerPayroll: '#ff9b9b',
  staffCost: '#ff8c50',
  eventCost: '#ffb830',
  operatingCost: '#d070ff',
  otherCost: '#90a0b0',
}

const INCOME_KEYS = ['sponsor', 'event', 'merchandise', 'thirdParty', 'webSubscription']
const EXPENSE_KEYS = ['wrestlerPayroll', 'staffCost', 'eventCost', 'operatingCost', 'otherCost']

const categoryKeyMap = {
  dailyClose: 'dailyClose',
  eventBooking: 'eventBooking',
  eventRefund: 'eventRefund',
  matchPayroll: 'matchPayroll',
  staffPayroll: 'staffPayroll',
  eventCost: 'eventCost',
  thirdPartyIncome: 'thirdPartyIncome',
  hiring: 'hiring',
  severance: 'severance',
  sponsorSigning: 'sponsorSigning',
  employeeBonus: 'employeeBonus',
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
const parseIsoDateLocal = (iso) => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const getEntryDate = (entry, startDateIso) => {
  const base = parseIsoDateLocal(startDateIso)
  if (!base) return null
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() + Math.max(0, (entry.day || 1) - 1))
  return d
}

const formatGameDateFromDay = (startDateIso, day) => {
  const date = getEntryDate({ day }, startDateIso)
  if (!date) return `Day ${day}`
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Timeline aggregation ──────────────────────────────────────────────────────
const zeroIncome = () => ({ sponsor: 0, event: 0, merchandise: 0, thirdParty: 0, webSubscription: 0 })
const zeroExpense = () => ({ wrestlerPayroll: 0, staffCost: 0, eventCost: 0, operatingCost: 0, otherCost: 0 })

const aggregateTimeline = (timeline, startDateIso, period) => {
  const groups = new Map()

  timeline.forEach((entry) => {
    const date = getEntryDate(entry, startDateIso)
    if (!date) return

    let key
    let label

    if (period === 'daily') {
      key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } else if (period === 'monthly') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      label = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    } else {
      key = String(date.getFullYear())
      label = String(date.getFullYear())
    }

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        cash: entry.cash,
        income: zeroIncome(),
        expenses: zeroExpense(),
        totalIncome: 0,
        totalExpenses: 0,
      })
    }

    const g = groups.get(key)
    const ib = entry.incomeBreakdown || {}
    const eb = entry.expenseBreakdown || {}

    INCOME_KEYS.forEach((k) => { g.income[k] += ib[k] || 0 })
    EXPENSE_KEYS.forEach((k) => { g.expenses[k] += eb[k] || 0 })
    g.totalIncome += entry.totalIncome || 0
    g.totalExpenses += entry.totalExpenses || 0
    g.cash = entry.cash
  })

  return [...groups.values()]
}

// Flatten for recharts (avoids nested dot-notation issues)
const flattenForChart = (rows) =>
  rows.map((row) => ({
    label: row.label,
    cash: row.cash,
    totalIncome: row.totalIncome,
    totalExpenses: row.totalExpenses,
    incomeSponsor: row.income.sponsor,
    incomeEvent: row.income.event,
    incomeMerchandise: row.income.merchandise,
    incomeThirdParty: row.income.thirdParty,
    incomeWebSubscription: row.income.webSubscription,
    expensesWrestlerPayroll: row.expenses.wrestlerPayroll,
    expensesStaffCost: row.expenses.staffCost,
    expensesEventCost: row.expenses.eventCost,
    expensesOperatingCost: row.expenses.operatingCost,
    expensesOtherCost: row.expenses.otherCost,
  }))

const formatAmt = (n) => `$${Math.round(n).toLocaleString()}`

// ─── Custom recharts tooltip ───────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.chartTooltip}>
      <p className={styles.chartTooltipLabel}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0', fontSize: '0.8rem' }}>
          {p.name}: {formatAmt(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────
function ManageFinancesModule() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview')
  const [period, setPeriod] = useState('daily')
  const ticketTypeOrder = ['regularWeekly', 'houseShow', 'digitalOnly', 'ppv', 'oneTime', 'megaLive']

  const startDateIso = useGameStore((s) => s.calendar.startDateIso)
  const cash = useGameStore((s) => s.finances.cash)
  const lastIncome = useGameStore((s) => s.finances.lastIncome)
  const lastExpenses = useGameStore((s) => s.finances.lastExpenses)
  const lastDelta = useGameStore((s) => s.finances.lastDelta)
  const ledger = useGameStore((s) => s.finances.ledger || [])
  const subscriptionFee = useGameStore((s) => s.finances.subscriptionFee ?? GAME_CONFIG.economy.webSubscription.defaultFee)
  const ticketFees = useGameStore((s) => s.finances.ticketFees || {})
  const fans = useGameStore((s) => s.stats.fans)
  const timeline = useGameStore((s) => s.history.timeline || [])
  const setSubscriptionFee = useGameStore((s) => s.setSubscriptionFee)
  const setEventTicketFee = useGameStore((s) => s.setEventTicketFee)

  const [feeInput, setFeeInput] = useState('')
  const [ticketFeeInputs, setTicketFeeInputs] = useState({})

  // Period-aware aggregation
  const aggregated = useMemo(
    () => aggregateTimeline(timeline, startDateIso, period),
    [timeline, startDateIso, period],
  )

  const chartData = useMemo(() => flattenForChart(aggregated), [aggregated])

  // Totals for selected period (table footers)
  const grandTotals = useMemo(() => {
    const inc = zeroIncome()
    const exp = zeroExpense()
    aggregated.forEach((g) => {
      INCOME_KEYS.forEach((k) => { inc[k] += g.income[k] })
      EXPENSE_KEYS.forEach((k) => { exp[k] += g.expenses[k] })
    })
    return { income: inc, expenses: exp }
  }, [aggregated])

  // All-time totals for overview (unaffected by period)
  const allTimeTotals = useMemo(() => {
    const inc = zeroIncome()
    const exp = zeroExpense()
    timeline.forEach((entry) => {
      if (entry.incomeBreakdown) {
        INCOME_KEYS.forEach((k) => { inc[k] += entry.incomeBreakdown[k] || 0 })
      }
      if (entry.expenseBreakdown) {
        EXPENSE_KEYS.forEach((k) => { exp[k] += entry.expenseBreakdown[k] || 0 })
      }
    })
    return { income: inc, expenses: exp }
  }, [timeline])

  // Pie data (from selected period aggregation)
  const incomePieData = useMemo(
    () => INCOME_KEYS.map((k) => ({ key: k, value: aggregated.reduce((s, g) => s + g.income[k], 0) })),
    [aggregated],
  )

  const expensePieData = useMemo(
    () => EXPENSE_KEYS.map((k) => ({ key: k, value: aggregated.reduce((s, g) => s + g.expenses[k], 0) })),
    [aggregated],
  )

  // Ledger category summaries
  const summaries = useMemo(() => {
    const totals = Object.fromEntries(Object.keys(categoryKeyMap).map((k) => [k, 0]))
    ledger.forEach((entry) => {
      if (totals[entry.category] !== undefined) totals[entry.category] += entry.amount
    })
    return totals
  }, [ledger])

  const recentEntries = ledger.slice(-10).reverse()

  const subscriberEstimate = useMemo(() => {
    const { minFee, maxFee, maxRate, minRate } = GAME_CONFIG.economy.webSubscription
    const norm = Math.max(0, Math.min(1, (subscriptionFee - minFee) / (maxFee - minFee)))
    const rate = maxRate - norm * (maxRate - minRate)
    return Math.round(fans * rate)
  }, [fans, subscriptionFee])

  const handleFeeApply = () => {
    const parsed = Number(feeInput)
    if (Number.isFinite(parsed) && parsed >= 0) {
      setSubscriptionFee(parsed)
      setFeeInput('')
    }
  }

  const handleTicketFeeChange = (eventType, value) => {
    setTicketFeeInputs((prev) => ({ ...prev, [eventType]: value }))
  }

  const handleTicketFeeApply = (eventType) => {
    const parsed = Number(ticketFeeInputs[eventType])
    if (!Number.isFinite(parsed) || parsed < 0) return
    setEventTicketFee(eventType, parsed)
    setTicketFeeInputs((prev) => ({ ...prev, [eventType]: '' }))
  }

  const tabs = ['overview', 'income', 'expenses', 'charts', 'settings', 'ledger']
  const showPeriod = ['income', 'expenses', 'charts'].includes(activeTab)
  const hasData = aggregated.length > 0

  return (
    <section className={styles.moduleBody}>
      {/* ── KPI grid ── */}
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

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`dashboard.finances.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* ── Period selector ── */}
      {showPeriod && (
        <div className={styles.periodBar}>
          {['daily', 'monthly', 'yearly'].map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
              onClick={() => setPeriod(p)}
            >
              {t(`dashboard.finances.period.${p}`)}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════ OVERVIEW TAB ══════════════════ */}
      {activeTab === 'overview' && (
        <>
          <div className={styles.breakdownGrid}>
            <div className={styles.breakdownCard}>
              <h5 className={styles.breakdownTitle}>{t('dashboard.finances.incomeTitle')}</h5>
              {INCOME_KEYS.map((k) => (
                <div key={k} className={styles.breakdownRow}>
                  <span className={styles.dot} style={{ background: INCOME_COLORS[k] }} />
                  <span>{t(`dashboard.finances.income.${k}`)}</span>
                  <span className={styles.breakdownAmt}>{formatAmt(allTimeTotals.income[k])}</span>
                </div>
              ))}
              <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                <span />
                <span>{t('dashboard.finances.total')}</span>
                <span className={`${styles.breakdownAmt} ${styles.positive}`}>
                  {formatAmt(INCOME_KEYS.reduce((s, k) => s + allTimeTotals.income[k], 0))}
                </span>
              </div>
            </div>

            <div className={styles.breakdownCard}>
              <h5 className={styles.breakdownTitle}>{t('dashboard.finances.expensesTitle')}</h5>
              {EXPENSE_KEYS.map((k) => (
                <div key={k} className={styles.breakdownRow}>
                  <span className={styles.dot} style={{ background: EXPENSE_COLORS[k] }} />
                  <span>{t(`dashboard.finances.expenses.${k}`)}</span>
                  <span className={styles.breakdownAmt}>{formatAmt(allTimeTotals.expenses[k])}</span>
                </div>
              ))}
              <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                <span />
                <span>{t('dashboard.finances.total')}</span>
                <span className={`${styles.breakdownAmt} ${styles.negative}`}>
                  {formatAmt(EXPENSE_KEYS.reduce((s, k) => s + allTimeTotals.expenses[k], 0))}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.summaryGrid}>
            {Object.entries(summaries).map(([category, amount]) => (
              <article key={category}>
                <p>{t(`dashboard.finances.categories.${categoryKeyMap[category]}`)}</p>
                <h5>$ {amount.toLocaleString()}</h5>
              </article>
            ))}
          </div>
        </>
      )}

      {/* ══════════════════ INCOME TAB ══════════════════ */}
      {activeTab === 'income' && (
        <div className={styles.breakdownTableWrap}>
          {!hasData ? (
            <p className={styles.emptyState}>{t('dashboard.finances.noData')}</p>
          ) : (
            <table className={styles.breakdownTable}>
              <thead>
                <tr>
                  <th>{t('dashboard.finances.tableColPeriod')}</th>
                  {INCOME_KEYS.map((k) => (
                    <th key={k} style={{ color: INCOME_COLORS[k] }}>
                      {t(`dashboard.finances.income.${k}`)}
                    </th>
                  ))}
                  <th>{t('dashboard.finances.total')}</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {INCOME_KEYS.map((k) => (
                      <td key={k}>{formatAmt(row.income[k])}</td>
                    ))}
                    <td className={styles.positive}>{formatAmt(row.totalIncome)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('dashboard.finances.total')}</td>
                  {INCOME_KEYS.map((k) => (
                    <td key={k}>{formatAmt(grandTotals.income[k])}</td>
                  ))}
                  <td className={styles.positive}>
                    {formatAmt(INCOME_KEYS.reduce((s, k) => s + grandTotals.income[k], 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ══════════════════ EXPENSES TAB ══════════════════ */}
      {activeTab === 'expenses' && (
        <div className={styles.breakdownTableWrap}>
          {!hasData ? (
            <p className={styles.emptyState}>{t('dashboard.finances.noData')}</p>
          ) : (
            <table className={styles.breakdownTable}>
              <thead>
                <tr>
                  <th>{t('dashboard.finances.tableColPeriod')}</th>
                  {EXPENSE_KEYS.map((k) => (
                    <th key={k} style={{ color: EXPENSE_COLORS[k] }}>
                      {t(`dashboard.finances.expenses.${k}`)}
                    </th>
                  ))}
                  <th>{t('dashboard.finances.total')}</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {EXPENSE_KEYS.map((k) => (
                      <td key={k}>{formatAmt(row.expenses[k])}</td>
                    ))}
                    <td className={styles.negative}>{formatAmt(row.totalExpenses)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('dashboard.finances.total')}</td>
                  {EXPENSE_KEYS.map((k) => (
                    <td key={k}>{formatAmt(grandTotals.expenses[k])}</td>
                  ))}
                  <td className={styles.negative}>
                    {formatAmt(EXPENSE_KEYS.reduce((s, k) => s + grandTotals.expenses[k], 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ══════════════════ CHARTS TAB ══════════════════ */}
      {activeTab === 'charts' && (
        <>
          {!hasData ? (
            <p className={styles.emptyState}>{t('dashboard.finances.noData')}</p>
          ) : (
            <div className={styles.chartsGrid}>
              {/* Cash balance trend */}
              <div className={styles.chartCard}>
                <h5 className={styles.chartCardTitle}>{t('dashboard.finances.charts.cashTrend')}</h5>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7eb3ff" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#7eb3ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="cash" name="Cash" stroke="#7eb3ff" fill="url(#cashGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Income vs Expenses */}
              <div className={styles.chartCard}>
                <h5 className={styles.chartCardTitle}>{t('dashboard.finances.charts.incomeVsExpenses')}</h5>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                    <Bar dataKey="totalIncome" name="Income" fill="#72e0b3" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="totalExpenses" name="Expenses" fill="#ff9b9b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Income breakdown stacked */}
              <div className={styles.chartCard}>
                <h5 className={styles.chartCardTitle}>{t('dashboard.finances.charts.incomeBreakdown')}</h5>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                    <Bar dataKey="incomeSponsor" name={t('dashboard.finances.income.sponsor')} stackId="i" fill={INCOME_COLORS.sponsor} />
                    <Bar dataKey="incomeEvent" name={t('dashboard.finances.income.event')} stackId="i" fill={INCOME_COLORS.event} />
                    <Bar dataKey="incomeMerchandise" name={t('dashboard.finances.income.merchandise')} stackId="i" fill={INCOME_COLORS.merchandise} />
                    <Bar dataKey="incomeThirdParty" name={t('dashboard.finances.income.thirdParty')} stackId="i" fill={INCOME_COLORS.thirdParty} />
                    <Bar dataKey="incomeWebSubscription" name={t('dashboard.finances.income.webSubscription')} stackId="i" fill={INCOME_COLORS.webSubscription} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Expense breakdown stacked */}
              <div className={styles.chartCard}>
                <h5 className={styles.chartCardTitle}>{t('dashboard.finances.charts.expenseBreakdown')}</h5>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                    <Bar dataKey="expensesWrestlerPayroll" name={t('dashboard.finances.expenses.wrestlerPayroll')} stackId="e" fill={EXPENSE_COLORS.wrestlerPayroll} />
                    <Bar dataKey="expensesStaffCost" name={t('dashboard.finances.expenses.staffCost')} stackId="e" fill={EXPENSE_COLORS.staffCost} />
                    <Bar dataKey="expensesEventCost" name={t('dashboard.finances.expenses.eventCost')} stackId="e" fill={EXPENSE_COLORS.eventCost} />
                    <Bar dataKey="expensesOperatingCost" name={t('dashboard.finances.expenses.operatingCost')} stackId="e" fill={EXPENSE_COLORS.operatingCost} />
                    <Bar dataKey="expensesOtherCost" name={t('dashboard.finances.expenses.otherCost')} stackId="e" fill={EXPENSE_COLORS.otherCost} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Income distribution pie */}
              <div className={styles.chartCard}>
                <h5 className={styles.chartCardTitle}>{t('dashboard.finances.charts.incomePie')}</h5>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={incomePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="key">
                      {incomePieData.map((entry) => (
                        <Cell key={entry.key} fill={INCOME_COLORS[entry.key] || '#888'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [formatAmt(v), t(`dashboard.finances.income.${name}`)]} />
                    <Legend
                      formatter={(value) => t(`dashboard.finances.income.${value}`)}
                      wrapperStyle={{ fontSize: 11, color: '#888' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Expense distribution pie */}
              <div className={styles.chartCard}>
                <h5 className={styles.chartCardTitle}>{t('dashboard.finances.charts.expensePie')}</h5>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={expensePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="key">
                      {expensePieData.map((entry) => (
                        <Cell key={entry.key} fill={EXPENSE_COLORS[entry.key] || '#888'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [formatAmt(v), t(`dashboard.finances.expenses.${name}`)]} />
                    <Legend
                      formatter={(value) => t(`dashboard.finances.expenses.${value}`)}
                      wrapperStyle={{ fontSize: 11, color: '#888' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════ SETTINGS TAB ══════════════════ */}
      {activeTab === 'settings' && (
        <>
          <div className={styles.subscriptionPanel}>
            <div className={styles.subscriptionInfo}>
              <p>{t('dashboard.finances.subscriptionFeeLabel')}</p>
              <h4>$ {subscriptionFee.toFixed(2)}</h4>
              <small>{t('dashboard.finances.subscriberEstimate', { count: subscriberEstimate.toLocaleString() })}</small>
            </div>
            <div className={styles.subscriptionEdit}>
              <input
                className={styles.feeInput}
                type="number"
                min="0"
                step="0.01"
                placeholder={String(subscriptionFee.toFixed(2))}
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
              />
              <button className={styles.feeApplyBtn} type="button" onClick={handleFeeApply}>
                {t('dashboard.finances.setFee')}
              </button>
            </div>
          </div>

          <div className={styles.ticketFeePanel}>
            <div className={styles.subscriptionInfo}>
              <p>{t('dashboard.finances.ticketFeeTitle')}</p>
              <small>{t('dashboard.finances.ticketFeeSubtitle')}</small>
            </div>
            <div className={styles.ticketFeeList}>
              {ticketTypeOrder.map((eventType) => {
                const currentFee = Number(ticketFees[eventType]) || GAME_CONFIG.economy.audience.byEventType[eventType].ticketPrice
                return (
                  <div key={eventType} className={styles.ticketFeeRow}>
                    <div>
                      <p>{t(`dashboard.finances.eventTypes.${eventType}`)}</p>
                      <small>$ {currentFee.toLocaleString()}</small>
                    </div>
                    <div className={styles.subscriptionEdit}>
                      <input
                        className={styles.feeInput}
                        type="number"
                        min="0"
                        step="1"
                        placeholder={String(currentFee)}
                        value={ticketFeeInputs[eventType] || ''}
                        onChange={(e) => handleTicketFeeChange(eventType, e.target.value)}
                      />
                      <button
                        className={styles.feeApplyBtn}
                        type="button"
                        onClick={() => handleTicketFeeApply(eventType)}
                      >
                        {t('dashboard.finances.setFee')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ LEDGER TAB ══════════════════ */}
      {activeTab === 'ledger' && (
        <>
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
        </>
      )}
    </section>
  )
}

export default ManageFinancesModule

