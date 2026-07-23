import { supabase } from '../supabaseClient'

// Returns the full aircraft objects assigned to a stage via the explicit
// stage_aircraft mapping (set by admin), mirroring getSimulatorsForStage.
export async function getAircraftForStage(stageId) {
  if (!stageId) return []
  const { data, error } = await supabase
    .from('stage_aircraft')
    .select('aircraft_id, aircraft(id, aircraft_type, registry, is_active, hours_before_50hr_maintenance, hours_before_100hr_maintenance)')
    .eq('stage_id', stageId)

  if (error || !data) return []
  return data
    .map((row) => row.aircraft)
    .filter((a) => a && a.is_active)
}
