import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './InterviewFocusModal.module.scss'

const sortWrestlers = (wrestlers) => [...(wrestlers || [])].sort((left, right) => (
  (Number(right.popularity) || 0) - (Number(left.popularity) || 0)
  || left.name.localeCompare(right.name)
))

function InterviewFocusModal({ isOpen, wrestlers = [], onStart, onCancel }) {
  const { t } = useTranslation()
  const sortedWrestlers = sortWrestlers(wrestlers)
  const [featuredWrestlerId, setFeaturedWrestlerId] = useState(
    sortedWrestlers[0]?.employeeId || '',
  )
  const [rivalWrestlerId, setRivalWrestlerId] = useState(
    sortedWrestlers[1]?.employeeId || '',
  )

  if (!isOpen) {
    return null
  }

  const rivalCandidates = sortedWrestlers.filter(
    (wrestler) => wrestler.employeeId !== featuredWrestlerId,
  )
  const selectedFeatured = sortedWrestlers.find(
    (wrestler) => wrestler.employeeId === featuredWrestlerId,
  )
  const selectedRival = rivalCandidates.find(
    (wrestler) => wrestler.employeeId === rivalWrestlerId,
  )

  const handleFeaturedChange = (event) => {
    const nextFeaturedId = event.target.value
    setFeaturedWrestlerId(nextFeaturedId)
    if (nextFeaturedId === rivalWrestlerId) {
      setRivalWrestlerId(sortedWrestlers.find(
        (wrestler) => wrestler.employeeId !== nextFeaturedId,
      )?.employeeId || '')
    }
  }

  const handleStart = (event) => {
    event.preventDefault()
    onStart?.({
      featuredWrestlerId: selectedFeatured?.employeeId || null,
      featuredWrestlerName: selectedFeatured?.name || '',
      rivalWrestlerId: selectedRival?.employeeId || null,
      rivalWrestlerName: selectedRival?.name || '',
    })
  }

  return (
    <section className={styles.backdrop}>
      <form className={styles.modal} onSubmit={handleStart} role="dialog" aria-modal="true">
        <p className={styles.eyebrow}>{t('dashboard.ai.interviewTitle')}</p>
        <h2>{t('dashboard.ai.interviewFocusTitle')}</h2>
        <p className={styles.description}>{t('dashboard.ai.interviewFocusDescription')}</p>

        <label className={styles.field}>
          <span>{t('dashboard.ai.interviewFocusFeatured')}</span>
          <select value={featuredWrestlerId} onChange={handleFeaturedChange}>
            <option value="">{t('dashboard.ai.interviewFocusCompany')}</option>
            {sortedWrestlers.map((wrestler) => (
              <option key={wrestler.employeeId} value={wrestler.employeeId}>
                {wrestler.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>{t('dashboard.ai.interviewFocusRival')}</span>
          <select
            value={rivalWrestlerId}
            disabled={!selectedFeatured || rivalCandidates.length === 0}
            onChange={(event) => setRivalWrestlerId(event.target.value)}
          >
            <option value="">{t('dashboard.ai.interviewFocusNoRival')}</option>
            {rivalCandidates.map((wrestler) => (
              <option key={wrestler.employeeId} value={wrestler.employeeId}>
                {wrestler.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onCancel}>
            {t('dashboard.ai.cancelInterview')}
          </button>
          <button type="submit" className={styles.primary}>
            {t('dashboard.ai.startInterview')}
          </button>
        </div>
      </form>
    </section>
  )
}

export default InterviewFocusModal
