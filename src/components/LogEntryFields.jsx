export const CATEGORY_OPTIONS = [
  { value: 'local', label: 'Local' },
  { value: 'cross_country', label: 'Cross Country' },
]

export const DUTY_OPTIONS = [
  { value: 'dual', label: 'Dual' },
  { value: 'solo', label: 'Solo' },
  { value: 'pic', label: 'PIC' },
]

export function emptyLogEntry() {
  return { aircraftType: '', routeFrom: '', routeTo: '', category: 'local', duty: 'dual', hours: '1' }
}

export default function LogEntryFields({ logEntry, updateLog, routes }) {
  return (
    <>
      <div className="backfill-form-row">
        <div className="field">
          <label>Type</label>
          <input
            type="text"
            placeholder="e.g. C-150"
            value={logEntry.aircraftType}
            onChange={(e) => updateLog('aircraftType', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Route from</label>
          <select value={logEntry.routeFrom} onChange={(e) => updateLog('routeFrom', e.target.value)}>
            <option value="">Select…</option>
            {routes.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Route to</label>
          <select value={logEntry.routeTo} onChange={(e) => updateLog('routeTo', e.target.value)}>
            <option value="">Select…</option>
            {routes.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="backfill-form-row">
        <div className="field">
          <label>Category</label>
          <select value={logEntry.category} onChange={(e) => updateLog('category', e.target.value)}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Duty</label>
          <select value={logEntry.duty} onChange={(e) => updateLog('duty', e.target.value)}>
            {DUTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Hours</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={logEntry.hours}
            onChange={(e) => updateLog('hours', e.target.value)}
          />
        </div>
      </div>
    </>
  )
}
