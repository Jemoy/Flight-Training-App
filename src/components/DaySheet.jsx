import { SIM_SLOTS } from '../lib/simSlots'
import { studentDisplayName, instructorInitials } from '../lib/scheduleFormat'

// entriesBySlot: array of 12 arrays, each holding
// { instructorId, instructorName, studentName, cumulativeHours }
export default function DaySheet({ date, entriesBySlot, onEntryClick }) {
  return (
    <div className="daysheet">
      <div className="daysheet-header">
        <div className="daysheet-date">
          {date.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <div className="daysheet-dow">
          {date.toLocaleDateString(undefined, { weekday: 'long' })}
        </div>
      </div>

      <table className="daysheet-table">
        <tbody>
          {SIM_SLOTS.map((slot, i) => {
            const entries = entriesBySlot[i] ?? []
            if (entries.length === 0) {
              return (
                <tr key={i}>
                  <td className="ds-cell ds-instructor"></td>
                  <td className="ds-cell ds-student"></td>
                  <td className="ds-cell ds-resource"></td>
                  <td className="ds-cell ds-hours"></td>
                </tr>
              )
            }
            return entries.map((entry, j) => {
              const editable = onEntryClick && !['completed', 'cancelled'].includes(entry.status)
              return (
                <tr
                  key={`${i}-${j}`}
                  className={editable ? 'ds-row-editable' : ''}
                  onClick={() => editable && onEntryClick(entry)}
                >
                  <td className="ds-cell ds-instructor">{instructorInitials(entry.instructorName)}</td>
                  <td className="ds-cell ds-student">{studentDisplayName(entry.studentName)}</td>
                  <td className="ds-cell ds-resource">{entry.simulatorName ?? entry.aircraftName ?? '—'}</td>
                  <td className="ds-cell ds-hours">{entry.cumulativeHours ?? ''}</td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  )
}
