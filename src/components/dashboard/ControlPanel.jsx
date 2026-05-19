import { useTranslation } from 'react-i18next'
import styles from './ControlPanel.module.scss'

function ControlPanel({ isEventDay, isPreparationDay, onProceed, onReset, proceedLabelOverride = '' }) {
  const { t } = useTranslation()

  const handleReset = () => {
    const shouldReset = window.confirm(t('dashboard.controls.resetConfirm'))
    if (!shouldReset) {
      return
    }

    onReset()
  }

  const proceedLabel = proceedLabelOverride || (isPreparationDay
    ? t('dashboard.controls.eventPreparation')
    : isEventDay
    ? t('dashboard.controls.proceedEvent')
    : t('dashboard.controls.proceedDay'))

  return (
    <section className={styles.controlPanel}>
      <button type="button" className={styles.primaryButton} onClick={onProceed}>
        {proceedLabel}
      </button>
      <button type="button" className={styles.resetButton} onClick={handleReset}>
        {t('dashboard.controls.resetGame')}
      </button>
      <p className={styles.saveHint}>{t('dashboard.saveStatus')}</p>
    </section>
  )
}

export default ControlPanel
