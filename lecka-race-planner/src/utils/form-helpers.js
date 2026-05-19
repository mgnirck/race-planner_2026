export function goalMinutesFromFields(h, m) {
  const hours = parseInt(h, 10)
  const mins  = parseInt(m, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  if (hours < 0 || hours > 200) return null
  if (mins < 0 || mins > 59) return null
  const total = hours * 60 + mins
  return total > 0 ? total : null
}
