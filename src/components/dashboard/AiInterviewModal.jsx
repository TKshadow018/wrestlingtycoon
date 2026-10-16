import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './AiInterviewModal.module.scss'

function AiInterviewModal({
  isOpen,
  interview,
  messages,
  onSubmitAnswer,
  onSkip,
  onFinishEarly,
  onFinishAndContinue,
  impactSummary,
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
    const succeeded = await onSubmitAnswer?.(submittedAnswer)
    if (succeeded !== false) {
      setAnswer('')
    }
  }

  const handleDialogKeyDown = (event) => {
    if (event.key !== 'Tab') return
    const selector = 'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]'
    const controls = [...event.currentTarget.querySelectorAll('*')]
      .filter((element) => element.matches(selector))
    if (controls.length === 0) return
    const activeIndex = controls.indexOf(event.target)
    const isWrapping = event.shiftKey ? activeIndex === 0 : activeIndex === controls.length - 1
    if (!isWrapping) return
    event.preventDefault()
    controls[event.shiftKey ? controls.length - 1 : 0].focus()
  }

  return (
    <section className={styles.backdrop}>
      <article
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-interview-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className={styles.header}>
          <h3 id="ai-interview-title">{t('dashboard.ai.interviewTitle')}</h3>
          <p>{headline}</p>
          {interview.situation ? <p className={styles.situation}>{interview.situation}</p> : null}
        </header>

        <div
          className={styles.chatLog}
          role="log"
          aria-label={t('dashboard.ai.interviewTranscript')}
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={isSubmitting}
        >
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

        {error ? <p id="ai-interview-error" className={styles.error} role="alert">{error}</p> : null}

        {isFinished && impactSummary ? (
          <div className={styles.impactSummary}>
            <p>{t('dashboard.ai.interviewImpactSummary', {
              fans: impactSummary.fansDelta >= 0 ? `+${impactSummary.fansDelta}` : `${impactSummary.fansDelta}`,
              prestige: impactSummary.prestigeDelta >= 0 ? `+${impactSummary.prestigeDelta}` : `${impactSummary.prestigeDelta}`,
              trust: impactSummary.sponsorTrustDeltaAverage >= 0
                ? `+${impactSummary.sponsorTrustDeltaAverage}`
                : `${impactSummary.sponsorTrustDeltaAverage}`,
              alignment: `${impactSummary.alignmentTargetName ? `${impactSummary.alignmentTargetName} ` : ''}${impactSummary.alignmentDelta >= 0 ? '+' : ''}${impactSummary.alignmentDelta}`,
              rivalry: `${impactSummary.rivalryNames?.join(' vs ') || t('dashboard.ai.noInterviewRival')} ${impactSummary.rivalryHeatDelta >= 0 ? '+' : ''}${impactSummary.rivalryHeatDelta}`,
            })}
            </p>
            {impactSummary.rubric ? (
              <p>{t('dashboard.ai.interviewRubricSummary', {
                relevance: impactSummary.rubric.relevance,
                clarity: impactSummary.rubric.clarity,
                professionalism: impactSummary.rubric.professionalism,
                hype: impactSummary.rubric.hype,
                controversy: impactSummary.rubric.controversy,
              })}</p>
            ) : null}
          </div>
        ) : null}

        {isFinished ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onFinishAndContinue}>
              {t('dashboard.ai.finishInterview')}
            </button>
          </div>
        ) : (
          <form className={styles.answerForm} onSubmit={handleSubmit}>
            <label htmlFor="ai-interview-answer">{t('dashboard.ai.answerLabel')}</label>
            <textarea
              id="ai-interview-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={t('dashboard.ai.answerPlaceholder')}
              aria-describedby={error ? 'ai-interview-error' : undefined}
              autoFocus
              rows={4}
              disabled={isSubmitting}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onSkip} disabled={isSubmitting}>
                {t('dashboard.ai.skipInterview')}
              </button>
              {interview.topic !== 'initializing' ? (
                <button type="button" className={styles.secondary} onClick={onFinishEarly} disabled={isSubmitting}>
                  {t('dashboard.ai.finishEarly')}
                </button>
              ) : null}
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
