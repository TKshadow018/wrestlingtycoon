import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_CAREER_ARC_UNLOCKS,
  getUnlockedCareerArcItems,
} from '../../data/careerArcUnlocks'
import styles from './EventPreparationScreen.module.scss'

const FEMALE_FALLBACK = '/people/girl.png'
const MALE_FALLBACK = '/people/boy.png'
const getFallback = (gender) => (gender === 'female' ? FEMALE_FALLBACK : MALE_FALLBACK)

function WrestlerCard({ employee, selected, onToggle, rank, isChampion }) {
  return (
    <button
      type="button"
      className={`${styles.wrestlerCard} ${selected ? styles.wrestlerCardSelected : ''}`}
      onClick={() => onToggle(employee.employeeId)}
    >
      <div className={styles.wrestlerAvatarWrap}>
        <img
          src={employee.imageUrl || getFallback(employee.gender)}
          alt={employee.name}
          className={styles.wrestlerAvatar}
          onError={(e) => {
            if (!e.currentTarget.dataset.fb) {
              e.currentTarget.dataset.fb = '1'
              e.currentTarget.src = getFallback(employee.gender)
            }
          }}
        />
        {rank !== undefined && rank < 5 && (
          <span className={styles.rankBadge}>#{rank + 1}</span>
        )}
        {isChampion && <span className={styles.championBadge}>🏆</span>}
        {selected && <span className={styles.selectedBadge}>✓</span>}
      </div>
      <span className={styles.wrestlerName}>{employee.name}</span>
      <span className={styles.wrestlerPop}>{employee.popularity ?? 0}</span>
    </button>
  )
}

