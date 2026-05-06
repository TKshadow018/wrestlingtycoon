import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import styles from './ManageTitlesModule.module.scss'

const getFallbackImage = (gender) => (gender === 'female' ? '/people/girl.png' : '/people/boy.png')

function ManageTitlesModule() {
  const { t } = useTranslation()
  const titles = useGameStore((state) => state.roster.titles)
  const employees = useGameStore((state) => state.roster.employees)
  const setTitleActive = useGameStore((state) => state.setTitleActive)
  const [historyTitleId, setHistoryTitleId] = useState(null)

  const historyTitle = useMemo(
    () => titles.find((title) => title.titleId === historyTitleId) || null,
    [historyTitleId, titles],
  )

  if (!titles.length) {
    return <p className={styles.emptyState}>{t('dashboard.titles.empty')}</p>
  }

  return (
    <section className={styles.moduleBody}>
      {titles.map((title) => {
        const holderIds = title.division === 'doubles'
          ? Array.from(
              new Set(
                [
                  ...(Array.isArray(title.holderEmployeeIds) ? title.holderEmployeeIds : []),
                  ...(title.holderEmployeeId ? [title.holderEmployeeId] : []),
                ].filter(Boolean),
              ),
            ).slice(0, 2)
          : (title.holderEmployeeId ? [title.holderEmployeeId] : [])
        const holders = holderIds
          .map((id) => employees.find((employee) => employee.employeeId === id) || null)
          .filter(Boolean)
        const holderLabel = holders.length > 0
          ? holders.map((holder) => holder.name).join(' & ')
          : t('dashboard.titles.vacant', 'Vacant')
        const isDoublesTitle = title.division === 'doubles'

        return (
        <article key={title.titleId} className={styles.titleCard}>
          {isDoublesTitle ? (
            <div className={styles.titleVisualDoubles}>
              {[0, 1].map((index) => {
                const holder = holders[index] || null

                return (
                  <div key={`${title.titleId}-holder-slot-${index}`} className={styles.holderSlot}>
                    {holder ? (
                      <img
                        src={holder.imageUrl || getFallbackImage(holder.gender)}
                        alt={holder.name}
                        className={styles.holderImage}
                        loading="lazy"
                        onError={(event) => {
                          if (!event.currentTarget.dataset.fallbackApplied) {
                            event.currentTarget.dataset.fallbackApplied = '1'
                            event.currentTarget.src = getFallbackImage(holder.gender)
                          }
                        }}
                      />
                    ) : (
                      <div className={styles.noHolder}>{t('dashboard.titles.noHolder', 'No current holder')}</div>
                    )}
                    <img src={title.image} alt={title.name} className={styles.titleImageOnHolder} loading="lazy" />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={styles.titleVisual}>
              {holders[0] ? (
                <img
                  src={holders[0].imageUrl || getFallbackImage(holders[0].gender)}
                  alt={holders[0].name}
                  className={styles.holderImage}
                  loading="lazy"
                  onError={(event) => {
                    if (!event.currentTarget.dataset.fallbackApplied) {
                      event.currentTarget.dataset.fallbackApplied = '1'
                      event.currentTarget.src = getFallbackImage(holders[0].gender)
                    }
                  }}
                />
              ) : (
                <div className={styles.noHolder}>{t('dashboard.titles.noHolder', 'No current holder')}</div>
              )}
              <img src={title.image} alt={title.name} className={styles.titleImage} loading="lazy" />
            </div>
          )}

          <div className={styles.titleOverlay}>
            <div className={styles.titleActions}>
              <button
                type="button"
                className={styles.historyButton}
                onClick={() => setHistoryTitleId(title.titleId)}
              >
                {t('dashboard.titles.historyButton', 'Holder History')}
              </button>
              <button
                type="button"
                className={title.isActive ? styles.deactivateButton : styles.activateButton}
                onClick={() => setTitleActive(title.titleId, !title.isActive)}
              >
                {title.isActive ? t('dashboard.titles.disable') : t('dashboard.titles.enable')}
              </button>
            </div>

            <div className={styles.titleInfo}>
              <h4>{title.name}</h4>
              <p>{t('dashboard.titles.division', { division: title.division })}</p>
              <p>
                {t('dashboard.titles.currentHolder', 'Current Holder: {{name}}', {
                  name: holderLabel,
                })}
              </p>
              <p>{title.isActive ? t('dashboard.titles.active') : t('dashboard.titles.inactive')}</p>
            </div>
          </div>
        </article>
        )
      })}

      {historyTitle ? (
        <div className={styles.historyOverlay} role="presentation" onClick={() => setHistoryTitleId(null)}>
          <aside
            className={styles.historyPanel}
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.titles.historyTitle', 'Previous Holders')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.historyHeader}>
              <h4>{t('dashboard.titles.historyTitle', 'Previous Holders')}</h4>
              <button type="button" onClick={() => setHistoryTitleId(null)}>
                {t('dashboard.titles.closeHistory', 'Close')}
              </button>
            </div>

            <p className={styles.historySubtitle}>{historyTitle.name}</p>

            {Array.isArray(historyTitle.holderHistory) && historyTitle.holderHistory.length > 0 ? (
              <div className={styles.historyList}>
                {[...historyTitle.holderHistory].reverse().map((entry, index) => {
                  const entryHolders = Array.isArray(entry.holders) && entry.holders.length > 0
                    ? entry.holders
                    : (Array.isArray(entry.holderEmployeeIds) ? entry.holderEmployeeIds.map((id) => {
                        const employee = employees.find((item) => item.employeeId === id)
                        return {
                          employeeId: id,
                          name: employee?.name || id,
                          gender: employee?.gender || null,
                          imageUrl: employee?.imageUrl || null,
                        }
                      }) : [])

                  return (
                    <article key={`${historyTitle.titleId}-history-${index}`} className={styles.historyEntry}>
                      <div className={styles.historyHoldersGrid}>
                        {entryHolders.map((holder) => (
                          <div key={`${historyTitle.titleId}-${index}-${holder.employeeId}`} className={styles.historyHolderCard}>
                            <img
                              src={holder.imageUrl || getFallbackImage(holder.gender)}
                              alt={holder.name}
                              loading="lazy"
                              onError={(event) => {
                                if (!event.currentTarget.dataset.fallbackApplied) {
                                  event.currentTarget.dataset.fallbackApplied = '1'
                                  event.currentTarget.src = getFallbackImage(holder.gender)
                                }
                              }}
                            />
                            <span>{holder.name}</span>
                          </div>
                        ))}
                      </div>
                      <p>
                        {t('dashboard.titles.daysHeld', 'Days held: {{days}}', {
                          days: Number(entry.daysHeld) || 0,
                        })}
                      </p>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className={styles.historyEmpty}>{t('dashboard.titles.noHistory', 'No previous holders yet.')}</p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  )
}

export default ManageTitlesModule
