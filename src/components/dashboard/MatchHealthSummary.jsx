import { useTranslation } from 'react-i18next'

export default function MatchHealthSummary({ segment, className }) {
  const { t } = useTranslation()
  if (segment.cancelled) return <div className={className}>
    <strong>{t('matchHealth.cancelled')}</strong>
    <p>{t('matchHealth.cancelledReason')}</p>
  </div>
  const losses = Object.entries(segment.staminaLossById || {})
  const injuries = Array.isArray(segment.injuries) ? segment.injuries : []
  if (!losses.length && !injuries.length) return null
  const names = new Map((segment.participantDetails || []).map((person) => [person.employeeId, person.name]))
  const name = (id) => names.get(id) || t('dashboard.events.setup.execution.unknownCompetitor')
  return <div className={className}>
    {losses.map(([id, amount]) => <p key={id}>{t('matchHealth.staminaCost', { name: name(id), amount })}</p>)}
    {injuries.map((injury) => <p key={injury.employeeId}>{t('matchHealth.injuryResult', {
      name: name(injury.employeeId), count: injury.returnDay - injury.occurredDay, day: injury.returnDay,
    })}</p>)}
  </div>
}
