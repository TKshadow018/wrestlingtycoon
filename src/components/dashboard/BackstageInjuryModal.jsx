import { useTranslation } from 'react-i18next'
import styles from './BackstageInjuryModal.module.scss'

export default function BackstageInjuryModal({ injury, onDismiss }) {
  const { t } = useTranslation()
  if (!injury) return null

  const reason = t(`dashboard.backstageInjury.reasons.${injury.reasonId}`)
  const duration = Math.max(0, injury.returnDay - injury.occurredDay)

  return (
    <div className={styles.overlay}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backstage-injury-title"
      >
        <p className={styles.eyebrow}>{t('dashboard.backstageInjury.eyebrow')}</p>
        <h2 id="backstage-injury-title">{t('dashboard.backstageInjury.title')}</h2>
        <p className={styles.description}>
          {t('dashboard.backstageInjury.description', {
            name: injury.employeeName,
            reason,
          })}
        </p>
        <p className={styles.recovery}>
          {t('dashboard.backstageInjury.recovery', {
            count: duration,
            day: injury.returnDay,
          })}
        </p>
        <button type="button" onClick={onDismiss}>
          {t('dashboard.backstageInjury.acknowledge')}
        </button>
      </section>
    </div>
  )
}
