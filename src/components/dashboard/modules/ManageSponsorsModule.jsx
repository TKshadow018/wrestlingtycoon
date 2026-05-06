import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import { SPONSOR_TYPE_CONFIG, SPONSOR_TYPE_ORDER } from '../../../data/sponsorOffers'
import styles from './ManageSponsorsModule.module.scss'

const SPONSORABLE_EVENT_TYPES = ['ppv', 'megaLive', 'oneTime']

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
  const rerollSponsorOffers = useGameStore((state) => state.rerollSponsorOffers)
  const signSponsor = useGameStore((state) => state.signSponsor)
  const currentDay = useGameStore((state) => state.calendar.day)
  const lastRerolledDay = useGameStore((state) => state.market.sponsorOffersLastRerolledDay)
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
                    <p>
                      {t('dashboard.sponsors.contractLength', {
                        value: config.eventScoped
                          ? t('dashboard.sponsors.contractEvent')
                          : t('dashboard.sponsors.contractWeeks', { weeks: offer.contractWeeks }),
                      })}
                    </p>
                    <button
                      type="button"
                      disabled={isTypeFull || eventNeedsBooking || eventTypeNotEligible}
                      onClick={() => signSponsor(offer.offerId)}
                    >
                      {t('dashboard.sponsors.sign')}
                    </button>
                    {isTypeFull ? <p className={styles.hint}>{t('dashboard.sponsors.slotFull')}</p> : null}
                    {eventNeedsBooking ? <p className={styles.hint}>{t('dashboard.sponsors.eventBookingRequired')}</p> : null}
                    {eventTypeNotEligible ? <p className={styles.hint}>{t('dashboard.sponsors.eventTypeNotEligible')}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>{t('dashboard.sponsors.noOffersForType')}</p>
            )}
          </section>
        )
      })}
    </section>
  )
}

export default ManageSponsorsModule
