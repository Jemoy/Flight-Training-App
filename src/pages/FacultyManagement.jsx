import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const INSTRUCTOR_ROLE_OPTIONS = [
  { value: 'ground_instructor', label: 'Ground Instructor' },
  { value: 'fsi_rated', label: 'FSI Rated' },
  { value: 'flight_instructor', label: 'Flight Instructor' },
  { value: 'any', label: 'Any' },
]

export default function FacultyManagement() {
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)

  // Add faculty form
  const [showAddForm, setShowAddForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [instructorRoles, setInstructorRoles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    loadFaculty()
  }, [])

  async function loadFaculty() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, instructor_roles')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })

    if (error) setError(error.message)
    else setFaculty(data ?? [])
    setLoading(false)
  }

  function toggleRole(role) {
    setInstructorRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let pw = ''
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)]
    setPassword(pw)
  }

  async function handleAddSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setSubmitting(true)

    const { data, error: invokeError } = await supabase.functions.invoke('create-faculty', {
      body: { full_name: fullName, email, password, instructor_roles: instructorRoles },
    })

    if (invokeError) {
      setError(invokeError.message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setSuccessMsg(
        `Faculty account created for ${fullName}. Email: ${email} · Password: ${password} — share these directly, they aren't shown again.`
      )
      setFullName('')
      setEmail('')
      setPassword('')
      setInstructorRoles([])
      await loadFaculty()
    }
    setSubmitting(false)
  }

  async function handleSaveEdit(member, newFullName, newRoles) {
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: newFullName, instructor_roles: newRoles })
      .eq('id', member.id)

    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await loadFaculty()
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Faculty</div>
      <div className="page-subheading">
        View and edit faculty accounts, and their instructor qualifications.
      </div>

      <button className="btn-primary" style={{ width: 'auto', marginBottom: 20 }} onClick={() => setShowAddForm((v) => !v)}>
        {showAddForm ? 'Cancel' : 'Add faculty'}
      </button>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="payment-form" style={{ marginBottom: 28 }}>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Temporary password</label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="button" className="link-btn generate-pw-btn" onClick={generatePassword}>
              Generate random password
            </button>
          </div>
          <div className="field">
            <label>Instructor qualifications</label>
            <div className="role-checkboxes">
              {INSTRUCTOR_ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="role-checkbox">
                  <input
                    type="checkbox"
                    checked={instructorRoles.includes(opt.value)}
                    onChange={() => toggleRole(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create faculty account'}
          </button>
        </form>
      )}

      {loading && <p className="loading-text">Loading…</p>}
      {!loading && faculty.length === 0 && <p className="empty-text">No faculty accounts yet.</p>}

      {!loading && faculty.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Qualifications</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {faculty.map((member) =>
              editingId === member.id ? (
                <FacultyEditRow
                  key={member.id}
                  member={member}
                  onCancel={() => setEditingId(null)}
                  onSave={handleSaveEdit}
                />
              ) : (
                <tr key={member.id}>
                  <td>{member.full_name}</td>
                  <td>
                    {(member.instructor_roles ?? []).length > 0
                      ? member.instructor_roles
                          .map((r) => INSTRUCTOR_ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r)
                          .join(', ')
                      : '—'}
                  </td>
                  <td>
                    <button className="link-btn" onClick={() => setEditingId(member.id)}>
                      Edit
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

function FacultyEditRow({ member, onCancel, onSave }) {
  const [name, setName] = useState(member.full_name)
  const [roles, setRoles] = useState(member.instructor_roles ?? [])

  function toggleRole(role) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  return (
    <tr>
      <td>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="inline-edit-input" />
      </td>
      <td>
        <div className="role-checkboxes">
          {INSTRUCTOR_ROLE_OPTIONS.map((opt) => (
            <label key={opt.value} className="role-checkbox">
              <input type="checkbox" checked={roles.includes(opt.value)} onChange={() => toggleRole(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      </td>
      <td className="row-actions">
        <button className="btn-approve" onClick={() => onSave(member, name, roles)}>
          Save
        </button>
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  )
}
