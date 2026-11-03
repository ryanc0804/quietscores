import { useEffect, useMemo, useState } from 'react'
import { fetchPlayer, trendFor, SPORT_LABEL } from '../lib/players'
import { heroColors } from './heroColor'
import { SummarySkeleton } from '../components/Skeletons'
import { LeaderboardModal } from '../components/LeaderboardModal'
import { leaderboardFor } from '../lib/leaders'

function Headshot({ src, name }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="pp-headshot placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="70%" height="70%" fill="currentColor">
          <circle cx="12" cy="8" r="4.2" />
          <path d="M3.5 22c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z" />
        </svg>
      </span>
    )
  }
  return <img className="pp-headshot" src={src} alt={name} onError={() => setFailed(true)} />
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TrendChart({ trend }) {
  const max = Math.max(...trend.points.map((p) => p.value), 1)
  const avg = trend.points.reduce((s, p) => s + p.value, 0) / trend.points.length
  const best = Math.max(...trend.points.map((p) => p.value))
  return (
    <section className="pg-card pp-trend">
      <h2 className="pg-card-title">{trend.label} · last {trend.points.length}</h2>
      <div className="pg-muted pp-trend-sub">
        {avg.toFixed(avg < 10 ? 1 : 0)} per game · best {best}
      </div>
      <div className="pp-bars" role="img" aria-label={`${trend.label} by game: ${trend.points.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        {trend.points.map((p, i) => (
          <div key={i} className="pp-bar-col">
            <span className="pp-bar-val">{p.value}</span>
            <span className={`pp-bar ${p.value === best ? 'best' : ''}`} style={{ height: `${Math.max(4, (p.value / max) * 100)}%` }} />
            <span className="pp-bar-label">{p.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function PlayerPage({ player: ref, onBack, onOpenTeam, onOpenPlayer }) {
  const [player, setPlayer] = useState(null)
  const [error, setError] = useState(null)
  const [showAllGames, setShowAllGames] = useState(false)
  const [boards, setBoards] = useState({}) // tile key → leaderboard, for tiles that have one
  const [openTile, setOpenTile] = useState(null)

  useEffect(() => {
    // The page is keyed per player in App, so state starts fresh for each one.
    const controller = new AbortController()
    fetchPlayer(ref.sport, ref.athleteId, { signal: controller.signal })
      .then(setPlayer)
      .catch((e) => {
        if (e.name !== 'AbortError') setError('Couldn’t load this player.')
      })
    return () => controller.abort()
  }, [ref.sport, ref.athleteId])

  // Work out which tiles can open a league leaderboard (not every sport or stat has one).
  useEffect(() => {
    if (!player?.tiles.length) return
    let cancelled = false
    Promise.all(
      player.tiles.map((t) =>
        leaderboardFor(player.sport, t.key, player.positionAbbr)
          .then((b) => [t.key, b])
          .catch(() => [t.key, null]),
      ),
    ).then((pairs) => {
      if (!cancelled) setBoards(Object.fromEntries(pairs.filter(([, b]) => b)))
    })
    return () => {
      cancelled = true
    }
  }, [player])

  const trend = useMemo(() => trendFor(player), [player])
  const colors = heroColors(player?.team?.color)

  return (
    <div className="pg-page">
      {!player && !error && (
        <div className="pg-wrap">
          <button className="back-btn" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
          <SummarySkeleton />
        </div>
      )}
      {error && (
        <div className="pg-wrap">
          <button className="back-btn" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
          <div className="error">{error}</div>
        </div>
      )}

      {player && (
        <>
          <section className="pg-hero" style={{ '--hero': colors.base, '--hero-deep': colors.deep }}>
            <div className="pg-wrap">
              <button className="pg-back" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                Back
              </button>
              <div className="pp-hero-main">
                <Headshot src={player.headshot || ref.headshot} name={player.name} />
                <div className="pp-hero-text">
                  <span className="pg-eyebrow">
                    {[player.jersey && `#${player.jersey}`, player.position, player.team?.name || SPORT_LABEL[player.sport]]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <h1 className="pg-title">{player.name}</h1>
                  <div className="pp-hero-tags">
                    {player.team && (
                      <button
                        type="button"
                        className="pg-pill-link"
                        onClick={() => onOpenTeam({ teamId: player.team.id, sport: player.sport, teamName: player.team.name, teamLogo: player.team.logo, teamAbbreviation: player.team.abbreviation })}
                      >
                        {player.team.logo && <img src={player.team.logo} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                        {player.team.name}
                      </button>
                    )}
                    {(player.injury || player.status) && <span className="pg-badge-out">{player.injury || player.status}</span>}
                  </div>
                </div>
                {player.nextGame && (
                  <div className="pg-next">
                    <span className="pg-next-label">{player.nextGame.label}</span>
                    <span className="pg-next-name">{player.nextGame.name}</span>
                    {player.nextGame.date && (
                      <span className="pg-next-when">
                        {new Date(player.nextGame.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {player.bio.length > 0 && (
                <dl className="pp-bio">
                  {player.bio.map((b) => (
                    <div key={b.label}>
                      <dt>{b.label}</dt>
                      <dd>{b.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          <main className="pg-wrap pg-main">
            {player.tiles.length > 0 && (
              <section>
                <h2 className="pg-section-title">{player.seasonLabel || 'This season'}</h2>
                <div className="pp-tiles">
                  {player.tiles.map((t) => {
                    const body = (
                      <>
                        <div className="pp-tile-label">{t.label}</div>
                        <div className="pp-tile-value">{t.value}</div>
                        {t.rank && <div className="pp-tile-rank">{t.rank} in league</div>}
                      </>
                    )
                    return boards[t.key] ? (
                      <button
                        key={t.key}
                        type="button"
                        className="pg-card pp-tile clickable"
                        onClick={() => setOpenTile(t)}
                        aria-label={`${t.label} ${t.value}${t.rank ? `, ${t.rank} in league` : ''}. Show league leaderboard`}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={t.key} className="pg-card pp-tile">{body}</div>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="pg-two-col">
              {player.log && (
                <section className="pg-card pg-col-main">
                  <div className="pg-card-head">
                    <h2 className="pg-card-title">Game log</h2>
                    <span className="pg-muted">{player.log.season}</span>
                  </div>
                  <div className="pg-table-scroll">
                    <table className="pg-table">
                      <thead>
                        <tr>
                          <th className="left">Date</th>
                          <th className="left">Opp</th>
                          <th className="left">Result</th>
                          {player.log.labels.map((l, i) => <th key={i}>{l}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllGames ? player.log.rows : player.log.rows.slice(0, 8)).map((r) => (
                          <tr key={r.id}>
                            <td className="left pg-muted">{formatDate(r.date)}</td>
                            <td className="left strong">{r.atVs} {r.opponent}</td>
                            <td className="left">
                              <b className={r.result === 'W' ? 'pg-win' : r.result === 'L' ? 'pg-loss' : ''}>{r.result}</b> {r.score}
                            </td>
                            {r.stats.map((s, i) => <td key={i}>{s}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {player.log.rows.length > 8 && (
                    <button type="button" className="pg-more" onClick={() => setShowAllGames((v) => !v)}>
                      {showAllGames ? 'Show fewer' : `Show all ${player.log.rows.length} games`}
                    </button>
                  )}
                </section>
              )}
              {trend && <TrendChart trend={trend} />}
            </div>

            {player.splits && (
              <section className="pg-card">
                <h2 className="pg-card-title">Splits</h2>
                <div className="pg-table-scroll">
                  <table className="pg-table">
                    <thead>
                      <tr>
                        <th className="left" />
                        {player.splits.labels.map((l, i) => <th key={i}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {player.splits.rows.map((r) => (
                        <tr key={r.name}>
                          <td className="left strong">{r.name}</td>
                          {r.stats.map((s, i) => <td key={i}>{s}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {!player.tiles.length && !player.log && !player.splits && (
              <div className="info">No stats yet this season.</div>
            )}
          </main>
          {openTile && boards[openTile.key] && (
            <LeaderboardModal
              board={boards[openTile.key]}
              player={{ ...player, headshot: player.headshot || ref.headshot }}
              playerTile={openTile}
              onClose={() => setOpenTile(null)}
              onOpenPlayer={(p) => {
                setOpenTile(null)
                onOpenPlayer?.(p)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
