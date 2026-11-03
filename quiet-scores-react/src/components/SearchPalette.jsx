import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { searchEspn, SPORT_LABEL } from '../lib/players'
import { usePersistentState } from '../hooks/usePersistentState'

function SearchIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function Avatar({ src, label, round }) {
  const [failed, setFailed] = useState(false)
  const initials = (label || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return (
    <span className={`sp-avatar ${round ? 'round' : ''}`}>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  )
}

/**
 * The header button that opens search; also shows the "/" shortcut. Passes its
 * on-screen box so the search panel can grow out of it.
 */
export function SearchButton({ onOpen }) {
  return (
    <button
      type="button"
      className="search-trigger"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      aria-label="Search teams and players"
    >
      <SearchIcon size={15} />
      <span className="search-trigger-label">Search</span>
      <kbd>/</kbd>
    </button>
  )
}

function highlight(text, query) {
  const q = query.trim()
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function SearchPalette({ onClose, onOpenTeam, onOpenPlayer, favorites = [], origin = null }) {
  // Mounted only while open, so every open starts with fresh state.
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  // Results are tagged with the query they answer; anything else is "loading".
  const [response, setResponse] = useState({ q: '', teams: [], players: [], error: false })
  const [active, setActive] = useState(0)
  const [recent, setRecent] = usePersistentState('qs:recent-search:v1', [])
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const dialogRef = useRef(null)

  // Opened from the header button: grow the panel out of the button's box
  // (from its spot and size to the panel's), then fade the contents in.
  // Opened with "/" there's no box, so the CSS drop-in plays instead.
  useLayoutEffect(() => {
    const el = dialogRef.current
    if (!origin || !el?.animate) return
    let reduce = false
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* assume motion is fine */
    }
    if (reduce) return
    const to = el.getBoundingClientRect()
    if (!to.width || !to.height) return
    const dx = origin.left - to.left
    const dy = origin.top - to.top
    const sx = origin.width / to.width
    const sy = origin.height / to.height
    const anim = el.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.6 },
        { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' },
    )
    // Cancelled on cleanup so a re-run (React dev mode runs effects twice)
    // measures the panel untransformed instead of mid-animation.
    return () => anim.cancel()
  }, [origin])

  useEffect(() => {
    inputRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const trimmed = query.trim()
  const hasQuery = trimmed.length >= 2

  // Debounced search.
  useEffect(() => {
    if (trimmed.length < 2) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await searchEspn(trimmed, { signal: controller.signal })
        setResponse({ q: trimmed, ...r, error: false })
        setActive(0)
      } catch (e) {
        if (e.name !== 'AbortError') setResponse({ q: trimmed, teams: [], players: [], error: true })
      }
    }, 180)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [trimmed])

  const fresh = response.q === trimmed
  const status = !hasQuery ? 'idle' : !fresh ? 'loading' : response.error ? 'error' : 'done'
  const results = useMemo(() => (hasQuery && fresh ? response : { teams: [], players: [] }), [hasQuery, fresh, response])

  // Flat list of selectable rows in display order, used for keyboard nav.
  const sections = useMemo(() => {
    if (!hasQuery) {
      const favs = favorites.map((f) => ({
        kind: 'team',
        key: `team:${f.sport}:${f.teamId}`,
        sport: f.sport,
        teamId: f.teamId,
        name: f.name,
        logo: f.logo,
        subtitle: SPORT_LABEL[f.sport] || '',
        favorite: true,
      }))
      return [
        favs.length && { title: 'Your teams', items: favs },
        recent.length && { title: 'Recent', items: recent, clearable: true },
      ].filter(Boolean)
    }
    return [
      filter !== 'players' && results.teams.length && { title: 'Teams', items: results.teams },
      filter !== 'teams' && results.players.length && { title: 'Players', items: results.players },
    ].filter(Boolean)
  }, [hasQuery, favorites, recent, results, filter])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  const activeIdx = Math.max(0, Math.min(active, flat.length - 1))

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])


  const choose = (item) => {
    if (!item) return
    setRecent((prev) => [item, ...prev.filter((r) => r.key !== item.key)].slice(0, 8))
    onClose()
    if (item.kind === 'team') {
      onOpenTeam({ teamId: item.teamId, sport: item.sport, teamName: item.name, teamLogo: item.logo })
    } else {
      onOpenPlayer({ athleteId: item.athleteId, sport: item.sport, name: item.name, headshot: item.headshot })
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(flat.length - 1, activeIdx + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(0, activeIdx - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(flat[activeIdx])
    } else if (e.key === 'Tab' && hasQuery) {
      e.preventDefault()
      const order = ['all', 'teams', 'players']
      const dir = e.shiftKey ? -1 : 1
      setFilter((f) => order[(order.indexOf(f) + dir + order.length) % order.length])
      setActive(0)
    }
  }

  let rowIndex = -1

  return (
    <div className="sp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`sp-dialog ${origin ? 'from-button' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onKeyDown={onKeyDown}
      >
        <div className="sp-input-row">
          <SearchIcon size={20} />
          <label className="visually-hidden" htmlFor="sp-input">Search teams and players</label>
          <input
            id="sp-input"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams and players"
            autoComplete="off"
            spellCheck="false"
            role="combobox"
            aria-expanded="true"
            aria-controls="sp-results"
            aria-activedescendant={flat[activeIdx] ? `sp-opt-${activeIdx}` : undefined}
          />
          {status === 'loading' && <span className="sp-spinner" aria-hidden="true" />}
          <button type="button" className="sp-esc" onClick={onClose}>
            <span className="sp-esc-desktop">Esc</span>
            <span className="sp-esc-mobile">Cancel</span>
          </button>
        </div>

        {hasQuery && (
          <div className="sp-filters" role="tablist" aria-label="Result type">
            {[
              ['all', 'All', results.teams.length + results.players.length],
              ['teams', 'Teams', results.teams.length],
              ['players', 'Players', results.players.length],
            ].map(([id, label, n]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                className={`sp-chip ${filter === id ? 'active' : ''}`}
                onClick={() => {
                  setFilter(id)
                  setActive(0)
                  inputRef.current?.focus()
                }}
              >
                {label}
                {status === 'done' && id !== 'all' ? <span className="sp-chip-n">{n}</span> : null}
              </button>
            ))}
          </div>
        )}

        <div className="sp-results" id="sp-results" role="listbox" ref={listRef}>
          {sections.map((section) => (
            <div key={section.title} className="sp-section">
              <div className="sp-section-head">
                <span>{section.title}</span>
                {section.clearable && (
                  <button type="button" className="sp-clear" onClick={() => setRecent([])}>Clear</button>
                )}
              </div>
              {section.items.map((item) => {
                rowIndex += 1
                const i = rowIndex
                const isActive = i === activeIdx
                return (
                  <button
                    type="button"
                    key={`${section.title}-${item.key}`}
                    id={`sp-opt-${i}`}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    className={`sp-row ${isActive ? 'active' : ''}`}
                    style={{ '--i': Math.min(i, 10) }}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(item)}
                  >
                    <Avatar src={item.kind === 'team' ? item.logo : item.headshot} label={item.name} round={item.kind === 'player'} />
                    <span className="sp-row-text">
                      <span className="sp-row-name">{hasQuery ? highlight(item.name, query) : item.name}</span>
                      <span className="sp-row-sub">{item.subtitle}</span>
                    </span>
                    {item.favorite && <span className="sp-fav">★</span>}
                    {isActive && <kbd className="sp-enter" aria-hidden="true">↵</kbd>}
                  </button>
                )
              })}
            </div>
          ))}

          {hasQuery && status === 'done' && flat.length === 0 && (
            <div className="sp-empty">No teams or players match “{trimmed}”.</div>
          )}
          {status === 'error' && <div className="sp-empty">Search isn’t available right now. Try again in a moment.</div>}
          {!hasQuery && sections.length === 0 && (
            <div className="sp-empty">Search any NFL, NBA, MLB, NHL or college team or player.</div>
          )}
        </div>

        <div className="sp-footer" aria-hidden="true">
          <span><b>↑ ↓</b> to move</span>
          <span><b>↵</b> to open</span>
          {hasQuery && <span><b>Tab</b> to switch filter</span>}
          <span className="sp-footer-right"><b>/</b> opens search anywhere</span>
        </div>
      </div>
    </div>
  )
}
