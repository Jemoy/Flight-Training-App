// Small, dependency-free line icons (24x24, stroke = currentColor).
// Kept intentionally minimal — used only where they add real scanning value.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function PlaneIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M12 2.5c.9 0 1.6.9 1.6 2v5.2l6.4 3.8v2l-6.4-1.9v4.1l2 1.5v1.6l-3.6-1.1-3.6 1.1v-1.6l2-1.5v-4.1L4 15.5v-2l6.4-3.8V4.5c0-1.1.7-2 1.6-2z" />
    </svg>
  )
}

export function GaugeIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M4 13a8 8 0 1 1 16 0" />
      <path d="M12 13l3.2-3.6" />
      <path d="M12 13a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z" />
      <path d="M2.5 17.5h19" strokeOpacity="0" />
    </svg>
  )
}

export function WrenchIcon(props) {
  return (
    <svg {...base} width="14" height="14" {...props}>
      <path d="M14.7 6.3a4 4 0 0 1-5.1 5.1L4 17l3 3 5.6-5.6a4 4 0 0 1 5.1-5.1l-2.6 2.6-2-2z" />
    </svg>
  )
}

export function PlusIcon(props) {
  return (
    <svg {...base} width="16" height="16" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function XIcon(props) {
  return (
    <svg {...base} width="16" height="16" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function CheckIcon(props) {
  return (
    <svg {...base} width="13" height="13" strokeWidth={2.4} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}
