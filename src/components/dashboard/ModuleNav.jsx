import { useTranslation } from 'react-i18next'
import { MANAGEMENT_MODULES } from '../../config/gameConfig'
import styles from './ModuleNav.module.scss'

function ModuleNav({ activeModule, onSelect }) {
  const { t } = useTranslation()

  return (
    <nav className={styles.moduleNav}>
      {MANAGEMENT_MODULES.map((module) => (
        <button
          key={module.id}
          type="button"
          className={module.id === activeModule ? styles.active : ''}
          onClick={() => onSelect(module.id)}
        >
          {t(`dashboard.modules.${module.id}.nav`)}
        </button>
      ))}
    </nav>
  )
}

export default ModuleNav
