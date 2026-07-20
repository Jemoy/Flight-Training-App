import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? 6 : day - 1 // days since Monday
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatHM(decimalHours) {
  const h = Math.floor(decimalHours)
  const m = Math.round((decimalHours - h) * 60)
  return `${h}+${String(m).padStart(2, '0')}`
}

export default function InstructorHoursReport() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    setError('')

    const { data: faculty, error: facErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })

    if (facErr) {
      setError(facErr.message)
      setLoading(false)
      return
    }

    const { data: participants, error: partErr } = await supabase
      .from('session_participants')
      .select('hours_credited, sessions!inner(scheduled_start, status, instructor_id)')
      .eq('sessions.status', 'completed')

    if (partErr) {
      setError(partErr.message)
      setLoading(false)
      return
    }

    const now = new Date()
    const weekStart = startOfWeek(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    const totals = {} // instructorId -> { week, month, year }
    for (const p of participants ?? []) {
      const instructorId = p.sessions?.instructor_id
      if (!instructorId) continue
      const start = new Date(p.sessions.scheduled_start)
      const hours = Number(p.hours_credited ?? 0)

      if (!totals[instructorId]) totals[instructorId] = { week: 0, month: 0, year: 0 }
      if (start >= weekStart) totals[instructorId].week += hours
      if (start >= monthStart) totals[instructorId].month += hours
      if (start >= yearStart) totals[instructorId].year += hours
    }

    const merged = (faculty ?? []).map((f) => ({
      name: f.full_name,
      week: totals[f.id]?.week ?? 0,
      month: totals[f.id]?.month ?? 0,
      year: totals[f.id]?.year ?? 0,
    }))

    setRows(merged)
    setLoading(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Instructor hours</div>
      <div className="page-subheading">
        Total taught hours per instructor, from completed sessions only. Week starts
        Monday, month and year are calendar-based.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && rows.length === 0 && <p className="empty-text">No faculty accounts yet.</p>}

      {!loading && rows.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Instructor</th>
              <th>This week</th>
              <th>This month</th>
              <th>This year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td className="hours-figure">{formatHM(r.week)}</td>
                <td className="hours-figure">{formatHM(r.month)}</td>
                <td className="hours-figure">{formatHM(r.year)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
