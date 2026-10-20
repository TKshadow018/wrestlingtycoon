import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import { SPONSOR_TYPE_CONFIG, SPONSOR_TYPE_ORDER } from '../../../data/sponsorOffers'
import styles from './ManageSponsorsModule.module.scss'

const SPONSORABLE_EVENT_TYPES = ['ppv', 'megaLive', 'oneTime']
const HIGH_TIER_SPONSOR_MIN_TIER = 6
const HIGH_TIER_BRAND_SAFETY_MIN = 60
const HIGH_TIER_FAMILY_SHARE_MIN = 18

const getEventSponsorProfile = (eventOutcome) => {
  if (!eventOutcome) {
    return {
      brandSafetyScore: 0,
      familyShare: 0,
    }
  }

  const segments = Array.isArray(eventOutcome?.segments) ? eventOutcome.segments.filter((segment) => !segment.cancelled) : []
  const audienceSegments = Array.isArray(eventOutcome?.audienceSegments) ? eventOutcome.audienceSegments : []
  const totalSegments = Math.max(1, segments.length)
  const violentSegments = segments.filter((segment) => (
    segment?.segmentType === 'match' || segment?.segmentType === 'mainEvent' || segment?.segmentType === 'titleMatch'
  )).length
  const promoSegments = segments.filter((segment) => (
    segment?.segmentType === 'promo' || segment?.segmentType === 'interview'
  )).length
  const familySegment = audienceSegments.find((segment) => segment?.key === 'family') || null
  const familyShare = Number(familySegment?.sharePercent || 0)
  const overallRating = Number(eventOutcome?.overallRating || 0)
  const risk = Number(eventOutcome?.risk || 0)
  const violentRatio = violentSegments / totalSegments
  const promoRatio = promoSegments / totalSegments
  const scandalScore = Math.max(0, risk - 22) + Math.max(0, 7 - overallRating) * 6

  const brandSafetyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(64 + familyShare * 0.9 + promoRatio * 16 - violentRatio * 22 - scandalScore * 0.45),
    ),
  )

  return {
    familyShare,
    brandSafetyScore,
  }
}

const getOfferRestrictionReason = ({ offer, lastOutcome }) => {
  if (Number(offer?.tier || 1) < HIGH_TIER_SPONSOR_MIN_TIER) {
    return null
  }

  if (!lastOutcome) {
    return 'needsTrackRecord'
  }

  const profile = getEventSponsorProfile(lastOutcome)
  if (profile.brandSafetyScore < HIGH_TIER_BRAND_SAFETY_MIN) {
    return 'brandSafety'
  }

  if (profile.familyShare < HIGH_TIER_FAMILY_SHARE_MIN) {
    return 'familyAudience'
  }

  return null
}

const getTrustToneKey = (trust) => {
  const value = Number(trust || 0)
  if (value >= 80) return 'excellent'
  if (value >= 65) return 'strong'
  if (value >= 45) return 'neutral'
  if (value >= 25) return 'fragile'
  return 'critical'
}

const formatDuration = (sponsor, t) => {
  if (sponsor.eventScoped) {
    return t('dashboard.sponsors.contractEvent')
  }

  const remainingDays = Math.max(0, sponsor.remainingDays || 0)
  const remainingWeeks = Math.ceil(remainingDays / 7)

  if (remainingWeeks >= 52) {
    const years = (remainingWeeks / 52).toFixed(1)
    return t('dashboard.sponsors.contractYears', { years })
  }

  return t('dashboard.sponsors.contractWeeks', { weeks: remainingWeeks })
}

