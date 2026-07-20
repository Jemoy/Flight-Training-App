import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Calendar from '../components/Calendar'
import { getSimulatorsForStage } from '../lib/stageSimulators'
import { computeStageStatuses, TRACK_LABELS } from '../lib/stageStatus'

const BOOKABLE_TRACKS = ['simulator', 'ppl', 'cpl', 'ir', 'multi_engine']

export default function Payments({ session }) {
  const [stages, setStages] = useState([])
  const [trackId, setTrackId] = useState('simulator')
  const [stageId, setStageId] = useState('')
  const [amount, setAmount] = useState('')
  const [hoursCovered, setHoursCovered] = useState('')
  const [file, setFile] = useState(null)
  const [selectedSlots, setSelectedSlots] = useState([]) // Date[], each a 1-hour slot start
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [myPayments, setMyPayments] = useState([])
  const [loading, setLoading] = useState(true)

  // Calendar state
  const [calView, setCalView] = useState('week')
  const [calDate, setCalDate] = useState(new Date())
  const [calEvents, setCalEvents] = useState([])
  const [stageSimulators, setStageSimulators] = useState([])
  const [simulatorFilter, setSimulatorFilter] = useState('') // '' = all simulators

  const requiredSlots = Number(hoursCovered) || 0
  const selectedStage = stages.find((s) => s.id === stageId)

  useEffect(() => {
    loadStages()
    loadMyPayments()
    loadCalendar()
  }, [])

  useEffect(() => {
    if (!stageId) {
      setStageSimulators([])
      setSimulatorFilter('')
      return
    }
    setSimulatorFilter('')
    getSimulatorsForStage(stageId).then((sims) => {
      setStageSimulators(sims)
      setSimulatorFilter(sims[0]?.id ?? '')
    })
  }, [stageId])

  function compatibleSimulatorCount() {
    // Real-flying stages aren't resource-constrained by the simulator fleet —
    // there's no aircraft-availability model yet, so don't block on it.
    if (selectedStage && selectedStage.requires_simulator === false) return 999
    // Explicit admin-assigned mapping — a stage with nothing configured yet
    // has zero valid simulators, so booking is correctly blocked until set up.
    return stageSimulators.length
  }

  async function loadStages() {
    const userId = session.user.id
    const [{ data: allStages, error }, { data: prereqs }, { data: progressRows }] = await Promise.all([
      supabase.from('stages').select('id, name, code, instrument_type, track, sequence_order, requires_simulator'),
      supabase.from('stage_prerequisites').select('stage_id, prerequisite_stage_id'),
      supabase.from('student_stage_progress').select('stage_id, status, cumulative_hours').eq('student_id', userId),
    ])

    if (!error) setStages(computeStageStatuses(allStages, progressRows, prereqs))
  }

  async function loadMyPayments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, amount, hours_covered, status, submitted_at, stage_id, stages(name), sessions!sessions_payment_id_fkey(scheduled_start, status)'
      )
      .eq('student_id', session.user.id)
      .order('submitted_at', { ascending: false })

    if (!error) setMyPayments(data ?? [])
    setLoading(false)
  }

  // Everyone's booked/pending sessions (no names, privacy) + this student's
  // own class schedule, so they can pick genuinely open 1-hour slots.
  async function loadCalendar() {
    const userId = session.user.id

    const { data: allParticipants } = await supabase
      .from('session_participants')
      .select('student_id, sessions(id, scheduled_start, scheduled_end, status, simulator_id, stages(name))')

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
        simulatorId: s.simulator_id ?? null,
        isMine,
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

  function isSlotTaken(slotStart) {
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000)
    const overlapCount = calEvents.filter(
      (e) => e.type !== 'class' && slotStart < e.end && slotEnd > e.start
    ).length
    return overlapCount >= compatibleSimulatorCount()
  }

  function isSlotSelected(slotStart) {
    return selectedSlots.some((s) => s.getTime() === slotStart.getTime())
  }

  function handleSlotClick(clickedDate) {
    setError('')
    const slotStart = new Date(clickedDate) // already an exact SIM_SLOTS start time

    if (isSlotSelected(slotStart)) {
      setSelectedSlots((prev) => prev.filter((s) => s.getTime() !== slotStart.getTime()))
      return
    }

    if (isSlotTaken(slotStart)) {
      setError('That hour is already booked or pending. Pick another.')
      return
    }

    if (!requiredSlots) {
      setError('Enter "Hours this payment covers" first, so you know how many slots to pick.')
      return
    }

    if (selectedSlots.length >= requiredSlots) {
      setError(`You've already selected ${requiredSlots} hour(s). Remove one before adding another.`)
      return
    }

    setSelectedSlots((prev) => [...prev, slotStart].sort((a, b) => a - b))
  }

  // When viewing a specific simulator, show only sessions actually on that
  // exact unit — class schedule is unrelated to simulators so always shows.
  // Pending requests (no simulator assigned yet) don't show under a specific
  // simulator, including the student's own — same reasoning as anyone else's.
  const simulatorFilteredEvents = simulatorFilter
    ? calEvents.filter((e) => e.type === 'class' || e.simulatorId === simulatorFilter)
    : calEvents

  // Overlay the student's in-progress selections on the calendar as "mine" so
  // they're visible before submitting (not yet saved to the database).
  const displayEvents = [
    ...simulatorFilteredEvents,
    ...selectedSlots.map((s, i) => ({
      id: `selected-${i}`,
      start: s,
      end: new Date(s.getTime() + 60 * 60 * 1000),
      title: 'Selected',
      type: 'mine',
    })),
  ]

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!file || !stageId || !amount || !hoursCovered) {
      setError('Please fill in every field and choose a receipt file.')
      return
    }
    if (selectedSlots.length !== requiredSlots) {
      setError(`Select exactly ${requiredSlots} one-hour slot(s) on the calendar — you've picked ${selectedSlots.length}.`)
      return
    }

    setSubmitting(true)
    const userId = session.user.id

    // Conflict check against the student's own class schedule
    const { data: classes } = await supabase
      .from('class_schedule')
      .select('class_name, start_time, end_time')
      .eq('student_id', userId)

    for (const slot of selectedSlots) {
      const slotEnd = new Date(slot.getTime() + 60 * 60 * 1000)
      const conflict = (classes ?? []).find((c) => {
        const cStart = new Date(c.start_time)
        const cEnd = new Date(c.end_time)
        return slot < cEnd && slotEnd > cStart
      })
      if (conflict) {
        setError(`${slot.toLocaleString()} conflicts with your class "${conflict.class_name}". Remove that slot and pick another.`)
        setSubmitting(false)
        return
      }
    }

    // 1. Upload the receipt
    const filePath = `${userId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, file)
    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`)
      setSubmitting(false)
      return
    }

    // 2. Create the payment first, so each session slot can reference it
    const { data: newPayment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        student_id: userId,
        stage_id: stageId,
        amount: Number(amount),
        hours_covered: Number(hoursCovered),
        receipt_url: filePath,
        status: 'pending',
        preferred_simulator_id: simulatorFilter || null,
      })
      .select()
      .single()

    if (paymentError) {
      setError(`Could not save payment record: ${paymentError.message}`)
      setSubmitting(false)
      return
    }

    // 3. Create one 1-hour pending session per selected slot, linked to this payment
    const sessionRows = selectedSlots.map((slot) => ({
      stage_id: stageId,
      scheduled_start: slot.toISOString(),
      scheduled_end: new Date(slot.getTime() + 60 * 60 * 1000).toISOString(),
      status: 'pending',
      payment_id: newPayment.id,
    }))

    const { data: newSessions, error: sessionError } = await supabase
      .from('sessions')
      .insert(sessionRows)
      .select()

    if (sessionError) {
      setError(`Payment saved, but could not hold your slots: ${sessionError.message}`)
      setSubmitting(false)
      return
    }

    const participantRows = newSessions.map((s) => ({
      session_id: s.id,
      student_id: userId,
      hours_credited: 1,
    }))

    const { error: participantError } = await supabase.from('session_participants').insert(participantRows)

    if (participantError) {
      setError(`Slots held, but could not link them to your account: ${participantError.message}`)
      setSubmitting(false)
      return
    }

    setSuccessMsg(
      `Receipt and ${selectedSlots.length} slot(s) submitted. Faculty will approve the payment and schedule together — your slots are held in the meantime.`
    )
    setAmount('')
    setHoursCovered('')
    setFile(null)
    setSelectedSlots([])
    e.target.reset()
    await Promise.all([loadMyPayments(), loadCalendar()])
    setSubmitting(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Payments</div>
      <div className="page-subheading">
        Bookings are per 1-hour slot. Enter your paid hours below, then click that many
        open slots on the calendar. Faculty approves the payment and every slot together.
      </div>

      <div className="payments-layout">
        <div>
          {stageSimulators.length > 0 && (
            <div className="field" style={{ maxWidth: 320, marginBottom: 12 }}>
              <label htmlFor="simFilter">Preferred simulator</label>
              <select
                id="simFilter"
                value={simulatorFilter}
                onChange={(e) => setSimulatorFilter(e.target.value)}
                required
              >
                {stageSimulators.map((sim) => (
                  <option key={sim.id} value={sim.id}>
                    {sim.name}
                  </option>
                ))}
              </select>
              <p className="empty-text" style={{ marginTop: 6 }}>
                Also filters the calendar to that simulator's schedule. Faculty sees this
                as your preference when approving, and can assign a different one if needed.
              </p>
            </div>
          )}

          <Calendar
            view={calView}
            currentDate={calDate}
            onViewChange={setCalView}
            onDateChange={setCalDate}
            events={displayEvents}
            onSlotClick={handleSlotClick}
          />
        </div>

        <form onSubmit={handleSubmit} className="payment-form">
          {error && <div className="auth-error">{error}</div>}
          {successMsg && <div className="auth-success">{successMsg}</div>}

          <div className="field">
            <label htmlFor="track">Track</label>
            <select
              id="track"
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value)
                setStageId('')
              }}
              required
            >
              {BOOKABLE_TRACKS.map((t) => (
                <option key={t} value={t}>
                  {TRACK_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="stage">Stage</label>
            <select id="stage" value={stageId} onChange={(e) => setStageId(e.target.value)} required>
              <option value="">Select a stage…</option>
              {stages
                .filter((s) => s.track === trackId && (s.status === 'in_progress' || s.status === 'pending_approval'))
                .sort((a, b) => a.sequence_order - b.sequence_order)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            {trackId &&
              stages.filter((s) => s.track === trackId && (s.status === 'in_progress' || s.status === 'pending_approval'))
                .length === 0 && (
                <p className="empty-text" style={{ marginTop: 8 }}>
                  No unlocked stages in this track yet.
                </p>
              )}
            {stageId && selectedStage?.requires_simulator !== false && stageSimulators.length === 0 && (
              <p className="auth-error" style={{ marginTop: 8 }}>
                No simulators are assigned to this stage yet — contact the office before booking.
              </p>
            )}
            {stageId && selectedStage?.requires_simulator !== false && stageSimulators.length > 0 && (
              <p className="empty-text" style={{ marginTop: 8 }}>
                Uses: {stageSimulators.map((s) => s.name).join(', ')}
              </p>
            )}
            {stageId && selectedStage?.requires_simulator === false && (
              <p className="empty-text" style={{ marginTop: 8 }}>
                This is an actual flight, not a simulator session — no simulator needed.
              </p>
            )}
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
              step="1"
              min="1"
              value={hoursCovered}
              onChange={(e) => {
                setHoursCovered(e.target.value)
                setSelectedSlots([]) // changing hours invalidates prior slot picks
              }}
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
            <label>
              Requested slots ({selectedSlots.length}/{requiredSlots || 0})
            </label>
            {selectedSlots.length === 0 ? (
              <p className="empty-text">Click open 1-hour slots on the calendar.</p>
            ) : (
              <ul className="slot-list">
                {selectedSlots.map((s, i) => (
                  <li key={i}>
                    {s.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setSelectedSlots((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit payment & schedule request'}
          </button>
        </form>
      </div>

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
              <th>Requested slots</th>
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
                  {p.sessions && p.sessions.length > 0
                    ? p.sessions
                        .map((s) => new Date(s.scheduled_start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))
                        .join(', ')
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
