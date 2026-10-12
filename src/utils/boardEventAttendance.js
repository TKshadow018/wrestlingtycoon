const clampRandom = (random) => {
  const value = Number(random())
  if (!Number.isFinite(value)) {
    throw new Error('Board event attendance random source must return a finite number')
  }

  return Math.max(0, Math.min(1 - Number.EPSILON, value))
}

const getMemberByNameOrRole = (members, name, role) => (
  members.find((member) => member.person_name === name)
  || members.find((member) => member.current_role === role)
)

const createAttendance = ({ member, role, minimumBonus, maximumBonus, baseGateRevenue, random }) => {
  const randomFactor = clampRandom(random)
  const gateBonusPercent = Number((
    minimumBonus + randomFactor * (maximumBonus - minimumBonus)
  ).toFixed(1))

  return {
    personName: member.person_name,
    imageUrl: member.image_url || '',
    role,
    gateBonusPercent,
    gateBonusAmount: Math.round(Math.max(0, Number(baseGateRevenue) || 0) * gateBonusPercent / 100),
  }
}

export const getBoardEventAttendance = ({
  eventType,
  boardMembers,
  boardPresidentName,
  boardVicePresidentName,
  baseGateRevenue = 0,
  random = Math.random,
}) => {
  if (eventType !== 'ppv' && eventType !== 'megaLive') {
    return null
  }
  if (!Array.isArray(boardMembers) || boardMembers.length === 0) {
    throw new Error('Board members are required to resolve event attendance')
  }

  if (eventType === 'ppv') {
    if (clampRandom(random) >= 0.25) {
      return null
    }

    const memberIndex = Math.floor(clampRandom(random) * boardMembers.length)
    const member = boardMembers[memberIndex]
    return createAttendance({
      member,
      role: member.current_role,
      minimumBonus: 5,
      maximumBonus: 20,
      baseGateRevenue,
      random,
    })
  }

  const president = getMemberByNameOrRole(boardMembers, boardPresidentName, 'Board Chair')
  const vicePresident = getMemberByNameOrRole(boardMembers, boardVicePresidentName, 'Vice Chair')
  if (!president || !vicePresident) {
    throw new Error('Board President and Vice President must be available for Mega Live attendance')
  }

  if (clampRandom(random) < 0.5) {
    return createAttendance({
      member: president,
      role: 'Board President',
      minimumBonus: 20,
      maximumBonus: 25,
      baseGateRevenue,
      random,
    })
  }

  return createAttendance({
    member: vicePresident,
    role: 'Vice President',
    minimumBonus: 15,
    maximumBonus: 20,
    baseGateRevenue,
    random,
  })
}
