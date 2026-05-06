import { useTranslation } from 'react-i18next'
import HireEmployeesModule from './modules/HireEmployeesModule'
import ManageEventsModule from './modules/ManageEventsModule'
import ManageEmployeesModule from './modules/ManageEmployeesModule'
import ManageFinancesModule from './modules/ManageFinancesModule'
import ManageSponsorsModule from './modules/ManageSponsorsModule'
import ManageTitlesModule from './modules/ManageTitlesModule'
import MatchResultsModule from './modules/MatchResultsModule'
import StatisticsModule from './modules/StatisticsModule'
import WrestlerRankModule from './modules/WrestlerRankModule'
import styles from './ModulePanel.module.scss'

function ModulePanel({ moduleId }) {
  const { t } = useTranslation()

  return (
    <section className={styles.modulePanel}>
      <header>
        <h2>{t('dashboard.modulePanel.title')}</h2>
        <p>{t('dashboard.modulePanel.description')}</p>
      </header>

      <article className={styles.focusCard}>
        <p>{t('dashboard.modulePanel.focus')}</p>
        <h3>{t(`dashboard.modules.${moduleId}.title`)}</h3>
      </article>

      {moduleId === 'manageEmployees' && <ManageEmployeesModule />}
      {moduleId === 'hireEmployees' && <HireEmployeesModule />}
      {moduleId === 'manageEvents' && <ManageEventsModule />}
      {moduleId === 'manageTitles' && <ManageTitlesModule />}
      {moduleId === 'manageFinances' && <ManageFinancesModule />}
      {moduleId === 'manageSponsors' && <ManageSponsorsModule />}
      {moduleId === 'statistics' && <StatisticsModule />}
      {moduleId === 'matchResults' && <MatchResultsModule />}
      {moduleId === 'wrestlerRank' && <WrestlerRankModule />}
    </section>
  )
}

export default ModulePanel
