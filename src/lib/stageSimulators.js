import { supabase } from '../supabaseClient'

// Returns the full simulator objects assigned to a stage via the explicit
// stage_simulators mapping (set by admin), not inferred from instrument_type.
export async function getSimulatorsForStage(stageId) {
  if (!stageId) return []
  const { data, error } = await supabase
    .from('stage_simulators')
    .select('simulator_id, simulators(id, name, type, is_active)')
    .eq('stage_id', stageId)

  if (error || !data) return []
  return data
    .map((row) => row.simulators)
    .filter((s) => s && s.is_active)
}
