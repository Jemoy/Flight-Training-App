import { useMemo } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'

const HOUR_START = 6
const HOUR_END = 21 // 9pm
const HOUR_HEIGHT = 48 // px per hour row

// events: [{ id, start: Date, end: Date, title, type, subtitle? }]
// type drives color: 'class' | 'mine' | 'booked' | 'admin'
export default function Calendar({ view, currentDate, onViewChange, onDateChange, events, onSlotClick }) {
  function goToday() {
    onDateChange(new Date())
  }

  function goPrev() {
    if (view === 'day') onDateChange(subDays(currentDate, 1))
    else if (view === 'week') onDateChange(subWeeks(currentDate, 1))
    else onDateChange(subMonths(currentDate, 1))
  }

  function goNext() {
    if (view === 'day') onDateChange(addDays(currentDate, 1))
    else if (view === 'week') onDateChange(addWeeks(currentDate, 1))
    else onDateChange(addMonths(currentDate, 1))
  }

  const headerLabel =
    view === 'month' ? format(currentDate, 'MMMM yyyy') : format(currentDate, 'MMMM yyyy')

  return (
    <div className="cal-wrap">
      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <button className="cal-btn" onClick={goToday}>
            Today
          </button>
          <button className="cal-btn cal-btn-icon" onClick={goPrev}>
            ‹
          </button>
          <button className="cal-btn cal-btn-icon" onClick={goNext}>
            ›
          </button>
          <span className="cal-heading">{headerLabel}</span>
        </div>
        <div className="cal-view-switch">
          {['day', 'week', 'month'].map((v) => (
            <button
              key={v}
              className={`cal-view-btn ${view === v ? 'active' : ''}`}
              onClick={() => onViewChange(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <MonthGrid currentDate={currentDate} events={events} onDayClick={(d) => { onDateChange(d); onViewChange('day') }} />
      ) : (
        <TimeGrid
          view={view}
          currentDate={currentDate}
          events={events}
          onSlotClick={onSlotClick}
        />
      )}

      <div className="cal-legend">
        <span className="cal-legend-item"><i className="cal-dot mine" /> Your session</span>
        <span className="cal-legend-item"><i className="cal-dot pending" /> Pending approval</span>
        <span className="cal-legend-item"><i className="cal-dot booked" /> Booked</span>
        <span className="cal-legend-item"><i className="cal-dot class" /> Your class</span>
      </div>
    </div>
  )
}

function TimeGrid({ view, currentDate, events, onSlotClick }) {
  const days = useMemo(() => {
    if (view === 'day') return [currentDate]
    const start = startOfWeek(currentDate, { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end: endOfWeek(currentDate, { weekStartsOn: 0 }) })
  }, [view, currentDate])

  const hours = []
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h)

  return (
    <div className="cal-timegrid">
      <div className="cal-timegrid-header">
        <div className="cal-time-gutter" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`cal-day-header ${isToday(d) ? 'today' : ''}`}>
            <div className="cal-day-name">{format(d, 'EEE')}</div>
            <div className="cal-day-num">{format(d, 'd')}</div>
          </div>
        ))}
      </div>

      <div className="cal-timegrid-body" style={{ height: (HOUR_END - HOUR_START + 1) * HOUR_HEIGHT }}>
        <div className="cal-time-gutter">
          {hours.map((h) => (
            <div key={h} className="cal-hour-label" style={{ height: HOUR_HEIGHT }}>
              {formatHour(h)}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.start, day))
          return (
            <div key={day.toISOString()} className="cal-day-col">
              {hours.map((h) => (
                <div
                  key={h}
                  className="cal-hour-slot"
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSlotClick && onSlotClick(setHour(day, h))}
                />
              ))}
              {dayEvents.map((e) => (
                <EventBlock key={e.id} event={e} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventBlock({ event }) {
  const startMinutes = (event.start.getHours() - HOUR_START) * 60 + event.start.getMinutes()
  const durationMinutes = Math.max(20, (event.end - event.start) / 60000)
  const top = (startMinutes / 60) * HOUR_HEIGHT
  const height = (durationMinutes / 60) * HOUR_HEIGHT

  return (
    <div
      className={`cal-event cal-event-${event.type}`}
      style={{ top, height }}
      title={event.subtitle ?? event.title}
    >
      <div className="cal-event-title">{event.title}</div>
      {event.subtitle && <div className="cal-event-subtitle">{event.subtitle}</div>}
    </div>
  )
}

function MonthGrid({ currentDate, events, onDayClick }) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="cal-month-grid">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
        <div key={d} className="cal-month-dow">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(e.start, day))
        return (
          <button
            key={day.toISOString()}
            className={`cal-month-cell ${isSameMonth(day, currentDate) ? '' : 'faded'} ${
              isToday(day) ? 'today' : ''
            }`}
            onClick={() => onDayClick(day)}
          >
            <span className="cal-month-daynum">{format(day, 'd')}</span>
            {dayEvents.length > 0 && (
              <span className="cal-month-count">
                {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function setHour(date, hour) {
  const d = new Date(date)
  d.setHours(hour, 0, 0, 0)
  return d
}

function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12} ${period}`
}
