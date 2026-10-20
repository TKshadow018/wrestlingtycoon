import { useTranslation } from 'react-i18next'
import { isInjured, normalizeInjury } from '../../utils/matchHealth'

export default function InjuryStatus({ employee, day, className }) {
  const { t } = useTranslation()
  if (!isInjured(employee, day)) return null
  const injury = normalizeInjury(employee.injury)
  const translationKey = injury.type === 'backstage'
    ? 'matchHealth.backstageInjuryStatus'
    : 'matchHealth.injuryStatus'
  return <span className={className} role="status">
    {t(translationKey, {
      count: injury.returnDay - day,
      day: injury.returnDay,
      reason: injury.type === 'backstage' ? t(`dashboard.backstageInjury.reasons.${injury.reasonId}`) : '',
    })}
  </span>
}
