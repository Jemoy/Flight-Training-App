import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { computeStageStatuses, TRACK_LABELS } from '../lib/stageStatus'

const BOOKABLE_TRACKS = ['simulator', 'ppl', 'cpl', 'ir', 'multi_engine']

export default function Payments({ session }) {
  const [stages, setStages] = useState([])
  const [trackId, setTrackId] = useState('simulator')
  const [stageId, setStageId] = useState('')
  const [amount, setAmount] = useState('')
  const [hoursCovered, setHoursCovered] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [myPayments, setMyPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStages()
    loadMyPayments()
  }, [])

  async function loadStages() {
    const userId = session.user.id
    const [{ data: allStages, error }, { data: prereqs }, { data: progressRows }] = await Promise.all([
      supabase.from('stages').select('id, name, code, track, sequence_order'),
      supabase.from('stage_prerequisites').select('stage_id, prerequisite_stage_id'),
      supabase.from('student_stage_progress').select('stage_id, status, cumulative_hours').eq('student_id', userId),
    ])

    if (!error) setStages(computeStageStatuses(allStages, progressRows, prereqs))
  }

  async function loadMyPayments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('payments')
      .select('id, amount, hours_covered, status, submitted_at, rejection_reason, stage_id, stages(name)')
      .eq('student_id', session.user.id)
      .order('submitted_at', { ascending: false })

    if (!error) setMyPayments(data ?? [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!file || !stageId || !amount || !hoursCovered) {
      setError('Please fill in every field and choose a receipt file.')
      return
    }

    setSubmitting(true)
    const userId = session.user.id

    // 1. Upload the receipt
    const filePath = `${userId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, file)

    if (uploadError) {
      setError(`Could not upload receipt: ${uploadError.message}`)
      setSubmitting(false)
      return
    }

    // 2. Create the payment — that's it. Admin schedules the actual sessions
    // separately once this is verified, drawing down from the paid hours.
    const { error: paymentError } = await supabase.from('payments').insert({
      student_id: userId,
      stage_id: stageId,
      amount: Number(amount),
      hours_covered: Number(hoursCovered),
      receipt_url: filePath,
      status: 'pending',
    })

    if (paymentError) {
      setError(paymentError.message)
      setSubmitting(false)
      return
    }

    setSuccessMsg('Payment submitted. Admin will verify it and schedule your sessions.')
    setStageId('')
    setAmount('')
    setHoursCovered('')
    setFile(null)
    e.target.reset()
    await loadMyPayments()
    setSubmitting(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Payments</div>
      <div className="page-subheading">
        Submit your payment and receipt here. Once admin verifies it, they'll schedule
        your sessions and you'll see them on Full Schedule.
      </div>

      <form onSubmit={handleSubmit} className="payment-form" style={{ maxWidth: 460 }}>
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

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit payment'}
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
                  <span className={`status-pill ${p.status}`}>{p.status}</span>
                  {p.status === 'rejected' && p.rejection_reason && (
                    <div className="empty-text" style={{ marginTop: 4 }}>
                      {p.rejection_reason}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
