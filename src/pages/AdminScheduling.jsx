import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Calendar from '../components/Calendar'
import { getSimulatorsForStage } from '../lib/stageSimulators'
import { getAircraftForStage } from '../lib/stageAircraft'
import { aircraftMaintenanceStatus, aircraftOptionLabel } from '../lib/aircraftStatus'
import { SIM_SLOTS, slotStartDate, slotEndDate, findSlotIndexForDate } from '../lib/simSlots'

export default function AdminScheduling() {
  const [queue, setQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)

  const [studentSearch, setStudentSearch] = useState('')
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)

  const [availability, setAvailability] = useState([]) // [{stage_id, stage_name, requires_simulator, available_hours}]
  const [stageId, setStageId] = useState('')
  const [date, setDate] = useState('')
  const [slotIndex, setSlotIndex] = useState('')
  const [faculty, setFaculty] = useState([])
  const [instructorId, setInstructorId] = useState('')
  const [stageSimulators, setStageSimulators] = useState([])
  const [simulatorId, setSimulatorId] = useState('')
  const [aircraftList, setAircraftList] = useState([])
  const [aircraftId, setAircraftId] = useState('')

  const [calEvents, setCalEvents] = useState([])
  const [calView, setCalView] = useState('week')
  const [calDate, setCalDate] = useState(new Date())

  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  const selectedStage = availability.find((a) => a.stage_id === stageId)
  const needsSimulator = selectedStage?.requires_simulator !== false
  const needsAircraft = selectedStage?.requires_simulator === false

  useEffect(() => {
    loadFaculty()
    loadQueue()
  }, [])

  // Every verified payment with hours still unscheduled, oldest approval first.
  async function loadQueue() {
    setQueueLoading(true)

    const { data: payments } = await supabase
      .from('payments')
      .select(
        'id, student_id, stage_id, hours_covered, verified_at, profiles!payments_student_id_fkey(full_name, student_number), stages!inner(name, track)'
      )
      .eq('status', 'verified')
      .not('stages.track', 'in', '(ppl,cpl,ir)')
      .order('verified_at', { ascending: true })

    const { data: participations } = await supabase
      .from('session_participants')
      .select('student_id, hours_credited, sessions(stage_id, status)')

    const usedByStudentStage = {}
    for (const p of participations ?? []) {
      const s = p.sessions
      if (!s || s.status === 'cancelled') continue
      const key = `${p.student_id}_${s.stage_id}`
      usedByStudentStage[key] = (usedByStudentStage[key] ?? 0) + Number(p.hours_credited ?? 0)
    }

    // Group by student+stage so remaining hours reflect the combined pool,
    // not each individual payment — but keep the earliest approval date for ordering.
    const grouped = {}
    for (const p of payments ?? []) {
      const key = `${p.student_id}_${p.stage_id}`
      if (!grouped[key]) {
        grouped[key] = {
          studentId: p.student_id,
          studentName: p.profiles?.full_name ?? 'Unknown',
          studentNumber: p.profiles?.student_number ?? '',
          stageId: p.stage_id,
          stageName: p.stages?.name ?? '—',
          paidHours: 0,
          earliestApproval: p.verified_at,
        }
      }
      grouped[key].paidHours += Number(p.hours_covered)
      if (new Date(p.verified_at) < new Date(grouped[key].earliestApproval)) {
        grouped[key].earliestApproval = p.verified_at
      }
    }

    const rows = Object.values(grouped)
      .map((g) => ({
        ...g,
        remainingHours: Math.round((g.paidHours - (usedByStudentStage[`${g.studentId}_${g.stageId}`] ?? 0)) * 100) / 100,
      }))
      .filter((g) => g.remainingHours > 0)
      .sort((a, b) => new Date(a.earliestApproval) - new Date(b.earliestApproval))

    setQueue(rows)
    setQueueLoading(false)
  }

  useEffect(() => {
    if (!studentSearch.trim()) {
      setStudents([])
      return
    }
    const term = studentSearch.trim().toLowerCase()
    supabase
      .from('profiles')
      .select('id, full_name, student_number')
      .eq('role', 'student')
      .eq('is_active', true)
      .then(({ data }) => {
        setStudents(
          (data ?? []).filter(
            (s) =>
              s.full_name.toLowerCase().includes(term) ||
              (s.student_number ?? '').toLowerCase().includes(term)
          )
        )
      })
  }, [studentSearch])

  useEffect(() => {
    if (!stageId) {
      setStageSimulators([])
      setSimulatorId('')
      setAircraftList([])
      setAircraftId('')
      return
    }
    getSimulatorsForStage(stageId).then((sims) => {
      setStageSimulators(sims)
      setSimulatorId(sims[0]?.id ?? '')
    })
    getAircraftForStage(stageId).then(setAircraftList)
    setAircraftId('')
  }, [stageId])

  async function loadFaculty() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })
    setFaculty(data ?? [])
  }

  async function selectStudent(student, preselectStageId) {
    setSelectedStudent(student)
    setStudentSearch('')
    setStudents([])
    setStageId('')
    setDate('')
    setSlotIndex('')
    setError('')
    setSuccessMsg('')
    await Promise.all([loadAvailability(student.id), loadStudentCalendar(student.id)])
    if (preselectStageId) setStageId(preselectStageId)
  }

  async function loadAvailability(studentId) {
    setLoading(true)
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name, requires_simulator, track')
      .not('track', 'in', '(ppl,cpl,ir)')

    const { data: payments } = await supabase
      .from('payments')
      .select('stage_id, hours_covered')
      .eq('student_id', studentId)
      .eq('status', 'verified')

    const { data: participations } = await supabase
      .from('session_participants')
      .select('hours_credited, sessions(stage_id, status)')
      .eq('student_id', studentId)

    const paidByStage = {}
    for (const p of payments ?? []) {
      paidByStage[p.stage_id] = (paidByStage[p.stage_id] ?? 0) + Number(p.hours_covered)
    }

    const usedByStage = {}
    for (const p of participations ?? []) {
      const s = p.sessions
      if (!s || s.status === 'cancelled') continue
      usedByStage[s.stage_id] = (usedByStage[s.stage_id] ?? 0) + Number(p.hours_credited ?? 0)
    }

    const rows = (stages ?? [])
      .map((s) => {
        const paid = paidByStage[s.id] ?? 0
        const used = usedByStage[s.id] ?? 0
        const available = Math.round((paid - used) * 100) / 100
        return {
          stage_id: s.id,
          stage_name: s.name,
          requires_simulator: s.requires_simulator,
          available_hours: available,
        }
      })
      .filter((r) => r.available_hours > 0)

    setAvailability(rows)
    setLoading(false)
  }

  // Shows this student's existing sessions + their class schedule, so admin
  // can visually pick a time that doesn't conflict on the student's side.
  async function loadStudentCalendar(studentId) {
    const { data: participants } = await supabase
      .from('session_participants')
      .select('sessions(id, scheduled_start, scheduled_end, status, stages(name))')
      .eq('student_id', studentId)

    const { data: classes } = await supabase
      .from('class_schedule')
      .select('class_name, start_time, end_time')
      .eq('student_id', studentId)

    const sessionEvents = (participants ?? [])
      .filter((p) => p.sessions && p.sessions.status !== 'cancelled')
      .map((p) => ({
        id: `session-${p.sessions.id}`,
        start: new Date(p.sessions.scheduled_start),
        end: new Date(p.sessions.scheduled_end),
        title: p.sessions.stages?.name ?? 'Session',
        type: 'mine',
      }))

    const classEvents = (classes ?? []).map((c, i) => ({
      id: `class-${i}`,
      start: new Date(c.start_time),
      end: new Date(c.end_time),
      title: c.class_name,
      type: 'class',
    }))

    setCalEvents([...sessionEvents, ...classEvents])
  }

  function handleSlotClick(clickedDate) {
    setError('')
    setDate(formatDateInput(clickedDate))
    const idx = findSlotIndexForDate(clickedDate)
    setSlotIndex(idx >= 0 ? String(idx) : '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!stageId || !date || slotIndex === '' || !instructorId) {
      setError('Select a stage, date, slot, and instructor.')
      return
    }
    if (needsSimulator && !simulatorId) {
      setError('Select a simulator.')
      return
    }
    if (needsAircraft && !aircraftId) {
      setError('Select an aircraft.')
      return
    }

    if (needsAircraft) {
      const chosen = aircraftList.find((a) => a.id === aircraftId)
      if (aircraftMaintenanceStatus(chosen) === 'due') {
        const proceed = window.confirm(
          `${chosen.aircraft_type} — ${chosen.registry} is due for maintenance. Schedule anyway?`
        )
        if (!proceed) return
      }
    }

    const dayDate = new Date(`${date}T00:00`)
    const start = slotStartDate(dayDate, Number(slotIndex))
    const end = slotEndDate(dayDate, Number(slotIndex))

    setSubmitting(true)

    // Cross-check 1: instructor's other scheduled sessions
    const { data: instructorConflicts, error: instErr } = await supabase
      .from('sessions')
      .select('id, scheduled_start')
      .eq('instructor_id', instructorId)
      .eq('status', 'scheduled')
      .lt('scheduled_start', end.toISOString())
      .gt('scheduled_end', start.toISOString())

    if (instErr) {
      setError(`Could not check instructor availability: ${instErr.message}`)
      setSubmitting(false)
      return
    }
    if (instructorConflicts && instructorConflicts.length > 0) {
      setError(`That instructor already has a session at ${new Date(instructorConflicts[0].scheduled_start).toLocaleString()}.`)
      setSubmitting(false)
      return
    }

    // Cross-check 2: simulator or aircraft
    if (needsSimulator) {
      const { data: simConflicts, error: simErr } = await supabase
        .from('sessions')
        .select('id, scheduled_start')
        .eq('simulator_id', simulatorId)
        .eq('status', 'scheduled')
        .lt('scheduled_start', end.toISOString())
        .gt('scheduled_end', start.toISOString())

      if (simErr) {
        setError(`Could not check simulator availability: ${simErr.message}`)
        setSubmitting(false)
        return
      }
      if (simConflicts && simConflicts.length > 0) {
        setError(`That simulator is already booked at ${new Date(simConflicts[0].scheduled_start).toLocaleString()}.`)
        setSubmitting(false)
        return
      }
    }

    if (needsAircraft) {
      const { data: acConflicts, error: acErr } = await supabase
        .from('sessions')
        .select('id, scheduled_start')
        .eq('aircraft_id', aircraftId)
        .eq('status', 'scheduled')
        .lt('scheduled_start', end.toISOString())
        .gt('scheduled_end', start.toISOString())

      if (acErr) {
        setError(`Could not check aircraft availability: ${acErr.message}`)
        setSubmitting(false)
        return
      }
      if (acConflicts && acConflicts.length > 0) {
        setError(`That aircraft is already booked at ${new Date(acConflicts[0].scheduled_start).toLocaleString()}.`)
        setSubmitting(false)
        return
      }
    }

    // Cross-check 3: the student's own other sessions
    const { data: studentConflicts, error: stuErr } = await supabase
      .from('session_participants')
      .select('sessions!inner(id, scheduled_start, status)')
      .eq('student_id', selectedStudent.id)
      .neq('sessions.status', 'cancelled')
      .lt('sessions.scheduled_start', end.toISOString())
      .gt('sessions.scheduled_end', start.toISOString())

    if (stuErr) {
      setError(`Could not check student availability: ${stuErr.message}`)
      setSubmitting(false)
      return
    }
    if (studentConflicts && studentConflicts.length > 0) {
      setError(`${selectedStudent.full_name} already has a session at this time.`)
      setSubmitting(false)
      return
    }

    // Cross-check 4: the student's class schedule
    const { data: classes, error: classErr } = await supabase
      .from('class_schedule')
      .select('class_name, start_time, end_time')
      .eq('student_id', selectedStudent.id)

    if (classErr) {
      setError(`Could not check class schedule: ${classErr.message}`)
      setSubmitting(false)
      return
    }
    const classConflict = (classes ?? []).find((c) => start < new Date(c.end_time) && end > new Date(c.start_time))
    if (classConflict) {
      setError(`This conflicts with ${selectedStudent.full_name}'s class "${classConflict.class_name}".`)
      setSubmitting(false)
      return
    }

    // All clear — create the session
    const { data: newSession, error: sessionErr } = await supabase
      .from('sessions')
      .insert({
        stage_id: stageId,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: 'scheduled',
        instructor_id: instructorId,
        simulator_id: needsSimulator ? simulatorId : null,
        aircraft_id: needsAircraft ? aircraftId : null,
      })
      .select()
      .single()

    if (sessionErr) {
      setError(sessionErr.message)
      setSubmitting(false)
      return
    }

    const { error: participantErr } = await supabase.from('session_participants').insert({
      session_id: newSession.id,
      student_id: selectedStudent.id,
      hours_credited: 1,
    })

    if (participantErr) {
      setError(`Session created, but could not link the student: ${participantErr.message}`)
      setSubmitting(false)
      return
    }

    setSuccessMsg('Session scheduled.')
    setDate('')
    setSlotIndex('')
    await Promise.all([loadAvailability(selectedStudent.id), loadStudentCalendar(selectedStudent.id), loadQueue()])
    setSubmitting(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Scheduling</div>
      <div className="page-subheading">
        Pick a student with verified, unscheduled hours, then assign a time, instructor,
        and simulator/aircraft. Conflicts are checked against the instructor, the
        resource, and the student's own sessions and class schedule.
      </div>

      <h3 className="section-title">Waiting to be scheduled</h3>
      {queueLoading && <p className="loading-text">Loading queue…</p>}
      {!queueLoading && queue.length === 0 && (
        <p className="empty-text" style={{ marginBottom: 20 }}>
          No verified payments with unscheduled hours right now.
        </p>
      )}
      {!queueLoading && queue.length > 0 && (
        <table className="simple-table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Approved</th>
              <th>Student</th>
              <th>Stage</th>
              <th>Hours remaining</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q, i) => (
              <tr key={i}>
                <td>{new Date(q.earliestApproval).toLocaleDateString()}</td>
                <td>
                  {q.studentName} {q.studentNumber && `(${q.studentNumber})`}
                </td>
                <td>{q.stageName}</td>
                <td className="hours-figure">{q.remainingHours}</td>
                <td>
                  <button
                    className="link-btn"
                    onClick={() =>
                      selectStudent({ id: q.studentId, full_name: q.studentName, student_number: q.studentNumber }, q.stageId)
                    }
                  >
                    Schedule
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-divider" style={{ marginBottom: 20 }} />

      <div className="field" style={{ maxWidth: 360, marginBottom: 20 }}>
        <label htmlFor="studentSearch">Or find a specific student</label>
        <input
          id="studentSearch"
          type="text"
          placeholder="Search by name or student ID…"
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />
        {students.length > 0 && (
          <div className="search-results-dropdown">
            {students.map((s) => (
              <button key={s.id} type="button" className="search-result-row" onClick={() => selectStudent(s)}>
                {s.full_name} {s.student_number && `(${s.student_number})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedStudent && (
        <>
          <p className="empty-text" style={{ marginBottom: 16 }}>
            Scheduling for <strong>{selectedStudent.full_name}</strong>
            {selectedStudent.student_number && ` (${selectedStudent.student_number})`}
          </p>

          {error && <div className="auth-error">{error}</div>}
          {successMsg && <div className="auth-success">{successMsg}</div>}
          {loading && <p className="loading-text">Loading availability…</p>}

          {!loading && availability.length === 0 && (
            <p className="empty-text">No verified, unscheduled hours for this student yet.</p>
          )}

          {!loading && availability.length > 0 && (
            <div className="payments-layout">
              <Calendar
                view={calView}
                currentDate={calDate}
                onViewChange={setCalView}
                onDateChange={setCalDate}
                events={calEvents}
                onSlotClick={handleSlotClick}
              />

              <form onSubmit={handleSubmit} className="payment-form">
                <div className="field">
                  <label htmlFor="stage">Stage</label>
                  <select id="stage" value={stageId} onChange={(e) => setStageId(e.target.value)} required>
                    <option value="">Select a stage…</option>
                    {availability.map((a) => (
                      <option key={a.stage_id} value={a.stage_id}>
                        {a.stage_name} ({a.available_hours} hrs available)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="date">Date</label>
                  <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>

                <div className="field">
                  <label htmlFor="slot">Slot</label>
                  <select id="slot" value={slotIndex} onChange={(e) => setSlotIndex(e.target.value)} required>
                    <option value="">Select a slot…</option>
                    {SIM_SLOTS.map((s, i) => (
                      <option key={i} value={i}>
                        {s.start}–{s.end}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="instructor">Instructor</label>
                  <select id="instructor" value={instructorId} onChange={(e) => setInstructorId(e.target.value)} required>
                    <option value="">Select faculty…</option>
                    {faculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {needsSimulator && (
                  <div className="field">
                    <label htmlFor="simulator">Simulator</label>
                    <select id="simulator" value={simulatorId} onChange={(e) => setSimulatorId(e.target.value)} required>
                      <option value="">Select simulator…</option>
                      {stageSimulators.map((sim) => (
                        <option key={sim.id} value={sim.id}>
                          {sim.name}
                        </option>
                      ))}
                    </select>
                    {stageSimulators.length === 0 && (
                      <p className="auth-error" style={{ marginTop: 6 }}>
                        No simulators assigned to this stage yet.
                      </p>
                    )}
                  </div>
                )}

                {needsAircraft && (
                  <div className="field">
                    <label htmlFor="aircraft">Aircraft</label>
                    <select id="aircraft" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} required>
                      <option value="">Select aircraft…</option>
                      {aircraftList.map((a) => (
                        <option key={a.id} value={a.id}>
                          {aircraftOptionLabel(a)}
                        </option>
                      ))}
                    </select>
                    {aircraftId && aircraftMaintenanceStatus(aircraftList.find((a) => a.id === aircraftId)) !== 'ok' && (
                      <p className="auth-error" style={{ marginTop: 6 }}>
                        {aircraftMaintenanceStatus(aircraftList.find((a) => a.id === aircraftId)) === 'due'
                          ? 'This aircraft is due for maintenance.'
                          : 'This aircraft is close to needing maintenance.'}
                      </p>
                    )}
                  </div>
                )}

                <button className="btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Scheduling…' : 'Schedule session'}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatDateInput(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
