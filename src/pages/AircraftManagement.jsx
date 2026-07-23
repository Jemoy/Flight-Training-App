import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { TRACK_LABELS } from '../lib/stageStatus'
import { PlaneIcon, PlusIcon, XIcon, CheckIcon, WrenchIcon } from '../components/Icons'

function emptyAircraft() {
  return {
    aircraft_type: '',
    registry: '',
    total_flight_hours: 0,
    hours_before_50hr_maintenance: 50,
    hours_before_100hr_maintenance: 100,
  }
}

function meterState(value, intervalMax) {
  if (value <= 0) return 'due'
  if (intervalMax > 0 && value / intervalMax <= 0.2) return 'warn'
  return 'ok'
}

function HoursMeter({ value, intervalMax }) {
  const state = meterState(value, intervalMax)
  const pct = Math.max(0, Math.min(100, (value / intervalMax) * 100))

  return (
    <div className={`hours-meter ${state}`}>
      <div className="hours-meter-top">
        {value}
        <span className="hours-meter-unit">hrs left</span>
        {state === 'due' && (
          <span className="hours-meter-flag">
            <WrenchIcon />
          </span>
        )}
      </div>
      <div className="hours-meter-track">
        <div className="hours-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AircraftManagement() {
  const [aircraft, setAircraft] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAircraft, setNewAircraft] = useState(emptyAircraft())
  const [submitting, setSubmitting] = useState(false)

  // Stage assignment matrix
  const [flyingStages, setFlyingStages] = useState([])
  const [assignments, setAssignments] = useState(new Set()) // `${stageId}_${aircraftId}`
  const [matrixSaving, setMatrixSaving] = useState(false)
  const [matrixMsg, setMatrixMsg] = useState('')

  useEffect(() => {
    loadAircraft()
    loadMatrix()
  }, [])

  const summary = useMemo(() => {
    const active = aircraft.filter((a) => a.is_active).length
    const due = aircraft.filter(
      (a) => a.hours_before_50hr_maintenance <= 0 || a.hours_before_100hr_maintenance <= 0
    ).length
    return { active, due }
  }, [aircraft])

  async function loadMatrix() {
    const { data: stageRows } = await supabase
      .from('stages')
      .select('id, name, track, sequence_order')
      .eq('requires_simulator', false)
      .order('track', { ascending: true })
      .order('sequence_order', { ascending: true })
    setFlyingStages(stageRows ?? [])

    const { data: assignRows } = await supabase.from('stage_aircraft').select('stage_id, aircraft_id')
    setAssignments(new Set((assignRows ?? []).map((r) => `${r.stage_id}_${r.aircraft_id}`)))
  }

  async function toggleAssignment(stageId, aircraftId) {
    const key = `${stageId}_${aircraftId}`
    const isAssigned = assignments.has(key)
    setMatrixMsg('')
    setMatrixSaving(true)

    if (isAssigned) {
      const { error } = await supabase
        .from('stage_aircraft')
        .delete()
        .eq('stage_id', stageId)
        .eq('aircraft_id', aircraftId)
      if (error) {
        setMatrixMsg(error.message)
        setMatrixSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('stage_aircraft').insert({ stage_id: stageId, aircraft_id: aircraftId })
      if (error) {
        setMatrixMsg(error.message)
        setMatrixSaving(false)
        return
      }
    }

    setAssignments((prev) => {
      const next = new Set(prev)
      if (isAssigned) next.delete(key)
      else next.add(key)
      return next
    })
    setMatrixSaving(false)
  }

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
    <div className="main-content-wide">
      <div className="page-heading-row">
        <span className="page-icon-badge">
          <PlaneIcon />
        </span>
        <div className="page-heading">Aircraft</div>
      </div>
      <div className="page-subheading">
        Manage the fleet and its maintenance-hour tracking. 50-hour maintenance is a half-day
        turnaround; 100-hour maintenance is a full-day turnaround.
      </div>

      <div className="mgmt-toolbar">
        {!showAddForm && (
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            <PlusIcon /> Add aircraft
          </button>
        )}
        {showAddForm && <span />}

        {!loading && aircraft.length > 0 && (
          <div className="mgmt-summary">
            <span>
              <strong>{aircraft.length}</strong> total
            </span>
            <span>
              <strong>{summary.active}</strong> active
            </span>
            {summary.due > 0 && (
              <span className="due-flag">
                <WrenchIcon /> {summary.due} due for maintenance
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="auth-error">{error}</div>}

      {showAddForm && (
        <div className="form-card">
          <div className="form-card-head">
            <span className="form-card-title">Add aircraft</span>
            <button className="icon-btn" onClick={() => setShowAddForm(false)} aria-label="Close">
              <XIcon />
            </button>
          </div>
          <AircraftForm
            aircraft={newAircraft}
            setAircraft={setNewAircraft}
            onSubmit={handleAdd}
            submitting={submitting}
            submitLabel="Add aircraft"
          />
        </div>
      )}

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && aircraft.length === 0 && (
        <div className="empty-state">No aircraft added yet — add your first tail number above.</div>
      )}

      {!loading && aircraft.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Registry</th>
                <th>Total hours</th>
                <th>50-hr maintenance</th>
                <th>100-hr maintenance</th>
                <th>Status</th>
                <th>Actions</th>
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
                    <td>
                      <HoursMeter value={a.hours_before_50hr_maintenance} intervalMax={50} />
                    </td>
                    <td>
                      <HoursMeter value={a.hours_before_100hr_maintenance} intervalMax={100} />
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

      <div className="section-divider" />

      <h3 className="section-title">Stage assignments</h3>
      <p className="empty-text" style={{ marginBottom: 14 }}>
        Check which aircraft are allowed for each flying stage. Scheduling can only pick
        from these — nothing is inferred automatically.
      </p>

      {matrixMsg && <div className="auth-error">{matrixMsg}</div>}

      {flyingStages.length === 0 || aircraft.length === 0 ? (
        <div className="empty-state">Add flying stages and aircraft first.</div>
      ) : (
        <div className="matrix-table-wrap">
          <table className="simple-table matrix-table">
            <thead>
              <tr>
                <th>Stage</th>
                {aircraft.map((a) => (
                  <th key={a.id} className="matrix-col-header">
                    {a.registry}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flyingStages.map((stage) => (
                <tr key={stage.id}>
                  <td>
                    {stage.name} <span className="status-placeholder">({TRACK_LABELS[stage.track] ?? stage.track})</span>
                  </td>
                  {aircraft.map((a) => {
                    const key = `${stage.id}_${a.id}`
                    return (
                      <td key={a.id} className="matrix-checkbox-cell">
                        <label className="matrix-toggle">
                          <input
                            type="checkbox"
                            disabled={matrixSaving}
                            checked={assignments.has(key)}
                            onChange={() => toggleAssignment(stage.id, a.id)}
                            aria-label={`${a.registry} allowed for ${stage.name}`}
                          />
                          <span className="matrix-toggle-mark">
                            <CheckIcon />
                          </span>
                        </label>
                      </td>
                    )
                  })}
                </tr>
              ))}
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
    <form onSubmit={onSubmit}>
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

      <button className="btn-primary" type="submit" disabled={submitting} style={{ width: 'auto' }}>
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
        <button className="link-btn" onClick={onCancel} style={{ marginTop: 10 }}>
          Cancel
        </button>
      </td>
    </tr>
  )
}
