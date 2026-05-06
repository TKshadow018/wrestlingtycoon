import { useTranslation } from 'react-i18next'
import styles from './HudBar.module.scss'

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

const formatDate = (day, startDateIso) => {
  const startDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  return {
    dayName: weekDays[(gameDate.getDay() + 6) % 7],
    day: gameDate.getDate(),
    month: monthNames[gameDate.getMonth()],
    year: gameDate.getFullYear(),
  }
}

function HudBar({ snapshot }) {
  const { t } = useTranslation()
  const dateInfo = formatDate(snapshot.day, snapshot.startDateIso)

  return (
    <section className={styles.hudBar}>
      <article>
        <h3>{t('dashboard.hud.date', 'Date')}</h3>
        <p className={styles.dateDisplay}>{dateInfo.dayName}, {dateInfo.month} {dateInfo.day}, {dateInfo.year}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.schedule', 'Schedule')}</h3>
        <p>
          {snapshot.isEventDay
            ? t('dashboard.hud.eventDay', 'Event Day')
            : t('dashboard.hud.nonEventDay', 'No Event Today')}
        </p>
      </article>
      <article>
        <h3>{t('dashboard.hud.cash')}</h3>
        <p>$ {snapshot.cash.toLocaleString()}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.fans')}</h3>
        <p>{snapshot.fans.toLocaleString()}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.prestige')}</h3>
        <p>{snapshot.prestige}</p>
      </article>
    </section>
  )
}

export default HudBar
