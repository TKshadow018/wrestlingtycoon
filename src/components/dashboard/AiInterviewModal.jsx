import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './AiInterviewModal.module.scss'

function AiInterviewModal({
  isOpen,
  interview,
  messages,
  onSubmitAnswer,
  onSkip,
  onFinishAndContinue,
  isSubmitting,
  isFinished,
  error,
}) {
  const { t } = useTranslation()
  const [answer, setAnswer] = useState('')

  const canSubmit = answer.trim().length > 0 && !isSubmitting && !isFinished

  const headline = useMemo(() => {
    if (!interview) return ''
    return t('dashboard.ai.interviewHeadline', {
      journalist: interview.journalistName,
      newspaper: interview.newspaperName,
    })
  }, [interview, t])

  if (!isOpen || !interview) {
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    const submittedAnswer = answer.trim()
    setAnswer('')
    await onSubmitAnswer?.(submittedAnswer)
  }

  return (
    <section className={styles.backdrop}>
      <article className={styles.modal}>
        <header className={styles.header}>
          <h3>{t('dashboard.ai.interviewTitle')}</h3>
          <p>{headline}</p>
          {interview.situation ? <p className={styles.situation}>{interview.situation}</p> : null}
        </header>

        <div className={styles.chatLog}>
          {messages.map((entry, index) => (
            <div
              key={`${entry.speaker}-${index}`}
              className={`${styles.message} ${entry.speaker === 'user' ? styles.userMessage : styles.aiMessage}`}
            >
              <p className={styles.speaker}>{entry.speaker === 'user' ? t('dashboard.ai.you') : interview.journalistName}</p>
              <p>{entry.text}</p>
            </div>
          ))}
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {isFinished ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onFinishAndContinue}>
              {t('dashboard.ai.finishInterview')}
            </button>
          </div>
        ) : (
          <form className={styles.answerForm} onSubmit={handleSubmit}>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={t('dashboard.ai.answerPlaceholder')}
              rows={4}
              disabled={isSubmitting}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onSkip} disabled={isSubmitting}>
                {t('dashboard.ai.skipInterview')}
              </button>
              <button type="submit" className={styles.primary} disabled={!canSubmit}>
                {isSubmitting ? t('dashboard.ai.thinking') : t('dashboard.ai.submitAnswer')}
              </button>
            </div>
          </form>
        )}
      </article>
    </section>
  )
}

export default AiInterviewModal
