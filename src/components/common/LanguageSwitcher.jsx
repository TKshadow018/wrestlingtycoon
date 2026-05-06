import { useTranslation } from 'react-i18next'
import { AVAILABLE_LANGUAGES } from '../../i18n'
import styles from './LanguageSwitcher.module.scss'

function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  return (
    <label className={styles.languageSwitcher}>
      <span>{t('common.language')}</span>
      <select value={i18n.language} onChange={(event) => i18n.changeLanguage(event.target.value)}>
        {AVAILABLE_LANGUAGES.map((languageCode) => (
          <option key={languageCode} value={languageCode}>
            {languageCode.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  )
}

export default LanguageSwitcher
