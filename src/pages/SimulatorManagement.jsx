import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { TRACK_LABELS } from '../lib/stageStatus'
import { GaugeIcon, PlusIcon, XIcon, CheckIcon, WrenchIcon } from '../components/Icons'

const SIM_TYPE_OPTIONS = [
  { value: 'basic_simulator', label: 'Basic Simulator' },
  { value: 'atd', label: 'ATD' },
  { value: 'aatd', label: 'AATD' },
  { value: 'va', label: 'VA' },
]

function isMaintenanceDue(sim) {
  return sim.hours_before_maintenance != null && Number(sim.hours_before_maintenance) <= 0
}

function typeLabel(value) {
  return SIM_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function TypeChips({ selected, onToggle }) {
  return (
    <div className="type-chip-group">
      {SIM_TYPE_OPTIONS.map((opt) => (
        <label key={opt.value} className="type-chip">
          <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => onToggle(opt.value)} />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

function TypeBadges({ values }) {
  if (!values || values.length === 0) return <span className="status-placeholder">—</span>
  return values.map((v) => (
    <span key={v} className={`type-badge ${v}`}>
      {typeLabel(v)}
    </span>
  ))
}

function HoursRemaining({ sim }) {
  if (sim.hours_before_maintenance == null) {
    return <span className="status-placeholder">not tracked</span>
  }
  const due = isMaintenanceDue(sim)
  return (
    <span className={due ? 'due-flag' : ''} style={{ fontFamily: 'var(--font-mono)' }}>
      {sim.hours_before_maintenance}
      {due && (
        <span className="hours-meter-flag">
          <WrenchIcon />
        </span>
      )}
    </span>
  )
}

export default function SimulatorManagement() {
  const [simulators, setSimulators] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTypes, setNewTypes] = useState([])
  const [newHoursBeforeMaintenance, setNewHoursBeforeMaintenance] = useState('')
  const [newMaintenanceDuration, setNewMaintenanceDuration] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Stage assignment matrix
  const [stages, setStages] = useState([])
  const [assignments, setAssignments] = useState(new Set()) // `${stageId}_${simulatorId}`
  const [matrixSaving, setMatrixSaving] = useState(false)
  const [matrixMsg, setMatrixMsg] = useState('')

  useEffect(() => {
    loadSimulators()
    loadMatrix()
  }, [])

  const summary = useMemo(() => {
    const active = simulators.filter((s) => s.is_active).length
    const due = simulators.filter(isMaintenanceDue).length
    return { active, due }
  }, [simulators])

  async function loadMatrix() {
    const { data: stageRows } = await supabase
      .from('stages')
      .select('id, name, track, sequence_order')
      .eq('requires_simulator', true)
      .order('track', { ascending: true })
      .order('sequence_order', { ascending: true })
    setStages(stageRows ?? [])

    const { data: assignRows } = await supabase.from('stage_simulators').select('stage_id, simulator_id')
    setAssignments(new Set((assignRows ?? []).map((r) => `${r.stage_id}_${r.simulator_id}`)))
  }

  async function toggleAssignment(stageId, simulatorId) {
    const key = `${stageId}_${simulatorId}`
    const isAssigned = assignments.has(key)
    setMatrixMsg('')
    setMatrixSaving(true)

    if (isAssigned) {
      const { error } = await supabase
        .from('stage_simulators')
        .delete()
        .eq('stage_id', stageId)
        .eq('simulator_id', simulatorId)
      if (error) {
        setMatrixMsg(error.message)
        setMatrixSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('stage_simulators')
        .insert({ stage_id: stageId, simulator_id: simulatorId })
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

  async function loadSimulators() {
    setLoading(true)
    const { data, error } = await supabase
      .from('simulators')
      .select('id, name, type, is_active, deactivated_at, expected_reactivation_date, hours_before_maintenance, maintenance_duration, total_operating_hours')
      .order('name', { ascending: true })

    if (error) setError(error.message)
    else setSimulators(data ?? [])
    setLoading(false)
  }

  function toggleNewType(value) {
    setNewTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    if (newTypes.length === 0) {
      setError('Select at least one type rating.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('simulators').insert({
      name: newName,
      type: newTypes,
      hours_before_maintenance: newHoursBeforeMaintenance === '' ? null : Number(newHoursBeforeMaintenance),
      maintenance_duration: newMaintenanceDuration || null,
    })

    if (error) {
      setError(error.message)
    } else {
      setNewName('')
      setNewTypes([])
      setNewHoursBeforeMaintenance('')
      setNewMaintenanceDuration('')
      setShowAddForm(false)
      await loadSimulators()
    }
    setSubmitting(false)
  }

  async function handleSaveEdit(sim, newValues) {
    setError('')
    if (newValues.type.length === 0) {
      setError('Select at least one type rating.')
      return
    }
    const { error } = await supabase
      .from('simulators')
      .update({
        name: newValues.name,
        type: newValues.type,
        hours_before_maintenance: newValues.hoursBeforeMaintenance === '' ? null : Number(newValues.hoursBeforeMaintenance),
        maintenance_duration: newValues.maintenanceDuration || null,
        expected_reactivation_date: newValues.expectedReactivationDate || null,
      })
      .eq('id', sim.id)

    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await loadSimulators()
  }

  async function handleToggleActive(sim) {
    setError('')
    const deactivating = sim.is_active
    const { error } = await supabase
      .from('simulators')
      .update({
        is_active: !sim.is_active,
        deactivated_at: deactivating ? new Date().toISOString() : null,
        expected_reactivation_date: deactivating ? sim.expected_reactivation_date : null,
      })
      .eq('id', sim.id)

    if (error) {
      setError(error.message)
      return
    }
    await loadSimulators()
  }

  return (
    <div className="main-content-wide">
      <div className="page-heading-row">
        <span className="page-icon-badge">
          <GaugeIcon />
        </span>
        <div className="page-heading">Simulators</div>
      </div>
      <div className="page-subheading">
        Manage your simulator units and their classification. A unit can hold more than
        one rating (e.g. both ATD and AATD).
      </div>

      <div className="mgmt-toolbar">
        {!showAddForm && (
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            <PlusIcon /> Add simulator
          </button>
        )}
        {showAddForm && <span />}

        {!loading && simulators.length > 0 && (
          <div className="mgmt-summary">
            <span>
              <strong>{simulators.length}</strong> total
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
            <span className="form-card-title">Add simulator</span>
            <button className="icon-btn" onClick={() => setShowAddForm(false)} aria-label="Close">
              <XIcon />
            </button>
          </div>
          <form onSubmit={handleAdd}>
            <div className="field">
              <label htmlFor="simName">Name</label>
              <input id="simName" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Type rating(s)</label>
              <TypeChips selected={newTypes} onToggle={toggleNewType} />
            </div>
            <div className="backfill-form-row">
              <div className="field">
                <label>Hours in operation before maintenance</label>
                <input
                  type="number"
                  step="0.1"
                  value={newHoursBeforeMaintenance}
                  onChange={(e) => setNewHoursBeforeMaintenance(e.target.value)}
                />
              </div>
              <div className="field">
                <label>How long is the maintenance</label>
                <input
                  type="text"
                  placeholder="e.g. 4 hours, half day"
                  value={newMaintenanceDuration}
                  onChange={(e) => setNewMaintenanceDuration(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-primary" type="submit" disabled={submitting} style={{ width: 'auto' }}>
              {submitting ? 'Adding…' : 'Add simulator'}
            </button>
          </form>
        </div>
      )}

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && simulators.length === 0 && (
        <div className="empty-state">No simulators yet — add your first unit above.</div>
      )}

      {!loading && simulators.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type rating(s)</th>
              <th>Total hours</th>
              <th>Hrs remaining</th>
              <th>Maintenance duration</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {simulators.map((sim) =>
              editingId === sim.id ? (
                <SimEditRow key={sim.id} sim={sim} onCancel={() => setEditingId(null)} onSave={handleSaveEdit} />
              ) : (
                <tr key={sim.id} className={!sim.is_active ? 'row-inactive' : ''}>
                  <td>{sim.name}</td>
                  <td><TypeBadges values={sim.type} /></td>
                  <td className="hours-figure">{sim.total_operating_hours ?? 0}</td>
                  <td>
                    <HoursRemaining sim={sim} />
                  </td>
                  <td>{sim.maintenance_duration ?? '—'}</td>
                  <td>
                    <span className={`status-pill ${sim.is_active ? 'complete' : 'rejected'}`}>
                      {sim.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {!sim.is_active && (sim.deactivated_at || sim.expected_reactivation_date) && (
                      <span className="status-cell-sub">
                        {sim.deactivated_at ? `Since ${new Date(sim.deactivated_at).toLocaleDateString()}` : ''}
                        {sim.expected_reactivation_date
                          ? ` · Back ${new Date(sim.expected_reactivation_date).toLocaleDateString()}`
                          : ''}
                      </span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => setEditingId(sim.id)}>
                      Edit
                    </button>
                    <button
                      className={!sim.is_active ? 'btn-approve' : 'btn-reject'}
                      onClick={() => handleToggleActive(sim)}
                    >
                      {sim.is_active ? 'Deactivate' : 'Reactivate'}
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
        Check which simulators are allowed for each stage. Students and faculty can only
        select from these — nothing is inferred automatically.
      </p>

      {matrixMsg && <div className="auth-error">{matrixMsg}</div>}

      {stages.length === 0 || simulators.length === 0 ? (
        <div className="empty-state">Add stages and simulators first.</div>
      ) : (
        <div className="matrix-table-wrap">
          <table className="simple-table matrix-table">
            <thead>
              <tr>
                <th>Stage</th>
                {simulators.map((sim) => (
                  <th key={sim.id} className="matrix-col-header">
                    {sim.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.id}>
                  <td>{stage.name} <span className="status-placeholder">({TRACK_LABELS[stage.track] ?? stage.track})</span></td>
                  {simulators.map((sim) => {
                    const key = `${stage.id}_${sim.id}`
                    return (
                      <td key={sim.id} className="matrix-checkbox-cell">
                        <label className="matrix-toggle">
                          <input
                            type="checkbox"
                            disabled={matrixSaving}
                            checked={assignments.has(key)}
                            onChange={() => toggleAssignment(stage.id, sim.id)}
                            aria-label={`${sim.name} allowed for ${stage.name}`}
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

function SimEditRow({ sim, onCancel, onSave }) {
  const [name, setName] = useState(sim.name)
  const [types, setTypes] = useState(sim.type ?? [])
  const [hoursBeforeMaintenance, setHoursBeforeMaintenance] = useState(sim.hours_before_maintenance ?? '')
  const [maintenanceDuration, setMaintenanceDuration] = useState(sim.maintenance_duration ?? '')
  const [expectedReactivationDate, setExpectedReactivationDate] = useState(sim.expected_reactivation_date ?? '')

  function toggleType(value) {
    setTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  return (
    <tr>
      <td colSpan={7}>
        <div className="form-card" style={{ margin: '4px 0', boxShadow: 'none' }}>
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Type rating(s)</label>
            <TypeChips selected={types} onToggle={toggleType} />
          </div>
          <div className="backfill-form-row">
            <div className="field">
              <label>Hours in operation before maintenance</label>
              <input
                type="number"
                step="0.1"
                value={hoursBeforeMaintenance}
                onChange={(e) => setHoursBeforeMaintenance(e.target.value)}
              />
            </div>
            <div className="field">
              <label>How long is the maintenance</label>
              <input
                type="text"
                placeholder="e.g. 4 hours"
                value={maintenanceDuration}
                onChange={(e) => setMaintenanceDuration(e.target.value)}
              />
            </div>
          </div>
          {!sim.is_active && (
            <div className="field">
              <label>Expected reactivation date</label>
              <input
                type="date"
                value={expectedReactivationDate}
                onChange={(e) => setExpectedReactivationDate(e.target.value)}
              />
            </div>
          )}
          <div className="row-actions">
            <button
              className="btn-approve"
              type="button"
              onClick={() =>
                onSave(sim, { name, type: types, hoursBeforeMaintenance, maintenanceDuration, expectedReactivationDate })
              }
            >
              Save
            </button>
            <button className="link-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}
