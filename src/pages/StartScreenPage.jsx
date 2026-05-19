import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { startAiModelDownload } from '../ai/webllmManager'
import LanguageSwitcher from '../components/common/LanguageSwitcher'
import StartGameForm from '../components/onboarding/StartGameForm'
import { GAME_CONFIG } from '../config/gameConfig'
import { useGameStore } from '../store/useGameStore'
import styles from './StartScreenPage.module.scss'

function StartScreenPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const startGame = useGameStore((state) => state.startGame)
  const setAiOptedInAtStart = useGameStore((state) => state.setAiOptedInAtStart)
  const aiStatus = useGameStore((state) => state.ai.status)
  const aiProgress = useGameStore((state) => state.ai.progress)
  const aiProgressText = useGameStore((state) => state.ai.progressText)
  const aiError = useGameStore((state) => state.ai.error)

  const [playerName, setPlayerName] = useState('Tusar')
  const [companyName, setCompanyName] = useState('Dhisum Dhisum Wrestling')
  const [validation, setValidation] = useState(false)
  const [startWithAi, setStartWithAi] = useState(false)
  const [isBlockingForAi, setIsBlockingForAi] = useState(false)

  const titleVersion = useMemo(() => GAME_CONFIG.version, [])

  useEffect(() => {
    if (!isBlockingForAi || aiStatus !== 'ready') {
      return
    }

    navigate('/dashboard')
  }, [aiStatus, isBlockingForAi, navigate])

  const onSubmit = (event) => {
    event.preventDefault()

    const result = startGame({ playerName, companyName })
    if (!result.ok) {
      setValidation(true)
      return
    }

    setValidation(false)
    setAiOptedInAtStart(startWithAi)

    if (!startWithAi) {
      navigate('/dashboard')
      return
    }

    setIsBlockingForAi(true)
    startAiModelDownload().catch(() => {})
  }

  const handleContinueInBackground = () => {
    setIsBlockingForAi(false)
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

        {isBlockingForAi ? (
          <div className={styles.aiLoadingScreen}>
            <h2>{t('onboarding.aiLoadingTitle')}</h2>
            <p>{t('onboarding.aiLoadingSubtitle')}</p>
            <div className={styles.aiProgressPanel}>
              <p>
                {t('onboarding.aiLoadingPercent', {
                  progress: Math.max(0, Math.min(100, Number(aiProgress) || 0)),
                })}
              </p>
              {aiProgressText ? <small>{aiProgressText}</small> : null}
              {aiError ? <small className={styles.aiError}>{aiError}</small> : null}
            </div>
            <button type="button" className={styles.backgroundButton} onClick={handleContinueInBackground}>
              {t('onboarding.aiBackgroundButton')}
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            <article className={styles.pitch}>
              <h1>{t('onboarding.title')}</h1>
              <p>{t('onboarding.subtitle')}</p>
              <small>{t('app.version', { version: titleVersion })}</small>
            </article>

            <StartGameForm
              playerName={playerName}
              companyName={companyName}
              startWithAi={startWithAi}
              validation={validation}
              startingCash={GAME_CONFIG.startingCash}
              onStartWithAiChange={setStartWithAi}
              onPlayerNameChange={setPlayerName}
              onCompanyNameChange={setCompanyName}
              onSubmit={onSubmit}
            />
          </div>
        )}
      </section>
    </main>
  )
}

export default StartScreenPage
