const STATUS_LABEL = {
  locked: 'Locked',
  in_progress: 'In progress',
  complete: 'Complete',
}

export default function StageProgress({ stages }) {
  if (!stages || stages.length === 0) {
    return <p className="empty-text">No stages found for this track yet.</p>
  }

  return (
    <div className="route">
      {stages.map((s, i) => {
        const pct = s.required_hours
          ? Math.min(100, Math.round((s.cumulative_hours / s.required_hours) * 100))
          : 0

        return (
          <div className={`waypoint ${s.status}`} key={s.stage_id}>
            <div className="waypoint-line" />
            <div className="waypoint-node">
              {s.status === 'complete' ? '✓' : String(i + 1).padStart(2, '0')}
            </div>
            <div className="waypoint-body">
              <div className="waypoint-top">
                <span className="waypoint-name">{s.stage_name}</span>
                <span className={`waypoint-status ${s.status}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </div>
              <div className="waypoint-meta">
                <span className="hours-figure">
                  {s.cumulative_hours ?? 0} / {s.required_hours} hrs
                </span>
                {s.instrument_type ? ` · ${s.instrument_type}` : ''}
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
