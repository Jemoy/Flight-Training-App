import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { TRACK_LABELS } from '../lib/stageStatus'

function formatHM(decimalHours) {
  const h = Math.floor(decimalHours)
  const m = Math.round((decimalHours - h) * 60)
  return `${h}+${String(m).padStart(2, '0')}`
}

const CATEGORY_COLS = [
  { key: 'local_dual', category: 'local', duty: 'dual' },
  { key: 'local_solo', category: 'local', duty: 'solo' },
  { key: 'local_pic', category: 'local', duty: 'pic' },
  { key: 'cc_dual', category: 'cross_country', duty: 'dual' },
  { key: 'cc_solo', category: 'cross_country', duty: 'solo' },
  { key: 'cc_pic', category: 'cross_country', duty: 'pic' },
]

const TABS = ['simulator', 'ppl', 'cpl', 'ir', 'build_time']

export default function FacultyDashboard({ profile }) {
  const [activeTab, setActiveTab] = useState('simulator')
  const [rows, setRows] = useState([])
  const [simulators, setSimulators] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [simulatorFilter, setSimulatorFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadLogbook()
    loadSimulators()
  }, [])

  async function loadSimulators() {
    const { data } = await supabase.from('simulators').select('id, name').order('name', { ascending: true })
    setSimulators(data ?? [])
  }

  async function loadLogbook() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('session_participants')
      .select(
        'hours_credited, profiles(full_name, student_number), sessions!inner(scheduled_start, aircraft_type, route_from, route_to, flight_category, duty_type, status, simulator_id, stages(name, track), simulator:simulators(name), aircraft:aircraft(aircraft_type, registry))'
      )
      .eq('sessions.status', 'completed')
      .order('scheduled_start', { foreignTable: 'sessions', ascending: false })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const parsed = (data ?? []).map((row) => {
      const s = row.sessions
      return {
        date: new Date(s.scheduled_start),
        studentName: row.profiles?.full_name ?? 'Unknown',
        studentNumber: row.profiles?.student_number ?? '—',
        stageName: s.stages?.name ?? '—',
        track: s.stages?.track,
        aircraftType: s.aircraft_type ?? '—',
        simulatorId: s.simulator_id,
        simulatorName: s.simulator?.name ?? (s.aircraft ? s.aircraft.registry : '—'),
        routeFrom: s.route_from ?? '—',
        routeTo: s.route_to ?? '—',
        category: s.flight_category,
        duty: s.duty_type,
        hours: Number(row.hours_credited ?? 0),
      }
    })

    setRows(parsed)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const term = studentSearch.trim().toLowerCase()
    return rows
      .filter((r) => !term || r.studentName.toLowerCase().includes(term) || r.studentNumber.toLowerCase().includes(term))
      .filter((r) => !simulatorFilter || r.simulatorId === simulatorFilter)
      .filter((r) => activeTab === 'build_time' || r.track === activeTab)
  }, [rows, studentSearch, simulatorFilter, activeTab])

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Flight Training Records</div>
      <div className="page-subheading">
        Every completed session across all students. Search or filter to narrow it down.
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab-btn ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {TRACK_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="studentSearch">Student name or ID</label>
          <input
            id="studentSearch"
            type="text"
            placeholder="Search…"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
        </div>
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="simulatorFilter">Simulator</label>
          <select id="simulatorFilter" value={simulatorFilter} onChange={(e) => setSimulatorFilter(e.target.value)}>
            <option value="">All simulators</option>
            {simulators.map((sim) => (
              <option key={sim.id} value={sim.id}>
                {sim.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="empty-text">No matching records.</p>}

      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="logbook-table">
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={3}>Simulator</th>
                <th colSpan={2}>Route</th>
                <th colSpan={3}>Local</th>
                <th colSpan={3}>Cross Country</th>
                <th rowSpan={2}>Time</th>
                <th rowSpan={2}>Student</th>
              </tr>
              <tr>
                <th>Stage</th>
                <th>Type</th>
                <th>Type/Rating</th>
                <th>From</th>
                <th>To</th>
                <th>Dual</th>
                <th>Solo</th>
                <th>PIC</th>
                <th>Dual</th>
                <th>Solo</th>
                <th>PIC</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td>{r.date.toLocaleDateString()}</td>
                  <td>{r.stageName}</td>
                  <td>{r.aircraftType}</td>
                  <td>{r.simulatorName}</td>
                  <td>{r.routeFrom}</td>
                  <td>{r.routeTo}</td>
                  {CATEGORY_COLS.map((col) => (
                    <td key={col.key} className="hours-figure">
                      {r.category === col.category && r.duty === col.duty ? formatHM(r.hours) : formatHM(0)}
                    </td>
                  ))}
                  <td className="hours-figure">{formatHM(r.hours)}</td>
                  <td>{r.studentName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
