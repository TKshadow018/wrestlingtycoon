import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import styles from './HireEmployeesModule.module.scss'

const formatMoney = (value) => value.toLocaleString()
const ROLE_FILTERS = ['all', 'wrestler', 'referee', 'manager', 'announcer', 'staff']
const GENDER_FILTERS = ['all', 'male', 'female']
const getBackupImageByGender = (gender) => (gender === 'female' ? '/people/girl.png' : '/people/boy.png')
const parseIsoDateLocal = (isoDateString) => {
  if (!isoDateString) {
    return null
  }

  const [yearStr, monthStr, dayStr] = isoDateString.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

const getGameDate = (startDateIso, day) => {
  const baseDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return gameDate
}

const formatDobWithAge = (dob, gameDate) => {
  const dobDate = parseIsoDateLocal(dob)
  if (!dobDate || Number.isNaN(dobDate.getTime())) {
    return dob || '-'
  }

  const normalizedGameDate = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate())
  const normalizedDob = new Date(dobDate.getFullYear(), dobDate.getMonth(), dobDate.getDate())
  if (normalizedGameDate < normalizedDob) {
    return dob
  }

  let years = normalizedGameDate.getFullYear() - normalizedDob.getFullYear()
  const thisYearBirthday = new Date(normalizedGameDate.getFullYear(), normalizedDob.getMonth(), normalizedDob.getDate())
  if (normalizedGameDate < thisYearBirthday) {
    years -= 1
  }

  const lastBirthday = new Date(normalizedDob.getFullYear() + years, normalizedDob.getMonth(), normalizedDob.getDate())
  const days = Math.floor((normalizedGameDate.getTime() - lastBirthday.getTime()) / (1000 * 60 * 60 * 24))

  return `${dob} (${years} years ${days} days)`
}

const createOfferForm = (candidate) => ({
  priceAdjustPercent: String(candidate?.contract?.lastOfferAdjustPercent ?? 0),
  contractLengthMonths: String(
    candidate?.contract?.lastOfferContractLengthMonths ?? candidate?.contract?.contractLengthMonths ?? 12,
  ),
  benefits: {
    healthCare: Boolean(candidate?.contract?.lastOfferBenefits?.healthCare),
    travel: Boolean(candidate?.contract?.lastOfferBenefits?.travel),
    accommodation: Boolean(candidate?.contract?.lastOfferBenefits?.accommodation),
  },
})

const renderRoleDetails = (candidate, t) => {
  if (candidate.role === 'wrestler') {
    return (
      <>
        <p>{t('dashboard.hiring.popularity', { amount: candidate.popularity })}</p>
        <p>
          {t('dashboard.hiring.wrestlerAbility', {
            strength: candidate.wrestling_ability?.strength,
            technics: candidate.wrestling_ability?.technics,
            fly: candidate.wrestling_ability?.high_fly_ability,
          })}
        </p>
        <p>{t('dashboard.hiring.moves', { moves: candidate.signature_moves.join(', ') })}</p>
        <p>{t('dashboard.hiring.finishers', { moves: candidate.finisher_moves.join(', ') })}</p>
      </>
    )
  }

  if (candidate.role === 'referee') {
    return (
      <p>
        {t('dashboard.hiring.refereeAbility', {
          rules: candidate.officiating_ability?.rule_knowledge,
          speed: candidate.officiating_ability?.decision_speed,
          composure: candidate.officiating_ability?.composure,
        })}
      </p>
    )
  }

  if (candidate.role === 'manager') {
    return (
      <p>
        {t('dashboard.hiring.managerAbility', {
          charisma: candidate.management_ability?.charisma,
          negotiation: candidate.management_ability?.negotiation,
          promo: candidate.management_ability?.promo_skill,
        })}
      </p>
    )
  }

  if (candidate.role === 'announcer') {
    return (
      <p>
        {t('dashboard.hiring.announcerAbility', {
          voice: candidate.broadcast_ability?.voice_quality,
          hype: candidate.broadcast_ability?.hype_delivery,
          diction: candidate.broadcast_ability?.diction,
        })}
      </p>
    )
  }

  return (
    <p>
      {t('dashboard.hiring.staffAbility', {
        department: candidate.staff_department,
        reliability: candidate.staff_ability?.reliability,
        technical: candidate.staff_ability?.technical_skill,
      })}
    </p>
  )
}

