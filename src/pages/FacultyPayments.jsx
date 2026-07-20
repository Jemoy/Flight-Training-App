import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getSimulatorsForStage } from '../lib/stageSimulators'

export default function FacultyPayments({ session }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [facultyList, setFacultyList] = useState([])
  const [stageSimulatorsByStage, setStageSimulatorsByStage] = useState({})
  const [assignedInstructor, setAssignedInstructor] = useState({}) // paymentId -> instructorId
  const [assignedSimulator, setAssignedSimulator] = useState({}) // paymentId -> simulatorId

  useEffect(() => {
    loadPending()
    loadFaculty()
    loadStageSimulators()
  }, [])

  async function loadFaculty() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })
    setFacultyList(data ?? [])
  }

  async function loadStageSimulators() {
    const { data } = await supabase
      .from('stage_simulators')
      .select('stage_id, simulators(id, name, is_active)')

    const map = {}
    for (const row of data ?? []) {
      if (!row.simulators?.is_active) continue
      if (!map[row.stage_id]) map[row.stage_id] = []
      map[row.stage_id].push(row.simulators)
    }
    setStageSimulatorsByStage(map)
  }

  async function loadPending() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, amount, hours_covered, receipt_url, status, submitted_at, student_id, stage_id, profiles!payments_student_id_fkey(full_name, student_number), stages(name, instrument_type), sessions!sessions_payment_id_fkey(id, scheduled_start, scheduled_end, status)'
      )
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      setPayments(data ?? [])
    }
    setLoading(false)
  }

  async function viewReceipt(path) {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(path, 60)

    if (error) {
      setError(`Could not open receipt: ${error.message}`)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  async function handleApprove(payment) {
    setError('')
    const instructorId = assignedInstructor[payment.id]
    const simulatorId = assignedSimulator[payment.id]

    if (!instructorId) {
      setError('Select a faculty member to assign before approving.')
      return
    }
    if (!simulatorId) {
      setError('Select a simulator to assign before approving.')
      return
    }

    const sessionsToConfirm = payment.sessions ?? []

    // Check the chosen simulator isn't already booked by someone else at
    // any of these times — now that multiple simulators can run in parallel,
    // this is the one place double-booking actually gets prevented.
    for (const s of sessionsToConfirm) {
      const { data: conflicts, error: conflictErr } = await supabase
        .from('sessions')
        .select('id, scheduled_start, scheduled_end')
        .eq('simulator_id', simulatorId)
        .eq('status', 'scheduled')
        .neq('id', s.id)
        .lt('scheduled_start', s.scheduled_end)
        .gt('scheduled_end', s.scheduled_start)

      if (conflictErr) {
        setError(`Could not check simulator availability: ${conflictErr.message}`)
        return
      }
      if (conflicts && conflicts.length > 0) {
        setError(
          `That simulator is already booked at ${new Date(s.scheduled_start).toLocaleString()}. Choose a different simulator or reject this request.`
        )
        return
      }
    }

    setBusyId(payment.id)
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'verified',
        verified_by: session.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    if (error) {
      setError(error.message)
      setBusyId(null)
      return
    }

    const sessionIds = sessionsToConfirm.map((s) => s.id)
    if (sessionIds.length > 0) {
      const { error: sessionErr } = await supabase
        .from('sessions')
        .update({ status: 'scheduled', instructor_id: instructorId, simulator_id: simulatorId })
        .in('id', sessionIds)

      if (sessionErr) {
        setError(`Payment verified, but could not confirm all slots: ${sessionErr.message}`)
        setBusyId(null)
        return
      }
    }

    await loadPending()
    setBusyId(null)
  }

  async function handleReject(payment) {
    const reason = window.prompt('Reason for rejecting this receipt?')
    if (reason === null) return // cancelled

    setBusyId(payment.id)
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        verified_by: session.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    if (error) {
      setError(error.message)
      setBusyId(null)
      return
    }

    const sessionIds = (payment.sessions ?? []).map((s) => s.id)
    if (sessionIds.length > 0) {
      const { error: sessionErr } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .in('id', sessionIds)

      if (sessionErr) {
        setError(`Payment rejected, but could not release all held slots: ${sessionErr.message}`)
        setBusyId(null)
        return
      }
    }

    await loadPending()
    setBusyId(null)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Payment verification</div>
      <div className="page-subheading">
        Review student receipts before their paid hours become available for scheduling.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && payments.length === 0 && (
        <p className="empty-text">No pending payments to review.</p>
      )}

      {!loading && payments.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Student ID</th>
              <th>Stage</th>
              <th>Amount</th>
              <th>Hours</th>
              <th>Receipt</th>
              <th>Requested schedule</th>
              <th>Faculty assigned</th>
              <th>Simulator</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const options = stageSimulatorsByStage[p.stage_id] ?? []
              return (
                <tr key={p.id}>
                  <td>{p.profiles?.full_name ?? '—'}</td>
                  <td>{p.profiles?.student_number ?? '—'}</td>
                  <td>{p.stages?.name ?? '—'}</td>
                  <td className="hours-figure">₱{p.amount}</td>
                  <td className="hours-figure">{p.hours_covered}</td>
                  <td>
                    <button className="link-btn" onClick={() => viewReceipt(p.receipt_url)}>
                      View
                    </button>
                  </td>
                  <td>
                    {p.sessions && p.sessions.length > 0
                      ? p.sessions
                          .map((s) =>
                            new Date(s.scheduled_start).toLocaleString([], {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          )
                          .join(', ')
                      : '—'}
                  </td>
                  <td>
                    <select
                      className="inline-select"
                      value={assignedInstructor[p.id] ?? ''}
                      onChange={(e) =>
                        setAssignedInstructor((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    >
                      <option value="">Select faculty…</option>
                      {facultyList.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="inline-select"
                      value={assignedSimulator[p.id] ?? ''}
                      onChange={(e) =>
                        setAssignedSimulator((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    >
                      <option value="">Select simulator…</option>
                      {options.map((sim) => (
                        <option key={sim.id} value={sim.id}>
                          {sim.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(p.submitted_at).toLocaleDateString()}</td>
                  <td className="row-actions">
                    <button
                      className="btn-approve"
                      disabled={busyId === p.id}
                      onClick={() => handleApprove(p)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-reject"
                      disabled={busyId === p.id}
                      onClick={() => handleReject(p)}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
