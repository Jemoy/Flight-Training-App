// Merges raw stage rows + a student's progress rows + the prerequisite graph
// into each stage's effective status. A stage with no progress row defaults
// to 'in_progress' if it has zero prerequisites, otherwise 'locked'.
export function computeStageStatuses(stages, progressRows, prerequisites) {
  const progressByStage = Object.fromEntries((progressRows ?? []).map((p) => [p.stage_id, p]))
  const prereqByStage = {}
  for (const p of prerequisites ?? []) {
    if (!prereqByStage[p.stage_id]) prereqByStage[p.stage_id] = []
    prereqByStage[p.stage_id].push(p.prerequisite_stage_id)
  }

  return (stages ?? []).map((stage) => {
    const progress = progressByStage[stage.id]
    if (progress) {
      return { ...stage, status: progress.status, cumulative_hours: Number(progress.cumulative_hours ?? 0) }
    }
    const hasPrereqs = (prereqByStage[stage.id] ?? []).length > 0
    return { ...stage, status: hasPrereqs ? 'locked' : 'in_progress', cumulative_hours: 0 }
  })
}

export const TRACK_LABELS = {
  simulator: 'FS',
  ppl: 'PPL',
  cpl: 'CPL',
  ir: 'IR',
  multi_engine: 'Multi-Engine',
  build_time: 'Build Time',
}
