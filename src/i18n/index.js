import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const localeModules = import.meta.glob('./locales/*.json', { eager: true })

const resources = Object.entries(localeModules).reduce((accumulator, [path, module]) => {
  const matchedLanguage = path.match(/\.\/locales\/(.+)\.json$/)
  if (!matchedLanguage) {
    return accumulator
  }

  const language = matchedLanguage[1]
  return {
    ...accumulator,
    [language]: {
      translation: module.default,
    },
  }
}, {})

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export const AVAILABLE_LANGUAGES = Object.keys(resources)

export default i18n
