import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function RouteManagement() {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadRoutes()
  }, [])

  async function loadRoutes() {
    setLoading(true)
    const { data, error } = await supabase.from('routes').select('id, name').order('name', { ascending: true })
    if (error) setError(error.message)
    else setRoutes(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (!newName.trim()) return

    setSubmitting(true)
    const { error } = await supabase.from('routes').insert({ name: newName.trim() })

    if (error) {
      setError(error.message)
    } else {
      setNewName('')
      await loadRoutes()
    }
    setSubmitting(false)
  }

  async function handleSaveEdit(route, newValue) {
    setError('')
    if (!newValue.trim()) return

    const { error } = await supabase.from('routes').update({ name: newValue.trim() }).eq('id', route.id)

    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await loadRoutes()
  }

  async function handleDelete(route) {
    if (!window.confirm(`Delete "${route.name}" from the route list?`)) return
    setError('')
    const { error } = await supabase.from('routes').delete().eq('id', route.id)
    if (error) {
      setError(error.message)
      return
    }
    await loadRoutes()
  }

  return (
    <div className="main-content">
      <div className="page-heading">Routes</div>
      <div className="page-subheading">
        Maintain the list of route points (e.g. RPVM, LOCAL). Instructors pick From/To
        from this list when logging a session.
      </div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleAdd} className="payment-form" style={{ marginBottom: 28, maxWidth: 420 }}>
        <div className="field">
          <label htmlFor="routeName">Route point name</label>
          <input
            id="routeName"
            type="text"
            placeholder="e.g. RPVM or LOCAL"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add route point'}
        </button>
      </form>

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && routes.length === 0 && <p className="empty-text">No route points added yet.</p>}

      {!loading && routes.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Route point</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) =>
              editingId === r.id ? (
                <RouteEditRow key={r.id} route={r} onCancel={() => setEditingId(null)} onSave={handleSaveEdit} />
              ) : (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => setEditingId(r.id)}>
                      Edit
                    </button>
                    <button className="btn-reject" onClick={() => handleDelete(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RouteEditRow({ route, onCancel, onSave }) {
  const [name, setName] = useState(route.name)

  return (
    <tr>
      <td>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="inline-edit-input" />
      </td>
      <td className="row-actions">
        <button className="btn-approve" onClick={() => onSave(route, name)}>
          Save
        </button>
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  )
}
