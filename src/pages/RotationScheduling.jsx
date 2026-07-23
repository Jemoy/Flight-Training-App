import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getAircraftForStage } from '../lib/stageAircraft'

const SLOT_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
const DAY_NAMES = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }
const ROTATION_TRACKS = ['ppl', 'cpl', 'ir']

function emptyAssignment() {
  return Object.fromEntries(SLOT_LETTERS.map((l) => [l, { studentId: '', instructorId: '', aircraftId: '' }]))
}

export default function RotationScheduling({ session }) {
  const [template, setTemplate] = useState(null)
  const [templateSlots, setTemplateSlots] = useState([])
  const [stages, setStages] = useState([])
  const [stageId, setStageId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [aircraftList, setAircraftList] = useState([]) // filtered to the selected stage
  const [students, setStudents] = useState([])
  const [faculty, setFaculty] = useState([])
  const [assignments, setAssignments] = useState(emptyAssignment())

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { created, skipped: [{reason, letter, date}] }

  useEffect(() => {
    loadTemplate()
    loadStages()
    loadStudents()
    loadFaculty()
  }, [])

  useEffect(() => {
    if (!stageId) {
      setAircraftList([])
      return
    }
    getAircraftForStage(stageId).then(setAircraftList)
    // Clear any per-letter aircraft picks that are no longer valid for the new stage
    setAssignments((prev) => {
      const next = {}
      for (const l of SLOT_LETTERS) next[l] = { ...prev[l], aircraftId: '' }
      return next
    })
  }, [stageId])

  async function loadTemplate() {
    const { data: templates } = await supabase.from('rotation_templates').select('id, name').limit(1)
    const t = templates?.[0]
    setTemplate(t ?? null)
    if (t) {
      const { data: slots } = await supabase
        .from('rotation_template_slots')
        .select('slot_letter, day_of_week, start_time, end_time')
        .eq('template_id', t.id)
      setTemplateSlots(slots ?? [])
    }
  }

  async function loadStages() {
    const { data } = await supabase
      .from('stages')
      .select('id, name, track, requires_simulator')
      .in('track', ROTATION_TRACKS)
      .order('track', { ascending: true })
      .order('sequence_order', { ascending: true })
    setStages(data ?? [])
  }

  async function loadStudents() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, student_number')
      .eq('role', 'student')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    setStudents(data ?? [])
  }

  async function loadFaculty() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })
    setFaculty(data ?? [])
  }

  function updateAssignment(letter, field, value) {
    setAssignments((prev) => ({ ...prev, [letter]: { ...prev[letter], [field]: value } }))
  }

  function slotsForLetter(letter) {
    return templateSlots
      .filter((s) => s.slot_letter === letter)
      .sort((a, b) => a.day_of_week - b.day_of_week)
  }

  async function handleGenerate() {
    setError('')
    setResult(null)

    if (!stageId || !startDate || !endDate) {
      setError('Select stage and date range.')
      return
    }
    const filled = SLOT_LETTERS.filter((l) => assignments[l].studentId && assignments[l].instructorId)
    if (filled.length === 0) {
      setError('Assign at least one student+instructor to a slot letter.')
      return
    }
    const missingAircraft = filled.filter((l) => !assignments[l].aircraftId)
    if (missingAircraft.length > 0) {
      setError(`Select an aircraft for slot(s): ${missingAircraft.join(', ').toUpperCase()}`)
      return
    }

    setGenerating(true)

    let created = 0
    const skipped = []

    const start = new Date(`${startDate}T00:00`)
    const end = new Date(`${endDate}T00:00`)

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const jsDow = d.getDay() // 0=Sun..6=Sat
      if (jsDow === 0) continue // no Sunday flying, matches the template
      const dow = jsDow // already 1=Mon..6=Sat matching our convention

      const daySlots = templateSlots.filter((s) => s.day_of_week === dow)
      for (const slot of daySlots) {
        const assignment = assignments[slot.slot_letter]
        if (!assignment?.studentId || !assignment?.instructorId) continue

        const dateStr = formatDateInput(d)
        const sessionStart = new Date(`${dateStr}T${slot.start_time}`)
        const sessionEnd = new Date(`${dateStr}T${slot.end_time}`)
        const hours = Math.round(((sessionEnd - sessionStart) / 3600000) * 100) / 100

        // Conflict checks: instructor, aircraft, student, student's class schedule
        const { data: instrConf } = await supabase
          .from('sessions')
          .select('id')
          .eq('instructor_id', assignment.instructorId)
          .eq('status', 'scheduled')
          .lt('scheduled_start', sessionEnd.toISOString())
          .gt('scheduled_end', sessionStart.toISOString())

        if (instrConf && instrConf.length > 0) {
          skipped.push({ letter: slot.slot_letter, date: dateStr, reason: 'Instructor conflict' })
          continue
        }

        const { data: acConf } = await supabase
          .from('sessions')
          .select('id')
          .eq('aircraft_id', assignment.aircraftId)
          .eq('status', 'scheduled')
          .lt('scheduled_start', sessionEnd.toISOString())
          .gt('scheduled_end', sessionStart.toISOString())

        if (acConf && acConf.length > 0) {
          skipped.push({ letter: slot.slot_letter, date: dateStr, reason: 'Aircraft conflict' })
          continue
        }

        const { data: stuConf } = await supabase
          .from('session_participants')
          .select('sessions!inner(id, status)')
          .eq('student_id', assignment.studentId)
          .neq('sessions.status', 'cancelled')
          .lt('sessions.scheduled_start', sessionEnd.toISOString())
          .gt('sessions.scheduled_end', sessionStart.toISOString())

        if (stuConf && stuConf.length > 0) {
          skipped.push({ letter: slot.slot_letter, date: dateStr, reason: 'Student already booked' })
          continue
        }

        const { data: classes } = await supabase
          .from('class_schedule')
          .select('start_time, end_time')
          .eq('student_id', assignment.studentId)

        const classConflict = (classes ?? []).some(
          (c) => sessionStart < new Date(c.end_time) && sessionEnd > new Date(c.start_time)
        )
        if (classConflict) {
          skipped.push({ letter: slot.slot_letter, date: dateStr, reason: 'Class schedule conflict' })
          continue
        }

        const { data: newSession, error: sessionErr } = await supabase
          .from('sessions')
          .insert({
            stage_id: stageId,
            scheduled_start: sessionStart.toISOString(),
            scheduled_end: sessionEnd.toISOString(),
            status: 'scheduled',
            instructor_id: assignment.instructorId,
            aircraft_id: assignment.aircraftId,
          })
          .select()
          .single()

        if (sessionErr) {
          skipped.push({ letter: slot.slot_letter, date: dateStr, reason: sessionErr.message })
          continue
        }

        const { error: partErr } = await supabase.from('session_participants').insert({
          session_id: newSession.id,
          student_id: assignment.studentId,
          hours_credited: hours,
        })

        if (partErr) {
          skipped.push({ letter: slot.slot_letter, date: dateStr, reason: partErr.message })
          continue
        }

        created += 1
      }
    }

    // Record the batch for reference (no single aircraft — each slot can use a different one)
    await supabase.from('rotation_batches').insert({
      template_id: template.id,
      stage_id: stageId,
      start_date: startDate,
      end_date: endDate,
      created_by: session.user.id,
    })

    setResult({ created, skipped })
    setGenerating(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Rotation Scheduling</div>
      <div className="page-subheading">
        For PPL, CPL, and IR flying. Assign students to the weekly rotation slots below,
        pick a date range, and generate every session at once — each slot letter flies 4
        times a week on a fixed day/time pattern, so no student is stuck with the same
        slot every week.
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="backfill-form-row">
        <div className="field">
          <label>Stage</label>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} required>
            <option value="">Select a stage…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.track.toUpperCase()} — {s.name}
              </option>
            ))}
          </select>
          {stageId && aircraftList.length === 0 && (
            <p className="auth-error" style={{ marginTop: 6 }}>
              No aircraft assigned to this stage yet — set that up in Admin → Aircraft →
              Stage assignments first.
            </p>
          )}
        </div>
      </div>

      <div className="backfill-form-row">
        <div className="field">
          <label>Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>End date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
      </div>

      <h3 className="section-title">Slot assignments</h3>
      <p className="empty-text" style={{ marginBottom: 14 }}>
        Leave a letter blank to skip it — you don't need to fill all 9.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Weekly times</th>
              <th>Student</th>
              <th>Instructor</th>
              <th>Aircraft</th>
            </tr>
          </thead>
          <tbody>
            {SLOT_LETTERS.map((letter) => (
              <tr key={letter}>
                <td style={{ fontWeight: 700, textTransform: 'uppercase' }}>{letter}</td>
                <td className="empty-text">
                  {slotsForLetter(letter)
                    .map((s) => `${DAY_NAMES[s.day_of_week]} ${s.start_time}-${s.end_time}`)
                    .join(', ')}
                </td>
                <td>
                  <select
                    className="inline-select"
                    value={assignments[letter].studentId}
                    onChange={(e) => updateAssignment(letter, 'studentId', e.target.value)}
                  >
                    <option value="">—</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} {s.student_number && `(${s.student_number})`}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="inline-select"
                    value={assignments[letter].instructorId}
                    onChange={(e) => updateAssignment(letter, 'instructorId', e.target.value)}
                  >
                    <option value="">—</option>
                    {faculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="inline-select"
                    value={assignments[letter].aircraftId}
                    onChange={(e) => updateAssignment(letter, 'aircraftId', e.target.value)}
                    disabled={aircraftList.length === 0}
                  >
                    <option value="">—</option>
                    {aircraftList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.aircraft_type} — {a.registry}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn-primary" style={{ width: 'auto', marginTop: 20 }} onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating…' : 'Generate sessions'}
      </button>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div className="auth-success">
            {result.created} session(s) created.
            {result.skipped.length > 0 && ` ${result.skipped.length} skipped due to conflicts.`}
          </div>
          {result.skipped.length > 0 && (
            <table className="simple-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Date</th>
                  <th>Reason skipped</th>
                </tr>
              </thead>
              <tbody>
                {result.skipped.map((s, i) => (
                  <tr key={i}>
                    <td style={{ textTransform: 'uppercase' }}>{s.letter}</td>
                    <td>{s.date}</td>
                    <td>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
