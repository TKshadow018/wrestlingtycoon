import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BOARD_MEMBERS } from '../../data/board'
import {
  getBoardDismissalChance,
  getRepeatedRejectionPenalty,
} from '../../utils/boardMeetingSystem'
import { getBoardMeetingImageUrl } from '../../utils/boardMeetingVisuals'
import styles from './BoardMeetingModal.module.scss'

const formatCash = (amount) => `$${Math.round(Number(amount) || 0).toLocaleString()}`
const getInitials = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('')

const getSeatClass = ({ member, boardPresidentName, boardVicePresidentName, otherSeatIndex }) => {
  if (member.person_name === boardPresidentName) return styles.seatPresident
  if (member.person_name === boardVicePresidentName) return styles.seatVicePresident

  return [
    styles.seatOtherOne,
    styles.seatOtherTwo,
    styles.seatOtherThree,
    styles.seatOtherFour,
    styles.seatOtherFive,
  ][otherSeatIndex]
}

const getMemberRole = ({ member, boardPresidentName, boardVicePresidentName, t }) => {
  if (member.person_name === boardPresidentName) {
    return t('dashboard.boardMeeting.boardPresident')
  }
  if (member.person_name === boardVicePresidentName) {
    return t('dashboard.boardMeeting.boardVicePresident')
  }
  if (member.current_role === 'Board Chair' || member.current_role === 'Vice Chair') {
    return t('dashboard.board.membershipDirector')
  }
  return member.current_role
}

function BoardroomSeat({ name, role, imageUrl, className, isPresenter = false, unavailableLabel }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initials = getInitials(name)

  return (
    <article
      className={[
        styles.boardroomSeat,
        className,
        isPresenter ? styles.seatPresenting : '',
      ].filter(Boolean).join(' ')}
      aria-current={isPresenter ? 'true' : undefined}
      aria-label={`${name}, ${role}${isPresenter ? `, ${unavailableLabel}` : ''}`}
    >
      <div className={styles.seatPortrait}>
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
        ) : (
          <span className={styles.seatInitials}>{initials || '?'}</span>
        )}
      </div>
      <div className={styles.seatName}>{name}</div>
      <div className={styles.seatRole}>{role}</div>
      {isPresenter && <span className={styles.speakingIndicator}>{unavailableLabel}</span>}
    </article>
  )
}