function EventPreparationScreen({
  event,
  employees,
  titles,
  sponsors,
  ticketFees,
  eventPreparation,
  unlocks,
  modVenues = [],
  onSave,
  onCancel,
}) {
  const { t } = useTranslation()
  const eventType = event?.type || 'ppv'
  const unlockedVenues = getUnlockedCareerArcItems('venues', unlocks)
  const unlockedPromoStyles = getUnlockedCareerArcItems('promoStyles', unlocks)
  const unlockedPresentations = getUnlockedCareerArcItems('presentations', unlocks)
  const availableVenues = [
    ...unlockedVenues,
    ...(Array.isArray(modVenues) ? modVenues : []),
  ].filter((venue, index, venues) => (
    venues.findIndex((candidate) => candidate.id === venue.id) === index
  ))
  const initialVenueId = availableVenues.some((venue) => venue.id === eventPreparation?.venueId)
    ? eventPreparation.venueId
    : ''
  const initialPromoStyleId = unlockedPromoStyles.some((style) => style.id === eventPreparation?.promoStyleId)
    ? eventPreparation.promoStyleId
    : DEFAULT_CAREER_ARC_UNLOCKS.promoStyles[0]
  const initialPresentationId = unlockedPresentations.some((presentation) => presentation.id === eventPreparation?.presentationId)
    ? eventPreparation.presentationId
    : DEFAULT_CAREER_ARC_UNLOCKS.presentations[0]

  const [selectedVenueId, setSelectedVenueId] = useState(initialVenueId)
  const [selectedPromoStyleId, setSelectedPromoStyleId] = useState(initialPromoStyleId)
  const [selectedPresentationId, setSelectedPresentationId] = useState(initialPresentationId)
  const [promotedWrestlerIds, setPromotedWrestlerIds] = useState(
    Array.isArray(eventPreparation?.promotedWrestlerIds) ? eventPreparation.promotedWrestlerIds : [],
  )
  const [ticketPrice, setTicketPrice] = useState(String(ticketFees?.[eventType] ?? ''))
  const [ticketError, setTicketError] = useState('')
  const [venueSearch, setVenueSearch] = useState('')

  const wrestlers = employees.filter((e) => e.role === 'wrestler')

  const titleHolderIds = new Set(
    (titles || [])
      .filter((t) => t.isActive !== false)
      .flatMap((t) =>
        t.division === 'doubles'
          ? (Array.isArray(t.holderEmployeeIds) ? t.holderEmployeeIds : [])
          : (t.holderEmployeeId ? [t.holderEmployeeId] : []),
      ),
  )

  const sortedWrestlers = [...wrestlers].sort(
    (a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0),
  )
  const top5Ids = new Set(sortedWrestlers.slice(0, 5).map((e) => e.employeeId))

  const filteredVenues = availableVenues.filter(
    (v) =>
      !venueSearch ||
      v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
      v.location.toLowerCase().includes(venueSearch.toLowerCase()),
  )

  const selectedVenue = availableVenues.find((v) => v.id === selectedVenueId)
  const selectedPromoStyle = unlockedPromoStyles.find((style) => style.id === selectedPromoStyleId)

  const toggleWrestler = (id) => {
    setPromotedWrestlerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  const handleTicketChange = (e) => {
    setTicketPrice(e.target.value)
    setTicketError('')
  }

  const handleSave = () => {
    const parsedTicket = Number(ticketPrice)
    if (!Number.isFinite(parsedTicket) || parsedTicket < 0) {
      setTicketError(t('dashboard.eventPreparation.ticketInvalid'))
      return
    }
    onSave({
      venueId: selectedVenueId || null,
      promotedWrestlerIds,
      promoStyleId: selectedPromoStyleId,
      presentationId: selectedPresentationId,
      ticketPrice: Math.round(parsedTicket),
    })
  }

  const activeSponsors = (sponsors || []).filter((s) => s.eventScoped || s.remainingDays > 0)

  const promoHasQualified = promotedWrestlerIds.length === 2 &&
    promotedWrestlerIds.some((id) => top5Ids.has(id) || titleHolderIds.has(id))

  return (
    <div className={styles.overlay}>
      <div className={styles.scanlines} aria-hidden="true" />

      <div className={styles.content}>

        {/* ── Header ── */}
        <div className={styles.headerBlock}>
          <span className={styles.typeBadge}>
            {t(`dashboard.eventPreparation.eventTypes.${eventType}`)}
          </span>
          <h1 className={styles.pageTitle}>{t('dashboard.eventPreparation.title')}</h1>
          <p className={styles.eventName}>{event?.name}</p>
        </div>

        <div className={styles.divider} />

        {/* ── Body: two-column layout ── */}
        <div className={styles.bodyGrid}>

          {/* LEFT column */}
          <div className={styles.leftCol}>

            {/* Venue */}
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('dashboard.eventPreparation.venueTitle')}</h2>
                <p className={styles.cardHint}>{t('dashboard.eventPreparation.venueHint')}</p>
              </div>

              {selectedVenue && (
                <div className={styles.selectedVenueBar}>
                  <span className={styles.selectedVenueName}>{selectedVenue.name}</span>
                  <span className={styles.selectedVenueMeta}>
                    {selectedVenue.location} · {t('dashboard.eventPreparation.venueSeats', { count: selectedVenue.capacity.toLocaleString() })}
                    · {'★'.repeat(selectedVenue.facilities)}
                  </span>
                  <button
                    type="button"
                    className={styles.clearVenueBtn}
                    onClick={() => setSelectedVenueId('')}
                  >
                    ×
                  </button>
                </div>
              )}

              <input
                type="text"
                className={styles.venueSearch}
                placeholder={t('dashboard.eventPreparation.venueSearchPlaceholder')}
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
              />

              <div className={styles.venueList}>
                {filteredVenues.map((venue) => (
                  <button
                    key={venue.id}
                    type="button"
                    className={`${styles.venueRow} ${selectedVenueId === venue.id ? styles.venueRowSelected : ''}`}
                    onClick={() => setSelectedVenueId(venue.id === selectedVenueId ? '' : venue.id)}
                  >
                    <div className={styles.venueRowMain}>
                      <span className={styles.venueRowName}>{venue.name}</span>
                      <span className={styles.venueRowLocation}>
                        {venue.location} · {venue.isIndoor
                          ? t('dashboard.eventPreparation.indoor')
                          : t('dashboard.eventPreparation.outdoor')}
                      </span>
                    </div>
                    <div className={styles.venueRowRight}>
                      <span className={styles.venueRowCap}>{venue.capacity.toLocaleString()}</span>
                      <span className={styles.venueRowStars}>{'★'.repeat(venue.facilities)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Ticket Price */}
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('dashboard.eventPreparation.ticketTitle')}</h2>
                <p className={styles.cardHint}>{t('dashboard.eventPreparation.ticketHint', { type: eventType })}</p>
              </div>
              <div className={styles.ticketRow}>
                <span className={styles.ticketCurrency}>$</span>
                <input
                  id="prepTicketPrice"
                  type="number"
                  min="0"
                  className={styles.ticketInput}
                  value={ticketPrice}
                  onChange={handleTicketChange}
                />
                <label htmlFor="prepTicketPrice" className={styles.ticketLabel}>
                  {t('dashboard.eventPreparation.ticketLabel')}
                </label>
              </div>
              {ticketError && <p className={styles.ticketError}>{ticketError}</p>}
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('dashboard.eventPreparation.presentationTitle')}</h2>
                <p className={styles.cardHint}>{t('dashboard.eventPreparation.presentationHint')}</p>
              </div>
              <label className={styles.unlockChoice}>
                <span>{t('dashboard.eventPreparation.presentationTitle')}</span>
                <select
                  value={selectedPresentationId}
                  onChange={(event) => setSelectedPresentationId(event.target.value)}
                >
                  {unlockedPresentations.map((presentation) => (
                    <option key={presentation.id} value={presentation.id}>
                      {t(presentation.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {/* Sponsors */}
            {activeSponsors.length > 0 && (
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{t('dashboard.eventPreparation.sponsorTitle')}</h2>
                </div>
                <ul className={styles.sponsorList}>
                  {activeSponsors.map((s, i) => (
                    <li key={s.sponsorId || i} className={styles.sponsorItem}>
                      <span className={styles.sponsorName}>{s.name}</span>
                      {s.eventScoped && (
                        <span className={styles.sponsorBadge}>
                          {t('dashboard.eventPreparation.sponsorEventBadge')}
                        </span>
                      )}
                      {!s.eventScoped && s.remainingDays > 0 && (
                        <span className={styles.sponsorDays}>
                          {t('dashboard.eventPreparation.sponsorDaysLeft', { days: s.remainingDays })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* RIGHT column — Promoted Match */}
          <div className={styles.rightCol}>
            <section className={`${styles.card} ${styles.promoCard}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('dashboard.eventPreparation.promoTitle')}</h2>
                <p className={styles.cardHint}>{t('dashboard.eventPreparation.promoHint')}</p>
              </div>

              <label className={styles.unlockChoice}>
                <span>{t('dashboard.eventPreparation.promoStyleTitle')}</span>
                <select
                  value={selectedPromoStyleId}
                  onChange={(event) => setSelectedPromoStyleId(event.target.value)}
                >
                  {unlockedPromoStyles.map((style) => (
                    <option key={style.id} value={style.id}>
                      {t(style.labelKey)}
                    </option>
                  ))}
                </select>
                <small>
                  {t('dashboard.eventPreparation.promoStyleBonus', {
                    bonus: Number(selectedPromoStyle?.matchRatingBonus || 0).toFixed(1),
                  })}
                </small>
              </label>

              {wrestlers.length === 0 ? (
                <p className={styles.emptyNote}>{t('dashboard.eventPreparation.promoNoWrestlers')}</p>
              ) : (
                <>
                  <div className={styles.promoPickRow}>
                    {[0, 1].map((slot) => {
                      const id = promotedWrestlerIds[slot]
                      const w = id ? wrestlers.find((x) => x.employeeId === id) : null
                      return (
                        <div key={slot} className={styles.promoSlot}>
                          {w ? (
                            <div className={styles.promoSlotFilled}>
                              <img
                                src={w.imageUrl || getFallback(w.gender)}
                                alt={w.name}
                                className={styles.promoSlotAvatar}
                                onError={(e) => {
                                  if (!e.currentTarget.dataset.fb) {
                                    e.currentTarget.dataset.fb = '1'
                                    e.currentTarget.src = getFallback(w.gender)
                                  }
                                }}
                              />
                              <span className={styles.promoSlotName}>{w.name}</span>
                              <button
                                type="button"
                                className={styles.promoSlotClear}
                                onClick={() => toggleWrestler(w.employeeId)}
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <div className={styles.promoSlotEmpty}>
                              <span className={styles.promoSlotEmptyIcon}>+</span>
                              <span className={styles.promoSlotEmptyLabel}>
                                {t('dashboard.eventPreparation.promoPickWrestler', { index: slot + 1 })}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {promotedWrestlerIds.length === 2 && (
                    <p className={`${styles.promoBonus} ${promoHasQualified ? styles.promoBonusHigh : styles.promoBonusLow}`}>
                      {promoHasQualified
                        ? t('dashboard.eventPreparation.promoBonusHigh')
                        : t('dashboard.eventPreparation.promoBonusLow')}
                    </p>
                  )}

                  <div className={styles.wrestlerGrid}>
                    {sortedWrestlers.map((w, idx) => (
                      <WrestlerCard
                        key={w.employeeId}
                        employee={w}
                        selected={promotedWrestlerIds.includes(w.employeeId)}
                        onToggle={toggleWrestler}
                        rank={idx}
                        isChampion={titleHolderIds.has(w.employeeId)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t('dashboard.eventPreparation.cancel')}
          </button>
          <button type="button" className={styles.saveBtn} onClick={handleSave}>
            {t('dashboard.eventPreparation.save')}
          </button>
        </div>

      </div>
    </div>
  )
}

export default EventPreparationScreen
