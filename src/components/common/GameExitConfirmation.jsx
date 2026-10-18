import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import styles from './GameExitConfirmation.module.scss'

const GAME_EXIT_GUARD_KEY = '__gameExitGuard'

function GameExitConfirmation() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const hasGuardEntryRef = useRef(false)
  const routeHistoryIndexRef = useRef(window.history.state?.idx)
  const allowNextPopRef = useRef(false)
  const allowNextPopTimeoutRef = useRef(null)

  const pushGuardEntry = useCallback(() => {
    const currentState = window.history.state
    const nextState = {
      ...(currentState && typeof currentState === 'object' ? currentState : {}),
      [GAME_EXIT_GUARD_KEY]: true,
    }

    window.history.pushState(nextState, '', window.location.href)
  }, [])

  useEffect(() => {
    if (!hasGuardEntryRef.current) {
      pushGuardEntry()
      hasGuardEntryRef.current = true
    }

    const handlePopState = () => {
      if (allowNextPopRef.current) {
        allowNextPopRef.current = false
        window.clearTimeout(allowNextPopTimeoutRef.current)
        allowNextPopTimeoutRef.current = null
        return
      }

      pushGuardEntry()
      setIsOpen(true)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.clearTimeout(allowNextPopTimeoutRef.current)
    }
  }, [pushGuardEntry])

  const handleStay = () => setIsOpen(false)

  const handleLeave = () => {
    setIsOpen(false)
    if (!Number.isInteger(routeHistoryIndexRef.current) || routeHistoryIndexRef.current <= 0) {
      navigate('/', { replace: true })
      return
    }

    allowNextPopRef.current = true
    allowNextPopTimeoutRef.current = window.setTimeout(() => {
      allowNextPopRef.current = false
      allowNextPopTimeoutRef.current = null
    }, 1000)
    window.history.go(-2)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.backdrop}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-exit-title"
        aria-describedby="game-exit-message"
      >
        <h2 id="game-exit-title">{t('dashboard.navigationGuard.title')}</h2>
        <p id="game-exit-message">{t('dashboard.navigationGuard.message')}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.stayButton} onClick={handleStay} autoFocus>
            {t('dashboard.navigationGuard.stay')}
          </button>
          <button type="button" className={styles.leaveButton} onClick={handleLeave}>
            {t('dashboard.navigationGuard.leave')}
          </button>
        </div>
      </section>
    </div>
  )
}

export default GameExitConfirmation