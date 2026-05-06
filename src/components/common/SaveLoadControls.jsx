import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './SaveLoadControls.module.scss'

function SaveLoadControls({
  onSaveLocal,
  onLoadLocal,
  onSaveFirebase,
  onLoadFirebase,
  statusMessage = '',
  firebaseEnabled = true,
}) {
  const { t } = useTranslation()
  const [target, setTarget] = useState('local')
  const [slot, setSlot] = useState('default')

  const handleSave = async () => {
    if (target === 'firebase') {
      if (!firebaseEnabled) {
        return
      }

      await onSaveFirebase?.(slot.trim() || 'default')
      return
    }

    onSaveLocal?.()
  }

  const handleLoad = async () => {
    if (target === 'firebase') {
      if (!firebaseEnabled) {
        return
      }

      await onLoadFirebase?.(slot.trim() || 'default')
      return
    }

    onLoadLocal?.()
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.controlsRow}>
        <label className={styles.targetLabel}>
          <span>{t('dashboard.saveLoad.target')}</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="local">{t('dashboard.saveLoad.local')}</option>
            <option value="firebase" disabled={!firebaseEnabled}>
              {t('dashboard.saveLoad.firebase')}
            </option>
          </select>
        </label>

        {target === 'firebase' && (
          <label className={styles.slotLabel}>
            <span>{t('dashboard.saveLoad.slot')}</span>
            <input
              type="text"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              placeholder={t('dashboard.saveLoad.slotPlaceholder')}
            />
          </label>
        )}

        <button type="button" className={styles.actionButton} onClick={handleSave}>
          {t('dashboard.saveLoad.save')}
        </button>
        <button type="button" className={styles.actionButton} onClick={handleLoad}>
          {t('dashboard.saveLoad.load')}
        </button>
      </div>

      {statusMessage ? <p className={styles.status}>{statusMessage}</p> : null}
    </div>
  )
}

export default SaveLoadControls