function ManageSponsorsModule() {
  const { t } = useTranslation()
  const offers = useGameStore((state) => state.market.sponsorOffers)
  const sponsors = useGameStore((state) => state.roster.sponsors)
  const bookedEvent = useGameStore((state) => state.events.bookedEvent)
  const lastOutcome = useGameStore((state) => state.events.lastOutcome)
  const rerollSponsorOffers = useGameStore((state) => state.rerollSponsorOffers)
  const signSponsor = useGameStore((state) => state.signSponsor)
  const currentDay = useGameStore((state) => state.calendar.day)
  const lastRerolledDay = useGameStore((state) => state.market.sponsorOffersLastRerolledDay)
  const [signFeedback, setSignFeedback] = useState('')
  const rerollCooldownDays = lastRerolledDay === null ? 0 : Math.max(0, 7 - (currentDay - lastRerolledDay))
  const canReroll = rerollCooldownDays === 0

  const sponsorsByType = SPONSOR_TYPE_ORDER.reduce((acc, type) => {
    acc[type] = sponsors.filter((sponsor) => sponsor.sponsorType === type)
    return acc
  }, {})

  const offersByType = SPONSOR_TYPE_ORDER.reduce((acc, type) => {
    acc[type] = offers.filter((offer) => offer.sponsorType === type)
    return acc
  }, {})

  return (
    <section className={styles.moduleBody}>
      <header className={styles.headerRow}>
        <p>{t('dashboard.sponsors.activeCount', { count: sponsors.length })}</p>
        <button type="button" onClick={rerollSponsorOffers} disabled={!canReroll}>
          {canReroll
            ? t('dashboard.sponsors.refreshOffers')
            : t('dashboard.sponsors.refreshCooldown', { days: rerollCooldownDays })}
        </button>
      </header>

      {SPONSOR_TYPE_ORDER.map((type) => {
        const config = SPONSOR_TYPE_CONFIG[type]
        const typeSponsors = sponsorsByType[type] || []
        const typeOffers = offersByType[type] || []
        const isTypeFull = typeSponsors.length >= config.maxActive
        const eventNeedsBooking = config.eventScoped && !bookedEvent
        const eventTypeNotEligible =
          config.eventScoped && bookedEvent && !SPONSORABLE_EVENT_TYPES.includes(bookedEvent.type)

        return (
          <section key={`sponsor-section-${type}`} className={styles.typeSection}>
            <header className={styles.typeHeader}>
              <h4>{t(`dashboard.sponsors.types.${config.labelKey}`)}</h4>
              <p>{t('dashboard.sponsors.slotUsage', { current: typeSponsors.length, max: config.maxActive })}</p>
            </header>

            {typeSponsors.length > 0 ? (
              <div className={styles.activeList}>
                {typeSponsors.map((sponsor) => (
                  <article key={`active-${sponsor.offerId}`} className={styles.activeCard}>
                    <h5>{sponsor.name}</h5>
                    <p>{t('dashboard.sponsors.dailyPayout', { amount: sponsor.dailyPayout.toLocaleString() })}</p>
                    <p>{t('dashboard.sponsors.eventBoost', { percent: Math.round(sponsor.eventMultiplier * 100) })}</p>
                    <p>{t('dashboard.sponsors.trust', { value: Number(sponsor.trust ?? sponsor.reputation ?? 55) })}</p>
                    <p>{t('dashboard.sponsors.relationship', { value: t(`dashboard.sponsors.relationshipLevels.${getTrustToneKey(sponsor.trust ?? sponsor.reputation ?? 55)}`) })}</p>
                    <p>{t('dashboard.sponsors.contractLength', { value: formatDuration(sponsor, t) })}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>{t('dashboard.sponsors.emptyType')}</p>
            )}

            {typeOffers.length > 0 ? (
              <div className={styles.offerGrid}>
                {typeOffers.map((offer) => (
                  <article key={offer.offerId} className={styles.offerCard}>
                    <h5>{offer.name}</h5>
                    <p>{t('dashboard.sponsors.tier', { tier: offer.tier })}</p>
                    <p>{t('dashboard.sponsors.signingBonus', { amount: offer.signingBonus.toLocaleString() })}</p>
                    <p>{t('dashboard.sponsors.dailyPayout', { amount: offer.dailyPayout.toLocaleString() })}</p>
                    <p>{t('dashboard.sponsors.eventBoost', { percent: Math.round(offer.eventMultiplier * 100) })}</p>
                    <p>{t('dashboard.sponsors.baseTrust', { value: Number(offer.trust ?? offer.reputation ?? 55) })}</p>
                    <p>
                      {t('dashboard.sponsors.contractLength', {
                        value: config.eventScoped
                          ? t('dashboard.sponsors.contractEvent')
                          : t('dashboard.sponsors.contractWeeks', { weeks: offer.contractWeeks }),
                      })}
                    </p>
                    <button
                      type="button"
                      disabled={isTypeFull || eventNeedsBooking || eventTypeNotEligible || Boolean(getOfferRestrictionReason({ offer, lastOutcome }))}
                      onClick={() => {
                        const result = signSponsor(offer.offerId)
                        if (result?.ok) {
                          setSignFeedback('')
                          return
                        }
                        setSignFeedback(result?.reason || 'signFailed')
                      }}
                    >
                      {t('dashboard.sponsors.sign')}
                    </button>
                    {isTypeFull ? <p className={styles.hint}>{t('dashboard.sponsors.slotFull')}</p> : null}
                    {eventNeedsBooking ? <p className={styles.hint}>{t('dashboard.sponsors.eventBookingRequired')}</p> : null}
                    {eventTypeNotEligible ? <p className={styles.hint}>{t('dashboard.sponsors.eventTypeNotEligible')}</p> : null}
                    {getOfferRestrictionReason({ offer, lastOutcome }) === 'needsTrackRecord'
                      ? <p className={styles.hint}>{t('dashboard.sponsors.highTierNeedsTrackRecord')}</p>
                      : null}
                    {getOfferRestrictionReason({ offer, lastOutcome }) === 'brandSafety'
                      ? <p className={styles.hint}>{t('dashboard.sponsors.highTierNeedsBrandSafety')}</p>
                      : null}
                    {getOfferRestrictionReason({ offer, lastOutcome }) === 'familyAudience'
                      ? <p className={styles.hint}>{t('dashboard.sponsors.highTierNeedsFamilyAudience')}</p>
                      : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>{t('dashboard.sponsors.noOffersForType')}</p>
            )}
          </section>
        )
      })}
      {signFeedback ? <p className={styles.hint}>{t(`dashboard.sponsors.signErrors.${signFeedback}`)}</p> : null}
    </section>
  )
}

export default ManageSponsorsModule
