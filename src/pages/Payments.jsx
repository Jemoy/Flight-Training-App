import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Calendar from '../components/Calendar'

export default function Payments({ session }) {
  const [stages, setStages] = useState([])
  const [stageId, setStageId] = useState('')
  const [amount, setAmount] = useState('')
  const [hoursCovered, setHoursCovered] = useState('')
  const [file, setFile] = useState(null)
  const [requestedStart, setRequestedStart] = useState(null) // Date | null
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [myPayments, setMyPayments] = useState([])
  const [loading, setLoading] = useState(true)

  // Calendar state
  const [calView, setCalView] = useState('week')
  const [calDate, setCalDate] = useState(new Date())
  const [calEvents, setCalEvents] = useState([])

  useEffect(() => {
    loadStages()
    loadMyPayments()
    loadCalendar()
  }, [])

  async function loadStages() {
    const { data, error } = await supabase
      .from('stages')
      .select('id, name, code')
      .eq('track', 'simulator')
      .order('sequence_order', { ascending: true })

    if (!error) setStages(data ?? [])
  }

  async function loadMyPayments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, amount, hours_covered, status, submitted_at, stage_id, stages(name), sessions(scheduled_start, scheduled_end, status)'
      )
      .eq('student_id', session.user.id)
      .order('submitted_at', { ascending: false })

    if (!error) setMyPayments(data ?? [])
    setLoading(false)
  }

  // Shows everyone's booked/pending sessions (no names, privacy) + this
  // student's own class schedule, so they can pick a genuinely open slot.
  async function loadCalendar() {
    const userId = session.user.id

    const { data: allParticipants } = await supabase
      .from('session_participants')
      .select('student_id, sessions(id, scheduled_start, scheduled_end, status, stages(name))')

    const { data: classes } = await supabase
      .from('class_schedule')
      .select('class_name, start_time, end_time')
      .eq('student_id', userId)

    const seen = new Set()
    const sessionEvents = []

    for (const p of allParticipants ?? []) {
      const s = p.sessions
      if (!s || s.status === 'cancelled' || seen.has(s.id)) continue
      seen.add(s.id)

      const isMine = p.student_id === userId
      const isPending = s.status === 'pending'
      sessionEvents.push({
        id: `session-${s.id}`,
        start: new Date(s.scheduled_start),
        end: new Date(s.scheduled_end),
        title: isMine
          ? `${isPending ? 'Pending: ' : 'You: '}${s.stages?.name ?? 'Session'}`
          : isPending
          ? 'Pending approval'
          : 'Booked',
        type: isMine ? (isPending ? 'pending' : 'mine') : isPending ? 'pending' : 'booked',
      })
    }

    const classEvents = (classes ?? []).map((c, i) => ({
      id: `class-${i}`,
      start: new Date(c.start_time),
      end: new Date(c.end_time),
      title: c.class_name,
      type: 'class',
    }))

    setCalEvents([...sessionEvents, ...classEvents])
  }

  function handleSlotClick(clickedDate) {
    setRequestedStart(clickedDate)
  }

  function requestedEndPreview() {
    if (!requestedStart || !hoursCovered) return null
    return new Date(requestedStart.getTime() + Number(hoursCovered) * 60 * 60 * 1000)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!file || !stageId || !amount || !hoursCovered) {
      setError('Please fill in every field and choose a receipt file.')
      return
    }
    if (!requestedStart) {
      setError('Click a slot on the calendar above to request your simulator schedule.')
      return
    }

    setSubmitting(true)
    const userId = session.user.id
    const requestedEnd = requestedEndPreview()

    // Conflict check against the student's own class schedule before submitting
    const { data: classes } = await supabase
      .from('class_schedule')
      .select('class_name, start_time, end_time')
      .eq('student_id', userId)

    const conflict = (classes ?? []).find((c) => {
      const cStart = new Date(c.start_time)
      const cEnd = new Date(c.end_time)
      return requestedStart < cEnd && requestedEnd > cStart
    })

    if (conflict) {
      setError(`Your requested time conflicts with your class "${conflict.class_name}". Pick another slot.`)
      setSubmitting(false)
      return
    }

    // 1. Upload the receipt to the private 'receipts' bucket
    const filePath = `${userId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, file)

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`)
      setSubmitting(false)
      return
    }

    // 2. Create the session as a tentative hold (status = pending) —
    // it blocks the slot on the calendar but isn't a real booking yet.
    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        stage_id: stageId,
        scheduled_start: requestedStart.toISOString(),
        scheduled_end: requestedEnd.toISOString(),
        status: 'pending',
      })
      .select()
      .single()

    if (sessionError) {
      setError(`Could not hold that time slot: ${sessionError.message}`)
      setSubmitting(false)
      return
    }

    const { error: participantError } = await supabase.from('session_participants').insert({
      session_id: newSession.id,
      student_id: userId,
      hours_credited: Number(hoursCovered),
    })

    if (participantError) {
      setError(`Could not link your schedule request: ${participantError.message}`)
      setSubmitting(false)
      return
    }

    // 3. Create the payment record, linked to that pending session —
    // faculty approves both together.
    const { error: insertError } = await supabase.from('payments').insert({
      student_id: userId,
      stage_id: stageId,
      amount: Number(amount),
      hours_covered: Number(hoursCovered),
      receipt_url: filePath,
      status: 'pending',
      session_id: newSession.id,
    })

    if (insertError) {
      setError(`Could not save payment record: ${insertError.message}`)
      setSubmitting(false)
      return
    }

    setSuccessMsg(
      'Receipt and schedule request submitted. Faculty will approve both together — your slot is held in the meantime.'
    )
    setAmount('')
    setHoursCovered('')
    setFile(null)
    setRequestedStart(null)
    e.target.reset()
    await Promise.all([loadMyPayments(), loadCalendar()])
    setSubmitting(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Payments</div>
      <div className="page-subheading">
        Upload your receipt and pick your preferred simulator schedule. Faculty verifies
        the payment and approves the schedule together — your slot is held while you wait.
      </div>

      <Calendar
        view={calView}
        currentDate={calDate}
        onViewChange={setCalView}
        onDateChange={setCalDate}
        events={calEvents}
        onSlotClick={handleSlotClick}
      />

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <form onSubmit={handleSubmit} className="payment-form">
        <div className="field">
          <label htmlFor="stage">Stage</label>
          <select id="stage" value={stageId} onChange={(e) => setStageId(e.target.value)} required>
            <option value="">Select a stage…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="amount">Amount paid</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="hours">Hours this payment covers</label>
          <input
            id="hours"
            type="number"
            step="0.5"
            min="0"
            value={hoursCovered}
            onChange={(e) => setHoursCovered(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="receipt">Receipt (image or PDF)</label>
          <input
            id="receipt"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files[0])}
            required
          />
        </div>

        <div className="field">
          <label>Requested simulator schedule</label>
          {requestedStart ? (
            <div className="requested-slot">
              {requestedStart.toLocaleString()}
              {hoursCovered && requestedEndPreview() && (
                <> – {requestedEndPreview().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
              )}
              <button type="button" className="link-btn" onClick={() => setRequestedStart(null)}>
                Clear
              </button>
            </div>
          ) : (
            <p className="empty-text">Click an open slot on the calendar above to set this.</p>
          )}
        </div>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit payment & schedule request'}
        </button>
      </form>

      <div className="section-divider" />

      <h3 className="section-title">Your payment history</h3>
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && myPayments.length === 0 && (
        <p className="empty-text">No payments submitted yet.</p>
      )}
      {!loading && myPayments.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Amount</th>
              <th>Hours</th>
              <th>Requested schedule</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {myPayments.map((p) => (
              <tr key={p.id}>
                <td>{p.stages?.name ?? '—'}</td>
                <td className="hours-figure">₱{p.amount}</td>
                <td className="hours-figure">{p.hours_covered}</td>
                <td>
                  {p.sessions?.scheduled_start
                    ? new Date(p.sessions.scheduled_start).toLocaleString()
                    : '—'}
                </td>
                <td>
                  <span className={`status-pill ${p.status}`}>{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
