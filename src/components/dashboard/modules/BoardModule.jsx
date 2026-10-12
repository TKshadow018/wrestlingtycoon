import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BOARD_CHAIR, BOARD_MEMBERS, BOARD_VICE_CHAIR } from '../../../data/board'
import { useGameStore } from '../../../store/useGameStore'
import { getBoardMeetingSchedule } from '../../../utils/boardMeetings'
import { getGameDateFromDay } from '../../../utils/gameCalendar'
import styles from './BoardModule.module.scss'

const getInitials = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('')

function PortraitCard({ name, position, imageUrl, className, company, shareholding, unavailableLabel }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showPlaceholder = !imageUrl || imageFailed

  return (
    <article className={`${styles.portraitCard} ${className}`}>
      {showPlaceholder ? (
        <div className={styles.photoPlaceholder} role="img" aria-label={`${unavailableLabel}: ${name}`}>
          <span>{getInitials(name)}</span>
          <small>{unavailableLabel}</small>
        </div>
      ) : (
        <img
          className={styles.portrait}
          src={imageUrl}
          alt={`${name}, ${position}`}
          onError={() => setImageFailed(true)}
        />
      )}
      <div className={styles.cardCaption}>
        <p>{position}</p>
        <h3>{name}</h3>
        {company && <small>{company}</small>}
        {shareholding != null && <small>{shareholding}% ownership</small>}
      </div>
    </article>
  )
}

const toBoardCard = (member, className, position = member.current_role) => ({
  key: member.person_name,
  name: member.person_name,
  position,
  imageUrl: member.image_url,
  company: member.representing_company,
  shareholding: member.company_shareholder_percentage,
  className,
})

