import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './EventRequirementsOverlay.module.scss'

export const EVENT_REQUIREMENTS = {
  wrestlers: { min: 12, roleKey: 'wrestler' },
  staff:     { min: 1,  roleKey: 'staff' },
  referees:  { min: 1,  roleKey: 'referee' },
  announcers:{ min: 1,  roleKey: 'announcer' },
}

export function checkEventRequirements(employees = []) {
  const counts = {
    wrestlers:  employees.filter((e) => e.role === 'wrestler').length,
    staff:      employees.filter((e) => e.role === 'staff').length,
    referees:   employees.filter((e) => e.role === 'referee').length,
    announcers: employees.filter((e) => e.role === 'announcer').length,
  }
  const failures = Object.entries(EVENT_REQUIREMENTS).filter(
    ([key, req]) => counts[key] < req.min,
  )
  return { counts, failures, allMet: failures.length === 0 }
}

function RequirementRow({ labelKey, current, required, met }) {
  const { t } = useTranslation()
  return (
    <div className={`${styles.reqRow} ${met ? styles.reqMet : styles.reqFail}`}>
      <span className={styles.reqIcon}>{met ? '✓' : '✗'}</span>
      <span className={styles.reqLabel}>{t(labelKey)}</span>
      <span className={styles.reqCount}>
        {current} / {required}
      </span>
    </div>
  )
}

function EventRequirementsOverlay({ employees = [], onGoBack, onSkip }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const { counts, failures } = checkEventRequirements(employees)

  const requirements = [
    {
      key: 'wrestlers',
      labelKey: 'dashboard.eventRequirements.labelWrestlers',
      current: counts.wrestlers,
      required: EVENT_REQUIREMENTS.wrestlers.min,
    },
    {
      key: 'staff',
      labelKey: 'dashboard.eventRequirements.labelStaff',
      current: counts.staff,
      required: EVENT_REQUIREMENTS.staff.min,
    },
    {
      key: 'referees',
      labelKey: 'dashboard.eventRequirements.labelReferees',
      current: counts.referees,
      required: EVENT_REQUIREMENTS.referees.min,
    },
    {
      key: 'announcers',
      labelKey: 'dashboard.eventRequirements.labelAnnouncers',
      current: counts.announcers,
      required: EVENT_REQUIREMENTS.announcers.min,
    },
  ]

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`}>
      <div className={styles.scanlines} aria-hidden="true" />

      <div className={styles.content}>
        <div className={`${styles.warningBadge} ${visible ? styles.animate1 : ''}`}>
          {t('dashboard.eventRequirements.badge')}
        </div>

        <h2 className={`${styles.title} ${visible ? styles.animate2 : ''}`}>
          {t('dashboard.eventRequirements.title')}
        </h2>

        <p className={`${styles.subtitle} ${visible ? styles.animate3 : ''}`}>
          {t('dashboard.eventRequirements.subtitle', { count: failures.length })}
        </p>

        <div className={`${styles.divider} ${visible ? styles.animate3 : ''}`} />

        <div className={`${styles.requirementsList} ${visible ? styles.animate4 : ''}`}>
          <p className={styles.sectionLabel}>{t('dashboard.eventRequirements.requirementsLabel')}</p>
          {requirements.map((req) => (
            <RequirementRow
              key={req.key}
              labelKey={req.labelKey}
              current={req.current}
              required={req.required}
              met={req.current >= req.required}
            />
          ))}
        </div>

        <p className={`${styles.skipWarning} ${visible ? styles.animate5 : ''}`}>
          {t('dashboard.eventRequirements.skipWarning')}
        </p>

        <div className={`${styles.ctaRow} ${visible ? styles.animate6 : ''}`}>
          <button type="button" className={styles.backBtn} onClick={onGoBack}>
            {t('dashboard.eventRequirements.goBack')}
          </button>
          <button type="button" className={styles.skipBtn} onClick={onSkip}>
            {t('dashboard.eventRequirements.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EventRequirementsOverlay
