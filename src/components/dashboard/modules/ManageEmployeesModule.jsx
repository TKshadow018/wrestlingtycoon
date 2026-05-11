import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../../store/useGameStore'
import { calculateRanking, calculateTeamRanking } from '../../../utils/wrestlerRank'
import styles from './ManageEmployeesModule.module.scss'

const formatMoney = (value) => value.toLocaleString()
const getBackupImageByGender = (gender) => (gender === 'female' ? '/people/girl.png' : '/people/boy.png')
const getStamina = (employee) => Number(employee?.stamina ?? 100)
const getHappiness = (employee) => Number(employee?.happiness ?? 50)

const MATCH_SEGMENT_TYPES = new Set(['match', 'mainEvent', 'titleMatch'])

const getWrestlerRecentStats = (employee) => {
  const history = Array.isArray(employee?.matchStats?.matchHistory) ? employee.matchStats.matchHistory : []
  const matchHistory = history
    .filter((entry) => MATCH_SEGMENT_TYPES.has(entry?.segmentType))
    .sort((a, b) => (b.day || 0) - (a.day || 0))
    .slice(0, 20)

  if (matchHistory.length === 0) return null

  let wins = 0
  let losses = 0
  const ratings = []

  matchHistory.forEach((entry) => {
    const isWinner = entry.winnerEmployeeId === employee.employeeId
      || (Array.isArray(entry.winnerTeamIds) && entry.winnerTeamIds.includes(employee.employeeId))
    if (isWinner) {
      wins += 1
    } else {
      losses += 1
    }
    const r = Number(entry.matchRating)
    if (Number.isFinite(r)) ratings.push(r)
  })

  const avgRating = ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
    : null

  return { wins, losses, avgRating, count: matchHistory.length }
}
const ROLE_FILTERS = ['all', 'wrestler', 'referee', 'manager', 'announcer', 'staff']
const GENDER_FILTERS = ['all', 'male', 'female']

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