function HireEmployeesModule() {
  const { t } = useTranslation()
  const [roleFilter, setRoleFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [salarySort, setSalarySort] = useState('asc')
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [offerForm, setOfferForm] = useState({
    priceAdjustPercent: '0',
    contractLengthMonths: '12',
    benefits: {
      healthCare: false,
      travel: false,
      accommodation: false,
    },
  })
  const [offerFeedback, setOfferFeedback] = useState(null)
  const candidates = useGameStore((state) => state.market.employeeCandidates)
  const cash = useGameStore((state) => state.finances.cash)
  const gameDay = useGameStore((state) => state.calendar.day)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const hireEmployee = useGameStore((state) => state.hireEmployee)
  const negotiateEmployeeContract = useGameStore((state) => state.negotiateEmployeeContract)
  const maleWrestlerCount = useGameStore((state) => state.roster.employees.filter((emp) => emp.role === 'wrestler' && emp.gender === 'male').length)
  const femaleWrestlerCount = useGameStore((state) => state.roster.employees.filter((emp) => emp.role === 'wrestler' && emp.gender === 'female').length)
  const MAX_MALE = 20
  const MAX_FEMALE = 15

  const isWrestlerRosterFull = (gender) => {
    if (gender === 'male') return maleWrestlerCount >= MAX_MALE
    if (gender === 'female') return femaleWrestlerCount >= MAX_FEMALE
    return false
  }
  const selectedCandidate = candidates.find((candidate) => candidate.candidateId === selectedCandidateId) || null
  const selectedContract = selectedCandidate?.contract || null
  const gameDate = getGameDate(startDateIso, gameDay)

  const closeNegotiationModal = () => {
    setSelectedCandidateId(null)
    setOfferFeedback(null)
  }

  const openNegotiationModal = (candidate) => {
    setSelectedCandidateId(candidate.candidateId)
    setOfferForm(createOfferForm(candidate))
    setOfferFeedback(null)
  }

  const handleOfferFieldChange = (field) => (event) => {
    const value = event.target.value
    setOfferForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleBenefitChange = (field) => (event) => {
    const checked = event.target.checked
    setOfferForm((current) => ({
      ...current,
      benefits: {
        ...current.benefits,
        [field]: checked,
      },
    }))
  }

  const handleNegotiationSubmit = (event) => {
    event.preventDefault()

    if (!selectedCandidate) {
      return
    }

    const adjustPercent = Math.max(-30, Math.min(30, Number(offerForm.priceAdjustPercent) || 0))
    const multiplier = 1 + (adjustPercent / 100)
    const demandContract = selectedCandidate.contract || {}
    const offerMonthlySalary = Math.max(0, Math.round((demandContract.monthlySalary || 0) * multiplier))
    const offerPerMatchSalary = Math.max(0, Math.round((demandContract.perMatchSalary || 0) * multiplier))
    const offerSigningBonus = Math.max(0, Math.round((demandContract.signingBonus || 0) * multiplier))

    const result = negotiateEmployeeContract(selectedCandidate.candidateId, {
      monthlySalary: offerMonthlySalary,
      perMatchSalary: offerPerMatchSalary,
      signingBonus: offerSigningBonus,
      contractLengthMonths: offerForm.contractLengthMonths,
      adjustPercent,
      benefits: offerForm.benefits,
    })

    if (result?.ok && result.accepted) {
      const acceptedMonthlySalary = Number(result?.offer?.monthlySalary || 0)
      if (cash < acceptedMonthlySalary) {
        setOfferFeedback({
          ...result,
          autoHireFailed: true,
          autoHireFailureReason: 'insufficientCash',
        })
        return
      }

      const autoHireResult = hireEmployee(selectedCandidate.candidateId)
      if (autoHireResult?.ok) {
        closeNegotiationModal()
        return
      }

      setOfferFeedback({
        ...result,
        autoHireFailed: true,
        autoHireFailureReason: autoHireResult?.reason || 'unknown',
      })
      return
    }

    setOfferFeedback(result)
  }

  const handleQuickHire = (candidateId) => {
    const quickHireResult = hireEmployee(candidateId, { skipNegotiation: true })

    if (quickHireResult?.ok) {
      if (selectedCandidateId === candidateId) {
        closeNegotiationModal()
      }
      return
    }

    if (selectedCandidateId === candidateId) {
      setOfferFeedback({
        ok: false,
        accepted: false,
        quickHireFailed: true,
        quickHireFailureReason: quickHireResult?.reason || 'unknown',
      })
    }
  }


  const visibleCandidates = candidates
    .filter((candidate) => roleFilter === 'all' || candidate.role === roleFilter)
    .filter((candidate) => genderFilter === 'all' || candidate.gender === genderFilter)
    .sort((left, right) => {
      const leftSalary = left.contract?.negotiatedMonthlySalary || left.salary || 0
      const rightSalary = right.contract?.negotiatedMonthlySalary || right.salary || 0

      return salarySort === 'asc' ? leftSalary - rightSalary : rightSalary - leftSalary
    })

  return (
    <section className={styles.moduleBody}>
      <header className={styles.headerRow}>
        <p>{t('dashboard.hiring.availableCash', { amount: cash.toLocaleString() })}</p>
        <p>{t('dashboard.hiring.availablePeople', { amount: visibleCandidates.length, total: candidates.length })}</p>
        <p>{t('dashboard.hiring.rosterQuotaMale', { count: maleWrestlerCount, max: MAX_MALE })}</p>
        <p>{t('dashboard.hiring.rosterQuotaFemale', { count: femaleWrestlerCount, max: MAX_FEMALE })}</p>
      </header>

      <div className={styles.filterRow}>
        <label className={styles.filterField}>
          <span>{t('dashboard.hiring.roleSearch')}</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {ROLE_FILTERS.map((role) => (
              <option key={role} value={role}>
                {t(`dashboard.hiring.roleOptions.${role}`)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>{t('dashboard.hiring.salarySort')}</span>
          <select value={salarySort} onChange={(event) => setSalarySort(event.target.value)}>
            <option value="asc">{t('dashboard.hiring.salarySortAsc')}</option>
            <option value="desc">{t('dashboard.hiring.salarySortDesc')}</option>
          </select>
        </label>

        <label className={styles.filterField}>
          <span>{t('dashboard.hiring.genderFilter')}</span>
          <select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
            {GENDER_FILTERS.map((gender) => (
              <option key={gender} value={gender}>
                {t(`dashboard.hiring.genderOptions.${gender}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.candidateGrid}>
        {visibleCandidates.map((candidate) => {
          const contract = candidate.contract
          const signingBonus = contract?.negotiatedSigningBonus || candidate.signingBonus
          const monthlySalary = contract?.negotiatedMonthlySalary || candidate.salary
          const perMatchSalary = contract?.negotiatedPerMatchSalary || 0

          return (
            <article key={candidate.candidateId} className={styles.candidateCard}>
              <img
                className={styles.candidateImage}
                src={candidate.image_url || getBackupImageByGender(candidate.gender)}
                alt={candidate.name}
                loading="lazy"
                onError={(event) => {
                  if (event.currentTarget.dataset.fallbackApplied === 'true') {
                    event.currentTarget.style.display = 'none'
                    return
                  }

                  event.currentTarget.dataset.fallbackApplied = 'true'
                  event.currentTarget.src = getBackupImageByGender(candidate.gender)
                }}
              />

              <div className={styles.identityRow}>
                <div>
                  <h4>{candidate.name}</h4>
                  <p>{t('dashboard.hiring.identity', { gender: candidate.gender, dob: formatDobWithAge(candidate.dob, gameDate) })}</p>
                </div>
                <span className={styles.tierBadge}>{candidate.tier}</span>
              </div>

              <p>{t('dashboard.hiring.role', { role: candidate.role })}</p>
              <p>{t('dashboard.hiring.skill', { skill: candidate.skill })}</p>
              <p>{t('dashboard.hiring.monthlyWage', { amount: formatMoney(monthlySalary) })}</p>
              <p>{t('dashboard.hiring.perMatchSalary', { amount: formatMoney(perMatchSalary) })}</p>
              <p>{t('dashboard.hiring.signingBonus', { amount: formatMoney(signingBonus) })}</p>
              {contract?.offerAccepted ? <p>{t('dashboard.hiring.offerAccepted')}</p> : null}
              {!contract?.offerAccepted && contract?.negotiationAttempted ? <p>{t('dashboard.hiring.offerPending')}</p> : null}

              {renderRoleDetails(candidate, t)}

              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.quickHireAction}
                  disabled={cash < monthlySalary || (candidate.role === 'wrestler' && isWrestlerRosterFull(candidate.gender))}
                  onClick={() => handleQuickHire(candidate.candidateId)}
                >
                  {candidate.role === 'wrestler' && isWrestlerRosterFull(candidate.gender)
                    ? t('dashboard.hiring.rosterFull')
                    : cash >= monthlySalary
                      ? t('dashboard.hiring.quickHire')
                      : t('dashboard.hiring.insufficientCash')}
                </button>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={() => openNegotiationModal(candidate)}
                >
                  {contract?.offerAccepted ? t('dashboard.hiring.reviewOffer') : t('dashboard.hiring.negotiate')}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {selectedCandidate ? (
        <div className={styles.modalOverlay} onClick={closeNegotiationModal}>
          <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>{t('dashboard.hiring.negotiationTitle', { name: selectedCandidate.name })}</h3>
                <p>{t('dashboard.hiring.negotiationSubtitle', { role: selectedCandidate.role })}</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeNegotiationModal}>
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <section className={styles.offerPanel}>
                <h4>{t('dashboard.hiring.currentDemand')}</h4>
                <p>{t('dashboard.hiring.monthlyWage', { amount: formatMoney(selectedContract?.monthlySalary || 0) })}</p>
                <p>{t('dashboard.hiring.perMatchSalary', { amount: formatMoney(selectedContract?.perMatchSalary || 0) })}</p>
                <p>{t('dashboard.hiring.signingBonus', { amount: formatMoney(selectedContract?.signingBonus || 0) })}</p>
                <p>
                  {t('dashboard.hiring.contractLengthDemand', {
                    amount: selectedContract?.contractLengthMonths || 12,
                  })}
                </p>
                <p>
                  {t('dashboard.hiring.discountRange', {
                    amount: selectedContract?.maxDiscountPercent || 30,
                  })}
                </p>
                {(selectedCandidate.popularity || 0) <= 18 ? <p>{t('dashboard.hiring.noBonusPossible')}</p> : null}
              </section>

              <form className={styles.offerForm} onSubmit={handleNegotiationSubmit}>
                <h4>{t('dashboard.hiring.yourOffer')}</h4>

                <label className={styles.offerField}>
                  <span>{t('dashboard.hiring.offerAdjustPercent', 'Offer adjustment')}</span>
                  <input
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    value={offerForm.priceAdjustPercent}
                    onChange={handleOfferFieldChange('priceAdjustPercent')}
                  />
                  <small>
                    {(Number(offerForm.priceAdjustPercent) || 0) >= 0
                      ? t('dashboard.hiring.offerAdjustHigh', '+{{amount}}% above demand', { amount: Number(offerForm.priceAdjustPercent) || 0 })
                      : t('dashboard.hiring.offerAdjustLow', '{{amount}}% below demand', { amount: Math.abs(Number(offerForm.priceAdjustPercent) || 0) })}
                  </small>
                </label>

                <fieldset className={styles.benefitsFieldset}>
                  <legend>{t('dashboard.hiring.benefitsTitle', 'Extra benefits')}</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={offerForm.benefits.healthCare}
                      onChange={handleBenefitChange('healthCare')}
                    />
                    <span>{t('dashboard.hiring.benefitHealthCare', 'Cover health care')}</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={offerForm.benefits.travel}
                      onChange={handleBenefitChange('travel')}
                    />
                    <span>{t('dashboard.hiring.benefitTravel', 'Cover travel')}</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={offerForm.benefits.accommodation}
                      onChange={handleBenefitChange('accommodation')}
                    />
                    <span>{t('dashboard.hiring.benefitAccommodation', 'Cover accommodation')}</span>
                  </label>
                </fieldset>

                <label className={styles.offerField}>
                  <span>{t('dashboard.hiring.contractLengthLabel')}</span>
                  <select value={offerForm.contractLengthMonths} onChange={handleOfferFieldChange('contractLengthMonths')}>
                    {Array.from({ length: 60 }, (_, index) => {
                      const months = index + 1

                      return (
                        <option key={`contract-month-${months}`} value={String(months)}>
                          {t('dashboard.hiring.contractLengthOption', { amount: months })}
                        </option>
                      )
                    })}
                  </select>
                </label>

                {offerFeedback?.ok && offerFeedback.accepted && !offerFeedback.autoHireFailed ? (
                  <p className={styles.successMessage}>{t('dashboard.hiring.offerAcceptedAutoHiredMessage')}</p>
                ) : null}

                {offerFeedback?.ok && !offerFeedback.accepted && typeof offerFeedback.maxDiscountPercent === 'number' ? (
                  <p className={styles.errorMessage}>
                    {t('dashboard.hiring.offerRejectedMessage', { amount: offerFeedback.maxDiscountPercent })}
                  </p>
                ) : null}

                {offerFeedback?.autoHireFailed ? (
                  <p className={styles.errorMessage}>
                    {offerFeedback.autoHireFailureReason === 'insufficientCash'
                      ? t('dashboard.hiring.autoHireInsufficientCash')
                      : t('dashboard.hiring.autoHireFailed')}
                  </p>
                ) : null}

                {offerFeedback?.quickHireFailed ? (
                  <p className={styles.errorMessage}>
                    {offerFeedback.quickHireFailureReason === 'insufficientCash'
                      ? t('dashboard.hiring.insufficientCash')
                      : offerFeedback.quickHireFailureReason === 'rosterFull'
                        ? t('dashboard.hiring.rosterFullError')
                        : t('dashboard.hiring.quickHireFailed')}
                  </p>
                ) : null}
                {offerFeedback?.autoHireFailed && offerFeedback.autoHireFailureReason === 'rosterFull' ? (
                  <p className={styles.errorMessage}>{t('dashboard.hiring.rosterFullError')}</p>
                ) : null}

                <div className={styles.modalActions}>
                  <button type="button" className={styles.modalSecondaryButton} onClick={closeNegotiationModal}>
                    {t('dashboard.hiring.closeModal')}
                  </button>
                  <button type="submit" className={styles.modalPrimaryButton}>
                    {t('dashboard.hiring.submitOffer')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default HireEmployeesModule
