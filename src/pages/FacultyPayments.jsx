import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function FacultyPayments({ session }) {
  const [payments, setPayments] = useState([])
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
      .from('payments')
      .select(
        'id, amount, hours_covered, receipt_url, status, submitted_at, student_id, stage_id, session_id, profiles(full_name), stages(name), sessions(scheduled_start, scheduled_end, status)'
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

    // Confirm the tentative session hold that came with this payment, if any
    if (payment.session_id) {
      const { error: sessionErr } = await supabase
        .from('sessions')
        .update({ status: 'scheduled' })
        .eq('id', payment.session_id)

      if (sessionErr) {
        setError(`Payment verified, but could not confirm the schedule: ${sessionErr.message}`)
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

    // Free up the calendar hold since the payment behind it wasn't approved
    if (payment.session_id) {
      const { error: sessionErr } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', payment.session_id)

      if (sessionErr) {
        setError(`Payment rejected, but could not release the held slot: ${sessionErr.message}`)
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
              <th>Stage</th>
              <th>Amount</th>
              <th>Hours</th>
              <th>Receipt</th>
              <th>Requested schedule</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.profiles?.full_name ?? '—'}</td>
                <td>{p.stages?.name ?? '—'}</td>
                <td className="hours-figure">₱{p.amount}</td>
                <td className="hours-figure">{p.hours_covered}</td>
                <td>
                  <button className="link-btn" onClick={() => viewReceipt(p.receipt_url)}>
                    View
                  </button>
                </td>
                <td>
                  {p.sessions?.scheduled_start
                    ? new Date(p.sessions.scheduled_start).toLocaleString()
                    : '—'}
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
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
