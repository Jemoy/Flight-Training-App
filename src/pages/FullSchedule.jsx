import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import DaySheet from '../components/DaySheet'
import WeekSheet from '../components/WeekSheet'
import EditSessionModal from '../components/EditSessionModal'
import { findSlotIndexForDate, SIM_SLOTS } from '../lib/simSlots'

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Monday–Saturday for the week containing `date` (school doesn't operate Sunday)
function weekDaysFor(date) {
  const day = date.getDay() // 0 = Sun
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export default function FullSchedule({ profile }) {
  const [view, setView] = useState('week') // 'day' | 'week'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [rawRows, setRawRows] = useState([])
  const [facultyList, setFacultyList] = useState([])
  const [facultyFilter, setFacultyFilter] = useState('')
  const [simulatorList, setSimulatorList] = useState([])
  const [simulatorFilter, setSimulatorFilter] = useState('')
  const [aircraftList, setAircraftList] = useState([])
  const [aircraftFilter, setAircraftFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingEntry, setEditingEntry] = useState(null)
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    loadSchedule()
    loadFaculty()
    loadSimulators()
    loadAircraft()
  }, [])

  async function loadAircraft() {
    const { data } = await supabase
      .from('aircraft')
      .select('id, aircraft_type, registry')
      .eq('is_active', true)
      .order('registry', { ascending: true })
    setAircraftList(data ?? [])
  }

  async function loadFaculty() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'faculty_personnel')
      .order('full_name', { ascending: true })
    setFacultyList(data ?? [])
  }

  async function loadSimulators() {
    const { data } = await supabase.from('simulators').select('id, name').order('name', { ascending: true })
    setSimulatorList(data ?? [])
  }

  async function loadSchedule() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('session_participants')
      .select(
        'student_id, hours_credited, profiles(full_name), sessions(id, scheduled_start, status, stage_id, instructor_id, simulator_id, aircraft_id, instructor:profiles!sessions_instructor_id_fkey(full_name), simulator:simulators(name), aircraft:aircraft(aircraft_type, registry))'
      )

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const confirmed = (data ?? []).filter(
      (row) => row.sessions && ['scheduled', 'completed'].includes(row.sessions.status)
    )

    confirmed.sort((a, b) => new Date(a.sessions.scheduled_start) - new Date(b.sessions.scheduled_start))
    const runningTotals = {}

    const rows = confirmed.map((row) => {
      const key = `${row.student_id}_${row.sessions.stage_id}`
      runningTotals[key] = (runningTotals[key] ?? 0) + Number(row.hours_credited ?? 0)
      return {
        sessionId: row.sessions.id,
        status: row.sessions.status,
        stageId: row.sessions.stage_id,
        studentId: row.student_id,
        studentName: row.profiles?.full_name,
        start: new Date(row.sessions.scheduled_start),
        instructorId: row.sessions.instructor_id,
        instructorName: row.sessions.instructor?.full_name,
        simulatorId: row.sessions.simulator_id,
        simulatorName: row.sessions.simulator?.name,
        aircraftId: row.sessions.aircraft_id,
        aircraftName: row.sessions.aircraft ? `${row.sessions.aircraft.aircraft_type} — ${row.sessions.aircraft.registry}` : null,
        cumulativeHours: Math.round(runningTotals[key] * 100) / 100,
      }
    })

    setRawRows(rows)
    setLoading(false)
  }

  function goPrev() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - (view === 'day' ? 1 : 7)))
  }
  function goNext() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + (view === 'day' ? 1 : 7)))
  }
  function goToday() {
    setCurrentDate(new Date())
  }

  function filterRows(rows) {
    return rows
      .filter((r) => !facultyFilter || r.instructorId === facultyFilter)
      .filter((r) => !simulatorFilter || r.simulatorId === simulatorFilter)
      .filter((r) => !aircraftFilter || r.aircraftId === aircraftFilter)
  }

  const entriesBySlot = useMemo(() => {
    const slots = SIM_SLOTS.map(() => [])
    filterRows(rawRows.filter((r) => isSameDay(r.start, currentDate))).forEach((r) => {
      const idx = findSlotIndexForDate(r.start)
      if (idx >= 0) slots[idx].push(r)
    })
    return slots
  }, [rawRows, currentDate, facultyFilter, simulatorFilter, aircraftFilter])

  const weekDays = useMemo(() => weekDaysFor(currentDate), [currentDate])

  const entriesBySlotByDay = useMemo(() => {
    return weekDays.map((day) => {
      const slots = SIM_SLOTS.map(() => [])
      filterRows(rawRows.filter((r) => isSameDay(r.start, day))).forEach((r) => {
        const idx = findSlotIndexForDate(r.start)
        if (idx >= 0) slots[idx].push(r)
      })
      return slots
    })
  }, [rawRows, weekDays, facultyFilter, simulatorFilter, aircraftFilter])

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Full schedule</div>
      <div className="page-subheading">
        Daily operations sheet — instructor, student, and running total hours for that
        stage as of each session.
        {isAdmin && ' Click any session to reassign its date, slot, instructor, simulator, or aircraft.'}
      </div>

      <div className="filter-row">
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="facultyFilter">Faculty</label>
          <select id="facultyFilter" value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
            <option value="">All faculty</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="simulatorFilter">Simulator</label>
          <select id="simulatorFilter" value={simulatorFilter} onChange={(e) => setSimulatorFilter(e.target.value)}>
            <option value="">All simulators</option>
            {simulatorList.map((sim) => (
              <option key={sim.id} value={sim.id}>
                {sim.name} Schedule
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="aircraftFilter">Aircraft</label>
          <select id="aircraftFilter" value={aircraftFilter} onChange={(e) => setAircraftFilter(e.target.value)}>
            <option value="">All aircraft</option>
            {aircraftList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.aircraft_type} — {a.registry}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="daysheet-toolbar">
        <button className="cal-btn" onClick={goToday}>Today</button>
        <button className="cal-btn cal-btn-icon" onClick={goPrev}>‹</button>
        <button className="cal-btn cal-btn-icon" onClick={goNext}>›</button>
        <div className="cal-view-switch" style={{ marginLeft: 'auto' }}>
          <button className={`cal-view-btn ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}>
            Day
          </button>
          <button className={`cal-view-btn ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>
            Week
          </button>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}

      {!loading && view === 'day' && (
        <DaySheet
          date={currentDate}
          entriesBySlot={entriesBySlot}
          onEntryClick={isAdmin ? setEditingEntry : null}
        />
      )}
      {!loading && view === 'week' && (
        <WeekSheet
          days={weekDays}
          entriesBySlotByDay={entriesBySlotByDay}
          onEntryClick={isAdmin ? setEditingEntry : null}
        />
      )}

      {editingEntry && (
        <EditSessionModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null)
            loadSchedule()
          }}
        />
      )}
    </div>
  )
}
