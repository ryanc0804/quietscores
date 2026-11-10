import { useEffect, useRef, useState } from 'react'
import { boardsInCategory, fetchLeaderboard, formatRank } from '../lib/leaders'
import { SPORT_LABEL, searchEspn } from '../lib/players'

// ESPN names winter seasons by the year they end (2027 = the 2026–27 season).
const SPLIT_YEAR = new Set(['nba', 'nhl', 'college-basketball'])
function seasonName({ sport, year }) {
  return SPLIT_YEAR.has(sport) ? `${year - 1}–${String(year).slice(2)}` : String(year)
}

/**
 * League ranking for one stat, with tabs for the other stats in its category.
 * `view` = { board, position, player: { id, name, headshot }, tiles: { [stat]: { value, rank } } }.
 * The player it was opened from is highlighted, or pinned below the list
 * when they're outside the top 50.
 */
export function LeaderboardPage({ view, onBack, onOpenPlayer, onChangeBoard }) {
  const { board, player, tiles = {} } = view
  const [boards, setBoards] = useState([board])
  // Results are tagged with their stat so switching tabs never shows the old list.
  const [result, setResult] = useState(null) // { stat, data } | { stat, error }
  const data = result?.stat === board.stat ? result.data ?? null : null
  const error = result?.stat === board.stat ? result.error ?? null : null
  const meRef = useRef(null)
  const tabsRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    boardsInCategory(board, view.position)
      .then((b) => !cancelled && setBoards(b))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [board, view.position])

  useEffect(() => {
    const controller = new AbortController()
    fetchLeaderboard(board, { signal: controller.signal })
      .then((d) => setResult({ stat: board.stat, data: d }))
      .catch((e) => {
        if (e.name !== 'AbortError') setResult({ stat: board.stat, error: 'Couldn’t load this leaderboard.' })
      })
    return () => controller.abort()
  }, [board])

  // Open on the player: once the list loads (and on each tab switch), scroll
  // to his row if he's past the first few, which are already on screen.
  const myRank = data?.rows.find((r) => r.athleteId === player?.id || (player?.mlbId && r.mlbId === player.mlbId))?.rank
  useEffect(() => {
    if (myRank > 8) meRef.current?.scrollIntoView({ block: 'center' })
  }, [data, myRank])

  // Keep the active tab visible in the scrolling tab strip.
  // (Scrolls only the strip sideways; scrollIntoView would also move the page.)
  useEffect(() => {
    const strip = tabsRef.current
    const tab = strip?.querySelector('.active')
    if (tab) strip.scrollLeft = tab.offsetLeft - strip.clientWidth / 2 + tab.offsetWidth / 2
  }, [boards, board])

  const isMe = (r) => r.athleteId === player?.id || (player?.mlbId && r.mlbId === player.mlbId)
  const mine = data?.rows.find(isMe)
  // Rows from MLB's lists have no ESPN id; find the ESPN player by name.
  const openRow = async (r) => {
    if (r.athleteId) return onOpenPlayer({ sport: board.sport, athleteId: r.athleteId, name: r.name, headshot: r.headshot })
    const hit = (await searchEspn(r.name).catch(() => null))?.players.find((p) => p.sport === board.sport)
    if (hit) onOpenPlayer({ sport: board.sport, athleteId: hit.athleteId, name: hit.name, headshot: hit.headshot })
  }
  const inList = Boolean(mine)
  const tile = tiles[board.stat]

  return (
    <div className="pg-page">
      <div className="pg-wrap lb-page">
        <header className="lb-head">
          {/* Back on its own row like player/team pages, but compact. */}
          <button type="button" className="pg-back lb-back" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            Back
          </button>
          <div className="lb-topline">
            <span className="lb-eyebrow">
              {[SPORT_LABEL[board.sport], board.year && `${seasonName(board)} regular season`, board.scopeLabel ? `Among ${board.scopeLabel}` : 'League leaders']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <h1 className="lb-title">{board.label}</h1>
          {board.description && <p className="lb-desc">{board.description}</p>}
          {mine && mine.rank > 8 && (
            <button type="button" className="lb-jump" onClick={() => meRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              Jump to {player.name} · {formatRank(mine.rank)} ↓
            </button>
          )}
        </header>

        {boards.length > 1 && (
          <div className="lb-tabs" ref={tabsRef} role="tablist" aria-label="Stat">
            {boards.map((b) => (
              <button
                key={b.stat}
                type="button"
                role="tab"
                aria-selected={b.stat === board.stat}
                className={b.stat === board.stat ? 'active' : ''}
                title={b.label}
                onClick={() => b.stat !== board.stat && onChangeBoard(b)}
              >
                {b.abbreviation || b.label}
              </button>
            ))}
          </div>
        )}

        <section className="pg-card lb-card">
          {!data && !error && <div className="lb-status">Loading…</div>}
          {error && <div className="lb-status error">{error}</div>}
          {data && !data.rows.length && <div className="lb-status">Nobody has recorded this stat yet this season.</div>}

          {data && data.rows.length > 0 && (
            <ol className="lb-list">
              {data.rows.map((r) => {
                const me = isMe(r)
                return (
                  <li key={r.athleteId || r.mlbId} ref={me ? meRef : null}>
                    <button
                      type="button"
                      className={`lb-row ${me ? 'me' : ''}`}
                      onClick={() => openRow(r)}
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

          {data && player && !inList && (
            <div className="lb-row me pinned">
              <span className="lb-rank">{tile?.rank?.replace(/(st|nd|rd|th)$/, '') || '–'}</span>
              {player.headshot ? <img className="lb-headshot" src={player.headshot} alt="" /> : <span className="lb-headshot" aria-hidden="true" />}
              <span className="lb-name">
                <b>{player.name}</b>
                <small>{tile?.rank ? `${tile.rank} ${board.scopeLabel ? `among ${board.scopeLabel}` : 'in league'}` : tile?.reason || `Outside the top ${data.rows.length}`}</small>
              </span>
              <span className="lb-value">{tile?.value ?? ''}</span>
            </div>
          )}

          {data && (
            <footer className="lb-foot">
              {data.capped
                ? `Top ${data.rows.length}${board.sport === 'college-football' ? ' FBS' : ''} players shown.`
                : `Top ${data.rows.length} of ${data.total} ${data.qualified ? 'qualified players (minimum playing time applies)' : 'players with a stat'}.`}
            </footer>
          )}
        </section>
      </div>
    </div>
  )
}
