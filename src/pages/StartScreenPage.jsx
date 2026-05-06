import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from '../components/common/LanguageSwitcher'
import StartGameForm from '../components/onboarding/StartGameForm'
import { GAME_CONFIG } from '../config/gameConfig'
import { useGameStore } from '../store/useGameStore'
import styles from './StartScreenPage.module.scss'

function StartScreenPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const startGame = useGameStore((state) => state.startGame)

  const [playerName, setPlayerName] = useState('Tusar')
  const [companyName, setCompanyName] = useState('Dhisum Dhisum Wrestling')
  const [validation, setValidation] = useState(false)

  const titleVersion = useMemo(() => GAME_CONFIG.version, [])

  const onSubmit = (event) => {
    event.preventDefault()

    const result = startGame({ playerName, companyName })
    if (!result.ok) {
      setValidation(true)
      return
    }

    setValidation(false)
    navigate('/dashboard')
  }

  return (
    <main className={styles.screen}>
      <div className={styles.backgroundGlow} aria-hidden="true" />
      <section className={styles.card}>
        <header className={styles.header}>
          <p>{t('app.name')}</p>
          <LanguageSwitcher />
        </header>

        <div className={styles.body}>
          <article className={styles.pitch}>
            <h1>{t('onboarding.title')}</h1>
            <p>{t('onboarding.subtitle')}</p>
            <small>{t('app.version', { version: titleVersion })}</small>
          </article>

          <StartGameForm
            playerName={playerName}
            companyName={companyName}
            validation={validation}
            startingCash={GAME_CONFIG.startingCash}
            onPlayerNameChange={setPlayerName}
            onCompanyNameChange={setCompanyName}
            onSubmit={onSubmit}
          />
        </div>
      </section>
    </main>
  )
}

export default StartScreenPage
