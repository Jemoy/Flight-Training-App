import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Schedule({ session }) {
  const [availability, setAvailability] = useState([]) // [{stage_id, stage_name, available_hours}]
  const [stageId, setStageId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationHours, setDurationHours] = useState('1')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mySessions, setMySessions] = useState([])

  useEffect(() => {
    loadAvailability()
    loadMySessions()
  }, [])

  async function loadAvailability() {
    setLoading(true)
    const userId = session.user.id

    const { data: stages } = await supabase
      .from('stages')
      .select('id, name')
      .eq('track', 'simulator')

    const { data: payments } = await supabase
      .from('payments')
      .select('stage_id, hours_covered')
      .eq('student_id', userId)
      .eq('status', 'verified')

    const { data: participations } = await supabase
      .from('session_participants')
      .select('hours_credited, sessions(stage_id)')
      .eq('student_id', userId)

    const paidByStage = {}
    for (const p of payments ?? []) {
      paidByStage[p.stage_id] = (paidByStage[p.stage_id] ?? 0) + Number(p.hours_covered)
    }

    const usedByStage = {}
    for (const p of participations ?? []) {
      const sid = p.sessions?.stage_id
      if (!sid) continue
      usedByStage[sid] = (usedByStage[sid] ?? 0) + Number(p.hours_credited ?? 0)
    }

    const rows = (stages ?? [])
      .map((s) => {
        const paid = paidByStage[s.id] ?? 0
        const used = usedByStage[s.id] ?? 0
        const available = Math.round((paid - used) * 100) / 100
        return { stage_id: s.id, stage_name: s.name, available_hours: available }
      })
      .filter((r) => r.available_hours > 0)

    setAvailability(rows)
    setLoading(false)
  }

  async function loadMySessions() {
    const userId = session.user.id
    const { data } = await supabase
      .from('session_participants')
      .select('id, hours_credited, sessions(id, scheduled_start, scheduled_end, status, stages(name))')
      .eq('student_id', userId)
      .order('id', { ascending: false })

    setMySessions(data ?? [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!stageId || !date || !startTime || !durationHours) {
      setError('Please fill in every field.')
      return
    }

    const start = new Date(`${date}T${startTime}`)
    const end = new Date(start.getTime() + Number(durationHours) * 60 * 60 * 1000)

    setSubmitting(true)

    // Conflict check against the student's class schedule
    const { data: classes, error: classErr } = await supabase
      .from('class_schedule')
      .select('class_name, start_time, end_time')
      .eq('student_id', session.user.id)

    if (classErr) {
      setError(`Could not check class schedule: ${classErr.message}`)
      setSubmitting(false)
      return
    }

    const conflict = (classes ?? []).find((c) => {
      const cStart = new Date(c.start_time)
      const cEnd = new Date(c.end_time)
      return start < cEnd && end > cStart
    })

    if (conflict) {
      setError(`This time conflicts with your class "${conflict.class_name}". Pick another time.`)
      setSubmitting(false)
      return
    }

    // Create the session (instructor assigned later by admin)
    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        stage_id: stageId,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: 'scheduled',
      })
      .select()
      .single()

    if (sessionError) {
      setError(`Could not create session: ${sessionError.message}`)
      setSubmitting(false)
      return
    }

    const { error: participantError } = await supabase.from('session_participants').insert({
      session_id: newSession.id,
      student_id: session.user.id,
      hours_credited: Number(durationHours),
    })

    if (participantError) {
      setError(`Session created, but could not link your booking: ${participantError.message}`)
      setSubmitting(false)
      return
    }

    setSuccessMsg('Session booked. An instructor will be assigned by the scheduling office.')
    setDate('')
    setStartTime('')
    setDurationHours('1')
    await Promise.all([loadAvailability(), loadMySessions()])
    setSubmitting(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Schedule a simulator session</div>
      <div className="page-subheading">
        You can only book hours you have a verified payment for. Instructors are
        assigned by the scheduling office, not chosen by you.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      {!loading && availability.length === 0 && (
        <p className="empty-text">
          No paid, verified hours available yet. Submit a payment first on the Payments page.
        </p>
      )}

      {availability.length > 0 && (
        <form onSubmit={handleSubmit} className="payment-form">
          <div className="field">
            <label htmlFor="stage">Stage</label>
            <select id="stage" value={stageId} onChange={(e) => setStageId(e.target.value)} required>
              <option value="">Select a stage…</option>
              {availability.map((a) => (
                <option key={a.stage_id} value={a.stage_id}>
                  {a.stage_name} ({a.available_hours} hrs available)
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="startTime">Start time</label>
            <input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="duration">Duration (hours)</label>
            <input
              id="duration"
              type="number"
              step="0.5"
              min="0.5"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Booking…' : 'Book session'}
          </button>
        </form>
      )}

      <div className="section-divider" />

      <h3 className="section-title">Your upcoming sessions</h3>
      {mySessions.length === 0 && <p className="empty-text">No sessions booked yet.</p>}
      {mySessions.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Start</th>
              <th>Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mySessions.map((sp) => (
              <tr key={sp.id}>
                <td>{sp.sessions?.stages?.name ?? '—'}</td>
                <td>
                  {sp.sessions?.scheduled_start
                    ? new Date(sp.sessions.scheduled_start).toLocaleString()
                    : '—'}
                </td>
                <td className="hours-figure">{sp.hours_credited}</td>
                <td>
                  <span className={`status-pill ${sp.sessions?.status}`}>
                    {sp.sessions?.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
