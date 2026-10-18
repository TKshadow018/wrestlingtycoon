import { useTranslation } from 'react-i18next'
import { getGameDateFromDay } from '../../utils/gameCalendar'
import styles from './HudBar.module.scss'

const formatDate = (day, startDateIso, t) => {
  const gameDate = getGameDateFromDay(startDateIso, Math.max(1, Number(day) || 1))
  const weekDayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

  return {
    dayName: t(`dashboard.calendar.weekdays.${weekDayKeys[(gameDate.getDay() + 6) % 7]}`),
    day: gameDate.getDate(),
    month: t(`dashboard.calendar.months.${monthKeys[gameDate.getMonth()]}`),
    year: gameDate.getFullYear(),
  }
}

function HudBar({ snapshot }) {
  const { t } = useTranslation()
  const dateInfo = formatDate(snapshot.day, snapshot.startDateIso, t)
  const competitorPressure = snapshot.competitorPressure || null

  return (
    <section className={styles.hudBar}>
      <article>
        <h3>{t('dashboard.hud.date')}</h3>
        <p className={styles.dateDisplay}>{dateInfo.dayName}, {dateInfo.month} {dateInfo.day}, {dateInfo.year}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.schedule')}</h3>
        <p>
          {snapshot.boardMeetingToday
            ? t('dashboard.hud.boardMeeting')
            : snapshot.isEventDay
              ? t('dashboard.hud.eventDay')
              : t('dashboard.hud.nonEventDay')}
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
      <article>
        <h3>{t('dashboard.hud.owner')}</h3>
        <p>{snapshot.ownerName || t('dashboard.managementUnknown')}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.manager')}</h3>
        <p>{snapshot.generalManagerName || t('dashboard.managementUnknown')}</p>
      </article>
      {competitorPressure ? (
        <article>
          <h3>{t('dashboard.hud.competitorPressure')}</h3>
          <p>
            {competitorPressure.fanImpact >= 0 ? '+' : ''}
            {Number(competitorPressure.fanImpact || 0).toLocaleString()} {t('dashboard.hud.fans')}
          </p>
        </article>
      ) : null}
    </section>
  )
}

export default HudBar
