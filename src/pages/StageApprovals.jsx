import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function StageApprovals({ session }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    loadPending()
  }, [])

  async function loadPending() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('student_stage_progress')
      .select(
        'student_id, stage_id, cumulative_hours, profiles!student_stage_progress_student_id_fkey(full_name, student_number), stages(name, required_hours)'
      )
      .eq('status', 'pending_approval')

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Show the instructor's recommendation + who/when, from the most recent
    // evaluation for that student+stage.
    const enriched = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: evalRows } = await supabase
          .from('evaluations')
          .select('notes, created_at, evaluator:profiles!evaluations_evaluator_id_fkey(full_name), sessions!inner(stage_id)')
          .eq('student_id', row.student_id)
          .eq('sessions.stage_id', row.stage_id)
          .order('created_at', { ascending: false })
          .limit(1)

        return { ...row, latestEval: evalRows?.[0] ?? null }
      })
    )

    setRows(enriched)
    setLoading(false)
  }

  async function handleApprove(row) {
    setBusyId(`${row.student_id}_${row.stage_id}`)
    setError('')

    const { error } = await supabase.rpc('approve_stage_advancement', {
      p_student_id: row.student_id,
      p_stage_id: row.stage_id,
      p_approver: session.user.id,
    })

    if (error) {
      setError(error.message)
      setBusyId(null)
      return
    }

    await loadPending()
    setBusyId(null)
  }

  async function handleReject(row) {
    setBusyId(`${row.student_id}_${row.stage_id}`)
    setError('')

    const { error } = await supabase.rpc('reject_stage_advancement', {
      p_student_id: row.student_id,
      p_stage_id: row.stage_id,
    })

    if (error) {
      setError(error.message)
      setBusyId(null)
      return
    }

    await loadPending()
    setBusyId(null)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Stage approvals</div>
      <div className="page-subheading">
        Students who've met the hour requirement and been recommended by their
        instructor to proceed. Approving unlocks the next stage.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="empty-text">No stages awaiting approval.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="eval-list">
          {rows.map((row) => {
            const key = `${row.student_id}_${row.stage_id}`
            return (
              <div className="eval-card" key={key}>
                <div className="eval-card-top">
                  <div>
                    <div className="eval-student">
                      {row.profiles?.full_name ?? 'Unknown student'}{' '}
                      {row.profiles?.student_number && `(${row.profiles.student_number})`}
                    </div>
                    <div className="eval-meta">
                      {row.stages?.name} · {row.cumulative_hours}/{row.stages?.required_hours} hrs ·
                      Recommended by {row.latestEval?.evaluator?.full_name ?? 'Unknown instructor'}
                      {row.latestEval?.notes && <> · "{row.latestEval.notes}"</>}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      className="btn-approve"
                      disabled={busyId === key}
                      onClick={() => handleApprove(row)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-reject"
                      disabled={busyId === key}
                      onClick={() => handleReject(row)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
