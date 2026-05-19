import { useTranslation } from 'react-i18next'
import styles from './StartGameForm.module.scss'

function StartGameForm({
  playerName,
  companyName,
  startWithAi,
  validation,
  startingCash,
  onStartWithAiChange,
  onPlayerNameChange,
  onCompanyNameChange,
  onSubmit,
}) {
  const { t } = useTranslation()

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label>
        <span>{t('onboarding.playerName')}</span>
        <input
          value={playerName}
          onChange={(event) => onPlayerNameChange(event.target.value)}
          placeholder={t('onboarding.playerNamePlaceholder')}
          autoComplete="off"
          name="playerName"
        />
      </label>

      <label>
        <span>{t('onboarding.companyName')}</span>
        <input
          value={companyName}
          onChange={(event) => onCompanyNameChange(event.target.value)}
          placeholder={t('onboarding.companyNamePlaceholder')}
          autoComplete="off"
          name="companyName"
        />
      </label>

      <p className={styles.cashLabel}>{t('onboarding.startingCashLabel')}</p>
      <p className={styles.cashValue}>{t('onboarding.startingCashValue', { amount: startingCash.toLocaleString() })}</p>

      <fieldset className={styles.aiChoice}>
        <legend>{t('onboarding.aiLegend')}</legend>
        <label>
          <input
            type="radio"
            name="startWithAi"
            checked={startWithAi === true}
            onChange={() => onStartWithAiChange(true)}
          />
          <span>{t('onboarding.aiStartYes')}</span>
        </label>
        <label>
          <input
            type="radio"
            name="startWithAi"
            checked={startWithAi === false}
            onChange={() => onStartWithAiChange(false)}
          />
          <span>{t('onboarding.aiStartNo')}</span>
        </label>
      </fieldset>

      {validation ? <p className={styles.validation}>{t('onboarding.validation')}</p> : null}

      <button className={styles.startButton} type="submit">
        {t('common.startGame')}
      </button>
    </form>
  )
}

export default StartGameForm
