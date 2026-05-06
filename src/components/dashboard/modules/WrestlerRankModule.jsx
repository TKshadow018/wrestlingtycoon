import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import { calculateRanking, calculateTeamRanking } from '../../../utils/wrestlerRank'
import styles from './WrestlerRankModule.module.scss'

const FEMALE_FALLBACK_IMAGE = '/people/girl.png'
const MALE_FALLBACK_IMAGE = '/people/boy.png'

const getFallbackImage = (gender) => (gender === 'female' ? FEMALE_FALLBACK_IMAGE : MALE_FALLBACK_IMAGE)


function WrestlerRankModule() {
  const { t } = useTranslation()
  const employees = useGameStore((state) => state.roster.employees)
  const teams = useGameStore((state) => state.roster.teams)

  const maleRankedWrestlers = useMemo(
    () => calculateRanking((employees || []).filter((employee) => employee?.role === 'wrestler' && employee?.gender === 'male')),
    [employees],
  )
  const femaleRankedWrestlers = useMemo(
    () => calculateRanking((employees || []).filter((employee) => employee?.role === 'wrestler' && employee?.gender === 'female')),
    [employees],
  )
  const maleRankedTeams = useMemo(
    () => calculateTeamRanking({ teams: teams || [], employees, division: 'male' }),
    [employees, teams],
  )
  const femaleRankedTeams = useMemo(
    () => calculateTeamRanking({ teams: teams || [], employees, division: 'female' }),
    [employees, teams],
  )
  const [boardView, setBoardView] = useState('wrestlers')
  const [selectedDivision, setSelectedDivision] = useState('male')

  if (
    maleRankedWrestlers.length === 0
    && femaleRankedWrestlers.length === 0
    && maleRankedTeams.length === 0
    && femaleRankedTeams.length === 0
  ) {
    return <p className={styles.emptyState}>{t('dashboard.wrestlerRank.empty', 'No wrestlers available.')}</p>
  }

  const activeDivision = selectedDivision === 'female' ? 'female' : 'male'
  const rankedWrestlers = activeDivision === 'female' ? femaleRankedWrestlers : maleRankedWrestlers
  const rankedTeams = activeDivision === 'female' ? femaleRankedTeams : maleRankedTeams

  const renderWrestlerRankingList = (rankedList) => {
    if (!rankedList.length) {
      return (
        <p className={styles.sectionEmpty}>{t('dashboard.wrestlerRank.empty', 'No wrestlers available.')}</p>
      )
    }

    return (
      <div className={styles.rankList}>
        {rankedList.map((wrestler) => {
          const trendClass = wrestler.rankDelta > 0 ? styles.trendUp : wrestler.rankDelta < 0 ? styles.trendDown : styles.trendFlat
          const trendLabel = wrestler.rankDelta > 0
            ? `+${wrestler.rankDelta}`
            : wrestler.rankDelta < 0
              ? `${wrestler.rankDelta}`
              : '0'

          return (
            <article key={wrestler.employeeId} className={styles.rankCard}>
              <img
                className={styles.rankImage}
                src={wrestler.imageUrl || getFallbackImage(wrestler.gender)}
                alt={wrestler.name}
                loading="lazy"
                onError={(event) => {
                  if (!event.currentTarget.dataset.fb) {
                    event.currentTarget.dataset.fb = '1'
                    event.currentTarget.src = getFallbackImage(wrestler.gender)
                  }
                }}
              />
              <div className={styles.rankOverlay}>
                <div className={styles.rankTopRow}>
                  <strong className={styles.rankIndex}>#{wrestler.rank}</strong>
                  <em className={`${styles.rankTrend} ${trendClass}`}>
                    {t('dashboard.wrestlerRank.rankMove', 'Rank Move: {{value}}', { value: trendLabel })}
                  </em>
                </div>

                <div className={styles.rankBottomRow}>
                  <h5 className={styles.rankName}>{wrestler.name}</h5>
                  <p className={styles.rankMeta}>{t('dashboard.wrestlerRank.points', 'Points: {{points}}', { points: wrestler.rankPoints })}</p>
                  <p className={styles.rankMeta}>{t('dashboard.wrestlerRank.record', 'Record: {{wins}}W - {{losses}}L ({{matches}} matches)', {
                    wins: wrestler.wins,
                    losses: wrestler.losses,
                    matches: wrestler.matches,
                  })}</p>
                  <p className={styles.rankMeta}>{t('dashboard.wrestlerRank.popularity', 'Popularity: {{value}}', { value: Number(wrestler.popularity || 0) })}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  const renderTeamRankingList = (rankedList) => {
    if (!rankedList.length) {
      return (
        <p className={styles.sectionEmpty}>{t('dashboard.wrestlerRank.emptyTeams', 'No teams available.')}</p>
      )
    }

    return (
      <div className={styles.teamRankList}>
        {rankedList.map((team) => (
          <article key={team.teamId} className={styles.teamRankCard}>
            <div className={styles.teamRankHeader}>
              <strong className={styles.rankIndex}>#{team.teamRank}</strong>
              <h5 className={styles.teamRankName}>{team.name}</h5>
              {team.isMixed ? <span className={styles.teamMixedBadge}>{t('dashboard.wrestlerRank.mixedTeam', 'Mixed')}</span> : null}
            </div>
            <p className={styles.rankMeta}>{t('dashboard.wrestlerRank.teamPoints', 'Points: {{points}}', { points: team.teamRankPoints })}</p>
            <div className={styles.teamMemberNames}>
              {(team.memberEmployees || []).map((member) => (
                <span key={member.employeeId}>{member.name}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    )
  }

  return (
    <section className={styles.moduleBody}>
      <div className={styles.headerCard}>
        <h4>{t('dashboard.wrestlerRank.title', 'Wrestler Rank')}</h4>
        <p>{t('dashboard.wrestlerRank.description', 'Starts from popularity and shifts by match performance. Beating higher-ranked opponents grants more points.')}</p>
      </div>

      <div className={styles.boardTabs}>
        <button
          type="button"
          className={`${styles.divisionTab} ${boardView === 'wrestlers' ? styles.divisionTabActive : ''}`}
          onClick={() => setBoardView('wrestlers')}
        >
          {t('dashboard.wrestlerRank.wrestlersView', 'Wrestlers')}
        </button>
        <button
          type="button"
          className={`${styles.divisionTab} ${boardView === 'teams' ? styles.divisionTabActive : ''}`}
          onClick={() => setBoardView('teams')}
        >
          {t('dashboard.wrestlerRank.teamsView', 'Teams')}
        </button>
      </div>

      <div className={styles.divisionTabs}>
        <button
          type="button"
          className={`${styles.divisionTab} ${activeDivision === 'male' ? styles.divisionTabActive : ''}`}
          onClick={() => setSelectedDivision('male')}
        >
          {t('dashboard.wrestlerRank.maleDivision', 'Male Division')}
        </button>
        <button
          type="button"
          className={`${styles.divisionTab} ${activeDivision === 'female' ? styles.divisionTabActive : ''}`}
          onClick={() => setSelectedDivision('female')}
        >
          {t('dashboard.wrestlerRank.femaleDivision', 'Female Division')}
        </button>
      </div>

      {boardView === 'teams' ? renderTeamRankingList(rankedTeams) : renderWrestlerRankingList(rankedWrestlers)}
    </section>
  )
}

export default WrestlerRankModule
