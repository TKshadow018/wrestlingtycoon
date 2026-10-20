import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MATCH_DURATION_PRESETS, MATCH_FINISH_TYPES, MATCH_RISK_LEVELS,
  MATCH_MOMENT_ACTIONS, MATCH_PROP_OPTIONS, MAX_PLANNED_MOMENTS,
  clampMatchLengthMinutes, normalizeMatchPlan,
} from '../../../data/matchPlanning'
import styles from './EventSetupModal.module.scss'

export default function MatchPlanner({ segment, wrestlers, choice, onChange, onResolve, onBack }) {
  const { t } = useTranslation()
  const id = useId()
  const validation = normalizeMatchPlan({
    ...segment, ...choice,
    wrestlerIds: wrestlers.map((person) => person.employeeId),
    winnerEmployeeId: segment.matchType === 'tagTeam' ? null : choice.winnerEmployeeId,
    winnerTeamIds: segment.matchType === 'tagTeam'
      ? segment[choice.winnerTeam === 'team2' ? 'team2Ids' : 'team1Ids']
      : [],
  })
  const copy = (key, values) => t(`matchPlanner.${key}`, values)
  const change = (patch) => onChange((current) => ({ ...current, ...patch }))
  const name = (employeeId) => wrestlers.find((person) => person.employeeId === employeeId)?.name
    || t('dashboard.events.setup.execution.chooseWrestler')
  const updateMoment = (momentId, patch) => onChange((current) => ({
    ...current,
    plannedMoments: current.plannedMoments.map((moment) => (
      moment.momentId === momentId ? { ...moment, ...patch } : moment
    )),
  }))
  const addMoment = (source) => onChange((current) => {
    if (current.plannedMoments.length >= MAX_PLANNED_MOMENTS) return current
    let suffix = 1
    const ids = new Set(current.plannedMoments.map((moment) => moment.momentId))
    while (ids.has(`draft-${suffix}`)) suffix += 1
    return {
      ...current,
      plannedMoments: [...current.plannedMoments, {
        actionType: 'dominateStrikes', actorId: wrestlers[0]?.employeeId || null,
        targetId: wrestlers[1]?.employeeId || null, propId: null,
        atMinute: current.matchLengthMinutes,
        ...source, momentId: `draft-${suffix}`,
      }],
    }
  })
  const changeDuration = (value) => onChange((current) => {
    const matchLengthMinutes = clampMatchLengthMinutes(value)
    return {
      ...current, matchLengthMinutes,
      minutesAdjusted: current.plannedMoments.some((moment) => moment.atMinute > matchLengthMinutes),
      plannedMoments: current.plannedMoments.map((moment) => ({
        ...moment, atMinute: Math.min(matchLengthMinutes, moment.atMinute),
      })),
    }
  })
  const toggleProp = (propId) => onChange((current) => {
    const props = current.props.includes(propId)
      ? current.props.filter((value) => value !== propId) : [...current.props, propId]
    return {
      ...current, props,
      plannedMoments: current.plannedMoments.map((moment) => ({
        ...moment, propId: props.includes(moment.propId) ? moment.propId : null,
      })),
    }
  })
  const moments = [...choice.plannedMoments].sort((a, b) => a.atMinute - b.atMinute)

  return (
    <section className={styles.plannerCard} aria-label={copy('title')}>
      <header className={styles.executionInsightsHeader}>
        <h3>{copy('title')}</h3>
        <p>{t(`dashboard.events.setup.matchTypes.${segment.matchType === 'tagTeam' ? 'tagTeam' : 'singles'}`)}</p>
        <p>{wrestlers.map((person) => person.name).join(' / ')}</p>
        <p>{copy('summary', { moments: moments.length, props: choice.props.length })}</p>
      </header>
      <section className={styles.plannerSection}>
        <h4>{copy('overview')}</h4>
        <p>{t('matchHealth.plannerHint')}</p>
        <div className={styles.plannerControlsGrid}>
          <div className={styles.plannerField}>
            <label htmlFor={`${id}-duration`}>{t('dashboard.events.setup.execution.matchLength')}</label>
            <input id={`${id}-duration`} type="range" min="1" max="60" value={choice.matchLengthMinutes}
              onChange={(event) => changeDuration(event.target.value)} />
            <label htmlFor={`${id}-minutes`}>{copy('preciseDuration')}</label>
            <input id={`${id}-minutes`} type="number" min="1" max="60" value={choice.matchLengthMinutes}
              onChange={(event) => changeDuration(event.target.value)} />
          </div>
          <div className={styles.plannerField}>
            <span>{t('dashboard.events.setup.execution.chooseRisk')}</span>
            <div className={styles.matchTypeChips}>
              {MATCH_RISK_LEVELS.map((riskLevel) => (
                <button key={riskLevel} type="button" aria-pressed={choice.riskLevel === riskLevel}
                  className={`${styles.typeChip} ${choice.riskLevel === riskLevel ? styles.typeChipActive : ''}`}
                  onClick={() => change({ riskLevel })}>
                  {t(`dashboard.events.setup.execution.risks.${riskLevel}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.matchTypeChips}>
          {MATCH_DURATION_PRESETS.map((minutes) => (
            <button key={minutes} type="button" className={styles.typeChip}
              aria-pressed={choice.matchLengthMinutes === minutes} onClick={() => changeDuration(minutes)}>
              {copy('durationPreset', { minutes })}
            </button>
          ))}
        </div>
      </section>
      <section className={styles.plannerSection}>
        <h4>{copy('outcome')}</h4>
        <fieldset className={styles.plannerField}>
          <legend>{t('dashboard.events.setup.execution.chooseWinner')}</legend>
          <div className={styles.matchTypeChips}>
            {segment.matchType === 'tagTeam'
              ? ['team1', 'team2'].map((team) => (
                <button key={team} type="button" className={styles.typeChip}
                  aria-pressed={choice.winnerTeam === team} onClick={() => change({ winnerTeam: team })}>
                  {t(`dashboard.events.setup.execution.${team}`)}
                </button>
              ))
              : wrestlers.map((person) => (
                <button key={person.employeeId} type="button" className={styles.typeChip}
                  aria-pressed={choice.winnerEmployeeId === person.employeeId}
                  onClick={() => change({ winnerEmployeeId: person.employeeId })}>{person.name}</button>
              ))}
          </div>
        </fieldset>
        <fieldset className={styles.plannerField}>
          <legend>{t('dashboard.events.setup.execution.chooseFinish')}</legend>
          <div className={styles.matchTypeChips}>
            {MATCH_FINISH_TYPES.map((finishType) => (
              <button key={finishType} type="button" className={styles.typeChip}
                aria-pressed={choice.finishType === finishType} onClick={() => change({ finishType })}>
                {t(`dashboard.events.setup.execution.finishes.${finishType}`)}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
      <section className={styles.plannerSection}>
        <h4>{t('dashboard.events.setup.execution.chooseProps')}</h4>
        <p>{copy('propsHint')}</p>
        <div className={styles.propChoices}>
          {MATCH_PROP_OPTIONS.map((prop) => (
            <label key={prop.id} className={`${styles.propChoice} ${choice.props.includes(prop.id) ? styles.propSelected : ''}`}>
              <input type="checkbox" checked={choice.props.includes(prop.id)} onChange={() => toggleProp(prop.id)} />
              <span>{t(prop.labelKey)}</span>
            </label>
          ))}
        </div>
      </section>
      <section className={styles.plannerSection}>
        <div className={styles.plannerMomentsHeader}>
          <h4>{copy('timeline')}</h4>
          <button type="button" className={styles.secondaryBtn} disabled={moments.length >= MAX_PLANNED_MOMENTS}
            onClick={() => addMoment()}>{t('dashboard.events.setup.execution.addMoment')}</button>
        </div>
        <p>{copy('guidance')}</p>
        {moments.length === 0 ? (
          <div className={styles.plannerEmpty}>
            <p>{copy('empty')}</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => addMoment()}>{copy('addFirst')}</button>
          </div>
        ) : null}
        <div className={styles.plannedMomentsList}>
          {moments.map((moment, index) => {
            const action = MATCH_MOMENT_ACTIONS.find((item) => item.id === moment.actionType)
            const errors = validation.errors.filter((entry) => entry.momentId === moment.momentId)
            const invalidActor = !wrestlers.some((person) => person.employeeId === moment.actorId)
            const invalidTarget = action?.targetRequired && (!moment.targetId || moment.targetId === moment.actorId)
            const invalidProp = action?.propRequired && !choice.props.includes(moment.propId)
            const errorId = `${id}-${moment.momentId}-errors`
            return (
              <article key={moment.momentId} className={styles.plannedMomentRow} aria-label={copy('momentNumber', { number: index + 1 })}>
                <header className={styles.plannerMomentsHeader}>
                  <strong>{copy('momentHeader', { number: index + 1, minute: moment.atMinute })}</strong>
                  {action ? <span>{copy(`categories.${action.category}`)}</span> : null}
                </header>
                <div className={styles.plannerControlsGrid}>
                  <label className={styles.plannerField}>
                    <span>{t('dashboard.events.setup.execution.whatHappens')}</span>
                    <select value={moment.actionType} onChange={(event) => updateMoment(moment.momentId, {
                      actionType: event.target.value, propId: event.target.value === 'usesProp' ? moment.propId : null,
                    })}>
                      {MATCH_MOMENT_ACTIONS.map((item) => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
                    </select>
                  </label>
                  <label className={styles.plannerField}>
                    <span>{copy('minute')}</span>
                    <input type="number" min="1" max={choice.matchLengthMinutes} value={moment.atMinute}
                      onChange={(event) => updateMoment(moment.momentId, {
                        atMinute: Math.min(choice.matchLengthMinutes, clampMatchLengthMinutes(event.target.value)),
                      })} />
                  </label>
                  <label className={styles.plannerField}>
                    <span>{copy('actor')}</span>
                    <select value={moment.actorId || ''} aria-invalid={invalidActor} aria-describedby={errors.length ? errorId : undefined}
                      onChange={(event) => updateMoment(moment.momentId, {
                        actorId: event.target.value || null, targetId: event.target.value === moment.targetId ? null : moment.targetId,
                      })}>
                      <option value="">{t('dashboard.events.setup.execution.chooseWrestler')}</option>
                      {wrestlers.map((person) => <option key={person.employeeId} value={person.employeeId}>{person.name}</option>)}
                    </select>
                  </label>
                  <label className={styles.plannerField}>
                    <span>{copy('target')}</span>
                    <select value={moment.targetId || ''} aria-invalid={Boolean(invalidTarget)} aria-describedby={errors.length ? errorId : undefined}
                      onChange={(event) => updateMoment(moment.momentId, { targetId: event.target.value || null })}>
                      <option value="">{t('dashboard.events.setup.execution.noTarget')}</option>
                      {wrestlers.filter((person) => person.employeeId !== moment.actorId).map((person) => (
                        <option key={person.employeeId} value={person.employeeId}>{person.name}</option>
                      ))}
                    </select>
                  </label>
                  {action?.propAllowed ? (
                    <label className={styles.plannerField}>
                      <span>{t('dashboard.events.setup.execution.prop')}</span>
                      <select value={moment.propId || ''} aria-invalid={Boolean(invalidProp)} aria-describedby={errors.length ? errorId : undefined}
                        onChange={(event) => updateMoment(moment.momentId, { propId: event.target.value || null })}>
                        <option value="">{t('dashboard.events.setup.execution.chooseProp')}</option>
                        {MATCH_PROP_OPTIONS.filter((prop) => choice.props.includes(prop.id)).map((prop) => (
                          <option key={prop.id} value={prop.id}>{t(prop.labelKey)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <p>{copy('momentSummary', {
                  minute: moment.atMinute, actor: name(moment.actorId),
                  targetSuffix: moment.targetId ? t('dashboard.events.setup.execution.resultMomentTargetSuffix', { target: name(moment.targetId) }) : '',
                  action: action ? t(action.labelKey) : t('dashboard.events.setup.execution.unknownAction'),
                  prop: moment.propId ? copy('withProp', { prop: t(MATCH_PROP_OPTIONS.find((prop) => prop.id === moment.propId)?.labelKey
                    || 'dashboard.events.setup.execution.unknownProp') }) : '',
                })}</p>
                {errors.length ? <ul id={errorId} className={styles.warning}>
                  {errors.map((entry, i) => <li key={i}>{copy(`diagnostics.${entry.code}`)}</li>)}
                </ul> : null}
                <div className={styles.matchTypeChips}>
                  <button type="button" className={styles.secondaryBtn} disabled={moments.length >= MAX_PLANNED_MOMENTS}
                    onClick={() => addMoment(moment)} aria-label={copy('duplicateMoment', { number: index + 1 })}>{copy('duplicate')}</button>
                  <button type="button" className={styles.secondaryBtn}
                    onClick={() => change({ plannedMoments: choice.plannedMoments.filter((item) => item.momentId !== moment.momentId) })}
                    aria-label={copy('removeMoment', { number: index + 1 })}>{copy('remove')}</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      <footer className={styles.plannerFooter}>
        <div role="status" aria-live="polite">
          {choice.minutesAdjusted ? <p>{copy('minutesAdjusted')}</p> : null}
          <p>{validation.errors.length ? copy('invalidPlan') : copy('ready')}</p>
          {[...validation.errors.filter((entry) => !entry.momentId), ...validation.warnings, ...validation.adjustments].map((entry, index) => (
            <p key={index}>{copy(`diagnostics.${entry.code}`)}</p>
          ))}
        </div>
        <div className={styles.matchTypeChips}>
          <button type="button" className={styles.secondaryBtn} onClick={onBack}>{copy('return')}</button>
          <button type="button" className={styles.primaryBtn} disabled={validation.errors.length > 0} onClick={onResolve}>
            {copy('resolve')}
          </button>
        </div>
      </footer>
    </section>
  )
}
