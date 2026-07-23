import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import LogEntryFields, { emptyLogEntry } from '../components/LogEntryFields'

export default function FacultyEvaluations({ session, profile }) {
  const [pending, setPending] = useState([])
  const [completed, setCompleted] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openRowId, setOpenRowId] = useState(null)
  const [notes, setNotes] = useState('')
  const [logEntry, setLogEntry] = useState(emptyLogEntry())
  const [recommendAdvance, setRecommendAdvance] = useState(null)
  const [routes, setRoutes] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [editingEvalId, setEditingEvalId] = useState(null)
  const [editResult, setEditResult] = useState('pass')
  const [editNotes, setEditNotes] = useState('')
  const [editLog, setEditLog] = useState(emptyLogEntry())
  const [editRecommendAdvance, setEditRecommendAdvance] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    loadPending()
    loadCompleted()
    loadRoutes()
  }, [])

  async function loadRoutes() {
    const { data } = await supabase.from('routes').select('id, name').order('name', { ascending: true })
    setRoutes(data ?? [])
  }

  async function loadPending() {
    setLoading(true)
    setError('')

    let query = supabase
      .from('session_participants')
      .select(
        'id, student_id, session_id, hours_credited, profiles(full_name), sessions!inner(id, scheduled_start, status, instructor_id, stage_id, stages(name, code, required_hours), instructor:profiles!sessions_instructor_id_fkey(full_name))'
      )

    if (!isAdmin) {
      query = query.eq('sessions.instructor_id', session.user.id)
    }

    const { data: participants, error: pErr } = await query

    if (pErr) {
      setError(pErr.message)
      setLoading(false)
      return
    }

    const { data: evaluations, error: eErr } = await supabase
      .from('evaluations')
      .select('session_id, student_id')

    if (eErr) {
      setError(eErr.message)
      setLoading(false)
      return
    }

    const evaluatedKeys = new Set((evaluations ?? []).map((e) => `${e.session_id}_${e.student_id}`))

    const stillPending = (participants ?? []).filter(
      (p) => !evaluatedKeys.has(`${p.session_id}_${p.student_id}`)
    )

    // Existing cumulative hours per (student, stage) — needed to know whether
    // THIS evaluation's hours would push the student over the stage threshold.
    const { data: progressRows } = await supabase
      .from('student_stage_progress')
      .select('student_id, stage_id, cumulative_hours')

    const progressMap = {}
    for (const row of progressRows ?? []) {
      progressMap[`${row.student_id}_${row.stage_id}`] = Number(row.cumulative_hours ?? 0)
    }

    const withExisting = stillPending.map((p) => ({
      ...p,
      existingHours: progressMap[`${p.student_id}_${p.sessions.stage_id}`] ?? 0,
    }))

    setPending(withExisting)
    setLoading(false)
  }

  // Evaluations this instructor personally submitted, editable by them only.
  async function loadCompleted() {
    if (isAdmin) return

    const { data, error } = await supabase
      .from('evaluations')
      .select(
        'id, session_id, student_id, result, notes, recommend_advance, profiles!evaluations_student_id_fkey(full_name), sessions(scheduled_start, stage_id, aircraft_type, check_type, route_from, route_to, flight_category, duty_type, stages(name, code, required_hours))'
      )
      .eq('evaluator_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    const { data: hoursRows } = await supabase
      .from('session_participants')
      .select('session_id, student_id, hours_credited')

    const hoursMap = {}
    for (const h of hoursRows ?? []) {
      hoursMap[`${h.session_id}_${h.student_id}`] = h.hours_credited
    }

    const merged = (data ?? []).map((ev) => ({
      ...ev,
      hours_credited: hoursMap[`${ev.session_id}_${ev.student_id}`] ?? 1,
    }))

    setCompleted(merged)
  }

  function updateLog(field, value) {
    setLogEntry((prev) => ({ ...prev, [field]: value }))
  }

  function updateEditLog(field, value) {
    setEditLog((prev) => ({ ...prev, [field]: value }))
  }

  function crossesThreshold(existingHours, requiredHours, enteredHours) {
    if (requiredHours == null) return false
    const total = Number(existingHours ?? 0) + Number(enteredHours || 0)
    return total >= Number(requiredHours)
  }

  async function handleEvaluate(participant, result) {
    const hoursValue = Number(logEntry.hours)
    if (!logEntry.aircraftType.trim() || !logEntry.routeFrom || !logEntry.routeTo) {
      setError('Fill in Type, Route From, and Route To before submitting.')
      return
    }
    if (!hoursValue || hoursValue <= 0) {
      setError('Enter a valid number of hours.')
      return
    }

    const requiredHours = participant.sessions?.stages?.required_hours
    const willCrossThreshold =
      result === 'pass' && crossesThreshold(participant.existingHours, requiredHours, hoursValue)

    if (willCrossThreshold && recommendAdvance === null) {
      setError('This meets the stage requirement — answer "Will this student proceed?" before submitting.')
      return
    }

    setSubmitting(true)
    setError('')

    const { error: hoursErr } = await supabase
      .from('session_participants')
      .update({ hours_credited: hoursValue })
      .eq('session_id', participant.session_id)
      .eq('student_id', participant.student_id)

    if (hoursErr) {
      setError(hoursErr.message)
      setSubmitting(false)
      return
    }

    const { error: sessionErr } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        aircraft_type: logEntry.aircraftType.trim(),
        check_type: logEntry.checkType.trim() || null,
        route_from: logEntry.routeFrom,
        route_to: logEntry.routeTo,
        flight_category: logEntry.category,
        duty_type: logEntry.duty,
      })
      .eq('id', participant.session_id)

    if (sessionErr) {
      setError(sessionErr.message)
      setSubmitting(false)
      return
    }

    const { error: evalError } = await supabase.from('evaluations').insert({
      session_id: participant.session_id,
      student_id: participant.student_id,
      evaluator_id: session.user.id,
      result,
      notes,
      recommend_advance: willCrossThreshold ? recommendAdvance : null,
    })

    if (evalError) {
      setError(evalError.message)
      setSubmitting(false)
      return
    }

    setNotes('')
    setLogEntry(emptyLogEntry())
    setRecommendAdvance(null)
    setOpenRowId(null)
    await Promise.all([loadPending(), loadCompleted()])
    setSubmitting(false)
  }

  function startEdit(ev) {
    setEditingEvalId(ev.id)
    setEditResult(ev.result)
    setEditNotes(ev.notes ?? '')
    setEditRecommendAdvance(ev.recommend_advance ?? null)
    setEditLog({
      aircraftType: ev.sessions?.aircraft_type ?? '',
      checkType: ev.sessions?.check_type ?? '',
      routeFrom: ev.sessions?.route_from ?? '',
      routeTo: ev.sessions?.route_to ?? '',
      category: ev.sessions?.flight_category ?? 'local',
      duty: ev.sessions?.duty_type ?? 'dual',
      hours: String(ev.hours_credited ?? 1),
    })
  }

  async function handleSaveEdit(ev) {
    const hoursValue = Number(editLog.hours)
    if (!editLog.aircraftType.trim() || !editLog.routeFrom || !editLog.routeTo) {
      setError('Fill in Type, Route From, and Route To before saving.')
      return
    }
    if (!hoursValue || hoursValue <= 0) {
      setError('Enter a valid number of hours.')
      return
    }

    const requiredHours = ev.sessions?.stages?.required_hours
    const needsAnswer =
      editResult === 'pass' &&
      requiredHours != null &&
      hoursValue >= requiredHours &&
      editRecommendAdvance === null

    if (needsAnswer) {
      setError('This meets the stage requirement — answer "Will this student proceed?" before saving.')
      return
    }

    setEditSubmitting(true)
    setError('')

    const { error: sessionErr } = await supabase
      .from('sessions')
      .update({
        aircraft_type: editLog.aircraftType.trim(),
        check_type: editLog.checkType.trim() || null,
        route_from: editLog.routeFrom,
        route_to: editLog.routeTo,
        flight_category: editLog.category,
        duty_type: editLog.duty,
      })
      .eq('id', ev.session_id)

    if (sessionErr) {
      setError(sessionErr.message)
      setEditSubmitting(false)
      return
    }

    const { error: hoursErr } = await supabase
      .from('session_participants')
      .update({ hours_credited: hoursValue })
      .eq('session_id', ev.session_id)
      .eq('student_id', ev.student_id)

    if (hoursErr) {
      setError(hoursErr.message)
      setEditSubmitting(false)
      return
    }

    const { error: evalErr } = await supabase
      .from('evaluations')
      .update({ result: editResult, notes: editNotes, recommend_advance: editRecommendAdvance })
      .eq('id', ev.id)

    if (evalErr) {
      setError(evalErr.message)
      setEditSubmitting(false)
      return
    }

    setEditingEvalId(null)
    await loadCompleted()
    setEditSubmitting(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Student evaluations</div>
      <div className="page-subheading">
        {isAdmin
          ? "Every session awaiting evaluation, across all instructors. Only the assigned instructor can actually submit the evaluation — this view is for oversight."
          : 'Only sessions where you\'re the assigned instructor show here. When hours meet the stage requirement, you\'ll be asked whether the student should proceed — admin still has to approve it before the next stage unlocks.'}
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && pending.length === 0 && (
        <p className="empty-text">No sessions awaiting evaluation.</p>
      )}

      {!loading && pending.length > 0 && (
        <div className="eval-list">
          {pending.map((p) => {
            const requiredHours = p.sessions?.stages?.required_hours
            const willCross =
              openRowId === p.id && crossesThreshold(p.existingHours, requiredHours, Number(logEntry.hours))

            return (
              <div className="eval-card" key={p.id}>
                <div className="eval-card-top">
                  <div>
                    <div className="eval-student">{p.profiles?.full_name ?? 'Unknown student'}</div>
                    <div className="eval-meta">
                      {p.sessions?.stages?.name} ·{' '}
                      {p.sessions?.scheduled_start
                        ? new Date(p.sessions.scheduled_start).toLocaleString()
                        : '—'}{' '}
                      · {p.hours_credited} hrs
                      {isAdmin && (
                        <> · Assigned: {p.sessions?.instructor?.full_name ?? 'Unassigned'}</>
                      )}
                    </div>
                  </div>
                  {!isAdmin && openRowId !== p.id && (
                    <button
                      className="link-btn"
                      onClick={() => {
                        setOpenRowId(p.id)
                        setLogEntry({
                          ...emptyLogEntry(),
                          hours: String(p.hours_credited ?? 1),
                          aircraftType: p.sessions?.stages?.code === 'FS_VA' ? 'VA' : '',
                        })
                        setRecommendAdvance(null)
                      }}
                    >
                      Evaluate
                    </button>
                  )}
                </div>

                {!isAdmin && openRowId === p.id && (
                  <div className="eval-form">
                    <LogEntryFields
                      logEntry={logEntry}
                      updateLog={(field, value) => {
                        updateLog(field, value)
                        if (field === 'hours') setRecommendAdvance(null)
                      }}
                      routes={routes}
                      lockTypeToVA={p.sessions?.stages?.code === 'FS_VA'}
                    />

                    {willCross && (
                      <div className="recommend-advance-box">
                        <div className="recommend-advance-title">
                          This meets the {requiredHours} hr requirement for {p.sessions?.stages?.name}.
                          Will this student proceed to the next stage?
                        </div>
                        <div className="row-actions">
                          <button
                            type="button"
                            className={recommendAdvance === true ? 'btn-approve' : 'link-btn'}
                            onClick={() => setRecommendAdvance(true)}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={recommendAdvance === false ? 'btn-reject' : 'link-btn'}
                            onClick={() => setRecommendAdvance(false)}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}

                    <textarea
                      placeholder="Notes on this student's performance…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                    <div className="row-actions">
                      <button
                        className="btn-approve"
                        disabled={submitting}
                        onClick={() => handleEvaluate(p, 'pass')}
                      >
                        Pass
                      </button>
                      <button
                        className="btn-reject"
                        disabled={submitting}
                        onClick={() => handleEvaluate(p, 'fail')}
                      >
                        Fail
                      </button>
                      <button
                        className="link-btn"
                        disabled={submitting}
                        onClick={() => {
                          setOpenRowId(null)
                          setNotes('')
                          setLogEntry(emptyLogEntry())
                          setRecommendAdvance(null)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isAdmin && (
        <>
          <div className="section-divider" />
          <h3 className="section-title">Your past evaluations</h3>
          <p className="empty-text" style={{ marginBottom: 14 }}>
            You can edit an evaluation you submitted — result, notes, or the flight log
            details — at any time.
          </p>

          {completed.length === 0 && <p className="empty-text">No evaluations submitted yet.</p>}

          {completed.length > 0 && (
            <div className="eval-list">
              {completed.map((ev) => {
                const requiredHours = ev.sessions?.stages?.required_hours
                const editWillCross =
                  editingEvalId === ev.id &&
                  editResult === 'pass' &&
                  requiredHours != null &&
                  Number(editLog.hours) >= requiredHours

                return (
                  <div className="eval-card" key={ev.id}>
                    <div className="eval-card-top">
                      <div>
                        <div className="eval-student">{ev.profiles?.full_name ?? 'Unknown student'}</div>
                        <div className="eval-meta">
                          {ev.sessions?.stages?.name} ·{' '}
                          {ev.sessions?.scheduled_start
                            ? new Date(ev.sessions.scheduled_start).toLocaleString()
                            : '—'}{' '}
                          ·{' '}
                          <span className={`status-pill ${ev.result === 'pass' ? 'complete' : 'rejected'}`}>
                            {ev.result}
                          </span>
                        </div>
                      </div>
                      {editingEvalId !== ev.id && (
                        <button className="link-btn" onClick={() => startEdit(ev)}>
                          Edit
                        </button>
                      )}
                    </div>

                    {editingEvalId === ev.id && (
                      <div className="eval-form">
                        <LogEntryFields
                          logEntry={editLog}
                          updateLog={updateEditLog}
                          routes={routes}
                          lockTypeToVA={ev.sessions?.stages?.code === 'FS_VA'}
                        />

                        {editWillCross && (
                          <div className="recommend-advance-box">
                            <div className="recommend-advance-title">
                              This meets the {requiredHours} hr requirement. Will this student proceed
                              to the next stage?
                            </div>
                            <div className="row-actions">
                              <button
                                type="button"
                                className={editRecommendAdvance === true ? 'btn-approve' : 'link-btn'}
                                onClick={() => setEditRecommendAdvance(true)}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className={editRecommendAdvance === false ? 'btn-reject' : 'link-btn'}
                                onClick={() => setEditRecommendAdvance(false)}
                              >
                                No
                              </button>
                            </div>
                          </div>
                        )}

                        <textarea
                          placeholder="Notes on this student's performance…"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                        />
                        <div className="row-actions">
                          <button
                            className={editResult === 'pass' ? 'btn-approve' : 'link-btn'}
                            onClick={() => setEditResult('pass')}
                            disabled={editSubmitting}
                          >
                            Pass
                          </button>
                          <button
                            className={editResult === 'fail' ? 'btn-reject' : 'link-btn'}
                            onClick={() => setEditResult('fail')}
                            disabled={editSubmitting}
                          >
                            Fail
                          </button>
                          <button
                            className="btn-approve"
                            onClick={() => handleSaveEdit(ev)}
                            disabled={editSubmitting}
                          >
                            {editSubmitting ? 'Saving…' : 'Save changes'}
                          </button>
                          <button
                            className="link-btn"
                            onClick={() => setEditingEvalId(null)}
                            disabled={editSubmitting}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
