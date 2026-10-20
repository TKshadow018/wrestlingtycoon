import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEventTypeKey, isRegularWeeklyEvent } from '../../utils/eventDisplay'
import styles from './EventBannerScreen.module.scss'

const FEMALE_FALLBACK = '/people/girl.png'
const MALE_FALLBACK = '/people/boy.png'

const getFallbackImage = (gender) => (gender === 'female' ? FEMALE_FALLBACK : MALE_FALLBACK)

const parseIsoDateLocal = (isoDateString) => {
  if (!isoDateString) return null
  const [y, m, d] = isoDateString.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const formatGameDate = (startDateIso, day) => {
  const base = parseIsoDateLocal(startDateIso) || new Date()
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  date.setDate(date.getDate() + Math.max(0, Number(day || 1) - 1))
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

const EVENT_TYPE_KEYS = {
  ppv: 'dashboard.eventTypes.ppv',
  megaLive: 'dashboard.eventTypes.megaLive',
  oneTime: 'dashboard.eventTypes.oneTime',
  regularWeekly: 'dashboard.eventTypes.regularWeekly',
  houseShow: 'dashboard.eventTypes.houseShow',
  digitalOnly: 'dashboard.eventTypes.digitalOnly',
}

function ChampCard({ title, employees }) {
  const holderIds =
    title.division === 'doubles'
      ? Array.from(
          new Set([
            ...(Array.isArray(title.holderEmployeeIds) ? title.holderEmployeeIds : []),
            ...(title.holderEmployeeId ? [title.holderEmployeeId] : []),
          ].filter(Boolean)),
        ).slice(0, 2)
      : title.holderEmployeeId
      ? [title.holderEmployeeId]
      : []

  const holders = holderIds
    .map((id) => employees.find((e) => e.employeeId === id) || null)
    .filter(Boolean)

  if (holders.length === 0) return null

  return (
    <div className={styles.champCard}>
      {title.image && (
        <img className={styles.beltImg} src={title.image} alt={title.name} />
      )}
      <div className={styles.champInfo}>
        <span className={styles.beltName}>{title.name}</span>
        <div className={styles.holderRow}>
          {holders.map((holder) => (
            <div key={holder.employeeId} className={styles.holderChip}>
              <img
                className={styles.holderAvatar}
                src={holder.imageUrl || getFallbackImage(holder.gender)}
                alt={holder.name}
                onError={(e) => {
                  if (!e.currentTarget.dataset.fb) {
                    e.currentTarget.dataset.fb = '1'
                    e.currentTarget.src = getFallbackImage(holder.gender)
                  }
                }}
              />
              <span className={styles.holderName}>{holder.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EventBannerScreen({ event, day, startDateIso, sponsors, titles, employees, onSetup }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const eventType = getEventTypeKey(event)
  const eventTypeLabel = t(EVENT_TYPE_KEYS[eventType] || 'dashboard.eventTypes.unknown')
  const eventName = isRegularWeeklyEvent(event)
    ? eventTypeLabel
    : event?.name || (eventType ? eventTypeLabel : t('dashboard.eventBanner.tonightEvent'))
  const gameDate = formatGameDate(startDateIso, day)
  const activeSponsors = Array.isArray(sponsors) ? sponsors.filter(Boolean) : []
  const activeTitlesWithHolders = Array.isArray(titles)
    ? titles.filter(
        (t) =>
          t.isActive !== false &&
          (t.holderEmployeeId || (Array.isArray(t.holderEmployeeIds) && t.holderEmployeeIds.length > 0)),
      )
    : []

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`}>
      <div className={styles.scanlines} aria-hidden="true" />

      <div className={styles.content}>
        {/* Event type badge */}
        <div className={`${styles.typeBadge} ${visible ? styles.animate1 : ''}`}>
          {eventTypeLabel}
        </div>

        {/* Event name */}
        <h1 className={`${styles.eventName} ${visible ? styles.animate2 : ''}`}>
          {eventName}
        </h1>

        {/* Date */}
        <p className={`${styles.eventDate} ${visible ? styles.animate3 : ''}`}>
          {gameDate}
        </p>

        <div className={`${styles.divider} ${visible ? styles.animate3 : ''}`} />

        {/* Champions */}
        {activeTitlesWithHolders.length > 0 && (
          <div className={`${styles.champsSection} ${visible ? styles.animate4 : ''}`}>
            <p className={styles.sectionLabel}>{t('dashboard.eventBanner.currentChampions')}</p>
            <div className={styles.champsGrid}>
              {activeTitlesWithHolders.map((title) => (
                <ChampCard key={title.titleId} title={title} employees={employees} />
              ))}
            </div>
          </div>
        )}

        {/* Sponsors */}
        {activeSponsors.length > 0 && (
          <div className={`${styles.sponsorsSection} ${visible ? styles.animate5 : ''}`}>
            <p className={styles.sectionLabel}>{t('dashboard.eventBanner.eventSponsors')}</p>
            <div className={styles.sponsorChips}>
              {activeSponsors.map((sponsor, i) => (
                <span key={sponsor.sponsorId || sponsor.id || i} className={styles.sponsorChip}>
                  {sponsor.name || sponsor.company_name || t('dashboard.eventBanner.sponsorFallback')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className={`${styles.ctaRow} ${visible ? styles.animate6 : ''}`}>
            <button type="button" className={styles.setupBtn} onClick={onSetup}>
            {t('dashboard.eventBanner.setupEvent')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EventBannerScreen
