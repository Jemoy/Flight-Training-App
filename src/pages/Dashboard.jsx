import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

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

export default function Dashboard({ session }) {
  const [profileInfo, setProfileInfo] = useState(null)
  const [stageGroups, setStageGroups] = useState([])
  const [totalHours, setTotalHours] = useState(0)
  const [stageStatus, setStageStatus] = useState('')
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

    const { data: stages, error: stageErr } = await supabase
      .from('stages')
      .select('id, name, sequence_order')
      .eq('track', 'simulator')
      .order('sequence_order', { ascending: true })

    if (stageErr) {
      setError(stageErr.message)
      setLoading(false)
      return
    }

    const { data: progressRows } = await supabase
      .from('student_stage_progress')
      .select('stage_id, status')
      .eq('student_id', userId)

    const activeProgress = (progressRows ?? []).find(
      (p) => p.status === 'in_progress' || p.status === 'pending_approval'
    )
    const activeStage = (stages ?? []).find((s) => s.id === activeProgress?.stage_id)
    const allComplete =
      (progressRows ?? []).length > 0 && (progressRows ?? []).every((p) => p.status === 'complete')
    const label = allComplete
      ? 'All stages complete'
      : activeProgress?.status === 'pending_approval'
      ? `${activeStage?.name ?? ''} (awaiting admin approval)`
      : activeStage?.name ?? 'Not started'
    setStageStatus(label)

    const { data: rows, error: rowsErr } = await supabase
      .from('session_participants')
      .select(
        'hours_credited, sessions!inner(scheduled_start, stage_id, aircraft_type, route_from, route_to, flight_category, duty_type, status, simulator:simulators(name), instructor:profiles!sessions_instructor_id_fkey(full_name))'
      )
      .eq('student_id', userId)
      .eq('sessions.status', 'completed')

    if (rowsErr) {
      setError(rowsErr.message)
      setLoading(false)
      return
    }

    const byStage = {}
    let grandTotal = 0

    for (const row of rows ?? []) {
      const s = row.sessions
      const stageId = s.stage_id
      if (!byStage[stageId]) byStage[stageId] = []
      byStage[stageId].push({
        date: new Date(s.scheduled_start),
        aircraftType: s.aircraft_type ?? '—',
        simulatorName: s.simulator?.name ?? '—',
        routeFrom: s.route_from ?? '—',
        routeTo: s.route_to ?? '—',
        category: s.flight_category,
        duty: s.duty_type,
        instructorName: s.instructor?.full_name ?? '—',
        hours: Number(row.hours_credited ?? 0),
      })
      grandTotal += Number(row.hours_credited ?? 0)
    }

    const groups = (stages ?? [])
      .filter((stage) => byStage[stage.id])
      .map((stage) => {
        const entries = byStage[stage.id].sort((a, b) => a.date - b.date)
        const subtotal = { local_dual: 0, local_solo: 0, local_pic: 0, cc_dual: 0, cc_solo: 0, cc_pic: 0, time: 0 }
        for (const e of entries) {
          const col = CATEGORY_COLS.find((c) => c.category === e.category && c.duty === e.duty)
          if (col) subtotal[col.key] += e.hours
          subtotal.time += e.hours
        }
        return { stageName: stage.name, entries, subtotal }
      })

    setStageGroups(groups)
    setTotalHours(grandTotal)
    setLoading(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Flight Training Record</div>

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
            <div>
              <span className="logbook-header-label">Total Hours:</span>{' '}
              <span className="hours-figure">{formatHM(totalHours)}</span>
            </div>
            <div>
              <span className="logbook-header-label">Stage Status:</span> {stageStatus}
            </div>
          </div>

          {stageGroups.length === 0 && (
            <p className="empty-text" style={{ marginTop: 20 }}>
              No completed sessions logged yet.
            </p>
          )}

          {stageGroups.map((group, gi) => (
            <div key={gi} style={{ overflowX: 'auto', marginBottom: 24 }}>
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
                  {group.entries.map((e, i) => (
                    <tr key={i}>
                      <td>{e.date.toLocaleDateString()}</td>
                      <td>{group.stageName}</td>
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
                    <td colSpan={6}>Stage Completion</td>
                    {CATEGORY_COLS.map((col) => (
                      <td key={col.key} className="hours-figure">
                        {formatHM(group.subtotal[col.key])}
                      </td>
                    ))}
                    <td className="hours-figure">{formatHM(group.subtotal.time)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
