import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { emptyClassEntry, generateOccurrences, daysToPattern, formatTimeRange } from '../lib/classSchedule'
import { CURRENT_SEMESTER_START, CURRENT_SEMESTER_END } from '../lib/semester'

function summarize(rows) {
  const groups = {}
  for (const r of rows) {
    const start = new Date(r.start_time)
    const end = new Date(r.end_time)
    const key = `${r.class_name}_${start.getHours()}:${start.getMinutes()}-${end.getHours()}:${end.getMinutes()}`
    if (!groups[key]) {
      groups[key] = {
        className: r.class_name,
        days: new Set(),
        timeLabel: `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        count: 0,
        first: start,
        last: start,
      }
    }
    groups[key].days.add(start.getDay())
    groups[key].count += 1
    if (start < groups[key].first) groups[key].first = start
    if (start > groups[key].last) groups[key].last = start
  }
  return Object.values(groups).map((g) => ({ ...g, dayPattern: daysToPattern([...g.days]) }))
}

export default function ClassSchedulePanel({ studentId }) {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [semesterStart, setSemesterStart] = useState(CURRENT_SEMESTER_START)
  const [semesterEnd, setSemesterEnd] = useState(CURRENT_SEMESTER_END)
  const [entries, setEntries] = useState([emptyClassEntry()])
  const [saving, setSaving] = useState(false)
  const [offerings, setOfferings] = useState([])

  useEffect(() => {
    supabase
      .from('course_offerings')
      .select('*')
      .order('subject_code', { ascending: true })
      .then(({ data }) => setOfferings(data ?? []))
  }, [])

  useEffect(() => {
    loadSchedule()
  }, [studentId])

  async function loadSchedule() {
    setLoading(true)
    const { data, error } = await supabase
      .from('class_schedule')
      .select('id, class_name, start_time, end_time')
      .eq('student_id', studentId)
      .order('start_time', { ascending: true })

    if (error) setError(error.message)
    else setRows(data ?? [])
    setLoading(false)
  }

  function applyOffering(id, offeringId) {
    const offering = offerings.find((o) => o.id === offeringId)
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? offering
            ? {
                ...e,
                offeringId,
                className: `${offering.subject_code} - ${offering.subject_title}`,
                days: offering.days,
                startTime: offering.start_time,
                endTime: offering.end_time,
              }
            : { ...e, offeringId: '', className: '' }
          : e
      )
    )
  }

  async function handleSaveNew() {
    setError('')
    setSuccessMsg('')
    if (!semesterStart || !semesterEnd) {
      setError('Set both a start and end date.')
      return
    }
    const valid = entries.filter((e) => e.className.trim())
    if (valid.length === 0) {
      setError('Add at least one class.')
      return
    }

    setSaving(true)
    let newRows = []
    for (const entry of valid) {
      newRows = newRows.concat(
        generateOccurrences(entry, semesterStart, semesterEnd).map((o) => ({ ...o, student_id: studentId }))
      )
    }

    const { error: insertErr } = await supabase.from('class_schedule').insert(newRows)
    if (insertErr) {
      setError(insertErr.message)
      setSaving(false)
      return
    }

    setSuccessMsg(`Added ${newRows.length} class session(s).`)
    setEntries([emptyClassEntry()])
    setShowBuilder(false)
    setSaving(false)
    await loadSchedule()
  }

  async function handleClearAll() {
    if (!window.confirm('Remove this student\'s entire class schedule? This cannot be undone.')) return
    setError('')
    const { error } = await supabase.from('class_schedule').delete().eq('student_id', studentId)
    if (error) {
      setError(error.message)
      return
    }
    await loadSchedule()
  }

  const summary = rows ? summarize(rows) : []

  return (
    <div>
      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      {loading ? (
        <p className="loading-text">Loading schedule…</p>
      ) : summary.length === 0 ? (
        <p className="empty-text">No classes on file for this student.</p>
      ) : (
        <>
          <table className="simple-table receipts-subtable" style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Class</th>
                <th>Days</th>
                <th>Time</th>
                <th>Sessions</th>
                <th>Date range</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s, i) => (
                <tr key={i}>
                  <td>{s.className}</td>
                  <td>{s.dayPattern}</td>
                  <td className="hours-figure">{s.timeLabel}</td>
                  <td className="hours-figure">{s.count}</td>
                  <td>
                    {s.first.toLocaleDateString()} – {s.last.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link-btn" onClick={handleClearAll} style={{ marginBottom: 14 }}>
            Clear entire schedule
          </button>
        </>
      )}

      <div>
        <button className="link-btn" onClick={() => setShowBuilder((v) => !v)}>
          {showBuilder ? 'Hide' : '+ Add classes (new semester)'}
        </button>
      </div>

      {showBuilder && (
        <div className="backfill-form" style={{ marginTop: 12 }}>
          <div className="backfill-form-row" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Semester start</label>
              <input type="date" value={semesterStart} onChange={(e) => setSemesterStart(e.target.value)} />
            </div>
            <div className="field">
              <label>Semester end</label>
              <input type="date" value={semesterEnd} onChange={(e) => setSemesterEnd(e.target.value)} />
            </div>
          </div>

          {entries.map((entry) => (
            <div className="class-entry-card" key={entry.id}>
              <select
                value={entry.offeringId ?? ''}
                onChange={(e) => applyOffering(entry.id, e.target.value)}
                className="inline-select"
                style={{ marginBottom: 6, width: '100%' }}
              >
                <option value="">Select a subject…</option>
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.subject_code} - {o.subject_title} ({o.section || o.year_level || 'Section n/a'}) ·{' '}
                    {daysToPattern(o.days)} {formatTimeRange(o.start_time, o.end_time)}
                  </option>
                ))}
              </select>
              {entry.className ? (
                <div className="class-entry-summary-row">
                  <p className="empty-text" style={{ margin: 0 }}>
                    {entry.className} · {daysToPattern(entry.days)} · {formatTimeRange(entry.startTime, entry.endTime)}
                  </p>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="class-entry-summary-row">
                  <p className="empty-text" style={{ margin: 0 }}>
                    Days and time come from the Subjects catalog.
                  </p>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            className="add-schedule-btn"
            onClick={() => setEntries((prev) => [...prev, emptyClassEntry()])}
          >
            + Add another schedule
          </button>

          <button className="btn-approve" onClick={handleSaveNew} disabled={saving}>
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      )}
    </div>
  )
}
