import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function FacultyEvaluations({ session }) {
  const [pending, setPending] = useState([]) // participants awaiting evaluation
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openRowId, setOpenRowId] = useState(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadPending()
  }, [])

  async function loadPending() {
    setLoading(true)
    setError('')

    const { data: participants, error: pErr } = await supabase
      .from('session_participants')
      .select(
        'id, student_id, session_id, hours_credited, profiles(full_name), sessions(id, scheduled_start, status, stages(name))'
      )

    if (pErr) {
      setError(pErr.message)
      setLoading(false)
      return
    }

    const { data: evaluations, error: eErr } = await supabase
      .from('evaluations')
      .select('session_id, student_id')

    if (eErr) {
      setError(eErr.message)
      setLoading(false)
      return
    }

    const evaluatedKeys = new Set((evaluations ?? []).map((e) => `${e.session_id}_${e.student_id}`))

    const stillPending = (participants ?? []).filter(
      (p) => !evaluatedKeys.has(`${p.session_id}_${p.student_id}`)
    )

    setPending(stillPending)
    setLoading(false)
  }

  async function handleEvaluate(participant, result) {
    setSubmitting(true)
    setError('')

    const { error: evalError } = await supabase.from('evaluations').insert({
      session_id: participant.session_id,
      student_id: participant.student_id,
      evaluator_id: session.user.id,
      result,
      notes,
    })

    if (evalError) {
      setError(evalError.message)
      setSubmitting(false)
      return
    }

    // Mark the session completed once evaluated (simple MVP rule —
    // for group sessions you may want to wait until all participants are done)
    await supabase.from('sessions').update({ status: 'completed' }).eq('id', participant.session_id)

    setNotes('')
    setOpenRowId(null)
    await loadPending()
    setSubmitting(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Student evaluations</div>
      <div className="page-subheading">
        A passing evaluation is the gate itself — combined with hours, it unlocks the
        student's next stage automatically.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && pending.length === 0 && (
        <p className="empty-text">No sessions awaiting evaluation.</p>
      )}

      {!loading && pending.length > 0 && (
        <div className="eval-list">
          {pending.map((p) => (
            <div className="eval-card" key={p.id}>
              <div className="eval-card-top">
                <div>
                  <div className="eval-student">{p.profiles?.full_name ?? 'Unknown student'}</div>
                  <div className="eval-meta">
                    {p.sessions?.stages?.name} ·{' '}
                    {p.sessions?.scheduled_start
                      ? new Date(p.sessions.scheduled_start).toLocaleString()
                      : '—'}{' '}
                    · {p.hours_credited} hrs
                  </div>
                </div>
                {openRowId !== p.id && (
                  <button className="link-btn" onClick={() => setOpenRowId(p.id)}>
                    Evaluate
                  </button>
                )}
              </div>

              {openRowId === p.id && (
                <div className="eval-form">
                  <textarea
                    placeholder="Notes on this student's performance…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                  <div className="row-actions">
                    <button
                      className="btn-approve"
                      disabled={submitting}
                      onClick={() => handleEvaluate(p, 'pass')}
                    >
                      Pass
                    </button>
                    <button
                      className="btn-reject"
                      disabled={submitting}
                      onClick={() => handleEvaluate(p, 'fail')}
                    >
                      Fail
                    </button>
                    <button
                      className="link-btn"
                      disabled={submitting}
                      onClick={() => {
                        setOpenRowId(null)
                        setNotes('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
