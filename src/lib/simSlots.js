// The school's standard simulator schedule: 12 fixed 60-minute slots per day,
// each separated by a 10-minute gap. All simulator bookings must align to one
// of these — no arbitrary hour picks.

export const SIM_SLOTS = [
  { start: '08:00', end: '09:00' },
  { start: '09:10', end: '10:10' },
  { start: '10:20', end: '11:20' },
  { start: '11:30', end: '12:30' },
  { start: '12:40', end: '13:40' },
  { start: '13:50', end: '14:50' },
  { start: '15:00', end: '16:00' },
  { start: '16:10', end: '17:10' },
  { start: '17:20', end: '18:20' },
  { start: '18:30', end: '19:30' },
  { start: '19:40', end: '20:40' },
  { start: '20:50', end: '21:50' },
]

function parseHM(str) {
  const [h, m] = str.split(':').map(Number)
  return { h, m }
}

export function slotStartDate(day, slotIndex) {
  const { h, m } = parseHM(SIM_SLOTS[slotIndex].start)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

export function slotEndDate(day, slotIndex) {
  const { h, m } = parseHM(SIM_SLOTS[slotIndex].end)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

// Which slot a given Date's time-of-day falls into (-1 if it doesn't land in
// any defined slot, e.g. legacy or backfilled data from before this existed).
export function findSlotIndexForDate(date) {
  const minutesOfDay = date.getHours() * 60 + date.getMinutes()
  for (let i = 0; i < SIM_SLOTS.length; i++) {
    const { h: sh, m: sm } = parseHM(SIM_SLOTS[i].start)
    const { h: eh, m: em } = parseHM(SIM_SLOTS[i].end)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (minutesOfDay >= startMin && minutesOfDay < endMin) return i
  }
  return -1
}
