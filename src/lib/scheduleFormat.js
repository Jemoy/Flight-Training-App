// "Jeremy S. Bajado" -> "BAJADO, J."
export function studentDisplayName(fullName) {
  if (!fullName) return '—'
  const parts = fullName.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  const firstInitial = parts[0]?.[0] ?? ''
  return `${last.toUpperCase()}, ${firstInitial.toUpperCase()}.`
}

// "Robert Mendoza" -> "RM"
export function instructorInitials(fullName) {
  if (!fullName) return '—'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Consistent color per instructor, cycling through a fixed palette by id.
const INSTRUCTOR_PALETTE = [
  { bg: '#2f9e7a', fg: '#fff' }, // green
  { bg: '#7c3aed', fg: '#fff' }, // purple
  { bg: '#d97706', fg: '#fff' }, // amber/orange
  { bg: '#0b6e8f', fg: '#fff' }, // teal
  { bg: '#b91c1c', fg: '#fff' }, // maroon
  { bg: '#334155', fg: '#fff' }, // slate navy
]

export function instructorColor(instructorId) {
  if (!instructorId) return { bg: '#c3cad1', fg: '#2c3540' }
  let hash = 0
  for (let i = 0; i < instructorId.length; i++) {
    hash = (hash * 31 + instructorId.charCodeAt(i)) >>> 0
  }
  return INSTRUCTOR_PALETTE[hash % INSTRUCTOR_PALETTE.length]
}

// Pastel header color per weekday (0 = Sunday ... 6 = Saturday), loosely
// matching a typical printed weekly schedule sheet.
const DOW_COLORS = [
  '#e9def0', // Sun
  '#ddd6bd', // Mon
  '#cfe2f3', // Tue
  '#cfe2f3', // Wed
  '#f7d9d0', // Thu
  '#d9ead3', // Fri
  '#d9d2e9', // Sat
]

export function dowColor(date) {
  return DOW_COLORS[date.getDay()]
}
