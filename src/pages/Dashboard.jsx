import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import StageProgress from '../components/StageProgress'

export default function Dashboard({ session }) {
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadProgress()
  }, [])

  async function loadProgress() {
    setLoading(true)
    setError('')

    const userId = session.user.id

    // All simulator-track stages, in order
    const { data: stageRows, error: stageErr } = await supabase
      .from('stages')
      .select('id, code, name, sequence_order, required_hours, instrument_type')
      .eq('track', 'simulator')
      .order('sequence_order', { ascending: true })

    if (stageErr) {
      setError(stageErr.message)
      setLoading(false)
      return
    }

    // This student's progress rows (may not exist yet for locked/not-started stages)
    const { data: progressRows, error: progressErr } = await supabase
      .from('student_stage_progress')
      .select('stage_id, cumulative_hours, status')
      .eq('student_id', userId)

    if (progressErr) {
      setError(progressErr.message)
      setLoading(false)
      return
    }

    const progressByStage = Object.fromEntries(
      (progressRows ?? []).map((r) => [r.stage_id, r])
    )

    const merged = (stageRows ?? []).map((stage) => {
      const progress = progressByStage[stage.id]
      const defaultStatus = stage.sequence_order === 1 ? 'in_progress' : 'locked'

      return {
        stage_id: stage.id,
        stage_name: stage.name,
        required_hours: stage.required_hours,
        instrument_type: stage.instrument_type,
        cumulative_hours: progress?.cumulative_hours ?? 0,
        status: progress?.status ?? defaultStatus,
      }
    })

    setStages(merged)
    setLoading(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Simulator training progress</div>
      <div className="page-subheading">
        Your progress through the gated simulator stages. Each stage unlocks once the
        hour requirement and faculty evaluation are both met.
      </div>

      {loading && <p className="loading-text">Loading your progress…</p>}
      {error && <div className="auth-error">{error}</div>}
      {!loading && !error && <StageProgress stages={stages} />}
    </div>
  )
}
