import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import {
  localizeCompetitorArchetype,
  localizeCompetitorHeadline,
  localizeCompetitorName,
} from '../../../utils/competitorNews'
import styles from './CompetitorIntelModule.module.scss'

const COMPETITOR_LOGOS = {
  'comp-1': '/Company/Rivals/titan.jpeg',
  'comp-2': '/Company/Rivals/prime.jpeg',
  'comp-3': '/Company/Rivals/global.jpeg',
}

const formatSignedNumber = (value) => {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) {
    return '0'
  }

  const rounded = Math.round(numeric)
  if (rounded === 0) {
    return '0'
  }

  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function CompetitorIntelModule() {
  const { t } = useTranslation()
  const formatNameList = (names) => Array.isArray(names) && names.length > 0
    ? names.join(t('dashboard.competitorIntel.nameSeparator'))
    : t('dashboard.competitorIntel.unknownWinner')
  const headlines = useGameStore((state) => state.events.competitorHeadlines || [])
  const competitors = useGameStore((state) => state.events.competitorCompanies || [])
  const wrestlerPool = useGameStore((state) => state.events.competitorWrestlerPool || [])

  const latest = headlines[headlines.length - 1] || null
  const recent = useMemo(() => [...headlines].reverse().slice(0, 14), [headlines])

  const metrics = useMemo(() => {
    const impactHeadlines = headlines.filter((item) => (
      Number(item.fanImpact || 0) !== 0 || Number(item.prestigeImpact || 0) !== 0
    ))
    if (impactHeadlines.length === 0) {
      return {
        averageFanImpact: 0,
        averagePrestigeImpact: 0,
        positiveNights: 0,
        negativeNights: 0,
      }
    }

    const fanTotal = impactHeadlines.reduce((sum, item) => sum + Number(item.fanImpact || 0), 0)
    const prestigeTotal = impactHeadlines.reduce((sum, item) => sum + Number(item.prestigeImpact || 0), 0)
    const positiveNights = impactHeadlines.filter((item) => Number(item.fanImpact || 0) >= 0).length

    return {
      averageFanImpact: Math.round(fanTotal / impactHeadlines.length),
      averagePrestigeImpact: Number((prestigeTotal / impactHeadlines.length).toFixed(2)),
      positiveNights,
      negativeNights: impactHeadlines.length - positiveNights,
    }
  }, [headlines])

  if (headlines.length === 0 && competitors.length === 0) {
    return (
      <section className={styles.moduleBody}>
        <p className={styles.empty}>{t('dashboard.competitorIntel.empty')}</p>
      </section>
    )
  }

  return (
    <section className={styles.moduleBody}>
      <div className={styles.kpiGrid}>
        <article>
          <h4>{t('dashboard.competitorIntel.averageFanImpact')}</h4>
          <p className={metrics.averageFanImpact >= 0 ? styles.positive : styles.negative}>
            {formatSignedNumber(metrics.averageFanImpact)}
          </p>
        </article>
        <article>
          <h4>{t('dashboard.competitorIntel.averagePrestigeImpact')}</h4>
          <p className={metrics.averagePrestigeImpact >= 0 ? styles.positive : styles.negative}>
            {formatSignedNumber(metrics.averagePrestigeImpact)}
          </p>
        </article>
        <article>
          <h4>{t('dashboard.competitorIntel.winningNights')}</h4>
          <p>{metrics.positiveNights}</p>
        </article>
        <article>
          <h4>{t('dashboard.competitorIntel.losingNights')}</h4>
          <p>{metrics.negativeNights}</p>
        </article>
      </div>

      <section className={styles.competitorRoster}>
        <h3>{t('dashboard.competitorIntel.rivalProfiles')}</h3>
        <div className={styles.competitorProfiles}>
          {competitors.map((competitor) => {
            const competitorName = localizeCompetitorName(competitor, t)
            const competitorRoster = wrestlerPool.filter(({ employeeId }) => (
              competitor.rosterIds?.includes(employeeId)
            ))
            return (
              <article key={competitor.id} className={styles.competitorProfile}>
              {COMPETITOR_LOGOS[competitor.id] ? (
                <img
                  className={styles.competitorLogo}
                  src={COMPETITOR_LOGOS[competitor.id]}
                  alt={t('dashboard.competitorIntel.logoAlt', { name: competitorName })}
                  loading="lazy"
                />
              ) : null}
              <div className={styles.profileHeading}>
                <h4>{competitorName}</h4>
                <span>{t(`dashboard.competitorIntel.strategies.${competitor.strategyId}`, {
                  defaultValue: t('dashboard.competitorIntel.strategies.unknown'),
                })}</span>
              </div>
              <p>{t('dashboard.competitorIntel.nextRivalEvent', { day: competitor.nextEventDay })}</p>
              <p>
                {t('dashboard.competitorIntel.nextStrategyShift', {
                  day: competitor.nextStrategyDay,
                })}
              </p>
              {competitor.copiedGimmicks?.length > 0 ? (
                <ul>
                  {competitor.copiedGimmicks.map((gimmick) => (
                    <li key={`${gimmick.archetypeId}-${gimmick.copiedDay}`}>
                      {t('dashboard.competitorIntel.copiedGimmick', {
                        gimmick: localizeCompetitorArchetype(gimmick.archetypeId, t),
                        wrestler: gimmick.sourceWrestlerName,
                      })}
                    </li>
                  ))}
                </ul>
              ) : (
                <small>{t('dashboard.competitorIntel.noCopiedGimmicks')}</small>
              )}
              {competitor.champions?.length > 0 ? (
                <section className={styles.championSection}>
                  <h5>{t('dashboard.competitorIntel.champions')}</h5>
                  <ul className={styles.championList}>
                    {competitor.champions.map((champion) => (
                      <li key={champion.titleId}>
                        <strong>{t(champion.titleKey || 'dashboard.competitorIntel.rivalTitles.unknown')}</strong>
                        <span>{formatNameList(champion.championNames)}</span>
                        <small>
                          {t('dashboard.competitorIntel.titleDefenses', { count: champion.defenses })}
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {competitor.lastEvent ? (
                <section className={styles.rivalEvent}>
                  <h5>{t('dashboard.competitorIntel.latestRivalEvent')}</h5>
                  <p>
                    {t('dashboard.competitorIntel.eventAtDay', {
                      name: t('dashboard.competitorIntel.rivalEventName', {
                        number: competitor.lastEvent.eventNumber,
                      }),
                      day: competitor.lastEvent.day,
                    })}
                  </p>
                  <ol className={styles.matchList}>
                    {competitor.lastEvent.matches.map((match) => (
                      <li key={`${competitor.id}-${competitor.lastEvent.day}-${match.matchNumber}`}>
                        <strong>
                          {match.titleKey
                            ? t(match.titleKey)
                            : t('dashboard.competitorIntel.matchNumber', {
                            number: match.matchNumber,
                            })}
                        </strong>
                        <span>
                          {match.participantNames.join(t('dashboard.competitorIntel.matchupSeparator'))}
                        </span>
                        <small>
                          {t('dashboard.competitorIntel.matchWinner', {
                            name: formatNameList(match.winnerNames),
                          })}
                        </small>
                      </li>
                    ))}
                  </ol>
                  {competitor.lastEvent.championChanges.map((change) => (
                    <p className={styles.championChange} key={`${change.titleKey}-${change.championNames.join('-')}`}>
                      {t('dashboard.competitorIntel.titleChange', {
                        title: t(change.titleKey || 'dashboard.competitorIntel.rivalTitles.unknown'),
                        name: formatNameList(change.championNames),
                      })}
                    </p>
                  ))}
                </section>
              ) : null}
              {competitorRoster.length > 0 ? (
                <details className={styles.rivalRosterDetails}>
                  <summary>
                    {t('dashboard.competitorIntel.rosterSize', { count: competitorRoster.length })}
                  </summary>
                  <ul className={styles.rivalRosterList}>
                    {competitorRoster.map((wrestler) => (
                      <li key={wrestler.employeeId}>
                        <span>{wrestler.name}</span>
                        <small>
                          {t('dashboard.competitorIntel.wrestlerRecord', {
                            country: t(`dashboard.competitorIntel.countries.${wrestler.countryKey}`, {
                              defaultValue: t('dashboard.competitorIntel.unknownCountry'),
                            }),
                            wins: wrestler.wins,
                            losses: wrestler.losses,
                          })}
                        </small>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              </article>
            )
          })}
        </div>
      </section>

      {headlines.length === 0 && (
        <p className={styles.empty}>{t('dashboard.competitorIntel.noHeadlines')}</p>
      )}
      {latest ? (
        <article className={styles.latestCard}>
          <h4>{t('dashboard.competitorIntel.latestHeadline')}</h4>
          <p>{localizeCompetitorHeadline(latest, t)}</p>
        </article>
      ) : null}

      <div className={styles.list}>
        {recent.map((item, index) => (
          <article key={item.id || `${item.day}-${index}`} className={styles.itemCard}>
            <div className={styles.rowTop}>
              <strong>
                {t('dashboard.competitorIntel.dayLabel', { day: item.day })}
              </strong>
              <span>{localizeCompetitorName(item, t)}</span>
            </div>
            <p className={styles.headline}>{localizeCompetitorHeadline(item, t)}</p>
            <div className={styles.rowBottom}>
              <span className={Number(item.fanImpact || 0) >= 0 ? styles.positive : styles.negative}>
                {t('dashboard.competitorIntel.fanImpact', { value: formatSignedNumber(item.fanImpact) })}
              </span>
              <span className={Number(item.prestigeImpact || 0) >= 0 ? styles.positive : styles.negative}>
                {t('dashboard.competitorIntel.prestigeImpact', { value: formatSignedNumber(item.prestigeImpact) })}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default CompetitorIntelModule