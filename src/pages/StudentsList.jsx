import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import ClassSchedulePanel from '../components/ClassSchedulePanel'
import BackfillPanel from '../components/BackfillPanel'
import { computeStageStatuses } from '../lib/stageStatus'

export default function StudentsList({ profile, session }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const isAdmin = profile?.role === 'admin'

  // Receipts panel
  const [expandedReceipts, setExpandedReceipts] = useState(null) // studentId currently expanded
  const [receiptsByStudent, setReceiptsByStudent] = useState({})
  const [receiptsLoading, setReceiptsLoading] = useState(false)

  // Class schedule panel (admin only)
  const [expandedSchedule, setExpandedSchedule] = useState(null)

  // Backfill panel (admin only)
  const [expandedBackfill, setExpandedBackfill] = useState(null)

  async function toggleReceipts(studentId) {
    if (expandedReceipts === studentId) {
      setExpandedReceipts(null)
      return
    }
    setExpandedReceipts(studentId)

    if (!receiptsByStudent[studentId]) {
      setReceiptsLoading(true)
      const { data } = await supabase
        .from('payments')
        .select('id, amount, hours_covered, status, submitted_at, receipt_url, stages(name)')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })

      setReceiptsByStudent((prev) => ({ ...prev, [studentId]: data ?? [] }))
      setReceiptsLoading(false)
    }
  }

  async function viewReceipt(path) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (error) {
      setError(`Could not open receipt: ${error.message}`)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  useEffect(() => {
    loadRoster()
  }, [])

  async function loadRoster() {
    setLoading(true)
    setError('')

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, student_number, pel_number, is_active')
      .eq('role', 'student')
      .order('full_name', { ascending: true })

    if (profilesErr) {
      setError(profilesErr.message)
      setLoading(false)
      return
    }

    const { data: stages } = await supabase
      .from('stages')
      .select('id, name, track, sequence_order, required_hours')
      .eq('track', 'simulator')
      .order('sequence_order', { ascending: true })

    const { data: prereqs } = await supabase
      .from('stage_prerequisites')
      .select('stage_id, prerequisite_stage_id')

    const { data: progress } = await supabase
      .from('student_stage_progress')
      .select('student_id, stage_id, cumulative_hours, status')

    const { data: evaluations } = await supabase
      .from('evaluations')
      .select('student_id, result, created_at')
      .order('created_at', { ascending: false })

    const latestEvalByStudent = {}
    for (const e of evaluations ?? []) {
      if (!latestEvalByStudent[e.student_id]) latestEvalByStudent[e.student_id] = e
    }

    const progressByStudent = {}
    for (const p of progress ?? []) {
      if (!progressByStudent[p.student_id]) progressByStudent[p.student_id] = []
      progressByStudent[p.student_id].push(p)
    }

    const roster = (profiles ?? []).map((student) => {
      const studentProgress = progressByStudent[student.id] ?? []
      const merged = computeStageStatuses(stages, studentProgress, prereqs)

      const allComplete = merged.length > 0 && merged.every((s) => s.status === 'complete')
      const currentStage = merged.find((s) => s.status === 'in_progress' || s.status === 'pending_approval')
      const latestEval = latestEvalByStudent[student.id]

      return {
        ...student,
        currentStageLabel: allComplete
          ? 'FS: All stages complete'
          : currentStage?.status === 'pending_approval'
          ? `FS: ${currentStage.name} (pending approval)`
          : `FS: ${currentStage?.name ?? 'Not started'}`,
        latestEval,
      }
    })

    setStudents(roster)
    setLoading(false)
  }

  async function handleSaveEdit(student, newFullName, newStudentNumber, newPelNumber) {
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: newFullName, student_number: newStudentNumber, pel_number: newPelNumber })
      .eq('id', student.id)

    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    await loadRoster()
  }

  async function handleToggleActive(student) {
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !student.is_active })
      .eq('id', student.id)

    if (error) {
      setError(error.message)
      return
    }
    await loadRoster()
  }

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return students
      .filter((s) => showInactive || s.is_active !== false)
      .filter(
        (s) =>
          !term ||
          s.full_name?.toLowerCase().includes(term) ||
          s.student_number?.toLowerCase().includes(term)
      )
  }, [students, filter, showInactive])

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Students</div>
      <div className="page-subheading">
        Every student, their current simulator stage, and their most recent evaluation.
      </div>

      <div className="roster-controls">
        <input
          type="text"
          className="roster-filter"
          placeholder="Filter by name or student ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {isAdmin && (
          <label className="role-checkbox">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show deactivated
          </label>
        )}
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <p className="empty-text">No students found.</p>
      )}

      {!loading && filtered.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Student name</th>
              <th>Student ID</th>
              <th>Evaluation</th>
              <th>Current stage</th>
              <th>Receipts</th>
              {isAdmin && <th>Class schedule</th>}
              {isAdmin && <th>Backfill</th>}
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) =>
              editingId === s.id ? (
                <StudentEditRow
                  key={s.id}
                  student={s}
                  onCancel={() => setEditingId(null)}
                  onSave={handleSaveEdit}
                />
              ) : (
                <React.Fragment key={s.id}>
                  <tr className={s.is_active === false ? 'row-inactive' : ''}>
                    <td>
                      {s.full_name}
                      {s.is_active === false && (
                        <span className="status-pill rejected" style={{ marginLeft: 8 }}>
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="hours-figure">{s.student_number ?? '—'}</td>
                    <td>
                      {s.latestEval ? (
                        <span className={`status-pill ${s.latestEval.result === 'pass' ? 'complete' : 'rejected'}`}>
                          {s.latestEval.result}
                        </span>
                      ) : (
                        <span className="status-placeholder">No evaluations yet</span>
                      )}
                    </td>
                    <td>{s.currentStageLabel}</td>
                    <td>
                      <button className="link-btn" onClick={() => toggleReceipts(s.id)}>
                        {expandedReceipts === s.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className="link-btn"
                          onClick={() =>
                            setExpandedSchedule((prev) => (prev === s.id ? null : s.id))
                          }
                        >
                          {expandedSchedule === s.id ? 'Hide' : 'Manage'}
                        </button>
                      </td>
                    )}
                    {isAdmin && (
                      <td>
                        <button
                          className="link-btn"
                          onClick={() =>
                            setExpandedBackfill((prev) => (prev === s.id ? null : s.id))
                          }
                        >
                          {expandedBackfill === s.id ? 'Hide' : 'Add hours'}
                        </button>
                      </td>
                    )}
                    {isAdmin && (
                      <td className="row-actions">
                        <button className="link-btn" onClick={() => setEditingId(s.id)}>
                          Edit
                        </button>
                        <button
                          className={s.is_active === false ? 'btn-approve' : 'btn-reject'}
                          onClick={() => handleToggleActive(s)}
                        >
                          {s.is_active === false ? 'Reactivate' : 'Deactivate'}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedReceipts === s.id && (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 5} className="receipts-panel-cell">
                        {receiptsLoading && !receiptsByStudent[s.id] ? (
                          <p className="loading-text">Loading receipts…</p>
                        ) : (receiptsByStudent[s.id] ?? []).length === 0 ? (
                          <p className="empty-text">No receipts submitted yet.</p>
                        ) : (
                          <table className="simple-table receipts-subtable">
                            <thead>
                              <tr>
                                <th>Stage</th>
                                <th>Amount</th>
                                <th>Hours</th>
                                <th>Status</th>
                                <th>Submitted</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {receiptsByStudent[s.id].map((r) => (
                                <tr key={r.id}>
                                  <td>{r.stages?.name ?? '—'}</td>
                                  <td className="hours-figure">₱{r.amount}</td>
                                  <td className="hours-figure">{r.hours_covered}</td>
                                  <td>
                                    <span className={`status-pill ${r.status}`}>{r.status}</span>
                                  </td>
                                  <td>{new Date(r.submitted_at).toLocaleDateString()}</td>
                                  <td>
                                    <button className="link-btn" onClick={() => viewReceipt(r.receipt_url)}>
                                      View receipt
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  {isAdmin && expandedSchedule === s.id && (
                    <tr>
                      <td colSpan={8} className="receipts-panel-cell">
                        <ClassSchedulePanel studentId={s.id} />
                      </td>
                    </tr>
                  )}
                  {isAdmin && expandedBackfill === s.id && (
                    <tr>
                      <td colSpan={8} className="receipts-panel-cell">
                        <BackfillPanel studentId={s.id} currentUserId={session?.user?.id} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StudentEditRow({ student, onCancel, onSave }) {
  const [name, setName] = useState(student.full_name)
  const [studentNumber, setStudentNumber] = useState(student.student_number ?? '')
  const [pelNumber, setPelNumber] = useState(student.pel_number ?? '')

  return (
    <tr>
      <td>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="inline-edit-input" />
      </td>
      <td>
        <input
          type="text"
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          className="inline-edit-input"
        />
      </td>
      <td>
        <input
          type="text"
          placeholder="PEL number"
          value={pelNumber}
          onChange={(e) => setPelNumber(e.target.value)}
          className="inline-edit-input"
        />
      </td>
      <td colSpan={4}></td>
      <td className="row-actions">
        <button className="btn-approve" onClick={() => onSave(student, name, studentNumber, pelNumber)}>
          Save
        </button>
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  )
}
