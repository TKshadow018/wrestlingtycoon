import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../common/LanguageSwitcher'
import SaveLoadControls from '../common/SaveLoadControls'
import styles from '../../pages/DashboardPage.module.scss'

function DashboardHeader({
  profile,
  onboardingSummary,
  onOpenChallenge,
  saveLoadProps,
  aiStatusMessage,
  aiEnabled,
}) {
  const { t } = useTranslation()
  const [isActionsOpen, setIsActionsOpen] = useState(false)

  const handleOpenChallenge = () => {
    setIsActionsOpen(false)
    onOpenChallenge?.()
  }

  return (
    <header className={styles.topBar} data-layout="single-line">
      <div className={styles.topBarIdentity} data-testid="dashboard-header-identity">
        <h1>{t('dashboard.welcome', { playerName: profile.playerName })}</h1>
        <p>{t('dashboard.company', { companyName: profile.companyName })}</p>
      </div>

      <button
        type="button"
        className={styles.dashboardMenuToggle}
        aria-expanded={isActionsOpen}
        aria-controls="dashboard-header-actions"
        aria-label={t(isActionsOpen ? 'dashboard.header.closeMenu' : 'dashboard.header.openMenu')}
        onClick={() => setIsActionsOpen((open) => !open)}
      >
        <span className={styles.dashboardMenuIcon} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <div
        id="dashboard-header-actions"
        className={`${styles.topBarActions} ${isActionsOpen ? styles.topBarActionsOpen : ''}`}
        data-testid="dashboard-header-actions"
        data-menu-open={isActionsOpen}
      >
        {onboardingSummary && (
          <button
            type="button"
            className={styles.challengeButton}
            onClick={handleOpenChallenge}
          >
            {t('dashboard.onboardingChallenge.openButton')}
          </button>
        )}
        <SaveLoadControls
          {...saveLoadProps}
          aiStatusMessage={aiStatusMessage}
          aiEnabled={aiEnabled}
        />
        <LanguageSwitcher />
      </div>
    </header>
  )
}

export default DashboardHeader