function BoardModule() {
  const { t } = useTranslation()
  const profile = useGameStore((state) => state.profile)
  const boardState = useGameStore((state) => state.boardMeeting)
  const currentDay = useGameStore((state) => state.calendar.day)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const customEvents = useGameStore((state) => state.events.customEvents)
  const boardPresidentName = boardState.boardPresidentName || BOARD_CHAIR.person_name
  const boardVicePresidentName = boardState.boardVicePresidentName || BOARD_VICE_CHAIR.person_name
  const nextMeetingDate = useMemo(() => {
    const throughDate = getGameDateFromDay(startDateIso, currentDay + 365)

    return getBoardMeetingSchedule({
      startDateIso,
      customEvents,
      throughDate,
    }).find((meeting) => meeting.scheduledDay > currentDay)?.specificDate || ''
  }, [currentDay, customEvents, startDateIso])
  const managerPhoto = profile.managerImageUrl
    || profile.playerImageUrl
    || profile.imageUrl
    || profile.image_url
    || ''

  const president = BOARD_MEMBERS.find((member) => member.person_name === boardPresidentName) || BOARD_CHAIR
  const vicePresident = BOARD_MEMBERS.find((member) => member.person_name === boardVicePresidentName) || BOARD_VICE_CHAIR
  const chair = toBoardCard(president, styles.chairCard, t('dashboard.boardMeeting.boardPresident'))
  const viceChair = toBoardCard(vicePresident, styles.viceChairCard, t('dashboard.boardMeeting.boardVicePresident'))
  const supportingMembers = [
    ...BOARD_MEMBERS
      .filter((member) => member.person_name !== president.person_name && member.person_name !== vicePresident.person_name)
      .map((member) => toBoardCard(
        member,
        styles.supportingCard,
        ['Board Chair', 'Vice Chair'].includes(member.current_role)
          ? t('dashboard.board.membershipDirector')
          : member.current_role,
      )),
    {
      key: 'player-manager',
      name: profile.playerName,
      position: t('dashboard.hud.manager'),
      imageUrl: managerPhoto,
      className: styles.supportingCard,
    },
  ]

  return (
    <section className={styles.boardModule}>
      <header className={styles.boardHeader}>
        <div>
          <h3>{t('dashboard.modules.board.galleryTitle')}</h3>
          <p>{t('dashboard.modules.board.galleryDescription')}</p>
        </div>
        <span>{t('dashboard.modules.board.memberCount', { count: BOARD_MEMBERS.length })}</span>
      </header>

      <div className={styles.boardGallery}>
        <PortraitCard
          key={chair.key}
          {...chair}
          unavailableLabel={t('dashboard.modules.board.photoUnavailable')}
        />
        <div className={styles.boardSecondColumn}>
          <PortraitCard
            key={viceChair.key}
            {...viceChair}
            unavailableLabel={t('dashboard.modules.board.photoUnavailable')}
          />
          <div className={styles.supportingMembers}>
            {supportingMembers.map((member) => (
              <PortraitCard
                key={member.key}
                {...member}
                unavailableLabel={t('dashboard.modules.board.photoUnavailable')}
              />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.boardOperations}>
        <article className={styles.boardStatusCard}>
          <p>{t('dashboard.boardMeeting.relation')}</p>
          <strong>{boardState.relation}/100</strong>
          <div
            className={styles.relationTrack}
            role="meter"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={boardState.relation}
            aria-label={t('dashboard.boardMeeting.relation')}
          >
            <span style={{ width: `${boardState.relation}%` }} />
          </div>
          <small>
            {t('dashboard.boardMeeting.financeStreak', {
              count: boardState.consecutiveNegativeFinanceMonths,
            })}
          </small>
          {nextMeetingDate && (
            <small>
              {t('dashboard.boardMeeting.nextMeeting', {
                date: new Date(`${nextMeetingDate}T00:00:00`).toLocaleDateString(),
              })}
            </small>
          )}
        </article>

        <article className={styles.boardStatusCard}>
          <h4>{t('dashboard.boardMeeting.pendingMandates')}</h4>
          {boardState.pendingMandates.length === 0 ? (
            <p>{t('dashboard.boardMeeting.noPendingMandates')}</p>
          ) : (
            <ul>
              {boardState.pendingMandates.map((mandate) => (
                <li key={mandate.id}>
                  {mandate.type === 'eventRating'
                    ? t('dashboard.boardMeeting.mandates.eventRating', {
                        event: mandate.eventName,
                        rating: mandate.targetRating,
                      })
                    : mandate.type === 'wrestlerPush'
                      ? t('dashboard.boardMeeting.mandates.wrestlerPush', { name: mandate.employeeName })
                      : t('dashboard.boardMeeting.mandates.financialRecovery')}
                  <small>
                    {t('dashboard.boardMeeting.mandates.deadline', { day: mandate.deadlineDay })}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={styles.boardStatusCard}>
          <h4>{t('dashboard.boardMeeting.recentMeetings')}</h4>
          {boardState.meetingHistory.length === 0 ? (
            <p>{t('dashboard.boardMeeting.noMeetingHistory')}</p>
          ) : (
            <ul>
              {boardState.meetingHistory.slice(-3).reverse().map((meeting) => {
                const electionResult = meeting.decisions?.find((decision) => decision.electionResult)?.electionResult

                return (
                  <li key={meeting.meetingId}>
                    <span>
                      {t('dashboard.boardMeeting.meetingDay', { day: meeting.day })}
                      {' · '}
                      {t('dashboard.boardMeeting.meetingDecisions', {
                        count: meeting.decisions?.length || 0,
                      })}
                    </span>
                    <small>
                      {t('dashboard.boardMeeting.meetingNet', {
                        amount: `${meeting.financeReport?.operatingNet >= 0 ? '+' : '-'}$${Math.abs(Number(meeting.financeReport?.operatingNet) || 0).toLocaleString()}`,
                      })}
                    </small>
                    {electionResult && (
                      <small>
                        {t('dashboard.boardMeeting.electionWinners', {
                          president: electionResult.president.person_name,
                          vicePresident: electionResult.vicePresident.person_name,
                        })}
                      </small>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </article>
      </div>
    </section>
  )
}

export default BoardModule
