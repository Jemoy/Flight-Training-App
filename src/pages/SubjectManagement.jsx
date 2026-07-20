import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { DAY_OPTIONS, TYPE_OPTIONS, daysToPattern, formatTimeRange, calcWeeklyHours } from '../lib/classSchedule'

function emptyOffering() {
  return {
    subject_code: '',
    subject_title: '',
    instructor_name: '',
    section: '',
    year_level: '',
    days: [],
    start_time: '08:00',
    end_time: '09:00',
    room: '',
    type: 'Lecture',
  }
}

export default function SubjectManagement() {
  const [offerings, setOfferings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newOffering, setNewOffering] = useState(emptyOffering())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadOfferings()
  }, [])

  async function loadOfferings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('course_offerings')
      .select('*')
      .order('subject_code', { ascending: true })

    if (error) setError(error.message)
    else setOfferings(data ?? [])
    setLoading(false)
  }

  function toggleNewDay(day) {
    setNewOffering((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (newOffering.days.length === 0) {
      setError('Select at least one day.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('course_offerings').insert(newOffering)

    if (error) {
      setError(error.message)
    } else {
      setNewOffering(emptyOffering())
      setShowAddForm(false)
      await loadOfferings()
    }
    setSubmitting(false)
  }

  async function handleSaveEdit(offering, updated) {
    setError('')
    if (updated.days.length === 0) {
      setError('Select at least one day.')
      return
    }
    const { error } = await supabase.from('course_offerings').update(updated).eq('id', offering.id)

    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await loadOfferings()
  }

  async function handleDelete(offering) {
    if (!window.confirm(`Delete ${offering.subject_code} - ${offering.subject_title} (${offering.section})?`)) return
    setError('')
    const { error } = await supabase.from('course_offerings').delete().eq('id', offering.id)
    if (error) {
      setError(error.message)
      return
    }
    await loadOfferings()
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Subjects</div>
      <div className="page-subheading">
        Master schedule of course offerings. This is what populates the dropdown when
        building a student's class schedule — picking one auto-fills the days and time.
      </div>

      <button
        className="btn-primary"
        style={{ width: 'auto', marginBottom: 20 }}
        onClick={() => setShowAddForm((v) => !v)}
      >
        {showAddForm ? 'Cancel' : 'Add offering'}
      </button>

      {error && <div className="auth-error">{error}</div>}

      {showAddForm && (
        <OfferingForm
          offering={newOffering}
          setOffering={setNewOffering}
          onToggleDay={toggleNewDay}
          onSubmit={handleAdd}
          submitting={submitting}
          submitLabel="Add offering"
        />
      )}

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && offerings.length === 0 && <p className="empty-text">No course offerings yet.</p>}

      {!loading && offerings.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Code</th>
                <th>Title</th>
                <th>Instructor</th>
                <th>Section</th>
                <th>Year</th>
                <th>Days</th>
                <th>Time</th>
                <th>Room</th>
                <th>Type</th>
                <th>Hrs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {offerings.map((o, i) =>
                editingId === o.id ? (
                  <OfferingEditRow
                    key={o.id}
                    index={i + 1}
                    offering={o}
                    onCancel={() => setEditingId(null)}
                    onSave={handleSaveEdit}
                  />
                ) : (
                  <tr key={o.id}>
                    <td>{i + 1}</td>
                    <td>{o.subject_code}</td>
                    <td>{o.subject_title}</td>
                    <td>{o.instructor_name}</td>
                    <td>{o.section}</td>
                    <td>{o.year_level}</td>
                    <td>{daysToPattern(o.days)}</td>
                    <td className="hours-figure">{formatTimeRange(o.start_time, o.end_time)}</td>
                    <td>{o.room}</td>
                    <td>{o.type}</td>
                    <td className="hours-figure">{calcWeeklyHours(o.start_time, o.end_time, o.days)}</td>
                    <td className="row-actions">
                      <button className="link-btn" onClick={() => setEditingId(o.id)}>
                        Edit
                      </button>
                      <button className="btn-reject" onClick={() => handleDelete(o)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OfferingForm({ offering, setOffering, onToggleDay, onSubmit, submitting, submitLabel }) {
  function set(field, value) {
    setOffering((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={onSubmit} className="payment-form" style={{ marginBottom: 28, maxWidth: 640 }}>
      <div className="backfill-form-row">
        <div className="field">
          <label>Subject code</label>
          <input type="text" value={offering.subject_code} onChange={(e) => set('subject_code', e.target.value)} required />
        </div>
        <div className="field">
          <label>Subject title</label>
          <input type="text" value={offering.subject_title} onChange={(e) => set('subject_title', e.target.value)} required />
        </div>
        <div className="field">
          <label>Instructor</label>
          <input type="text" value={offering.instructor_name} onChange={(e) => set('instructor_name', e.target.value)} />
        </div>
      </div>

      <div className="backfill-form-row">
        <div className="field">
          <label>Section</label>
          <input type="text" value={offering.section} onChange={(e) => set('section', e.target.value)} />
        </div>
        <div className="field">
          <label>Year level</label>
          <input type="text" value={offering.year_level} onChange={(e) => set('year_level', e.target.value)} />
        </div>
        <div className="field">
          <label>Room</label>
          <input type="text" value={offering.room} onChange={(e) => set('room', e.target.value)} />
        </div>
      </div>

      <div className="days-field">
        <label>Days</label>
        <div className="days-checkboxes">
          {DAY_OPTIONS.map((d) => (
            <label key={d.value} className="day-checkbox">
              <span>{d.label.toUpperCase()}</span>
              <input type="checkbox" checked={offering.days.includes(d.value)} onChange={() => onToggleDay(d.value)} />
            </label>
          ))}
        </div>
      </div>

      <div className="backfill-form-row">
        <div className="field">
          <label>Start time</label>
          <input type="time" value={offering.start_time} onChange={(e) => set('start_time', e.target.value)} required />
        </div>
        <div className="field">
          <label>End time</label>
          <input type="time" value={offering.end_time} onChange={(e) => set('end_time', e.target.value)} required />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={offering.type} onChange={(e) => set('type', e.target.value)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

function OfferingEditRow({ index, offering, onCancel, onSave }) {
  const [local, setLocal] = useState({ ...offering })

  function toggleDay(day) {
    setLocal((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }))
  }

  return (
    <tr>
      <td colSpan={12}>
        <OfferingForm
          offering={local}
          setOffering={setLocal}
          onToggleDay={toggleDay}
          onSubmit={(e) => {
            e.preventDefault()
            onSave(offering, local)
          }}
          submitting={false}
          submitLabel="Save changes"
        />
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  )
}