const formatGameDateFromDay = (startDateIso, day) => {
  const baseDate = parseIsoDateLocal(startDateIso) || new Date()
  const gameDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
  gameDate.setDate(gameDate.getDate() + Math.max(0, Number(day || 1) - 1))
  return gameDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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

function ManagerSelectionModal({ employee, managers, onSelect, onClose }) {
  const { t } = useTranslation()

  return (
    <div className={styles.managerModalOverlay} onClick={onClose} role="presentation">
      <div className={styles.managerModal} onClick={(e) => e.stopPropagation()}>
        <h4>{t('dashboard.employees.selectManager')}</h4>
        {managers.length === 0 ? (
          <p className={styles.managerEmpty}>{t('dashboard.employees.noManagersAvailable')}</p>
        ) : (
          <div className={styles.managerList}>
            {managers.map((manager) => (
              <button
                key={manager.employeeId}
                type="button"
                className={styles.managerOption}
                onClick={() => onSelect(employee.employeeId, manager.employeeId)}
              >
                <img
                  src={manager.imageUrl || getBackupImageByGender(manager.gender)}
                  alt={manager.name}
                  className={styles.managerOptionImage}
                  loading="lazy"
                />
                <div>
                  <strong>{manager.name}</strong>
                  <p>{t('dashboard.employees.skill', { skill: manager.skill })}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {employee.managerId && (
          <button
            type="button"
            className={styles.managerOption}
            onClick={() => onSelect(employee.employeeId, null)}
          >
            {t('dashboard.employees.removeManager')}
          </button>
        )}
        <button type="button" className={styles.managerModalClose} onClick={onClose}>
          {t('dashboard.employees.closeDetails')}
        </button>
      </div>
    </div>
  )
}

function ManagedWrestlersModal({ manager, managedWrestlers, onClose }) {
  const { t } = useTranslation()

  return (
    <div className={styles.managerModalOverlay} onClick={onClose} role="presentation">
      <div className={styles.managerModal} onClick={(e) => e.stopPropagation()}>
        <h4>
          {t('dashboard.employees.managedWrestlers')} - {manager.name}
        </h4>
        <div className={styles.managedWrestlersGrid}>
          {managedWrestlers.length === 0 ? (
            <p className={styles.managerEmpty}>{t('dashboard.employees.noManagedWrestlers')}</p>
          ) : (
            managedWrestlers.map((wrestler) => (
              <div key={wrestler.employeeId} className={styles.managedWrestlerCard}>
                <img
                  src={wrestler.imageUrl || getBackupImageByGender(wrestler.gender)}
                  alt={wrestler.name}
                  className={styles.managedWrestlerImage}
                  loading="lazy"
                />
                <span className={styles.managedWrestlerName}>{wrestler.name}</span>
                <p className={styles.managedWrestlerRole}>{wrestler.role}</p>
                {wrestler.role === 'wrestler' && (
                  <p className={`${styles.managedWrestlerStamina} ${getStamina(wrestler) < 10 ? styles.staminaLow : ''}`}>
                    {t('dashboard.employees.stamina', { amount: getStamina(wrestler) })}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
        <button type="button" className={styles.managerModalClose} onClick={onClose}>
          {t('dashboard.employees.closeDetails')}
        </button>
      </div>
    </div>
  )
}

function BonusModal({ employee, cash, onConfirm, onClose, errorKey }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('1000')

  if (!employee) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onConfirm(Number(amount || 0))
  }

  return (
    <div className={styles.managerModalOverlay} onClick={onClose} role="presentation">
      <div className={styles.managerModal} onClick={(event) => event.stopPropagation()}>
        <h4>{t('dashboard.employees.giveBonusTo', { name: employee.name })}</h4>
        <p className={styles.bonusInfo}>{t('dashboard.employees.cashOnHand', { amount: formatMoney(cash) })}</p>
        <p className={styles.bonusInfo}>{t('dashboard.employees.happinessNow', { amount: getHappiness(employee) })}</p>

        <form className={styles.bonusForm} onSubmit={handleSubmit}>
          <label className={styles.filterField}>
            <span>{t('dashboard.employees.bonusAmount')}</span>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={styles.bonusInput}
            />
          </label>

          {errorKey ? <p className={styles.bonusError}>{t(`dashboard.employees.${errorKey}`)}</p> : null}

          <div className={styles.bonusActions}>
            <button type="submit" className={styles.bonusConfirmButton}>
              {t('dashboard.employees.confirmBonus')}
            </button>
            <button type="button" className={styles.bonusCancelButton} onClick={onClose}>
              {t('dashboard.employees.cancelBonus')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LowHappinessWarningModal({ employee, onDismiss, onGiveBonus }) {
  const { t } = useTranslation()

  if (!employee) {
    return null
  }

  return (
    <div className={styles.managerModalOverlay} onClick={onDismiss} role="presentation">
      <div className={styles.warningModal} onClick={(event) => event.stopPropagation()}>
        <h4>{t('dashboard.employees.lowHappinessTitle')}</h4>
        <img
          src={employee.imageUrl || getBackupImageByGender(employee.gender)}
          alt={employee.name}
          className={styles.warningImage}
          loading="lazy"
        />
        <p className={styles.warningName}>{employee.name}</p>
        <p className={styles.warningMessage}>
          {t('dashboard.employees.lowHappinessBody', { happiness: getHappiness(employee) })}
        </p>

        <div className={styles.warningActions}>
          <button type="button" className={styles.bonusConfirmButton} onClick={onGiveBonus}>
            {t('dashboard.employees.giveBonus')}
          </button>
          <button type="button" className={styles.bonusCancelButton} onClick={onDismiss}>
            {t('dashboard.employees.dismissWarning')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ManageTeamsSubsection ────────────────────────────────────────────────────

const EMPTY_TEAM_FORM = { name: '', memberIds: [] }
const MAX_TEAM_MEMBERS = 10

function TeamDnDForm({ availableEmployees, initialValues = EMPTY_TEAM_FORM, onSave, onCancel, errorKey }) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialValues.name || '')
  const [memberIds, setMemberIds] = useState(initialValues.memberIds || [])

  const employeeById = useMemo(() => {
    const mapping = new Map()
    availableEmployees.forEach((emp) => {
      mapping.set(emp.employeeId, emp)
    })
    return mapping
  }, [availableEmployees])

  const selectedMembers = memberIds.map((id) => employeeById.get(id)).filter(Boolean)
  const availablePool = availableEmployees.filter((emp) => !memberIds.includes(emp.employeeId))

  const dragFromPool = (event, employeeId) => {
    event.dataTransfer.setData('text/plain', employeeId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDropToTeam = (event) => {
    event.preventDefault()
    const employeeId = event.dataTransfer.getData('text/plain')
    if (!employeeId || memberIds.includes(employeeId)) {
      return
    }
    if (!employeeById.has(employeeId) || memberIds.length >= MAX_TEAM_MEMBERS) {
      return
    }
    setMemberIds((prev) => [...prev, employeeId])
  }

  const handleDropToPool = (event) => {
    event.preventDefault()
    const employeeId = event.dataTransfer.getData('text/plain')
    if (!employeeId || !memberIds.includes(employeeId)) {
      return
    }
    setMemberIds((prev) => prev.filter((id) => id !== employeeId))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSave({ name, memberIds })
  }

  return (
    <form className={styles.teamForm} onSubmit={handleSubmit}>
      <div className={styles.teamFormField}>
        <label htmlFor="team-name-input">{t('dashboard.teams.teamName')}</label>
        <input
          id="team-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('dashboard.teams.teamNamePlaceholder')}
          className={styles.teamNameInput}
        />
      </div>

      <div className={styles.teamBuilderGrid}>
        <section className={styles.teamBuilderColumn}>
          <p className={styles.teamFormLabel}>{t('dashboard.teams.selectMembers')}</p>
          <div
            className={styles.memberSelector}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropToPool}
          >
            {availablePool.length === 0 ? (
              <p className={styles.teamFormEmpty}>{t('dashboard.teams.noEmployees')}</p>
            ) : (
              availablePool.map((wrestler) => (
                <article
                  key={wrestler.employeeId}
                  className={styles.teamBuilderCard}
                  draggable
                  onDragStart={(event) => dragFromPool(event, wrestler.employeeId)}
                >
                  <img
                    src={wrestler.imageUrl || getBackupImageByGender(wrestler.gender)}
                    alt={wrestler.name}
                    className={styles.memberThumb}
                    loading="lazy"
                  />
                  <span>{wrestler.name}</span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className={styles.teamBuilderColumn}>
          <p className={styles.teamFormLabel}>{t('dashboard.teams.membersCount', { count: memberIds.length })}</p>
          <div
            className={styles.memberSelectorDrop}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropToTeam}
          >
            {selectedMembers.length === 0 ? (
              <p className={styles.teamFormEmpty}>{t('dashboard.teams.dragMembersHint', 'Drag wrestlers here')}</p>
            ) : (
              selectedMembers.map((wrestler) => (
                <article
                  key={wrestler.employeeId}
                  className={styles.teamBuilderCardSelected}
                  draggable
                  onDragStart={(event) => dragFromPool(event, wrestler.employeeId)}
                >
                  <img
                    src={wrestler.imageUrl || getBackupImageByGender(wrestler.gender)}
                    alt={wrestler.name}
                    className={styles.memberThumb}
                    loading="lazy"
                  />
                  <span>{wrestler.name}</span>
                  <button
                    type="button"
                    className={styles.removeSelectedMember}
                    onClick={() => setMemberIds((prev) => prev.filter((id) => id !== wrestler.employeeId))}
                  >
                    {t('dashboard.teams.removeMember', 'Remove')}
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {errorKey && <p className={styles.teamFormError}>{t(`dashboard.teams.${errorKey}`)}</p>}

      <div className={styles.teamFormActions}>
        <button type="submit" className={styles.teamSaveButton}>
          {t('dashboard.teams.saveTeam')}
        </button>
        <button type="button" className={styles.teamCancelButton} onClick={onCancel}>
          {t('dashboard.teams.cancel')}
        </button>
      </div>
    </form>
  )
}

function ManageTeamsSubsection({ employees, teams, createTeam, updateTeam, deleteTeam }) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [divisionView, setDivisionView] = useState('male')

  const ERROR_KEY_MAP = {
    teamNameRequired: 'validationNameRequired',
    teamMemberCount: 'validationMinMembers',
    teamAlreadyExists: 'errorAlreadyExists',
  }

  const wrestlerPool = useMemo(
    () => employees.filter((employee) => employee.role === 'wrestler'),
    [employees],
  )

  const teamedWrestlerIds = useMemo(() => {
    const ids = new Set()
    ;(teams || []).forEach((team) => {
      ;(team.memberIds || []).forEach((memberId) => ids.add(memberId))
    })
    return ids
  }, [teams])

  const createAvailableWrestlers = useMemo(
    () => wrestlerPool.filter((wrestler) => !teamedWrestlerIds.has(wrestler.employeeId)),
    [teamedWrestlerIds, wrestlerPool],
  )

  const rankedTeams = useMemo(
    () => calculateTeamRanking({ teams: teams || [], employees, division: divisionView }),
    [divisionView, employees, teams],
  )

  const getEditAvailableWrestlers = (teamId, memberIds) => {
    const idsInOtherTeams = new Set()
    ;(teams || []).forEach((team) => {
      if (team.teamId === teamId) return
      ;(team.memberIds || []).forEach((id) => idsInOtherTeams.add(id))
    })

    const currentMembers = new Set(memberIds)
    return wrestlerPool.filter((wrestler) => (
      currentMembers.has(wrestler.employeeId) || !idsInOtherTeams.has(wrestler.employeeId)
    ))
  }

  const mapTeamError = (error, memberCount) => {
    if (error === 'teamMemberCount') {
      if (memberCount > MAX_TEAM_MEMBERS) {
        return 'validationMaxMembers'
      }
      return 'validationMinMembers'
    }
    return ERROR_KEY_MAP[error] || 'validationNameRequired'
  }

  const handleCreate = ({ name, memberIds }) => {
    if ((memberIds || []).length > MAX_TEAM_MEMBERS) {
      setFormError('validationMaxMembers')
      return
    }
    const result = createTeam({ name, memberIds })
    if (result?.ok) {
      setCreating(false)
      setFormError(null)
    } else {
      setFormError(mapTeamError(result?.error, memberIds.length))
    }
  }

  const handleUpdate = (teamId) => ({ name, memberIds }) => {
    if ((memberIds || []).length > MAX_TEAM_MEMBERS) {
      setFormError('validationMaxMembers')
      return
    }
    const result = updateTeam(teamId, { name, memberIds })
    if (result?.ok) {
      setEditingTeamId(null)
      setFormError(null)
    } else {
      setFormError(mapTeamError(result?.error, memberIds.length))
    }
  }

  const handleDelete = (teamId) => {
    if (window.confirm(t('dashboard.teams.confirmDelete'))) {
      deleteTeam(teamId)
    }
  }

  return (
    <div className={styles.teamsSection}>
      <div className={styles.teamsHeader}>
        <div className={styles.teamDivisionSwitch}>
          <button
            type="button"
            className={`${styles.teamDivisionButton} ${divisionView === 'male' ? styles.teamDivisionButtonActive : ''}`}
            onClick={() => setDivisionView('male')}
          >
            {t('dashboard.teams.maleTeams', 'Male Teams')}
          </button>
          <button
            type="button"
            className={`${styles.teamDivisionButton} ${divisionView === 'female' ? styles.teamDivisionButtonActive : ''}`}
            onClick={() => setDivisionView('female')}
          >
            {t('dashboard.teams.femaleTeams', 'Female Teams')}
          </button>
        </div>
        {!creating && (
          <button
            type="button"
            className={styles.createTeamButton}
            onClick={() => { setCreating(true); setEditingTeamId(null); setFormError(null) }}
          >
            {t('dashboard.teams.createTeam')}
          </button>
        )}
      </div>

      {creating && (
        <div className={styles.teamFormWrapper}>
          <h4>{t('dashboard.teams.createTeam')}</h4>
          <TeamDnDForm
            availableEmployees={createAvailableWrestlers}
            onSave={handleCreate}
            onCancel={() => { setCreating(false); setFormError(null) }}
            errorKey={formError}
          />
        </div>
      )}

      {(teams || []).length === 0 && !creating ? (
        <p className={styles.teamsEmpty}>{t('dashboard.teams.empty')}</p>
      ) : rankedTeams.length === 0 && !creating ? (
        <p className={styles.teamsEmpty}>{t('dashboard.teams.emptyDivision', 'No teams in this division yet.')}</p>
      ) : (
        <div className={styles.teamsList}>
          {rankedTeams.map((team) => {
            const memberEmployees = team.memberEmployees || []

            return (
              <article key={team.teamId} className={styles.teamListRow}>
                {editingTeamId === team.teamId ? (
                  <div className={styles.teamFormWrapper}>
                    <h4>{t('dashboard.teams.editTeam')}</h4>
                    <TeamDnDForm
                      availableEmployees={getEditAvailableWrestlers(team.teamId, team.memberIds || [])}
                      initialValues={{ name: team.name, memberIds: team.memberIds }}
                      onSave={handleUpdate(team.teamId)}
                      onCancel={() => { setEditingTeamId(null); setFormError(null) }}
                      errorKey={formError}
                    />
                  </div>
                ) : (
                  <>
                    <div className={styles.teamRowMain}>
                      <span className={styles.teamRankBadge}>#{team.teamRank}</span>
                      <div className={styles.teamRowNameWrap}>
                        <h4 className={styles.teamCardName}>{team.name}</h4>
                        <p className={styles.teamRankPoints}>
                          {t('dashboard.teams.teamPoints', 'Points: {{points}}', { points: team.teamRankPoints })}
                        </p>
                      </div>
                      <span className={team.autoFormed ? styles.teamBadgeAuto : styles.teamBadgeManual}>
                        {team.autoFormed ? t('dashboard.teams.autoFormed') : t('dashboard.teams.manualTeam')}
                      </span>
                      {team.isMixed ? <span className={styles.teamMixedBadge}>{t('dashboard.teams.mixedTeam', 'Mixed')}</span> : null}
                    </div>

                    {team.autoFormed && team.autoReason && (
                      <p className={styles.teamAutoReason}>
                        {t(`dashboard.teams.autoReason${team.autoReason.charAt(0).toUpperCase()}${team.autoReason.slice(1)}`)}
                      </p>
                    )}

                    <p className={styles.teamFormedDay}>
                      {t('dashboard.teams.formedDay', { day: team.formedDay })}
                    </p>

                    <div className={styles.teamMembersRow}>
                      {memberEmployees.map((emp) => (
                        <div key={emp.employeeId} className={styles.teamMemberThumb}>
                          <img
                            src={emp.imageUrl || getBackupImageByGender(emp.gender)}
                            alt={emp.name}
                            loading="lazy"
                          />
                          <span>{emp.name}</span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.teamCardActions}>
                      <button
                        type="button"
                        className={styles.teamEditButton}
                        onClick={() => { setEditingTeamId(team.teamId); setCreating(false); setFormError(null) }}
                      >
                        {t('dashboard.teams.editTeam')}
                      </button>
                      <button
                        type="button"
                        className={styles.teamDeleteButton}
                        onClick={() => handleDelete(team.teamId)}
                      >
                        {t('dashboard.teams.deleteTeam')}
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function ManageEmployeesModule() {
  const { t } = useTranslation()
  const employees = useGameStore((state) => state.roster.employees)
  const titles = useGameStore((state) => state.roster.titles)
  const teams = useGameStore((state) => state.roster.teams)
  const cash = useGameStore((state) => state.finances.cash)
  const day = useGameStore((state) => state.calendar.day)
  const startDateIso = useGameStore((state) => state.calendar.startDateIso)
  const fireEmployee = useGameStore((state) => state.fireEmployee)
  const setEmployeeManager = useGameStore((state) => state.setEmployeeManager)
  const giveEmployeeBonus = useGameStore((state) => state.giveEmployeeBonus)
  const createTeam = useGameStore((state) => state.createTeam)
  const updateTeam = useGameStore((state) => state.updateTeam)
  const deleteTeam = useGameStore((state) => state.deleteTeam)
  const [activeTab, setActiveTab] = useState('employees')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [managerSelectionEmployeeId, setManagerSelectionEmployeeId] = useState(null)
  const [managedWrestlersManagerId, setManagedWrestlersManagerId] = useState(null)
  const [bonusEmployeeId, setBonusEmployeeId] = useState(null)
  const [bonusErrorKey, setBonusErrorKey] = useState(null)
  const [dismissedWarningIds, setDismissedWarningIds] = useState([])
  const [roleFilter, setRoleFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [sortField, setSortField] = useState('skill')
  const [sortOrder, setSortOrder] = useState('desc')

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.employeeId === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  )

  const selectedHistory = useMemo(() => {
    if (!selectedEmployee?.matchStats?.matchHistory) {
      return []
    }

    return [...selectedEmployee.matchStats.matchHistory].sort((a, b) => {
      const dayDiff = (b.day || 0) - (a.day || 0)
      if (dayDiff !== 0) return dayDiff
      return (b.eventName || '').localeCompare(a.eventName || '')
    })
  }, [selectedEmployee])

  const availableManagers = useMemo(
    () => employees.filter((emp) => emp.role === 'manager' && emp.employeeId !== managerSelectionEmployeeId),
    [employees, managerSelectionEmployeeId],
  )

  const assignedManager = useMemo(() => {
    if (!selectedEmployee?.managerId) return null
    return employees.find((emp) => emp.employeeId === selectedEmployee.managerId) || null
  }, [selectedEmployee, employees])

  const managedWrestlers = useMemo(() => {
    if (!managedWrestlersManagerId) return []
    return employees.filter((emp) => emp.managerId === managedWrestlersManagerId)
  }, [employees, managedWrestlersManagerId])

  const managedWrestlersManager = useMemo(() => {
    if (!managedWrestlersManagerId) return null
    return employees.find((emp) => emp.employeeId === managedWrestlersManagerId) || null
  }, [employees, managedWrestlersManagerId])

  const lowHappinessEmployees = useMemo(
    () => employees
      .filter((employee) => ['wrestler', 'staff'].includes(employee.role))
      .filter((employee) => getHappiness(employee) < 10)
      .sort((left, right) => getHappiness(left) - getHappiness(right)),
    [employees],
  )

  const warningEmployee = useMemo(
    () => lowHappinessEmployees.find((employee) => !dismissedWarningIds.includes(employee.employeeId)) || null,
    [dismissedWarningIds, lowHappinessEmployees],
  )

  const wrestlerRankById = useMemo(() => {
    const wrestlers = (employees || []).filter((emp) => emp.role === 'wrestler')
    const maleRanked = calculateRanking(wrestlers.filter((emp) => emp.gender === 'male'))
    const femaleRanked = calculateRanking(wrestlers.filter((emp) => emp.gender === 'female'))
    const map = new Map()
    maleRanked.forEach((w) => map.set(w.employeeId, w.rank))
    femaleRanked.forEach((w) => map.set(w.employeeId, w.rank))
    return map
  }, [employees])

  useEffect(() => {
    setDismissedWarningIds((previous) =>
      previous.filter((employeeId) => lowHappinessEmployees.some((employee) => employee.employeeId === employeeId)),
    )
  }, [lowHappinessEmployees])

  const visibleEmployees = useMemo(() => {
    return [...employees]
      .filter((employee) => roleFilter === 'all' || employee.role === roleFilter)
      .filter((employee) => genderFilter === 'all' || employee.gender === genderFilter)
      .sort((left, right) => {
        const leftValue = sortField === 'fee'
          ? Number(left.contract?.monthlySalary || left.salary || 0)
          : Number(left.skill || 0)
        const rightValue = sortField === 'fee'
          ? Number(right.contract?.monthlySalary || right.salary || 0)
          : Number(right.skill || 0)

        if (leftValue === rightValue) {
          return left.name.localeCompare(right.name)
        }

        return sortOrder === 'asc' ? leftValue - rightValue : rightValue - leftValue
      })
  }, [employees, roleFilter, genderFilter, sortField, sortOrder])

  const titlesByHolderId = useMemo(() => {
    const mapping = new Map()

    ;(titles || []).forEach((title) => {
      const holderIds = title.division === 'doubles'
        ? Array.from(
            new Set(
              [
                ...(Array.isArray(title.holderEmployeeIds) ? title.holderEmployeeIds : []),
                ...(title.holderEmployeeId ? [title.holderEmployeeId] : []),
              ].filter(Boolean),
            ),
          )
        : (title.holderEmployeeId ? [title.holderEmployeeId] : [])

      holderIds.forEach((holderId) => {
        const currentTitles = mapping.get(holderId) || []
        mapping.set(holderId, [...currentTitles, title])
      })
    })

    return mapping
  }, [titles])
  const gameDate = useMemo(() => getGameDate(startDateIso, day), [day, startDateIso])

  const handleAssignManager = (employeeId, managerId) => {
    setEmployeeManager(employeeId, managerId)
    setManagerSelectionEmployeeId(null)
  }

  const handleGiveBonus = (employeeId, amount) => {
    const rankPosition = wrestlerRankById.get(employeeId) || 0
    const result = giveEmployeeBonus(employeeId, amount, rankPosition)
    if (result?.ok) {
      setBonusEmployeeId(null)
      setBonusErrorKey(null)
      return
    }

    if (result?.reason === 'insufficientCash') {
      setBonusErrorKey('bonusInsufficientCash')
    } else if (result?.reason === 'invalidAmount') {
      setBonusErrorKey('bonusInvalidAmount')
    } else {
      setBonusErrorKey('bonusFailed')
    }
  }

  return (
    <section className={styles.moduleBody}>
      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'employees' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          {t('dashboard.employees.tabEmployees')}
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'teams' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          {t('dashboard.employees.tabTeams')}
        </button>
      </div>

      {activeTab === 'teams' && (
        <ManageTeamsSubsection
          employees={employees}
          teams={teams || []}
          createTeam={createTeam}
          updateTeam={updateTeam}
          deleteTeam={deleteTeam}
        />
      )}

      {activeTab === 'employees' && employees.length === 0 && (
        <p className={styles.emptyState}>{t('dashboard.employees.empty')}</p>
      )}

      {activeTab === 'employees' && employees.length > 0 && (
        <>
          <header className={styles.headerRow}>
            <p>{t('dashboard.employees.activeContracts', { amount: employees.length })}</p>
            <p>{t('dashboard.employees.filteredCount', { amount: visibleEmployees.length, total: employees.length })}</p>
          </header>

      <div className={styles.filterRow}>
        <label className={styles.filterField}>
          <span>{t('dashboard.employees.roleFilter')}</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {ROLE_FILTERS.map((role) => (
              <option key={role} value={role}>
                {t(`dashboard.employees.roleOptions.${role}`)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>{t('dashboard.employees.genderFilter')}</span>
          <select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
            {GENDER_FILTERS.map((gender) => (
              <option key={gender} value={gender}>
                {t(`dashboard.employees.genderOptions.${gender}`)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span>{t('dashboard.employees.sortBy')}</span>
          <select value={sortField} onChange={(event) => setSortField(event.target.value)}>
            <option value="skill">{t('dashboard.employees.sortSkill')}</option>
            <option value="fee">{t('dashboard.employees.sortFee')}</option>
          </select>
        </label>

        <label className={styles.filterField}>
          <span>{t('dashboard.employees.sortOrder')}</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="asc">{t('dashboard.employees.sortAsc')}</option>
            <option value="desc">{t('dashboard.employees.sortDesc')}</option>
          </select>
        </label>
      </div>

      <div className={styles.employeeGrid}>
      {visibleEmployees.map((employee) => (
        (() => {
          const heldTitles = titlesByHolderId.get(employee.employeeId) || []
          const isChampion = heldTitles.length > 0

          return (
        <article key={employee.employeeId} className={`${styles.employeeCard} ${isChampion ? styles.employeeCardChampion : ''}`}>
          <img
            className={styles.employeeImage}
            src={employee.imageUrl || getBackupImageByGender(employee.gender)}
            alt={employee.name}
            loading="lazy"
            onError={(event) => {
              if (event.currentTarget.dataset.fallbackApplied === 'true') {
                event.currentTarget.style.display = 'none'
                return
              }

              event.currentTarget.dataset.fallbackApplied = 'true'
              event.currentTarget.src = getBackupImageByGender(employee.gender)
            }}
          />

          <div className={styles.identityRow}>
            <div>
              <h4>{employee.name}</h4>
              <p>{t('dashboard.employees.identity', { gender: employee.gender, dob: formatDobWithAge(employee.dob, gameDate) })}</p>
            </div>
            <span className={styles.tierBadge}>{employee.tier}</span>
          </div>

          <p>{t('dashboard.employees.role', { role: employee.role })}</p>
          <p>{t('dashboard.employees.skill', { skill: employee.skill })}</p>
          {['wrestler', 'staff'].includes(employee.role) && (
            <p className={getHappiness(employee) < 10 ? styles.happinessLow : styles.happinessValue}>
              {t('dashboard.employees.happiness', { amount: getHappiness(employee) })}
            </p>
          )}
          {employee.role === 'wrestler' && (
            <p className={getStamina(employee) < 10 ? styles.staminaLow : ''}>
              {t('dashboard.employees.stamina', { amount: getStamina(employee) })}
            </p>
          )}
          {employee.role === 'wrestler' && (() => {
            const stats = getWrestlerRecentStats(employee)
            if (!stats) return null
            return (
              <div className={styles.recentMatchStats}>
                <span className={styles.recentMatchStatsLabel}>
                  {t('dashboard.employees.last20Label', 'Last {{count}} matches', { count: stats.count })}
                </span>
                <div className={styles.recentMatchStatsPills}>
                  {stats.avgRating !== null && (
                    <span className={styles.recentStatPill}>
                      ★ {stats.avgRating}
                    </span>
                  )}
                  <span className={`${styles.recentStatPill} ${styles.recentStatWin}`}>
                    {stats.wins}W
                  </span>
                  <span className={`${styles.recentStatPill} ${styles.recentStatLoss}`}>
                    {stats.losses}L
                  </span>
                </div>
              </div>
            )
          })()}
          <p>{t('dashboard.employees.monthlyWage', { amount: formatMoney(employee.contract?.monthlySalary || employee.salary) })}</p>
          <p>{t('dashboard.employees.perMatchSalary', { amount: formatMoney(employee.contract?.perMatchSalary || 0) })}</p>
          <p>{t('dashboard.employees.signingBonus', { amount: formatMoney(employee.contract?.signingBonus || 0) })}</p>
          <p>
            {t('dashboard.employees.contractEndDayLabel', 'Contract ends')}: {employee.contract?.endDay ? formatGameDateFromDay(startDateIso, employee.contract.endDay) : '-'}
          </p>
          <p>
            {t('dashboard.employees.contractDaysLeft', {
              days: Math.max(0, (employee.contract?.endDay || day) - day),
            })}
          </p>

          {employee.managerId && <span className={styles.managerAssignedBadge}>{t('dashboard.employees.managerAssigned')}</span>}
          {isChampion ? (
            <div className={styles.championBadgeList}>
              {heldTitles.map((title) => (
                <span key={`${employee.employeeId}-${title.titleId}`} className={styles.championBadge}>
                  <img src={title.image} alt={title.name} loading="lazy" />
                  {title.name}
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.detailsButton}
              onClick={() => setSelectedEmployeeId(employee.employeeId)}
            >
              {t('dashboard.employees.seeDetails')}
            </button>
            <button
              type="button"
              className={styles.fireButton}
              onClick={() => fireEmployee(employee.employeeId)}
            >
              {t('dashboard.employees.fire')}
            </button>
            <button
              type="button"
              className={styles.bonusButton}
              onClick={() => {
                setBonusEmployeeId(employee.employeeId)
                setBonusErrorKey(null)
              }}
            >
              {t('dashboard.employees.giveBonus')}
            </button>
            {employee.role === 'wrestler' && (
              <button
                type="button"
                className={styles.managerButton}
                onClick={() => setManagerSelectionEmployeeId(employee.employeeId)}
              >
                {employee.managerId ? t('dashboard.employees.changeManager') : t('dashboard.employees.assignManager')}
              </button>
            )}
            {employee.role === 'manager' && (
              <button
                type="button"
                className={styles.managerButton}
                onClick={() => setManagedWrestlersManagerId(employee.employeeId)}
              >
                {t('dashboard.employees.showManagedWrestlers')}
              </button>
            )}
          </div>
        </article>
          )
        })()
      ))}
      </div>

      {selectedEmployee && (
        <div
          className={styles.detailsOverlay}
          role="presentation"
          onClick={() => setSelectedEmployeeId(null)}
        >
          <aside
            className={styles.detailsPanel}
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.employees.detailsPanelTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.detailsHeader}>
              <h3>{t('dashboard.employees.detailsPanelTitle')}</h3>
              <button type="button" onClick={() => setSelectedEmployeeId(null)}>
                {t('dashboard.employees.closeDetails')}
              </button>
            </div>

            <div className={styles.detailsIdentity}>
              <img
                className={styles.detailsImage}
                src={selectedEmployee.imageUrl || getBackupImageByGender(selectedEmployee.gender)}
                alt={selectedEmployee.name}
                loading="lazy"
                onError={(event) => {
                  if (event.currentTarget.dataset.fallbackApplied === 'true') {
                    event.currentTarget.style.display = 'none'
                    return
                  }

                  event.currentTarget.dataset.fallbackApplied = 'true'
                  event.currentTarget.src = getBackupImageByGender(selectedEmployee.gender)
                }}
              />
              <div>
                <h4>{selectedEmployee.name}</h4>
                <p>{t('dashboard.employees.identity', { gender: selectedEmployee.gender, dob: formatDobWithAge(selectedEmployee.dob, gameDate) })}</p>
                <p>{t('dashboard.employees.role', { role: selectedEmployee.role })}</p>
                <p>{t('dashboard.employees.skill', { skill: selectedEmployee.skill })}</p>
                {['wrestler', 'staff'].includes(selectedEmployee.role) && (
                  <p className={getHappiness(selectedEmployee) < 10 ? styles.happinessLow : styles.happinessValue}>
                    {t('dashboard.employees.happiness', { amount: getHappiness(selectedEmployee) })}
                  </p>
                )}
                {selectedEmployee.role === 'wrestler' && (
                  <p className={getStamina(selectedEmployee) < 10 ? styles.staminaLow : ''}>
                    {t('dashboard.employees.stamina', { amount: getStamina(selectedEmployee) })}
                  </p>
                )}
              </div>
            </div>

            {assignedManager && (
              <div className={styles.managerInfoSection}>
                <h4>{t('dashboard.employees.managerInfo')}</h4>
                <div className={styles.managerInfoContent}>
                  <img
                    src={assignedManager.imageUrl || getBackupImageByGender(assignedManager.gender)}
                    alt={t('dashboard.employees.managerPhotoAlt')}
                    className={styles.managerInfoImage}
                    loading="lazy"
                  />
                  <div>
                    <span className={styles.managerInfoName}>{assignedManager.name}</span>
                    <p className={styles.managerInfoSkill}>{t('dashboard.employees.skill', { skill: assignedManager.skill })}</p>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.statGrid}>
              <div className={styles.statItem}>
                <span>{t('dashboard.employees.totalMatches')}</span>
                <strong>{selectedEmployee.matchStats?.totalMatches || 0}</strong>
              </div>
              <div className={styles.statItem}>
                <span>{t('dashboard.employees.totalWins')}</span>
                <strong>{selectedEmployee.matchStats?.totalWins || 0}</strong>
              </div>
              <div className={styles.statItem}>
                <span>{t('dashboard.employees.totalLosses')}</span>
                <strong>{selectedEmployee.matchStats?.totalLosses || 0}</strong>
              </div>
            </div>

            <div className={styles.historySection}>
              <h4>{t('dashboard.employees.participationHistory')}</h4>

              {selectedHistory.length === 0 ? (
                <p className={styles.historyEmpty}>{t('dashboard.employees.noHistory')}</p>
              ) : (
                <div className={styles.historyList}>
                  {selectedHistory.map((entry, index) => (
                    <article key={`${entry.day}-${entry.eventName}-${entry.segmentType}-${index}`} className={styles.historyRow}>
                      <div className={styles.historyTop}>
                        <strong>{entry.eventName || t('dashboard.employees.unknownEvent')}</strong>
                        <span>{entry.day ? formatGameDateFromDay(startDateIso, entry.day) : '-'}</span>
                      </div>
                      <p>
                        {t('dashboard.employees.historySegment', {
                          segment: t(`dashboard.events.setup.segmentTypes.${entry.segmentType}`, entry.segmentType),
                        })}
                      </p>
                      <p>
                        {t('dashboard.employees.historyResult', {
                          result: t(`dashboard.employees.results.${entry.result || 'nodecision'}`),
                        })}
                      </p>
                      <p>
                        {t('dashboard.employees.historyWinner', {
                          winner: entry.winnerName || t('dashboard.employees.noDecisionWinner'),
                        })}
                      </p>
                      <p>
                        {t('dashboard.employees.historyOpponents', {
                          opponents:
                            Array.isArray(entry.opponent) && entry.opponent.length > 0
                              ? entry.opponent.join(', ')
                              : t('dashboard.employees.noOpponents'),
                        })}
                      </p>

                      {Array.isArray(entry.otherParticipantDetails) && entry.otherParticipantDetails.length > 0 ? (
                        <div className={styles.historyParticipantsWrap}>
                          <span>{t('dashboard.employees.otherParticipants')}</span>
                          <div className={styles.historyParticipantsGrid}>
                            {entry.otherParticipantDetails.map((participant) => {
                              const isWinner = participant.employeeId === entry.winnerEmployeeId
                              return (
                                <div
                                  key={`${entry.day}-${entry.eventName}-${participant.employeeId}`}
                                  className={`${styles.historyParticipantCard} ${isWinner ? styles.historyParticipantWinner : ''}`}
                                >
                                  <img
                                    src={participant.imageUrl || getBackupImageByGender(participant.gender)}
                                    alt={participant.name}
                                    loading="lazy"
                                  />
                                  <span>{participant.name}</span>
                                  {isWinner ? <em>{t('dashboard.employees.winnerBadge')}</em> : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {managerSelectionEmployeeId && (
        <ManagerSelectionModal
          employee={employees.find((e) => e.employeeId === managerSelectionEmployeeId)}
          managers={availableManagers}
          onSelect={handleAssignManager}
          onClose={() => setManagerSelectionEmployeeId(null)}
        />
      )}

      {managedWrestlersManagerId && managedWrestlersManager && (
        <ManagedWrestlersModal
          manager={managedWrestlersManager}
          managedWrestlers={managedWrestlers}
          onClose={() => setManagedWrestlersManagerId(null)}
        />
      )}

      {bonusEmployeeId && (
        <BonusModal
          employee={employees.find((employee) => employee.employeeId === bonusEmployeeId)}
          cash={cash}
          errorKey={bonusErrorKey}
          onConfirm={(amount) => handleGiveBonus(bonusEmployeeId, amount)}
          onClose={() => {
            setBonusEmployeeId(null)
            setBonusErrorKey(null)
          }}
        />
      )}

      {activeTab === 'employees' && warningEmployee && !bonusEmployeeId && (
        <LowHappinessWarningModal
          employee={warningEmployee}
          onDismiss={() => setDismissedWarningIds((previous) => [...previous, warningEmployee.employeeId])}
          onGiveBonus={() => {
            setBonusEmployeeId(warningEmployee.employeeId)
            setBonusErrorKey(null)
          }}
        />
      )}
        </>
      )}
    </section>
  )
}

export default ManageEmployeesModule
