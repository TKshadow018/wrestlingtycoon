import { useTranslation } from 'react-i18next'
import { getGameDateFromDay } from '../../utils/gameCalendar'
import styles from './HudBar.module.scss'

const formatDate = (day, startDateIso) => {
  const gameDate = getGameDateFromDay(startDateIso, Math.max(1, Number(day) || 1))
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
  const competitorPressure = snapshot.competitorPressure || null

  return (
    <section className={styles.hudBar}>
      <article>
        <h3>{t('dashboard.hud.date', 'Date')}</h3>
        <p className={styles.dateDisplay}>{dateInfo.dayName}, {dateInfo.month} {dateInfo.day}, {dateInfo.year}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.schedule', 'Schedule')}</h3>
        <p>
          {snapshot.boardMeetingToday
            ? t('dashboard.hud.boardMeeting', 'Board Meeting')
            : snapshot.isEventDay
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
      <article>
        <h3>{t('dashboard.hud.owner', 'Owner')}</h3>
        <p>{snapshot.ownerName || t('dashboard.managementUnknown', 'TBD')}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.manager', 'General Manager')}</h3>
        <p>{snapshot.generalManagerName || t('dashboard.managementUnknown', 'TBD')}</p>
      </article>
      <article>
        <h3>{t('dashboard.hud.country', 'Home Country')}</h3>
        <p>{t(`onboarding.countryOptions.${snapshot.homeCountry || 'UnitedStates'}`, snapshot.homeCountry || 'UnitedStates')}</p>
      </article>
      {competitorPressure ? (
        <article>
          <h3>{t('dashboard.hud.competitorPressure', 'Competitor Pressure')}</h3>
          <p>
            {competitorPressure.fanImpact >= 0 ? '+' : ''}
            {Number(competitorPressure.fanImpact || 0).toLocaleString()} {t('dashboard.hud.fans', 'Fans')}
          </p>
        </article>
      ) : null}
    </section>
  )
}

export default HudBar
