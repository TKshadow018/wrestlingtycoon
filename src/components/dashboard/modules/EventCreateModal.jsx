import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './EventCreateModal.module.scss'

const EVENT_TYPES = [
   { value: 'houseShow', labelKey: 'dashboard.eventTypes.houseShow' },
   { value: 'ppv', labelKey: 'dashboard.eventTypes.ppv' },
   { value: 'megaLive', labelKey: 'dashboard.eventTypes.megaLive' },
   { value: 'oneTime', labelKey: 'dashboard.eventTypes.oneTime' },
   { value: 'digitalOnly', labelKey: 'dashboard.eventTypes.digitalOnly' },
]

function EventCreateModal({ isOpen, eventToEdit, initialSpecificDate, currentWeek, currentDay, startDateIso, onClose, onSubmit, onDelete }) {
  const { t } = useTranslation()
  const specificDateInputRef = useRef(null)
  const [formState, setFormState] = useState({
    type: 'houseShow',
    name: '',
    specificDate: '',
    isRecurringAnnually: false,
  })
  const [errorMessage, setErrorMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (eventToEdit) {
      setFormState({
        type: eventToEdit.type,
        name: eventToEdit.name,
        specificDate: eventToEdit.specificDate || '',
        isRecurringAnnually: eventToEdit.isRecurringAnnually || false,
      })
    } else {
      resetForm(initialSpecificDate)
    }
    setErrorMessage('')
    setShowDeleteConfirm(false)
  }, [isOpen, eventToEdit, initialSpecificDate])

  const resetForm = (specificDate = '') => {
    setFormState({
      type: 'houseShow',
      name: '',
      specificDate: specificDate || getDefaultDate(),
      isRecurringAnnually: false,
    })
    setErrorMessage('')
    setShowDeleteConfirm(false)
  }

  const getDefaultDate = () => {
    const parseIso = (iso) => {
      if (!iso) return null
      const [y, m, d] = iso.split('-').map(Number)
      if (!y || !m || !d) return null
      return new Date(y, m - 1, d)
    }
    const base = parseIso(startDateIso)
    const gameDate = base ? new Date(base.getFullYear(), base.getMonth(), base.getDate()) : new Date()
    gameDate.setDate(gameDate.getDate() + Math.max(0, Number(currentDay || 1) - 1))
    const year = gameDate.getFullYear()
    const month = String(gameDate.getMonth() + 1).padStart(2, '0')
    const day = String(gameDate.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleTypeChange = (typeValue) => {
    setFormState((current) => ({
      ...current,
      type: typeValue,
      name: current.name || t(`dashboard.eventTypes.${typeValue}`),
    }))
  }

  const openNativeDatePicker = () => {
    const input = specificDateInputRef.current
    if (!input) {
      return
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }

    input.focus()
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!formState.name.trim()) {
      setErrorMessage(t('dashboard.events.validation.eventNameRequired'))
      return
    }

    if (!formState.specificDate) {
      setErrorMessage(t('dashboard.events.validation.dateRequired'))
      return
    }

    const payload = {
      ...formState,
      name: formState.name.trim(),
    }

    const result = onSubmit(payload)

    if (!result?.ok) {
      const errorKey = typeof result?.error === 'string'
        && result.error.startsWith('dashboard.events.validation.')
        ? result.error
        : 'dashboard.events.validation.unableToSave'
      setErrorMessage(t(errorKey))
      return
    }

    resetForm()
    onClose()
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (!eventToEdit?.eventId) {
      return
    }

    onDelete?.(eventToEdit.eventId)
  }

  if (!isOpen) return null

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{eventToEdit ? t('dashboard.events.editEvent') : t('dashboard.events.createEvent')}</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label={t('dashboard.accessibility.closeModal')}>×</button>
        </div>

        <form className={styles.modalBody} onSubmit={handleSubmit}>
          <label className={styles.formGroup}>
            <span className={styles.label}>{t('dashboard.events.eventType')}</span>
            <select value={formState.type} onChange={(e) => handleTypeChange(e.target.value)}>
              {EVENT_TYPES.map((typeOption) => (
                <option key={typeOption.value} value={typeOption.value}>
                  {t(typeOption.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.formGroup}>
            <span className={styles.label}>{t('dashboard.events.eventName')}</span>
            <input
              type="text"
              value={formState.name}
              onChange={(e) => setFormState((current) => ({ ...current, name: e.target.value }))}
              maxLength={70}
              placeholder={t('dashboard.events.eventNamePlaceholder')}
            />
          </label>

          <label className={styles.formGroup}>
            <span className={styles.label}>{t('dashboard.events.specificDate')}</span>
            <div className={styles.dateInputRow}>
              <input
                ref={specificDateInputRef}
                type="date"
                value={formState.specificDate}
                onChange={(e) => setFormState((current) => ({ ...current, specificDate: e.target.value }))}
              />
              <button type="button" className={styles.datePickerButton} onClick={openNativeDatePicker}>
                {t('dashboard.events.pickDate')}
              </button>
            </div>
          </label>

          <label className={styles.checkboxGroup}>
            <input
              type="checkbox"
              checked={formState.isRecurringAnnually}
              onChange={(e) => setFormState((current) => ({ ...current, isRecurringAnnually: e.target.checked }))}
            />
            <span>{t('dashboard.events.recurringAnnually')}</span>
          </label>

          {errorMessage && <p className={styles.error}>{errorMessage}</p>}

          <div className={styles.modalFooter}>
            {eventToEdit ? (
              showDeleteConfirm ? (
                <>
                  <button type="button" className={styles.confirmDeleteButton} onClick={handleConfirmDelete}>
                    {t('dashboard.events.confirmDelete')}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShowDeleteConfirm(false)}>
                    {t('dashboard.events.keepEvent')}
                  </button>
                </>
              ) : (
                <button type="button" className={styles.dangerButton} onClick={handleDeleteClick}>
                  {t('dashboard.events.deleteEvent')}
                </button>
              )
            ) : null}
            <button type="button" className={styles.secondaryButton} onClick={() => { resetForm(); onClose(); }}>
              {t('dashboard.events.cancel')}
            </button>
            <button type="submit" className={styles.primaryButton}>
              {eventToEdit ? t('dashboard.events.updateEvent') : t('dashboard.events.createEvent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EventCreateModal
