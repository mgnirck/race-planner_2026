export function goalMinutesFromFields(h, m) {
  const hours = parseInt(h, 10)
  const mins  = parseInt(m, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  if (hours < 0 || hours > 200) return null
  if (mins < 0 || mins > 59) return null
  const total = hours * 60 + mins
  return total > 0 ? total : null
}

/**
 * Maps a race distance in km to the closest standard race type.
 * Shared by the Quick and Pro planners so both classify a distance the same way.
 * Boundaries sit roughly midway between standard distances; anything clearly
 * longer than a marathon (> 45 km, allowing for GPS overshoot) is an ultra.
 * Note: carb targets come from goal duration, not race type — race type only
 * drives labels and product rules (e.g. Ultra Gel eligibility).
 */
export function distanceToRaceType(km) {
  if (km < 7.5)  return '5k'
  if (km < 15.5) return '10k'
  if (km < 31.6) return 'half_marathon'
  if (km < 45)   return 'marathon'
  if (km < 75)   return 'ultra_50k'
  return 'ultra_100k'
}