function BoardMeetingModal({
  meeting,
  relation,
  rejectionCounts = {},
  boardPresidentName,
  boardVicePresidentName,
  managerName,
  managerPhoto = '',
  cash,
  gameOverReason,
  onResolve,
  onAcknowledgeElectionResult,
  onFinish,
  onReset,
}) {
  const { t } = useTranslation()
  const [error, setError] = useState('')

  if (gameOverReason) {
    const reasonKey = gameOverReason === 'three-negative-finance-periods'
      ? 'dashboard.boardMeeting.gameOver.finance'
      : 'dashboard.boardMeeting.gameOver.relation'

    return (
      <section className={styles.backdrop}>
        <article className={styles.gameOverCard} role="dialog" aria-modal="true" aria-labelledby="board-game-over-title">
          <p className={styles.eyebrow}>{t('dashboard.boardMeeting.title')}</p>
          <h2 id="board-game-over-title">{t('dashboard.boardMeeting.gameOver.title')}</h2>
          <p>{t(reasonKey)}</p>
          <button type="button" onClick={onReset}>
            {t('dashboard.boardMeeting.gameOver.reset')}
          </button>
        </article>
      </section>
    )
  }

  if (!meeting) {
    return null
  }

  const agenda = meeting.agendas[meeting.currentAgendaIndex] || null
  const agendaNumber = Math.min(meeting.currentAgendaIndex + 1, meeting.agendas.length)
  const financeIsNegative = meeting.financeReport.operatingNet < 0
  const dismissalRisk = getBoardDismissalChance(relation)
  const relationSign = (delta) => (delta > 0 ? '+' : '')
  const presenter = agenda?.presenter || agenda?.proposer
  let directorIndex = 0

  const handleChoice = (agendaId, choiceId) => {
    setError('')
    const result = onResolve({ agendaId, choiceId })
    if (!result?.ok) {
      setError(t(`dashboard.boardMeeting.errors.${result?.reason || 'unknown'}`))
    }
  }

  const handleElectionVote = (candidateName) => {
    setError('')
    const result = onResolve({
      agendaId: agenda.id,
      choiceId: 'castBoardElectionVote',
      candidateId: candidateName,
    })
    if (!result?.ok) {
      setError(t(`dashboard.boardMeeting.errors.${result?.reason || 'unknown'}`))
    }
  }

  return (
    <section className={styles.backdrop}>
      <article className={styles.meetingCard} role="dialog" aria-modal="true" aria-labelledby="board-meeting-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t('dashboard.boardMeeting.title')}</p>
            <h2 id="board-meeting-title">{t('dashboard.boardMeeting.meetingTitle')}</h2>
          </div>
          <div className={styles.relationBadge}>
            <span>{t('dashboard.boardMeeting.relation')}</span>
            <strong>{relation}/100</strong>
            <small>{t('dashboard.boardMeeting.dismissalRisk', { percent: Math.round(dismissalRisk * 100) })}</small>
          </div>
        </header>

        <img
          className={styles.meetingPoster}
          src={getBoardMeetingImageUrl(meeting.isJanuary)}
          alt={meeting.isJanuary ? 'Annual Board Meeting election' : 'Board Meeting'}
        />

        <section className={`${styles.financeReport} ${financeIsNegative ? styles.financeNegative : ''}`}>
          <div>
            <span>{t('dashboard.boardMeeting.financeReport')}</span>
            <small>{t('dashboard.boardMeeting.periodDays', { count: meeting.financeReport.completedDays })}</small>
          </div>
          <div>
            <span>{t('dashboard.finances.lastIncome')}</span>
            <strong>{formatCash(meeting.financeReport.totalIncome)}</strong>
          </div>
          <div>
            <span>{t('dashboard.finances.lastExpenses')}</span>
            <strong>{formatCash(meeting.financeReport.totalExpenses)}</strong>
          </div>
          <div>
            <span>{t('dashboard.finances.projectedWeeklyNet')}</span>
            <strong className={financeIsNegative ? styles.negative : styles.positive}>
              {meeting.financeReport.operatingNet >= 0 ? '+' : '-'}
              {formatCash(Math.abs(meeting.financeReport.operatingNet))}
            </strong>
          </div>
          <div>
            <span>{t('dashboard.finances.cashOnHand')}</span>
            <strong>{formatCash(meeting.financeReport.cashOnHand)}</strong>
          </div>
          {financeIsNegative && (
            <p className={styles.pressureMessage}>
              {t('dashboard.boardMeeting.negativeMonths', { count: meeting.negativeFinanceMonths })}
            </p>
          )}
        </section>

        <section
          className={styles.boardroom}
          aria-label={t('dashboard.boardMeeting.boardroomTitle')}
        >
          <div className={styles.boardroomTable}>
            <span>{t('dashboard.boardMeeting.boardroomTable')}</span>
            <small>{t('dashboard.boardMeeting.boardroomSubtitle')}</small>
          </div>
          {BOARD_MEMBERS.map((member) => {
            const isExecutiveSeat = member.person_name === boardPresidentName
              || member.person_name === boardVicePresidentName
            const otherSeatIndex = isExecutiveSeat ? -1 : directorIndex++
            const memberIsPresenter = member.person_name === presenter?.person_name
            const seatClass = getSeatClass({
              member,
              boardPresidentName,
              boardVicePresidentName,
              otherSeatIndex,
            })
            const isTopSeat = member.person_name === boardPresidentName
              || otherSeatIndex === 0
              || otherSeatIndex === 1
            const isSideSeat = otherSeatIndex === 2

            return (
              <BoardroomSeat
                key={member.person_name}
                name={member.person_name}
                role={getMemberRole({
                  member,
                  boardPresidentName,
                  boardVicePresidentName,
                  t,
                })}
                imageUrl={member.image_url}
                className={[
                  seatClass,
                  memberIsPresenter && isTopSeat ? styles.presentingFromTop : '',
                  memberIsPresenter && isSideSeat ? styles.presentingFromSide : '',
                  memberIsPresenter && !isTopSeat && !isSideSeat ? styles.presentingFromBottom : '',
                ].filter(Boolean).join(' ')}
                isPresenter={memberIsPresenter}
                unavailableLabel={t('dashboard.boardMeeting.speakingNow')}
              />
            )
          })}
          <BoardroomSeat
            name={managerName}
            role={t('dashboard.hud.manager')}
            imageUrl={managerPhoto}
            className={styles.seatManager}
            unavailableLabel={t('dashboard.modules.board.photoUnavailable')}
          />
        </section>

        {meeting.decisions.length > 0 && (
          <section className={styles.lastDecision} role="status">
            <strong>{t(meeting.decisions[meeting.decisions.length - 1].agendaTitleKey)}</strong>
            <span>{t(`dashboard.boardMeeting.${meeting.decisions[meeting.decisions.length - 1].effectMessageKey}`)}</span>
            {meeting.decisions[meeting.decisions.length - 1].electionResult && (
              <span className={styles.electionWinnerLine}>
                {t('dashboard.boardMeeting.electionWinners', {
                  president: meeting.decisions[meeting.decisions.length - 1].electionResult.president.person_name,
                  vicePresident: meeting.decisions[meeting.decisions.length - 1].electionResult.vicePresident.person_name,
                })}
              </span>
            )}
            <span className={meeting.decisions[meeting.decisions.length - 1].relationDelta >= 0 ? styles.positive : styles.negative}>
              {t('dashboard.boardMeeting.relationChange', {
                value: `${relationSign(meeting.decisions[meeting.decisions.length - 1].relationDelta)}${meeting.decisions[meeting.decisions.length - 1].relationDelta}`,
              })}
            </span>
          </section>
        )}

        {agenda && meeting.status === 'electionResult' ? (
          <section className={styles.electionResultPanel} aria-live="polite">
            <p className={styles.eyebrow}>{t('dashboard.boardMeeting.electionResultTitle')}</p>
            <h3>
              {t('dashboard.boardMeeting.electionWinners', {
                president: meeting.decisions.at(-1).electionResult.president.person_name,
                vicePresident: meeting.decisions.at(-1).electionResult.vicePresident.person_name,
              })}
            </h3>
            <p className={styles.electionTieNote}>{t('dashboard.boardMeeting.electionTieBreak')}</p>
            <div className={styles.electionResultTable}>
              <div className={styles.electionResultHeader}>
                <span>{t('dashboard.boardMeeting.electionCandidateColumn')}</span>
                <span>{t('dashboard.boardMeeting.electionVotesColumn')}</span>
                <span>{t('dashboard.boardMeeting.electionSharesColumn')}</span>
                <span>{t('dashboard.boardMeeting.electionResultColumn')}</span>
              </div>
              {meeting.decisions.at(-1).electionResult.rankedCandidates.map((candidate, index) => (
                <div key={candidate.candidateId} className={styles.electionResultRow}>
                  <span>{candidate.person_name}</span>
                  <strong>{candidate.votes}</strong>
                  <span>{candidate.company_shareholder_percentage}%</span>
                  <strong className={index === 0 || index === 1 ? styles.electionWinner : ''}>
                    {index === 0
                      ? t('dashboard.boardMeeting.boardPresident')
                      : index === 1
                        ? t('dashboard.boardMeeting.boardVicePresident')
                        : t('dashboard.boardMeeting.electionNotElected')}
                  </strong>
                </div>
              ))}
            </div>
            <button
              className={styles.electionContinue}
              type="button"
              onClick={onAcknowledgeElectionResult}
            >
              {t('dashboard.boardMeeting.continueAfterElection')}
            </button>
          </section>
        ) : agenda ? (
          <section className={styles.agenda}>
            <div
              key={`${agenda.id}-${presenter?.person_name || 'board'}`}
              className={styles.presenterSpotlight}
            >
              <div className={styles.presenterPhoto}>
                {presenter?.image_url ? (
                  <img src={presenter.image_url} alt="" />
                ) : (
                  <span>{getInitials(presenter?.person_name)}</span>
                )}
              </div>
              <div className={styles.presenterCopy}>
                <p className={styles.eyebrow}>{t('dashboard.boardMeeting.speakingNow')}</p>
                <h3>{presenter?.person_name || t('dashboard.boardMeeting.theBoard')}</h3>
                <p>{presenter
                  ? getMemberRole({
                      member: presenter,
                      boardPresidentName,
                      boardVicePresidentName,
                      t,
                    })
                  : ''}</p>
              </div>
              <div className={styles.presenterAgenda}>
                <p className={styles.eyebrow}>
                  {t('dashboard.boardMeeting.agendaCount', {
                    current: agendaNumber,
                    total: meeting.agendas.length,
                  })}
                </p>
                <h4>{t(agenda.titleKey)}</h4>
              </div>
            </div>
            <div className={styles.agendaHeader}>
              <div>
                <p className={styles.agendaDescription}>{t(agenda.descriptionKey)}</p>
              </div>
            </div>
            {agenda.context?.sponsorOffer && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.sponsor', {
                  name: agenda.context.sponsorOffer.name,
                  bonus: formatCash(agenda.context.sponsorOffer.signingBonus),
                  daily: formatCash(agenda.context.sponsorOffer.dailyPayout),
                })}
              </p>
            )}
            {agenda.context?.activeSponsors?.length > 0 && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.activeSponsors', {
                  names: agenda.context.activeSponsors
                    .map((sponsor) => `${sponsor.name} (${t('dashboard.boardMeeting.sponsorTrust', { trust: sponsor.trust })})`)
                    .join(', '),
                })}
              </p>
            )}
            {agenda.context?.sponsorToReview && !agenda.context?.sponsorOffer && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.sponsorPerformance', {
                  name: agenda.context.sponsorToReview.name,
                  trust: agenda.context.sponsorToReview.trust,
                })}
              </p>
            )}
            {agenda.context?.titleChange && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.champion', {
                  title: agenda.context.titleChange.titleName,
                  wrestler: agenda.context.titleChange.targetName,
                })}
              </p>
            )}
            {agenda.context?.wrestlerPush && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.push', { name: agenda.context.wrestlerPush.name })}
              </p>
            )}
            {agenda.context?.upcomingEvent && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.event', { name: agenda.context.upcomingEvent.name })}
              </p>
            )}
            {agenda.context?.lastOutcome && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.lastEvent', {
                  name: agenda.context.lastOutcome.eventName,
                  rating: agenda.context.lastOutcome.overallRating ?? t('dashboard.boardMeeting.notRated'),
                })}
              </p>
            )}
            {agenda.context?.targetRating && (
              <p className={styles.contextLine}>
                {t('dashboard.boardMeeting.context.rating', { rating: agenda.context.targetRating })}
              </p>
            )}

            <div className={styles.choices}>
              {agenda.id === 'boardElection' ? (
                <div className={styles.electionPanel}>
                  <p>{t('dashboard.boardMeeting.electionInstructions')}</p>
                  <div className={styles.electionCandidates}>
                    {agenda.context.candidates.map((candidate) => (
                      <button
                        key={candidate.person_name}
                        type="button"
                        onClick={() => handleElectionVote(candidate.person_name)}
                      >
                        <span className={styles.electionCandidatePhoto}>
                          {candidate.image_url ? (
                            <img src={candidate.image_url} alt="" />
                          ) : (
                            getInitials(candidate.person_name)
                          )}
                        </span>
                        <span className={styles.electionCandidateInfo}>
                          <strong>{candidate.person_name}</strong>
                          <small>{getMemberRole({
                            member: candidate,
                            boardPresidentName,
                            boardVicePresidentName,
                            t,
                          })}</small>
                          <small>{t('dashboard.boardMeeting.ownershipVotes', {
                            share: candidate.company_shareholder_percentage,
                          })}</small>
                        </span>
                        <span className={styles.ballotLabel}>{t('dashboard.boardMeeting.castVote')}</span>
                      </button>
                    ))}
                  </div>
                  {error && <p className={styles.errorMessage} role="alert">{error}</p>}
                </div>
              ) : agenda.choices.map((choice) => {
                const unaffordable = Number(choice.cashCost || 0) > cash
                const proposerName = agenda.proposer?.person_name
                const relationDelta = Number(choice.relationDelta || 0)
                  - (choice.isRejection
                    ? getRepeatedRejectionPenalty(rejectionCounts[proposerName])
                    : 0)
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={unaffordable}
                    onClick={() => handleChoice(agenda.id, choice.id)}
                  >
                    <strong>{t(choice.labelKey)}</strong>
                    <span>{t(choice.descriptionKey)}</span>
                    <small>
                      {t('dashboard.boardMeeting.relationChange', {
                        value: `${relationSign(relationDelta)}${relationDelta}`,
                      })}
                      {choice.cashCost > 0
                        ? ` | ${t('dashboard.boardMeeting.cost', { amount: formatCash(choice.cashCost) })}`
                        : ''}
                      {choice.requiresVote ? ` | ${t('dashboard.boardMeeting.voteRequired')}` : ''}
                    </small>
                  </button>
                )
              })}
            </div>
            {error && <p className={styles.errorMessage} role="alert">{error}</p>}
          </section>
        ) : (
          <section className={styles.meetingComplete}>
            <h3>{t('dashboard.boardMeeting.meetingComplete')}</h3>
            <p>{t('dashboard.boardMeeting.decisionsRecorded', { count: meeting.decisions.length })}</p>
            {meeting.decisions.map((decision, index) => (
              <div key={`${decision.agendaId}-${index}`} className={styles.decisionRow}>
                <span>{t(decision.agendaTitleKey)}</span>
                <strong className={decision.relationDelta >= 0 ? styles.positive : styles.negative}>
                  {relationSign(decision.relationDelta)}{decision.relationDelta}
                </strong>
                {decision.voteResult && (
                  <>
                    <small>
                      {t('dashboard.boardMeeting.voteResult', {
                        percent: Math.round(decision.voteResult.supportPercent),
                      })}
                    </small>
                    <div className={styles.voteDetails}>
                      {BOARD_MEMBERS.map((member) => (
                        <span key={member.person_name}>
                          {member.person_name} ({member.company_shareholder_percentage}%):{' '}
                          {decision.voteResult.votes[member.person_name]
                            ? t('dashboard.boardMeeting.voteYes')
                            : t('dashboard.boardMeeting.voteNo')}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {decision.electionResult && (
                  <div className={styles.electionOutcome}>
                    <strong>
                      {t('dashboard.boardMeeting.electionWinners', {
                        president: decision.electionResult.president.person_name,
                        vicePresident: decision.electionResult.vicePresident.person_name,
                      })}
                    </strong>
                    {decision.electionResult.rankedCandidates.map((candidate) => (
                      <small key={candidate.candidateId}>
                        {candidate.person_name}: {t('dashboard.boardMeeting.voteCount', {
                          count: candidate.votes,
                        })}
                        {' · '}
                        {t('dashboard.boardMeeting.ownershipVotes', {
                          share: candidate.company_shareholder_percentage,
                        })}
                      </small>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={onFinish}>
              {t('dashboard.boardMeeting.finishMeeting')}
            </button>
          </section>
        )}
      </article>
    </section>
  )
}

export default BoardMeetingModal
