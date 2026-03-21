/**
 * Format date as "1 January 2026" (Day Month Year).
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string}
 */
export function formatDateDMY(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = d.toLocaleString('en-GB', { month: 'long' })
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

/**
 * Format date and time as "1 January 2026, 2:30 pm".
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string}
 */
export function formatDateTimeDMY(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const datePart = formatDateDMY(d)
  const timePart = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart}, ${timePart}`
}
