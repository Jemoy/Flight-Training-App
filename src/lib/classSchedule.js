export const TYPE_OPTIONS = ['Lecture', 'Laboratory', 'Lecture&Lab']

const DAY_LETTERS = { 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'S' }

// [1,3,5] -> "MWF", [2,4] -> "TTh"
export function daysToPattern(days) {
  return [...days].sort((a, b) => a - b).map((d) => DAY_LETTERS[d]).join('')
}

export function formatTimeRange(startTime, endTime) {
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Total weekly contact hours: (end - start) in hours, times number of days
export function calcWeeklyHours(startTime, endTime, days) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const durationHours = (eh * 60 + em - (sh * 60 + sm)) / 60
  return Math.round(durationHours * days.length * 100) / 100
}

export const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

export function emptyClassEntry() {
  return { id: crypto.randomUUID(), className: '', days: [], startTime: '09:00', endTime: '10:00' }
}

// Every occurrence of any of entry.days between semesterStart and semesterEnd
// (inclusive), as class_schedule rows with real start_time/end_time timestamps.
export function generateOccurrences(entry, semesterStart, semesterEnd) {
  const rows = []
  const cursor = new Date(`${semesterStart}T00:00`)
  const end = new Date(`${semesterEnd}T00:00`)
  const dayNums = (entry.days ?? []).map(Number)

  while (cursor <= end) {
    if (dayNums.includes(cursor.getDay())) {
      const [sh, sm] = entry.startTime.split(':').map(Number)
      const [eh, em] = entry.endTime.split(':').map(Number)
      const start = new Date(cursor)
      start.setHours(sh, sm, 0, 0)
      const stop = new Date(cursor)
      stop.setHours(eh, em, 0, 0)
      rows.push({ class_name: entry.className, start_time: start.toISOString(), end_time: stop.toISOString() })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return rows
}
