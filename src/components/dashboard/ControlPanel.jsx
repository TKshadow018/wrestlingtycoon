import { useTranslation } from 'react-i18next'
import styles from './ControlPanel.module.scss'

function ControlPanel({ isEventDay, onProceed, onReset }) {
  const { t } = useTranslation()

  const handleReset = () => {
    const shouldReset = window.confirm(t('dashboard.controls.resetConfirm'))
    if (!shouldReset) {
      return
    }

    onReset()
  }

  return (
    <section className={styles.controlPanel}>
      <button type="button" className={styles.primaryButton} onClick={onProceed}>
        {isEventDay ? t('dashboard.controls.proceedEvent') : t('dashboard.controls.proceedDay')}
      </button>
      <button type="button" className={styles.resetButton} onClick={handleReset}>
        {t('dashboard.controls.resetGame')}
      </button>
      <p className={styles.saveHint}>{t('dashboard.saveStatus')}</p>
    </section>
  )
}

export default ControlPanel
