import { useTranslation } from 'react-i18next'
import {
  CAREER_ARC_UNLOCK_CATEGORIES,
  getCareerArcUnlockItem,
} from '../../../data/careerArcUnlocks'
import { useGameStore } from '../../../store/useGameStore'
import styles from './CareerArcModule.module.scss'

const formatSigned = (value) => {
  const numeric = Number(value || 0)
  const rounded = Math.round(numeric)
  if (!Number.isFinite(rounded) || rounded === 0) {
    return '0'
  }

  return rounded > 0 ? `+${rounded.toLocaleString()}` : `${rounded.toLocaleString()}`
}

const getProgressPercent = (current, target) => {
  const safeTarget = Math.max(1, Number(target || 0))
  const safeCurrent = Math.max(0, Number(current || 0))
  return Math.max(0, Math.min(100, Math.round((safeCurrent / safeTarget) * 100)))
}

function ProgressRow({ label, current, target }) {
  const percent = getProgressPercent(current, target)

  return (
    <div className={styles.progressRow}>
      <div className={styles.progressHeader}>
        <span>{label}</span>
        <span>{current.toLocaleString()} / {target.toLocaleString()}</span>
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function CareerArcModule() {
  const { t } = useTranslation()
  const progression = useGameStore((state) => state.progression)
  const currentArc = progression?.currentArc
  const arcHistory = Array.isArray(progression?.history) ? progression.history : []

  if (!currentArc) {
    return <p className={styles.empty}>{t('dashboard.careerArc.empty')}</p>
  }

  const currentProgress = currentArc.progress || { fanGain: 0, prestigeGain: 0, cashGain: 0 }
  const goals = currentArc.goals || { fanGain: 0, prestigeGain: 0, cashGain: 0 }
  const reward = currentArc.reward || { cash: 0, prestige: 0, sponsorTrust: 0, unlockables: [] }
  const unlockables = Array.isArray(reward.unlockables) ? reward.unlockables : []

  return (
    <section className={styles.moduleBody}>
      <article className={styles.currentArcCard}>
        <header>
          <h4>{t(`dashboard.careerArc.templates.${currentArc.templateKey}.title`)}</h4>
          <p>{t('dashboard.careerArc.arcWindow', { start: currentArc.startDay, end: currentArc.endDay })}</p>
        </header>
        <p className={styles.description}>{t(`dashboard.careerArc.templates.${currentArc.templateKey}.description`)}</p>

        <div className={styles.progressGrid}>
          <ProgressRow
            label={t('dashboard.careerArc.goalFans')}
            current={Number(currentProgress.fanGain || 0)}
            target={Number(goals.fanGain || 0)}
          />
          <ProgressRow
            label={t('dashboard.careerArc.goalPrestige')}
            current={Number(currentProgress.prestigeGain || 0)}
            target={Number(goals.prestigeGain || 0)}
          />
          <ProgressRow
            label={t('dashboard.careerArc.goalCash')}
            current={Number(currentProgress.cashGain || 0)}
            target={Number(goals.cashGain || 0)}
          />
        </div>

        <div className={styles.rewardRow}>
          <span>{t('dashboard.careerArc.rewardTitle')}</span>
          <strong>
            {t('dashboard.careerArc.rewardValue', {
              cash: Number(reward.cash || 0).toLocaleString(),
              prestige: formatSigned(reward.prestige || 0),
              trust: formatSigned(reward.sponsorTrust || 0),
            })}
          </strong>
        </div>
        {unlockables.length > 0 && (
          <div className={styles.unlockRewards}>
            <span>{t('dashboard.careerArc.unlocksTitle')}</span>
            <ul>
              {unlockables.map((unlock) => {
                if (!CAREER_ARC_UNLOCK_CATEGORIES.includes(unlock.category)) return null
                const item = getCareerArcUnlockItem(unlock.category, unlock.id)
                if (!item) return null

                return (
                  <li key={`${unlock.category}-${unlock.id}`}>
                    <small>{t(`dashboard.careerArc.unlockCategories.${unlock.category}`)}</small>
                    <strong>{item.labelKey ? t(item.labelKey) : item.name}</strong>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </article>

      <article className={styles.historyCard}>
        <h4>{t('dashboard.careerArc.historyTitle')}</h4>
        {arcHistory.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.careerArc.historyEmpty')}</p>
        ) : (
          <div className={styles.historyList}>
            {arcHistory.slice(0, 8).map((arc) => (
              <div key={arc.arcId} className={styles.historyItem}>
                <div>
                  <p className={styles.historyName}>{t(`dashboard.careerArc.templates.${arc.templateKey}.title`)}</p>
                  <small>{t('dashboard.careerArc.arcWindow', { start: arc.startDay, end: arc.endDay })}</small>
                </div>
                <span className={arc.status === 'completed' ? styles.success : styles.fail}>
                  {arc.status === 'completed'
                    ? t('dashboard.careerArc.completed')
                    : t('dashboard.careerArc.failed')}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}

export default CareerArcModule