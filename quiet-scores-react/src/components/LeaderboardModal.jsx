import { useEffect, useRef, useState } from 'react'
import { fetchLeaderboard } from '../lib/leaders'
import { SPORT_LABEL } from '../lib/players'

// ESPN names winter seasons by the year they end (2027 = the 2026–27 season).
const SPLIT_YEAR = new Set(['nba', 'nhl', 'college-basketball'])
function seasonName({ sport, year }) {
  return SPLIT_YEAR.has(sport) ? `${year - 1}–${String(year).slice(2)}` : String(year)
}

/**
 * Full league ranking for one stat, opened from a player's stat tile.
 * The player it was opened from is highlighted (and pinned below the list
 * when they're outside the top 50).
 */
export function LeaderboardModal({ board, player, playerTile, onClose, onOpenPlayer }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const meRef = useRef(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchLeaderboard(board, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError('Couldn’t load this leaderboard.')
      })
    return () => controller.abort()
  }, [board])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Bring the highlighted player into view once the list renders.
  useEffect(() => {
    meRef.current?.scrollIntoView({ block: 'center' })
  }, [data])

  const inList = data?.rows.some((r) => r.athleteId === player.id)

  return (
    <div className="lb-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="lb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lb-head">
          <div>
            <span className="lb-eyebrow">{[SPORT_LABEL[board.sport], board.year && `${seasonName(board)} regular season`].filter(Boolean).join(' · ')}</span>
            <h2 id="lb-title">{board.label}</h2>
            {board.description && <p className="lb-desc">{board.description}</p>}
          </div>
          <button type="button" className="lb-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {!data && !error && <div className="lb-status">Loading…</div>}
        {error && <div className="lb-status error">{error}</div>}
        {data && !data.rows.length && <div className="lb-status">No qualified players yet this season.</div>}

        {data && data.rows.length > 0 && (
          <ol className="lb-list">
            {data.rows.map((r) => {
              const me = r.athleteId === player.id
              return (
                <li key={r.athleteId} ref={me ? meRef : null}>
                  <button
                    type="button"
                    className={`lb-row ${me ? 'me' : ''}`}
                    onClick={() => (me ? onClose() : onOpenPlayer({ sport: board.sport, athleteId: r.athleteId, name: r.name, headshot: r.headshot }))}
                  >
                    <span className="lb-rank">{r.rank}</span>
                    {r.headshot ? (
                      <img className="lb-headshot" src={r.headshot} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                    ) : (
                      <span className="lb-headshot" aria-hidden="true" />
                    )}
                    <span className="lb-name">
                      <b>{r.name}</b>
                      <small>{[r.team, r.position].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="lb-value">{r.value}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}

        {data && !inList && playerTile && (
          <div className="lb-row me pinned">
            <span className="lb-rank">{playerTile.rankNumber ?? '–'}</span>
            {player.headshot ? <img className="lb-headshot" src={player.headshot} alt="" /> : <span className="lb-headshot" aria-hidden="true" />}
            <span className="lb-name">
              <b>{player.name}</b>
              <small>{playerTile.rankFull ? `${playerTile.rankFull} in league` : 'Not ranked among qualified players'}</small>
            </span>
            <span className="lb-value">{playerTile.value}</span>
          </div>
        )}

        {data && (
          <footer className="lb-foot">
            {data.capped
              ? `Top ${data.rows.length} FBS players shown.`
              : `Top ${data.rows.length} of ${data.total} ${data.qualified ? 'qualified players (minimum playing time applies)' : 'players with a stat'}.`}
          </footer>
        )}
      </div>
    </div>
  )
}
