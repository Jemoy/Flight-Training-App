import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const SIM_TYPE_OPTIONS = [
  { value: 'basic_simulator', label: 'Basic Simulator' },
  { value: 'atd', label: 'ATD' },
  { value: 'aatd', label: 'AATD' },
]

function typeLabels(values) {
  return (values ?? [])
    .map((v) => SIM_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v)
    .join(', ') || '—'
}

export default function SimulatorManagement() {
  const [simulators, setSimulators] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTypes, setNewTypes] = useState([])
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

  async function loadMatrix() {
    const { data: stageRows } = await supabase
      .from('stages')
      .select('id, name, sequence_order')
      .eq('track', 'simulator')
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
      .select('id, name, type, is_active')
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
    const { error } = await supabase.from('simulators').insert({ name: newName, type: newTypes })

    if (error) {
      setError(error.message)
    } else {
      setNewName('')
      setNewTypes([])
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
      .update({ name: newValues.name, type: newValues.type })
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
    const { error } = await supabase
      .from('simulators')
      .update({ is_active: !sim.is_active })
      .eq('id', sim.id)

    if (error) {
      setError(error.message)
      return
    }
    await loadSimulators()
  }

  return (
    <div className="main-content">
      <div className="page-heading">Simulators</div>
      <div className="page-subheading">
        Manage your simulator units and their classification. A unit can hold more than
        one rating (e.g. both ATD and AATD).
      </div>

      <button
        className="btn-primary"
        style={{ width: 'auto', marginBottom: 20 }}
        onClick={() => setShowAddForm((v) => !v)}
      >
        {showAddForm ? 'Cancel' : 'Add simulator'}
      </button>

      {error && <div className="auth-error">{error}</div>}

      {showAddForm && (
        <form onSubmit={handleAdd} className="payment-form" style={{ marginBottom: 28, maxWidth: 420 }}>
          <div className="field">
            <label htmlFor="simName">Name</label>
            <input id="simName" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Type rating(s)</label>
            <div className="role-checkboxes">
              {SIM_TYPE_OPTIONS.map((opt) => (
                <label key={opt.value} className="role-checkbox">
                  <input
                    type="checkbox"
                    checked={newTypes.includes(opt.value)}
                    onChange={() => toggleNewType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add simulator'}
          </button>
        </form>
      )}

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && simulators.length === 0 && <p className="empty-text">No simulators yet.</p>}

      {!loading && simulators.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type rating(s)</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {simulators.map((sim) =>
              editingId === sim.id ? (
                <SimEditRow key={sim.id} sim={sim} onCancel={() => setEditingId(null)} onSave={handleSaveEdit} />
              ) : (
                <tr key={sim.id} className={!sim.is_active ? 'row-inactive' : ''}>
                  <td>{sim.name}</td>
                  <td>{typeLabels(sim.type)}</td>
                  <td>
                    <span className={`status-pill ${sim.is_active ? 'complete' : 'rejected'}`}>
                      {sim.is_active ? 'Active' : 'Inactive'}
                    </span>
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
      )}

      <div className="section-divider" />

      <h3 className="section-title">Stage assignments</h3>
      <p className="empty-text" style={{ marginBottom: 14 }}>
        Check which simulators are allowed for each stage. Students and faculty can only
        select from these — nothing is inferred automatically.
      </p>

      {matrixMsg && <div className="auth-error">{matrixMsg}</div>}

      {stages.length === 0 || simulators.length === 0 ? (
        <p className="empty-text">Add stages and simulators first.</p>
      ) : (
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
                <td>{stage.name}</td>
                {simulators.map((sim) => (
                  <td key={sim.id} className="matrix-checkbox-cell">
                    <input
                      type="checkbox"
                      disabled={matrixSaving}
                      checked={assignments.has(`${stage.id}_${sim.id}`)}
                      onChange={() => toggleAssignment(stage.id, sim.id)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SimEditRow({ sim, onCancel, onSave }) {
  const [name, setName] = useState(sim.name)
  const [types, setTypes] = useState(sim.type ?? [])

  function toggleType(value) {
    setTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  return (
    <tr>
      <td>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="inline-edit-input" />
      </td>
      <td>
        <div className="role-checkboxes">
          {SIM_TYPE_OPTIONS.map((opt) => (
            <label key={opt.value} className="role-checkbox">
              <input type="checkbox" checked={types.includes(opt.value)} onChange={() => toggleType(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      </td>
      <td colSpan={2} className="row-actions">
        <button className="btn-approve" onClick={() => onSave(sim, { name, type: types })}>
          Save
        </button>
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  )
}
