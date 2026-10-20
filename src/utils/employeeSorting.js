export const getEmployeeWinRate = (employee) => {
  const wins = Number(employee?.matchStats?.totalWins) || 0
  const losses = Number(employee?.matchStats?.totalLosses) || 0
  const decidedMatches = wins + losses

  return decidedMatches === 0 ? 0 : (wins / decidedMatches) * 100
}

const getSortValue = (employee, field) => {
  if (field === 'winRate') return getEmployeeWinRate(employee)
  if (field === 'stamina') return Number(employee?.stamina ?? 100) || 0
  if (field === 'popularity') return Number(employee?.popularity) || 0
  if (field === 'skill') return Number(employee?.skill) || 0
  if (field === 'fee') {
    return Number(employee?.contract?.monthlySalary ?? employee?.salary) || 0
  }

  return Number(
    employee?.contract?.negotiatedMonthlySalary
      ?? employee?.salary
      ?? employee?.contract?.monthlySalary,
  ) || 0
}

export const sortEmployees = (employees, field, order = 'asc') => (
  [...(Array.isArray(employees) ? employees : [])].sort((left, right) => {
    const difference = getSortValue(left, field) - getSortValue(right, field)
    if (difference === 0) return (left?.name || '').localeCompare(right?.name || '')
    return order === 'asc' ? difference : -difference
  })
)
