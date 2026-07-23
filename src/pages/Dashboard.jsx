import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { computeStageStatuses, TRACK_LABELS } from '../lib/stageStatus'

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

const STATUS_LABEL = {
  locked: 'Locked',
  in_progress: 'In progress',
  pending_approval: 'Pending admin approval',
  complete: 'Complete',
}

export default function Dashboard({ session }) {
  const [activeTab, setActiveTab] = useState('simulator')
  const [profileInfo, setProfileInfo] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [entriesByStage, setEntriesByStage] = useState({})
  const [allEntries, setAllEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadLogbook()
  }, [])

  async function loadLogbook() {
    setLoading(true)
    setError('')
    const userId = session.user.id

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('full_name, student_number, pel_number')
      .eq('id', userId)
      .single()
    setProfileInfo(profileRow)

    const [{ data: stages, error: stageErr }, { data: prereqs }, { data: progressRows }] = await Promise.all([
      supabase.from('stages').select('id, name, code, track, sequence_order, required_hours, manual_completion_only'),
      supabase.from('stage_prerequisites').select('stage_id, prerequisite_stage_id'),
      supabase.from('student_stage_progress').select('stage_id, status, cumulative_hours').eq('student_id', userId),
    ])

    if (stageErr) {
      setError(stageErr.message)
      setLoading(false)
      return
    }

    setStatuses(computeStageStatuses(stages, progressRows, prereqs))

    const { data: rows, error: rowsErr } = await supabase
      .from('session_participants')
      .select(
        'hours_credited, sessions!inner(scheduled_start, stage_id, aircraft_type, check_type, route_from, route_to, flight_category, duty_type, status, simulator:simulators(name), aircraft:aircraft(aircraft_type, registry), instructor:profiles!sessions_instructor_id_fkey(full_name), stages(name, track))'
      )
      .eq('student_id', userId)
      .eq('sessions.status', 'completed')

    if (rowsErr) {
      setError(rowsErr.message)
      setLoading(false)
      return
    }

    const byStage = {}
    const flat = []

    for (const row of rows ?? []) {
      const s = row.sessions
      const entry = {
        date: new Date(s.scheduled_start),
        stageName: s.stages?.name ?? '—',
        track: s.stages?.track,
        aircraftType: s.aircraft_type ?? '—',
        simulatorName: s.check_type || s.simulator?.name || (s.aircraft ? s.aircraft.registry : '—'),
        routeFrom: s.route_from ?? '—',
        routeTo: s.route_to ?? '—',
        category: s.flight_category,
        duty: s.duty_type,
        instructorName: s.instructor?.full_name ?? '—',
        hours: Number(row.hours_credited ?? 0),
      }
      if (!byStage[s.stage_id]) byStage[s.stage_id] = []
      byStage[s.stage_id].push(entry)
      flat.push(entry)
    }

    for (const key of Object.keys(byStage)) {
      byStage[key].sort((a, b) => a.date - b.date)
    }
    flat.sort((a, b) => a.date - b.date)

    setEntriesByStage(byStage)
    setAllEntries(flat)
    setLoading(false)
  }

  function subtotalFor(entries) {
    const t = { local_dual: 0, local_solo: 0, local_pic: 0, cc_dual: 0, cc_solo: 0, cc_pic: 0, time: 0 }
    for (const e of entries) {
      const col = CATEGORY_COLS.find((c) => c.category === e.category && c.duty === e.duty)
      if (col) t[col.key] += e.hours
      t.time += e.hours
    }
    return t
  }

  const trackStages = statuses.filter((s) => s.track === activeTab)
  const trackTotalHours = trackStages.reduce((sum, s) => sum + Number(s.cumulative_hours ?? 0), 0)
  const activeStage = trackStages.find((s) => s.status === 'in_progress' || s.status === 'pending_approval')
  const allTrackComplete = trackStages.length > 0 && trackStages.every((s) => s.status === 'complete')
  const trackStatusLabel = allTrackComplete
    ? 'All stages complete'
    : activeStage
    ? `${activeStage.name} — ${STATUS_LABEL[activeStage.status]}`
    : trackStages.length > 0
    ? 'Locked'
    : '—'

  const stageGroupsToShow = trackStages
    .filter((s) => entriesByStage[s.id] || s.status === 'in_progress' || s.status === 'pending_approval')
    .sort((a, b) => a.sequence_order - b.sequence_order)

  const grandTotalHours = allEntries.reduce((sum, e) => sum + e.hours, 0)

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Flight Training Record</div>

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

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading your logbook…</p>}

      {!loading && (
        <>
          <div className="logbook-header">
            <div>
              <span className="logbook-header-label">Student Name:</span> {profileInfo?.full_name ?? '—'}
            </div>
            <div>
              <span className="logbook-header-label">Student Number:</span> {profileInfo?.student_number ?? '—'}
            </div>
            <div>
              <span className="logbook-header-label">PEL Number:</span> {profileInfo?.pel_number ?? '—'}
            </div>
            {activeTab === 'build_time' ? (
              <div>
                <span className="logbook-header-label">Total Hours:</span>{' '}
                <span className="hours-figure">{formatHM(grandTotalHours)}</span>
              </div>
            ) : (
              <>
                <div>
                  <span className="logbook-header-label">{TRACK_LABELS[activeTab]} Hours:</span>{' '}
                  <span className="hours-figure">{formatHM(trackTotalHours)}</span>
                </div>
                <div>
                  <span className="logbook-header-label">Stage Status:</span> {trackStatusLabel}
                </div>
              </>
            )}
          </div>

          {activeTab === 'build_time' ? (
            allEntries.length === 0 ? (
              <p className="empty-text">No sessions logged yet.</p>
            ) : (
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
                      <th rowSpan={2}>Instructor</th>
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
                    {allEntries.map((e, i) => (
                      <tr key={i}>
                        <td>{e.date.toLocaleDateString()}</td>
                        <td>{e.stageName}</td>
                        <td>{e.aircraftType}</td>
                        <td>{e.simulatorName}</td>
                        <td>{e.routeFrom}</td>
                        <td>{e.routeTo}</td>
                        {CATEGORY_COLS.map((col) => (
                          <td key={col.key} className="hours-figure">
                            {e.category === col.category && e.duty === col.duty ? formatHM(e.hours) : formatHM(0)}
                          </td>
                        ))}
                        <td className="hours-figure">{formatHM(e.hours)}</td>
                        <td>{e.instructorName}</td>
                      </tr>
                    ))}
                    <tr className="logbook-subtotal-row">
                      <td colSpan={12}>Total</td>
                      <td className="hours-figure">{formatHM(grandTotalHours)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          ) : stageGroupsToShow.length === 0 ? (
            <p className="empty-text" style={{ marginTop: 20 }}>
              {trackStages.length === 0
                ? 'No stages configured for this track yet.'
                : 'This track is locked until its prerequisites are complete.'}
            </p>
          ) : (
            stageGroupsToShow.map((stage, gi) => {
              const entries = entriesByStage[stage.id] ?? []
              const subtotal = subtotalFor(entries)
              const isVA = stage.code === 'FS_VA'
              return (
                <div key={gi} style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <table className="logbook-table">
                    <thead>
                      <tr>
                        <th rowSpan={2}>Date</th>
                        <th colSpan={3}>Simulator</th>
                        {!isVA && (
                          <>
                            <th colSpan={2}>Route</th>
                            <th colSpan={3}>Local</th>
                            <th colSpan={3}>Cross Country</th>
                          </>
                        )}
                        <th rowSpan={2}>Time</th>
                        <th rowSpan={2}>Instructor</th>
                      </tr>
                      <tr>
                        <th>Stage</th>
                        <th>Type</th>
                        <th>Type/Rating</th>
                        {!isVA && (
                          <>
                            <th>From</th>
                            <th>To</th>
                            <th>Dual</th>
                            <th>Solo</th>
                            <th>PIC</th>
                            <th>Dual</th>
                            <th>Solo</th>
                            <th>PIC</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.length === 0 ? (
                        <tr>
                          <td colSpan={isVA ? 6 : 13} className="empty-text" style={{ textAlign: 'left' }}>
                            {stage.name} — {STATUS_LABEL[stage.status]}, no sessions logged yet.
                          </td>
                        </tr>
                      ) : (
                        entries.map((e, i) => (
                          <tr key={i}>
                            <td>{e.date.toLocaleDateString()}</td>
                            <td>{stage.name}</td>
                            <td>{e.aircraftType}</td>
                            <td>{e.simulatorName}</td>
                            {!isVA && (
                              <>
                                <td>{e.routeFrom}</td>
                                <td>{e.routeTo}</td>
                                {CATEGORY_COLS.map((col) => (
                                  <td key={col.key} className="hours-figure">
                                    {e.category === col.category && e.duty === col.duty ? formatHM(e.hours) : formatHM(0)}
                                  </td>
                                ))}
                              </>
                            )}
                            <td className="hours-figure">{formatHM(e.hours)}</td>
                            <td>{e.instructorName}</td>
                          </tr>
                        ))
                      )}
                      {entries.length > 0 && (
                        <tr className="logbook-subtotal-row">
                          <td colSpan={isVA ? 3 : 6}>Stage Completion</td>
                          {!isVA &&
                            CATEGORY_COLS.map((col) => (
                              <td key={col.key} className="hours-figure">
                                {formatHM(subtotal[col.key])}
                              </td>
                            ))}
                          <td className="hours-figure">{formatHM(subtotal.time)}</td>
                          <td></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
