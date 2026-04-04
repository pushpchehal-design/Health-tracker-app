const MONTH_LONG = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC day-shift from `new Date(iso)`). */
export function parseISODateLocal(iso) {
  if (!iso || typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(y, mo, day)
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null
  return d
}

/** Time value for strings produced by formatDateDMY ("25 April 2026"). */
export function parseFormatDateDMY(str) {
  if (!str || typeof str !== 'string') return NaN
  const m = /^(\d{1,2})\s+(\w+)\s+(\d{4})$/.exec(str.trim())
  if (!m) return NaN
  const day = Number(m[1])
  const monthIdx = MONTH_LONG.indexOf(m[2].toLowerCase())
  const year = Number(m[3])
  if (monthIdx < 0) return NaN
  const d = new Date(year, monthIdx, day)
  if (d.getFullYear() !== year || d.getMonth() !== monthIdx || d.getDate() !== day) return NaN
  return d.getTime()
}

/** Sort "Day Month Year" labels chronologically. */
export function compareFormatDateDMY(a, b) {
  const ta = parseFormatDateDMY(a)
  const tb = parseFormatDateDMY(b)
  if (Number.isNaN(ta) && Number.isNaN(tb)) return String(a).localeCompare(String(b))
  if (Number.isNaN(ta)) return 1
  if (Number.isNaN(tb)) return -1
  return ta - tb
}

/**
 * Format date as "25 April 2026" (Day Month Year).
 * @param {string|Date} date - ISO date (YYYY-MM-DD), ISO datetime, or Date
 * @returns {string}
 */
export function formatDateDMY(date) {
  if (!date) return ''
  let d
  if (typeof date === 'string') {
    const local = parseISODateLocal(date)
    if (local) d = local
    else {
      d = new Date(date)
    }
  } else {
    d = date
  }
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
  let d
  if (typeof date === 'string') {
    const local = parseISODateLocal(date)
    d = local || new Date(date)
  } else {
    d = date
  }
  if (Number.isNaN(d.getTime())) return ''
  const datePart = formatDateDMY(d)
  const timePart = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart}, ${timePart}`
}
