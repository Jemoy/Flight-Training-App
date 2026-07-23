import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import LogEntryFields, { emptyLogEntry } from './LogEntryFields'
import { TRACK_LABELS } from '../lib/stageStatus'
import { aircraftOptionLabel } from '../lib/aircraftStatus'
import { getAircraftForStage } from '../lib/stageAircraft'

const ALL_TRACKS = ['simulator', 'ppl', 'cpl', 'ir', 'multi_engine']

export default function BackfillPanel({ studentId, currentUserId }) {
  const [stages, setStages] = useState([])
  const [trackId, setTrackId] = useState('simulator')
  const [routes, setRoutes] = useState([])
  const [faculty, setFaculty] = useState([])
  const [aircraftList, setAircraftList] = useState([])
  const [aircraftId, setAircraftId] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [stageId, setStageId] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [logEntry, setLogEntry] = useState(emptyLogEntry())
  const [result, setResult] = useState('pass')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const selectedStage = stages.find((s) => s.id === stageId)
  const needsAircraft = selectedStage?.requires_simulator === false
  const needsVA = selectedStage?.code === 'FS_VA'

  useEffect(() => {
    if (needsVA) updateLog('aircraftType', 'VA')
  }, [needsVA])

  useEffect(() => {
    if (!needsAircraft) {
      setAircraftList([])
      return
    }
    getAircraftForStage(stageId).then(setAircraftList)
  }, [stageId, needsAircraft])

  useEffect(() => {
    supabase
      .from('stages')
      .select('id, name, track, sequence_order, requires_simulator, code')
      .order('sequence_order', { ascending: true })
      .then(({ data }) => setStages(data ?? []))

    supabase
      .from('routes')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => setRoutes(data ?? []))

    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })
      .then(({ data }) => setFaculty(data ?? []))
  }, [])

  function updateLog(field, value) {
    setLogEntry((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    const hoursValue = Number(logEntry.hours)
    if (!stageId || !date) {
      setError('Stage and date are required.')
      return
    }
    if (!instructorId) {
      setError('Select which instructor taught this session.')
      return
    }
    if (!logEntry.aircraftType.trim() || !logEntry.routeFrom || !logEntry.routeTo) {
      setError('Fill in Type, Route From, and Route To.')
      return
    }
    if (needsAircraft && !aircraftId) {
      setError('Select which aircraft was used.')
      return
    }
    if (!hoursValue || hoursValue <= 0) {
      setError('Enter a valid number of hours.')
      return
    }

    setSubmitting(true)

    const start = new Date(`${date}T09:00`)
    const end = new Date(start.getTime() + hoursValue * 60 * 60 * 1000)

    // Create the session as 'pending' first, log the hours, THEN flip to
    // 'completed' — this ordering matters: the aircraft-hours trigger reads
    // session_participants at the moment status becomes 'completed', so the
    // hours row must already exist by then.
    const { data: newSession, error: sessionErr } = await supabase
      .from('sessions')
      .insert({
        stage_id: stageId,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: 'pending',
        instructor_id: instructorId,
        aircraft_type: logEntry.aircraftType.trim(),
        check_type: logEntry.checkType.trim() || null,
        route_from: logEntry.routeFrom,
        route_to: logEntry.routeTo,
        flight_category: logEntry.category,
        duty_type: logEntry.duty,
      })
      .select()
      .single()

    if (sessionErr) {
      setError(`Could not create historical session: ${sessionErr.message}`)
      setSubmitting(false)
      return
    }

    const { error: participantErr } = await supabase.from('session_participants').insert({
      session_id: newSession.id,
      student_id: studentId,
      hours_credited: hoursValue,
    })

    if (participantErr) {
      setError(`Could not log hours: ${participantErr.message}`)
      setSubmitting(false)
      return
    }

    const { error: completeErr } = await supabase
      .from('sessions')
      .update({ status: 'completed', aircraft_id: needsAircraft ? aircraftId : null })
      .eq('id', newSession.id)

    if (completeErr) {
      setError(`Hours logged, but could not finalize the session: ${completeErr.message}`)
      setSubmitting(false)
      return
    }

    const { error: evalErr } = await supabase.from('evaluations').insert({
      session_id: newSession.id,
      student_id: studentId,
      evaluator_id: currentUserId,
      result,
      recommend_advance: result === 'pass' ? true : null,
      notes: notes || 'Backfilled historical data (pre-system training).',
    })

    if (evalErr) {
      setError(`Session logged, but could not record the evaluation: ${evalErr.message}`)
      setSubmitting(false)
      return
    }

    setSuccessMsg(`Backfilled ${hoursValue} hour(s).`)
    setStageId('')
    setInstructorId('')
    setAircraftId('')
    setDate('')
    setNotes('')
    setResult('pass')
    setLogEntry(emptyLogEntry())
    setSubmitting(false)
  }

  return (
    <div>
      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <form onSubmit={handleSubmit} className="backfill-form">
        <div className="backfill-form-row">
          <div className="field">
            <label>Track</label>
            <select
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value)
                setStageId('')
              }}
              required
            >
              {ALL_TRACKS.map((t) => (
                <option key={t} value={t}>
                  {TRACK_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Stage</label>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} required>
              <option value="">Select a stage…</option>
              {stages
                .filter((s) => s.track === trackId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>Instructor</label>
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} required>
              <option value="">Select faculty…</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="backfill-form-row">
          <div className="field">
            <label>Date completed</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {needsAircraft && (
            <div className="field">
              <label>Aircraft</label>
              <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} required>
                <option value="">Select aircraft…</option>
                {aircraftList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {aircraftOptionLabel(a)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <LogEntryFields logEntry={logEntry} updateLog={updateLog} routes={routes} lockTypeToVA={needsVA} />

        <div className="field">
          <label>Notes (optional)</label>
          <input
            type="text"
            placeholder="e.g. Carried over from paper logbook"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Result</label>
          <div className="row-actions">
            <button
              type="button"
              className={result === 'pass' ? 'btn-approve' : 'link-btn'}
              onClick={() => setResult('pass')}
            >
              Pass
            </button>
            <button
              type="button"
              className={result === 'fail' ? 'btn-reject' : 'link-btn'}
              onClick={() => setResult('fail')}
            >
              Fail
            </button>
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Add historical hours'}
        </button>
      </form>
    </div>
  )
}
