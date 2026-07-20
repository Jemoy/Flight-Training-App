import React from 'react'
import { SIM_SLOTS } from '../lib/simSlots'
import { studentDisplayName, instructorInitials, dowColor } from '../lib/scheduleFormat'

// days: Date[] (e.g. Monday–Saturday)
// entriesBySlotByDay: array parallel to days, each an array of 12 slot-entry-arrays
export default function WeekSheet({ days, entriesBySlotByDay, onEntryClick }) {
  return (
    <div className="weeksheet-wrap">
      <table className="weeksheet-table">
        <thead>
          <tr>
            <th className="ws-corner" rowSpan={2}></th>
            {days.map((d, i) => (
              <th key={i} colSpan={3} className="ws-date-header">
                {d.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}
              </th>
            ))}
          </tr>
          <tr>
            {days.map((d, i) => (
              <th key={i} colSpan={3} className="ws-dow-header" style={{ background: dowColor(d) }}>
                {d.toLocaleDateString(undefined, { weekday: 'long' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIM_SLOTS.map((slot, slotIdx) => (
            <tr key={slotIdx}>
              <td className="ws-time-label">
                {slot.start}-{slot.end}
              </td>
              {days.map((d, dayIdx) => {
                const entries = entriesBySlotByDay[dayIdx]?.[slotIdx] ?? []
                if (entries.length === 0) {
                  return (
                    <React.Fragment key={dayIdx}>
                      <td className="ds-cell ds-instructor"></td>
                      <td className="ds-cell ds-student"></td>
                      <td className="ds-cell ds-hours"></td>
                    </React.Fragment>
                  )
                }
                // Usually one entry per slot; stack if a group session has more.
                const editable =
                  onEntryClick && !['completed', 'cancelled'].includes(entries[0]?.status)
                return (
                  <React.Fragment key={dayIdx}>
                    <td
                      className={`ds-cell ds-instructor ${editable ? 'ds-cell-editable' : ''}`}
                      onClick={() => editable && onEntryClick(entries[0])}
                    >
                      {entries.map((e, k) => (
                        <div key={k}>{instructorInitials(e.instructorName)}</div>
                      ))}
                    </td>
                    <td
                      className={`ds-cell ds-student ${editable ? 'ds-cell-editable' : ''}`}
                      onClick={() => editable && onEntryClick(entries[0])}
                    >
                      {entries.map((e, k) => (
                        <div key={k}>{studentDisplayName(e.studentName)}</div>
                      ))}
                    </td>
                    <td
                      className={`ds-cell ds-hours ${editable ? 'ds-cell-editable' : ''}`}
                      onClick={() => editable && onEntryClick(entries[0])}
                    >
                      {entries.map((e, k) => (
                        <div key={k}>{e.cumulativeHours ?? ''}</div>
                      ))}
                    </td>
                  </React.Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
