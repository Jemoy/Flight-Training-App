// Which simulators satisfy a stage's required instrument_type.
// AATD (Advanced ATD) satisfies a plain 'atd' requirement too, since it's a superset.
// A simulator can hold more than one type rating, so we check for overlap.
// null/undefined instrumentType means the stage has no specific requirement (any works).
export function compatibleSimulators(stageInstrumentType, simulators) {
  if (!stageInstrumentType) return simulators
  if (stageInstrumentType === 'atd') {
    return simulators.filter((s) => (s.type ?? []).some((t) => t === 'atd' || t === 'aatd'))
  }
  if (stageInstrumentType === 'basic_or_atd') {
    return simulators.filter((s) =>
      (s.type ?? []).some((t) => ['basic_simulator', 'atd', 'aatd'].includes(t))
    )
  }
  return simulators
}
