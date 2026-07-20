const NEAR_DUE_THRESHOLD = 5 // hours

export function aircraftMaintenanceStatus(a) {
  const h50 = Number(a?.hours_before_50hr_maintenance ?? Infinity)
  const h100 = Number(a?.hours_before_100hr_maintenance ?? Infinity)
  const minHours = Math.min(h50, h100)

  if (minHours <= 0) return 'due'
  if (minHours <= NEAR_DUE_THRESHOLD) return 'near_due'
  return 'ok'
}

export function aircraftOptionLabel(a) {
  const base = `${a.aircraft_type} — ${a.registry}`
  const status = aircraftMaintenanceStatus(a)
  if (status === 'due') return `${base} (Maintenance due)`
  if (status === 'near_due') return `${base} (Maintenance due soon)`
  return base
}
