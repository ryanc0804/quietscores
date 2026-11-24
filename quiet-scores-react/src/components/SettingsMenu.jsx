import { useEffect, useRef, useState } from 'react'

function ThemeIcon({ mode }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (mode === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (mode === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}

const THEMES = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
]

/** The header's settings menu (appearance). Its icon shows the current theme. */
export function SettingsButton({ themeMode, onThemeChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-btn avatar guest"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Appearance"
        title="Appearance"
      >
        <ThemeIcon mode={themeMode} />
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-section-label">Appearance</div>
          <div className="account-theme" role="radiogroup" aria-label="Appearance">
            {THEMES.map((t) => (
              <button
                key={t.mode}
                type="button"
                role="radio"
                aria-checked={themeMode === t.mode}
                className={themeMode === t.mode ? 'active' : ''}
                onClick={() => onThemeChange(t.mode)}
              >
                <ThemeIcon mode={t.mode} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
