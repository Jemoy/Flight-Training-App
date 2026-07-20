import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function emptyAircraft() {
  return {
    aircraft_type: '',
    registry: '',
    total_flight_hours: 0,
    hours_before_50hr_maintenance: 50,
    hours_before_100hr_maintenance: 100,
  }
}

export default function AircraftManagement() {
  const [aircraft, setAircraft] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAircraft, setNewAircraft] = useState(emptyAircraft())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadAircraft()
  }, [])

  async function loadAircraft() {
    setLoading(true)
    const { data, error } = await supabase
      .from('aircraft')
      .select('*')
      .order('registry', { ascending: true })

    if (error) setError(error.message)
    else setAircraft(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (!newAircraft.aircraft_type.trim() || !newAircraft.registry.trim()) {
      setError('Aircraft type and registry are required.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('aircraft').insert(newAircraft)

    if (error) {
      setError(error.message)
    } else {
      setNewAircraft(emptyAircraft())
      setShowAddForm(false)
      await loadAircraft()
    }
    setSubmitting(false)
  }

  async function handleSaveEdit(item, updated) {
    setError('')
    if (!updated.aircraft_type.trim() || !updated.registry.trim()) {
      setError('Aircraft type and registry are required.')
      return
    }
    const { error } = await supabase.from('aircraft').update(updated).eq('id', item.id)

    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await loadAircraft()
  }

  async function handleToggleActive(item) {
    setError('')
    const { error } = await supabase.from('aircraft').update({ is_active: !item.is_active }).eq('id', item.id)
    if (error) {
      setError(error.message)
      return
    }
    await loadAircraft()
  }

  return (
    <div className="main-content">
      <div className="page-heading">Aircraft</div>
      <div className="page-subheading">
        Manage the fleet and its maintenance-hour tracking. 50-hour maintenance is a half-day
        turnaround; 100-hour maintenance is a full-day turnaround.
      </div>

      <button
        className="btn-primary"
        style={{ width: 'auto', marginBottom: 20 }}
        onClick={() => setShowAddForm((v) => !v)}
      >
        {showAddForm ? 'Cancel' : 'Add aircraft'}
      </button>

      {error && <div className="auth-error">{error}</div>}

      {showAddForm && (
        <AircraftForm
          aircraft={newAircraft}
          setAircraft={setNewAircraft}
          onSubmit={handleAdd}
          submitting={submitting}
          submitLabel="Add aircraft"
        />
      )}

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && aircraft.length === 0 && <p className="empty-text">No aircraft added yet.</p>}

      {!loading && aircraft.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Registry</th>
                <th>Total hours</th>
                <th>Hrs to 50-hr maint.</th>
                <th>Hrs to 100-hr maint.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {aircraft.map((a) =>
                editingId === a.id ? (
                  <AircraftEditRow key={a.id} item={a} onCancel={() => setEditingId(null)} onSave={handleSaveEdit} />
                ) : (
                  <tr key={a.id} className={!a.is_active ? 'row-inactive' : ''}>
                    <td>{a.aircraft_type}</td>
                    <td>{a.registry}</td>
                    <td className="hours-figure">{a.total_flight_hours}</td>
                    <td className="hours-figure">
                      {a.hours_before_50hr_maintenance}
                      {a.hours_before_50hr_maintenance <= 0 && (
                        <span className="status-pill rejected" style={{ marginLeft: 6 }}>
                          Due
                        </span>
                      )}
                    </td>
                    <td className="hours-figure">
                      {a.hours_before_100hr_maintenance}
                      {a.hours_before_100hr_maintenance <= 0 && (
                        <span className="status-pill rejected" style={{ marginLeft: 6 }}>
                          Due
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${a.is_active ? 'complete' : 'rejected'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button className="link-btn" onClick={() => setEditingId(a.id)}>
                        Edit
                      </button>
                      <button
                        className={!a.is_active ? 'btn-approve' : 'btn-reject'}
                        onClick={() => handleToggleActive(a)}
                      >
                        {a.is_active ? 'Deactivate' : 'Reactivate'}
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

function AircraftForm({ aircraft, setAircraft, onSubmit, submitting, submitLabel }) {
  function set(field, value) {
    setAircraft((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={onSubmit} className="payment-form" style={{ marginBottom: 28, maxWidth: 520 }}>
      <div className="backfill-form-row">
        <div className="field">
          <label>Aircraft type</label>
          <input type="text" value={aircraft.aircraft_type} onChange={(e) => set('aircraft_type', e.target.value)} placeholder="e.g. C150" required />
        </div>
        <div className="field">
          <label>Registry</label>
          <input type="text" value={aircraft.registry} onChange={(e) => set('registry', e.target.value)} placeholder="e.g. RP-C1234" required />
        </div>
      </div>

      <div className="field">
        <label>Total flight hours</label>
        <input
          type="number"
          step="0.1"
          value={aircraft.total_flight_hours}
          onChange={(e) => set('total_flight_hours', Number(e.target.value))}
        />
      </div>

      <div className="backfill-form-row">
        <div className="field">
          <label>Hours before 50-hr maintenance</label>
          <input
            type="number"
            step="0.1"
            value={aircraft.hours_before_50hr_maintenance}
            onChange={(e) => set('hours_before_50hr_maintenance', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Hours before 100-hr maintenance</label>
          <input
            type="number"
            step="0.1"
            value={aircraft.hours_before_100hr_maintenance}
            onChange={(e) => set('hours_before_100hr_maintenance', Number(e.target.value))}
          />
        </div>
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

function AircraftEditRow({ item, onCancel, onSave }) {
  const [local, setLocal] = useState({ ...item })

  return (
    <tr>
      <td colSpan={7}>
        <AircraftForm
          aircraft={local}
          setAircraft={setLocal}
          onSubmit={(e) => {
            e.preventDefault()
            onSave(item, local)
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
