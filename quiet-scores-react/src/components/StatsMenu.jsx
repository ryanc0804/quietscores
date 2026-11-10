import { useEffect, useRef, useState } from 'react'

const ICONS = {
  standings: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  leaders: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />,
}
const Icon = ({ name, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
)

/**
 * Header "Stats" button: a small menu with the league's Standings and
 * Leaders (`label` is the league, e.g. "NFL"; `active` the view showing).
 * Closes on a pick, a click outside, or Escape.
 */
export function StatsMenu({ label, active, onOpen }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (view) => {
    setOpen(false)
    onOpen(view)
  }

  return (
    <div className="stats-menu" ref={ref}>
      <button
        type="button"
        className={`stats-trigger ${active ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${label} standings and leaders`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="standings" />
        <span className="stats-label">Stats</span>
        <svg className="stats-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="stats-popover" role="menu">
          {[['standings', 'Standings'], ['leaders', 'Leaders']].map(([view, name]) => (
            <button key={view} type="button" role="menuitem" className={active === view ? 'active' : ''} onClick={() => pick(view)}>
              <Icon name={view} />
              {label} {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
