import { useTranslation } from 'react-i18next'
import styles from './OnboardingTutorialGuide.module.scss'

function OnboardingTutorialGuide({ tutorial, onOpenModule, onDismissForever }) {
  const { t } = useTranslation()
  if (!tutorial) return null

  if (tutorial.id === 'completed' || tutorial.id === 'failed') {
    const outcome = tutorial.id
    return (
      <section className={`${styles.guide} ${styles[`guide${outcome}`]}`}>
        <div>
          <p className={styles.eyebrow}>{t('dashboard.onboardingChallenge.tutorial.kicker')}</p>
          <h2>{t(`dashboard.onboardingChallenge.tutorial.${outcome}.title`)}</h2>
          <p>{t(`dashboard.onboardingChallenge.tutorial.${outcome}.body`)}</p>
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={onDismissForever}
        >
          {t('dashboard.onboardingChallenge.tutorial.dismissForever')}
        </button>
      </section>
    )
  }

  return (
    <section className={styles.guide} aria-label={t('dashboard.onboardingChallenge.tutorial.kicker')}>
      <div className={styles.stepBadge}>
        {tutorial.step}/{tutorial.totalSteps}
      </div>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>
          {t('dashboard.onboardingChallenge.tutorial.kicker')}
          {' · '}
          {t('dashboard.onboardingChallenge.tutorial.step', {
            current: tutorial.step,
            total: tutorial.totalSteps,
          })}
        </p>
        <h2>{t(tutorial.titleKey)}</h2>
        <p>{t(tutorial.bodyKey)}</p>
        {tutorial.id === 'buildRoster' && tutorial.rosterProgress && (
          <small>{tutorial.rosterProgress}</small>
        )}
        {tutorial.id !== 'buildRoster' && tutorial.id !== 'stabilizePromotion' && (
          <small>
            {t('dashboard.onboardingChallenge.tutorial.showsComplete', {
              current: tutorial.successfulEvents,
              total: tutorial.targetSuccessfulEvents,
            })}
          </small>
        )}
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={() => onOpenModule?.(tutorial.moduleId)}
      >
        {t(tutorial.actionKey)}
      </button>
    </section>
  )
}

export default OnboardingTutorialGuide
