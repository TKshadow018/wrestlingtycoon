const makeChoice = ({
  id,
  relationDelta,
  effect,
  requiresVote = false,
  supportChance = 0.5,
  cashCost = 0,
}) => ({
  id,
  labelKey: `dashboard.boardMeeting.choices.${id}.label`,
  descriptionKey: `dashboard.boardMeeting.choices.${id}.description`,
  relationDelta,
  effect,
  requiresVote,
  isRejection: id.startsWith('reject')
    || id.startsWith('decline')
    || ['protectEventBudget', 'deferMarketingInvestment', 'holdCurrentStrategy', 'cancelBoardMandates'].includes(id),
  supportChance,
  cashCost,
})

const makeAgenda = ({ id, weight, proposer, context = {}, choices }) => ({
  id,
  weight,
  titleKey: `dashboard.boardMeeting.agendas.${id}.title`,
  descriptionKey: `dashboard.boardMeeting.agendas.${id}.description`,
  proposer,
  context,
  choices,
})

export const buildBoardMeetingAgendaPool = ({
  financialIsNegative,
  isJanuary = false,
  financialReport,
  boardMembers,
  sponsorOffer,
  activeSponsors = [],
  sponsorToReview = null,
  upcomingEvent,
  lastOutcome,
  titleChange,
  wrestlerPush,
  pendingMandates = [],
}) => {
  const boardChair = boardMembers.find((member) => member.current_role === 'Board Chair') || boardMembers[0]
  const viceChair = boardMembers.find((member) => member.current_role === 'Vice Chair') || boardChair
  const auditChair = boardMembers.find((member) => member.current_role === 'Audit Committee Chair') || boardChair
  const compensationChair = boardMembers.find((member) => member.current_role === 'Compensation Committee Chair') || boardChair
  const director = boardMembers.find((member) => member.current_role === 'Director') || boardChair
  const agendaPool = []

  if (isJanuary) {
    agendaPool.push(makeAgenda({
      id: 'boardElection',
      weight: 5,
      proposer: viceChair,
      context: {
        candidates: boardMembers.filter((member) => member.current_role !== 'General Manager'),
      },
      choices: [
        makeChoice({
          id: 'castBoardElectionVote',
          relationDelta: 0,
          effect: 'boardElectionVote',
        }),
      ],
    }))
  }

  if (financialIsNegative) {
    agendaPool.push(makeAgenda({
      id: 'financialReview',
      weight: 1,
      proposer: auditChair,
      context: { financialReport },
      choices: [
        makeChoice({ id: 'presentRecoveryPlan', relationDelta: 2, effect: 'financialRecovery' }),
        makeChoice({
          id: 'enactCostControls',
          relationDelta: 3,
          effect: 'costControls',
          requiresVote: true,
          supportChance: 0.72,
        }),
        makeChoice({ id: 'rejectPressure', relationDelta: -8, effect: 'rejectPressure' }),
      ],
    }))
  }

  if (sponsorOffer || sponsorToReview) {
    const sponsorChoices = sponsorOffer
      ? [
          makeChoice({
            id: 'acceptSponsorProposal',
            relationDelta: 5,
            effect: 'signSponsor',
            requiresVote: true,
            supportChance: 0.68,
          }),
          makeChoice({ id: 'rejectSponsorProposal', relationDelta: -5, effect: 'rejectSponsor' }),
        ]
      : [
          makeChoice({ id: 'maintainSponsorPortfolio', relationDelta: 2, effect: 'maintainSponsors' }),
          makeChoice({ id: 'releaseUnderperformingSponsor', relationDelta: -3, effect: 'releaseSponsor' }),
        ]

    agendaPool.push(makeAgenda({
      id: 'sponsorReview',
      weight: 3,
      proposer: director,
      context: { sponsorOffer, activeSponsors, sponsorToReview },
      choices: sponsorChoices,
    }))
  }

  if (upcomingEvent || lastOutcome) {
    agendaPool.push(makeAgenda({
      id: 'eventReview',
      weight: 3,
      proposer: viceChair,
      context: { upcomingEvent, lastOutcome },
      choices: [
        makeChoice({
          id: 'investInEvent',
          relationDelta: 3,
          effect: 'eventInvestment',
          requiresVote: true,
          supportChance: 0.58,
          cashCost: 5000,
        }),
        makeChoice({ id: 'protectEventBudget', relationDelta: 1, effect: 'protectEventBudget' }),
      ],
    }))
  }

  if (titleChange) {
    agendaPool.push(makeAgenda({
      id: 'championChange',
      weight: 2,
      proposer: viceChair,
      context: { titleChange },
      choices: [
        makeChoice({
          id: 'approveChampionChange',
          relationDelta: 4,
          effect: 'championChange',
          requiresVote: true,
          supportChance: 0.55,
        }),
        makeChoice({ id: 'rejectChampionChange', relationDelta: -6, effect: 'rejectChampionChange' }),
      ],
    }))
  }

  if (wrestlerPush) {
    agendaPool.push(makeAgenda({
      id: 'wrestlerPush',
      weight: 2,
      proposer: compensationChair,
      context: { wrestlerPush },
      choices: [
        makeChoice({ id: 'acceptWrestlerPush', relationDelta: 3, effect: 'wrestlerPush' }),
        makeChoice({ id: 'declineWrestlerPush', relationDelta: -5, effect: 'declineWrestlerPush' }),
      ],
    }))
  }

  if (upcomingEvent) {
    agendaPool.push(makeAgenda({
      id: 'eventRatingTarget',
      weight: 2,
      proposer: boardChair,
      context: {
        upcomingEvent,
        targetRating: Number(lastOutcome?.overallRating) >= 8 ? 8.5 : 7.5,
      },
      choices: [
        makeChoice({
          id: 'acceptEventRatingTarget',
          relationDelta: 3,
          effect: 'eventRatingMandate',
          requiresVote: true,
          supportChance: 0.62,
        }),
        makeChoice({ id: 'declineEventRatingTarget', relationDelta: -4, effect: 'declineEventRatingTarget' }),
      ],
    }))
  }

  if (pendingMandates.length > 0) {
    agendaPool.push(makeAgenda({
      id: 'mandateReview',
      weight: 2,
      proposer: viceChair,
      context: { pendingMandates },
      choices: [
        makeChoice({ id: 'reaffirmBoardMandates', relationDelta: 2, effect: 'reaffirmMandates' }),
        makeChoice({ id: 'extendBoardMandates', relationDelta: -1, effect: 'extendMandates' }),
        makeChoice({ id: 'cancelBoardMandates', relationDelta: -6, effect: 'cancelMandates' }),
      ],
    }))
  }

  agendaPool.push(
    makeAgenda({
      id: 'investmentProposal',
      weight: 2,
      proposer: boardChair,
      choices: [
        makeChoice({
          id: 'approveMarketingInvestment',
          relationDelta: 4,
          effect: 'marketingInvestment',
          requiresVote: true,
          supportChance: 0.52,
          cashCost: 10000,
        }),
        makeChoice({ id: 'deferMarketingInvestment', relationDelta: -1, effect: 'deferInvestment' }),
      ],
    }),
    makeAgenda({
      id: 'competitorResponse',
      weight: 1,
      proposer: director,
      choices: [
        makeChoice({
          id: 'counterCompetitorPromotion',
          relationDelta: 2,
          effect: 'competitorResponse',
          requiresVote: true,
          supportChance: 0.5,
          cashCost: 5000,
        }),
        makeChoice({ id: 'holdCurrentStrategy', relationDelta: -1, effect: 'holdStrategy' }),
      ],
    }),
    makeAgenda({
      id: 'promotionStrategy',
      weight: 1,
      proposer: viceChair,
      choices: [
        makeChoice({ id: 'commitToLongTermGrowth', relationDelta: 2, effect: 'longTermGrowth' }),
        makeChoice({ id: 'keepCurrentDirection', relationDelta: 1, effect: 'maintainDirection' }),
      ],
    }),
  )

  return agendaPool
}
