export const selectHeaderSnapshot = (state) => ({
  day: state.calendar.day,
  week: state.calendar.week,
  isEventDay: state.calendar.isEventDay,
  cash: state.finances.cash,
  fans: state.stats.fans,
  prestige: state.stats.prestige,
})
