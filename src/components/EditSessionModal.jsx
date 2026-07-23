import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SIM_SLOTS, slotStartDate, slotEndDate, findSlotIndexForDate } from '../lib/simSlots'
import { getSimulatorsForStage } from '../lib/stageSimulators'
import { aircraftMaintenanceStatus, aircraftOptionLabel } from '../lib/aircraftStatus'
import { getAircraftForStage } from '../lib/stageAircraft'

function toDateInputValue(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function EditSessionModal({ entry, onClose, onSaved }) {
  const [date, setDate] = useState(toDateInputValue(entry.start))
  const [slotIndex, setSlotIndex] = useState(String(Math.max(0, findSlotIndexForDate(entry.start))))
  const [instructorId, setInstructorId] = useState(entry.instructorId ?? '')
  const [simulatorId, setSimulatorId] = useState(entry.simulatorId ?? '')
  const [aircraftId, setAircraftId] = useState(entry.aircraftId ?? '')
  const [facultyList, setFacultyList] = useState([])
  const [simOptions, setSimOptions] = useState([])
  const [aircraftOptions, setAircraftOptions] = useState([])
  const [requiresSimulator, setRequiresSimulator] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadOptions()
  }, [])

  async function loadOptions() {
    const [{ data: faculty }, sims, { data: stage }, activeAircraft] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'faculty_personnel').order('full_name'),
      getSimulatorsForStage(entry.stageId),
      supabase.from('stages').select('requires_simulator').eq('id', entry.stageId).single(),
      getAircraftForStage(entry.stageId),
    ])
    setFacultyList(faculty ?? [])
    setSimOptions(sims)
    setAircraftOptions(activeAircraft)
    setRequiresSimulator(stage?.requires_simulator !== false)
  }

  async function handleSave() {
    setError('')
    if (!instructorId) {
      setError('Select an instructor.')
      return
    }
    if (requiresSimulator && !simulatorId) {
      setError('Select a simulator.')
      return
    }
    if (!requiresSimulator && !aircraftId) {
      setError('Select an aircraft.')
      return
    }

    if (!requiresSimulator) {
      const chosenAircraft = aircraftOptions.find((a) => a.id === aircraftId)
      if (aircraftMaintenanceStatus(chosenAircraft) === 'due') {
        const proceed = window.confirm(
          `${chosenAircraft.aircraft_type} — ${chosenAircraft.registry} is due for maintenance. Proceed anyway?`
        )
        if (!proceed) return
      }
    }

    const dayDate = new Date(`${date}T00:00`)
    const newStart = slotStartDate(dayDate, Number(slotIndex))
    const newEnd = slotEndDate(dayDate, Number(slotIndex))

    setSubmitting(true)

    // Conflict check: same simulator OR same instructor already booked
    // elsewhere at the new time (excluding this session itself).
    if (requiresSimulator) {
      const { data: simConflicts, error: simErr } = await supabase
        .from('sessions')
        .select('id, scheduled_start')
        .eq('simulator_id', simulatorId)
        .eq('status', 'scheduled')
        .neq('id', entry.sessionId)
        .lt('scheduled_start', newEnd.toISOString())
        .gt('scheduled_end', newStart.toISOString())

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

    if (!requiresSimulator) {
      const { data: acConflicts, error: acErr } = await supabase
        .from('sessions')
        .select('id, scheduled_start')
        .eq('aircraft_id', aircraftId)
        .eq('status', 'scheduled')
        .neq('id', entry.sessionId)
        .lt('scheduled_start', newEnd.toISOString())
        .gt('scheduled_end', newStart.toISOString())

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

    const { data: instrConflicts, error: instrErr } = await supabase
      .from('sessions')
      .select('id, scheduled_start')
      .eq('instructor_id', instructorId)
      .eq('status', 'scheduled')
      .neq('id', entry.sessionId)
      .lt('scheduled_start', newEnd.toISOString())
      .gt('scheduled_end', newStart.toISOString())

    if (instrErr) {
      setError(`Could not check instructor availability: ${instrErr.message}`)
      setSubmitting(false)
      return
    }
    if (instrConflicts && instrConflicts.length > 0) {
      setError(
        `That instructor is already teaching another session at ${new Date(instrConflicts[0].scheduled_start).toLocaleString()}.`
      )
      setSubmitting(false)
      return
    }

    const { error: updateErr } = await supabase
      .from('sessions')
      .update({
        scheduled_start: newStart.toISOString(),
        scheduled_end: newEnd.toISOString(),
        instructor_id: instructorId,
        simulator_id: requiresSimulator ? simulatorId : null,
        aircraft_id: requiresSimulator ? null : aircraftId,
      })
      .eq('id', entry.sessionId)

    if (updateErr) {
      setError(updateErr.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="page-heading" style={{ fontSize: '1.1rem' }}>
          Reassign session
        </div>
        <div className="page-subheading" style={{ marginBottom: 18 }}>
          {entry.studentName} · currently {entry.instructorName ?? 'Unassigned'} ·{' '}
          {entry.aircraftName ?? entry.simulatorName ?? 'No resource assigned'}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="field">
          <label htmlFor="editDate">Date</label>
          <input id="editDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="editSlot">Slot</label>
          <select id="editSlot" value={slotIndex} onChange={(e) => setSlotIndex(e.target.value)}>
            {SIM_SLOTS.map((s, i) => (
              <option key={i} value={i}>
                {s.start}–{s.end}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="editInstructor">Instructor</label>
          <select id="editInstructor" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
            <option value="">Select faculty…</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name}
              </option>
            ))}
          </select>
        </div>

        {requiresSimulator ? (
          <div className="field">
            <label htmlFor="editSimulator">Simulator</label>
            <select id="editSimulator" value={simulatorId} onChange={(e) => setSimulatorId(e.target.value)}>
              <option value="">Select simulator…</option>
              {simOptions.map((sim) => (
                <option key={sim.id} value={sim.id}>
                  {sim.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="editAircraft">Aircraft</label>
            <select id="editAircraft" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)}>
              <option value="">Select aircraft…</option>
              {aircraftOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {aircraftOptionLabel(a)}
                </option>
              ))}
            </select>
            {aircraftId && aircraftMaintenanceStatus(aircraftOptions.find((a) => a.id === aircraftId)) !== 'ok' && (
              <p className="auth-error" style={{ marginTop: 6 }}>
                {aircraftMaintenanceStatus(aircraftOptions.find((a) => a.id === aircraftId)) === 'due'
                  ? 'This aircraft is due for maintenance.'
                  : 'This aircraft is close to needing maintenance.'}
              </p>
            )}
          </div>
        )}

        <div className="row-actions" style={{ marginTop: 18 }}>
          <button className="btn-approve" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button className="link-btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
