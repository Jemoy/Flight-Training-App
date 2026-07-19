import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Payments({ session }) {
  const [stages, setStages] = useState([])
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
      .select('id, amount, hours_covered, status, submitted_at, stage_id, stages(name)')
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
    const filePath = `${userId}/${Date.now()}_${file.name}`

    // 1. Upload the receipt to the private 'receipts' bucket
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, file)

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`)
      setSubmitting(false)
      return
    }

    // 2. Create the payment record, pending faculty verification
    const { error: insertError } = await supabase.from('payments').insert({
      student_id: userId,
      stage_id: stageId,
      amount: Number(amount),
      hours_covered: Number(hoursCovered),
      receipt_url: filePath,
      status: 'pending',
    })

    if (insertError) {
      setError(`Could not save payment record: ${insertError.message}`)
      setSubmitting(false)
      return
    }

    setSuccessMsg('Receipt uploaded. Your payment is pending faculty verification.')
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
        Upload your receipt for a stage. Faculty will verify it before your hours are
        available to schedule.
      </div>

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

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Uploading…' : 'Submit payment'}
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
