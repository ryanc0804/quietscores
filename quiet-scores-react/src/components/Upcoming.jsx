import { useEffect, useState } from 'react'
import { favoriteStatus, nextGameDate } from '../lib/upcoming'
import { SPORT_LABEL } from '../lib/players'

const SOCCER = new Set(['worldcup', 'mls', 'epl', 'ucl', 'laliga', 'bundesliga', 'seriea', 'ligue1'])
const ORDER = { live: 0, final: 1, next: 2, offseason: 3 }

function when(iso, withTime = true) {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return withTime ? `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : day
}

function Logo({ src, className }) {
  if (!src) return null
  return <img className={className} src={src} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
}

function FavoriteTeamCard({ fav, status, onOpenTeam }) {
  const g = status.game
  const badge = {
    live: { cls: 'live', text: 'Live' },
    final: { cls: 'final', text: 'Final' },
    next: { cls: 'scheduled', text: 'Next game' },
    offseason: { cls: 'scheduled', text: 'Offseason' },
  }[status.kind]
  const openTeam = () =>
    onOpenTeam({ teamId: fav.teamId, sport: fav.sport, teamName: fav.name, teamLogo: fav.logo, teamAbbreviation: fav.abbreviation })

  return (
    <div className="score-card fav-next-card" role="button" tabIndex={0} onClick={openTeam}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openTeam())}
      aria-label={`${fav.name}: ${badge.text}`}>
      <div className="game-header">
        <span className="sport-type">{SPORT_LABEL[fav.sport] || fav.sport.toUpperCase()}</span>
        <span className={`inning-display ${badge.cls}`}>{badge.text}</span>
      </div>
      <div className="fnc-body">
        <div className="fnc-team">
          <Logo src={fav.logo} className="fnc-logo" />
          <b>{fav.name}</b>
        </div>
        {g && (
          <div className="fnc-game">
            <span className="fnc-vs">{g.home || g.neutral ? 'vs' : '@'}</span>
            <Logo src={g.opponentLogo} className="fnc-opp-logo" />
            <span className="fnc-opp">{g.opponentShort || g.opponent}</span>
            {(status.kind === 'final' || status.kind === 'live') && g.ours != null && g.theirs != null && (
              <span className={`fnc-score ${g.result === 'W' ? 'pg-win' : g.result === 'L' ? 'pg-loss' : ''}`}>
                {g.result ? `${g.result} ` : ''}{g.ours}–{g.theirs}
              </span>
            )}
          </div>
        )}
        <div className="fnc-sub">
          {status.kind === 'live' && (g.status || 'In progress')}
          {status.kind === 'final' && [g.headline && /final|bowl|series|championship/i.test(g.headline) ? g.headline : null, when(g.date, false)].filter(Boolean).join(' · ')}
          {status.kind === 'next' && when(g.date)}
          {status.kind === 'offseason' && 'No games scheduled yet'}
        </div>
      </div>
    </div>
  )
}

/**
 * Favorites with no game on today's scoreboard: each team's live game,
 * recent final, next game, or "Offseason". Live and soonest come first.
 */
export function FavoritesUpcoming({ favorites, onOpenTeam }) {
  const [statuses, setStatuses] = useState({})
  const keys = favorites.map((f) => f.key).join('|')

  useEffect(() => {
    const controller = new AbortController()
    for (const fav of favorites) {
      if (SOCCER.has(fav.sport)) continue
      favoriteStatus(fav, { signal: controller.signal })
        .then((s) => !controller.signal.aborted && setStatuses((prev) => ({ ...prev, [fav.key]: s })))
        .catch(() => {})
    }
    return () => controller.abort()
    // favorites is re-created each render; `keys` captures what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])

  const rows = favorites
    .map((fav) => ({ fav, status: statuses[fav.key] }))
    .filter((r) => r.status && ORDER[r.status.kind] != null)
    .sort((a, b) => {
      const k = ORDER[a.status.kind] - ORDER[b.status.kind]
      if (k) return k
      const da = a.status.game ? new Date(a.status.game.date) : 0
      const db = b.status.game ? new Date(b.status.game.date) : 0
      return a.status.kind === 'final' ? db - da : da - db
    })
  if (!rows.length) return null

  return (
    <>
      <h2 className="scores-group-title"><span className="star">★</span> Coming up</h2>
      {rows.map(({ fav, status }) => (
        <FavoriteTeamCard key={fav.key} fav={fav} status={status} onOpenTeam={onOpenTeam} />
      ))}
    </>
  )
}

/** Empty-day message for one sport, with a jump to its next date with games. */
export function NextSlate({ sportKeys, label, from, onGo }) {
  const [state, setState] = useState({ key: null, date: undefined })
  const key = `${sportKeys.join(',')}:${from.toDateString()}`

  useEffect(() => {
    const controller = new AbortController()
    nextGameDate(sportKeys, from, { signal: controller.signal })
      .then((date) => !controller.signal.aborted && setState({ key, date }))
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const date = state.key === key ? state.date : undefined
  return (
    <div className="info empty-state">
      <div>No {label} games on {when(from, false)}.</div>
      {date === undefined && <div className="next-slate-hint">Finding the next games…</div>}
      {date === null && <div className="next-slate-hint">No {label} games in the next five weeks.</div>}
      {date && (
        <button type="button" className="next-slate-btn" onClick={() => onGo(date)}>
          Next games: {when(date, false)} →
        </button>
      )}
    </div>
  )
}
