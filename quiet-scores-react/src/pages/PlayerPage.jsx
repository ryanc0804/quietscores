import { useEffect, useMemo, useState } from 'react'
import { fetchPlayer, trendFor, SPORT_LABEL } from '../lib/players'
import { heroColors } from './heroColor'
import { SummarySkeleton } from '../components/Skeletons'
import { findRank, formatRank, isCurrentSeason, leaderboardFor, seasonYear } from '../lib/leaders'
import { fetchAdvanced } from '../lib/advanced'
import { fetchCareer } from '../lib/career'
import { PlayerLastGame } from '../components/PlayerLastGame'
import { PercentileTrack } from '../components/PercentileBars'

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

// ESPN's player-page rank matches its leaderboards except in college
// basketball (a different pool) and on boards ranked here (QB interceptions,
// W-L shown as wins); there the tile rank is looked up on the leaderboard so
// the two always agree.
function usesSummaryRank(sport, tile, board) {
  return Boolean(tile.rankFull) && sport !== 'college-basketball' && !board?.ownRank && !board?.aliased
}

// A column is worth showing if any game has something in it ("0", "0.0" and
// "-" in every game means the player doesn't do that: a WR's rushing).
const EMPTY_CELL = /^(?:0|0\.0+|-|–|0-0|)$/
function gameLogColumns(log) {
  const cols = log.labels.map((_, i) => i).filter((i) => log.rows.some((r) => !EMPTY_CELL.test(String(r.stats[i] ?? '').trim())))
  const visible = cols.length ? cols : log.labels.map((_, i) => i)
  // Group labels over the kept columns, only when more than one group is left.
  let start = 0
  const groups = (log.groups || [])
    .map((g) => {
      const span = visible.filter((i) => i >= start && i < start + g.count).length
      start += g.count
      return { label: g.label, span }
    })
    .filter((g) => g.span > 0)
  return { visible, groups: groups.length > 1 ? groups : null }
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

export function PlayerPage({ player: ref, onBack, onOpenTeam, onOpenLeaderboard }) {
  const [player, setPlayer] = useState(null)
  const [error, setError] = useState(null)
  const [showAllGames, setShowAllGames] = useState(false)
  const [boards, setBoards] = useState({}) // tile key → leaderboard, for tiles that have one
  const [foundRanks, setFoundRanks] = useState({}) // tile key → { rank } | { reason }, when ESPN gave none
  const [career, setCareer] = useState(null)
  const [advanced, setAdvanced] = useState(null)
  const [careerTab, setCareerTab] = useState(null)

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
        leaderboardFor(player.sport, t.key, player.positionAbbr, player.seasonLabel)
          .then((b) => [t.key, b])
          .catch(() => [t.key, null]),
      ),
    ).then((pairs) => {
      if (cancelled) return
      const found = Object.fromEntries(pairs.filter(([, b]) => b))
      setBoards(found)
      // ESPN leaves some ranks off the player page (all of college basketball,
      // unqualified rate stats); look those up on the leaderboard itself.
      for (const t of player.tiles) {
        if (!found[t.key] || usesSummaryRank(player.sport, t, found[t.key])) continue
        findRank(found[t.key], player.id)
          .then((r) => !cancelled && setFoundRanks((prev) => ({ ...prev, [t.key]: r })))
          .catch(() => {})
      }
    })
    return () => {
      cancelled = true
    }
  }, [player])

  // Advanced stats (NFL, MLB) for the current season only: an inactive
  // player's page shows last season, which these lists don't cover.
  useEffect(() => {
    if (!player || !['nfl', 'mlb'].includes(player.sport)) return
    let cancelled = false
    ;(async () => {
      if (!(await isCurrentSeason(player.sport, player.seasonLabel))) return
      const adv = await fetchAdvanced(player, await seasonYear(player.sport))
      if (!cancelled) setAdvanced(adv)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [player])

  useEffect(() => {
    if (!player) return
    const controller = new AbortController()
    fetchCareer(player.sport, player.id, player.positionAbbr, { signal: controller.signal })
      .then((c) => {
        setCareer(c)
        setCareerTab(c?.defaultKey ?? null)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [player])

  // Rank shown on a tile: ESPN's own, or one we looked up.
  const tileRank = (t) => (usesSummaryRank(player.sport, t, boards[t.key]) ? { rank: formatRank(t.rankFull) } : foundRanks[t.key] || null)

  const openLeaderboard = (t) => {
    const tiles = Object.fromEntries(
      player.tiles.filter((x) => boards[x.key]).map((x) => [boards[x.key].stat, { value: x.value, ...(tileRank(x) || {}) }]),
    )
    onOpenLeaderboard({
      board: boards[t.key],
      position: player.positionAbbr,
      player: { id: player.id, name: player.name, headshot: player.headshot || ref.headshot },
      tiles,
    })
  }
  const activeCareer = career?.tabs.find((c) => c.key === careerTab) || career?.tabs[0]

  const openAdvancedBoard = (t) => {
    const tiles = Object.fromEntries(advanced.tiles.filter((x) => x.board).map((x) => [x.board.stat, { value: x.value, rank: x.rank, reason: x.reason }]))
    onOpenLeaderboard({
      board: t.board,
      position: player.positionAbbr,
      player: { id: player.id, mlbId: advanced.mlbId, name: player.name, headshot: player.headshot || ref.headshot },
      tiles,
    })
  }

  const trend = useMemo(() => trendFor(player), [player])
  const logCols = useMemo(() => (player?.log ? gameLogColumns(player.log) : null), [player])
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
              </div>
              {(player.bio.length > 0 || player.log?.rows?.length > 0) && (
                <dl className="pp-bio">
                  {player.bio.map((b) => (
                    <div key={b.label}>
                      <dt>{b.label}</dt>
                      <dd>{b.value}</dd>
                    </div>
                  ))}
                  <PlayerLastGame player={player} />
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
                    const board = boards[t.key]
                    const r = board ? tileRank(t) : null
                    const rankText = r?.rank ? `${r.rank} in ${SPORT_LABEL[player.sport]}` : r?.reason
                    const body = (
                      <>
                        <div className="pp-tile-label">{t.label}</div>
                        <div className="pp-tile-value">{t.value}</div>
                        {board ? (
                          rankText && <div className={`pp-tile-rank ${r?.rank ? '' : 'muted'}`}>{rankText}</div>
                        ) : (
                          t.rank && <div className="pp-tile-rank">{t.rank} in league</div>
                        )}
                        {t.pace && <div className="pp-tile-pace" title={`On pace for ${t.pace} over 17 games (season total ÷ games played × 17)`}>Pace {t.pace}</div>}
                      </>
                    )
                    return board ? (
                      <button
                        key={t.key}
                        type="button"
                        className="pg-card pp-tile clickable"
                        onClick={() => openLeaderboard(t)}
                        aria-label={`${t.label} ${t.value}${rankText ? `, ${rankText}` : ''}. Show league leaderboard`}
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

            {advanced && (
              <section>
                <h2 className="pg-section-title">
                  Advanced{' '}
                  <span className="pp-adv-source">
                    via {advanced.source}
                    {advanced.updated && ` · updated ${new Date(advanced.updated.replace(/ E[SD]T$/, '').replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </span>
                </h2>
                <div className="pp-tiles">
                  {advanced.tiles.map((t) => {
                    const rankText = t.rank ? `${t.rank} in ${SPORT_LABEL[player.sport]}` : t.reason
                    const pct = Number.isFinite(t.percentile) ? `, ${t.percentile}th percentile` : ''
                    const body = (
                      <>
                        <div className="pp-tile-label">{t.label}</div>
                        <div className="pp-tile-value">{t.value}</div>
                        {rankText && <div className={`pp-tile-rank ${t.rank ? '' : 'muted'}`}>{rankText}</div>}
                        <PercentileTrack percentile={t.percentile} />
                      </>
                    )
                    return t.board ? (
                      <button key={t.key} type="button" className="pg-card pp-tile clickable" title={t.desc || undefined}
                        onClick={() => openAdvancedBoard(t)} aria-label={`${t.label} ${t.value}${rankText ? `, ${rankText}` : ''}${pct}. Show league leaderboard`}>
                        {body}
                      </button>
                    ) : (
                      <div key={t.key} className="pg-card pp-tile" title={t.desc || undefined}>{body}</div>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="pg-two-col pp-log-row">
              {player.log && (
                <section className="pg-card pg-col-main">
                  <div className="pg-card-head">
                    <h2 className="pg-card-title">Game log</h2>
                    <span className="pg-muted">{player.log.season}</span>
                  </div>
                  <div className="pg-table-scroll">
                    <table className="pg-table">
                      <thead>
                        {logCols.groups && (
                          <tr className="pp-log-groups">
                            <th colSpan={3} />
                            {logCols.groups.map((g) => (
                              <th key={g.label} colSpan={g.span}>{g.label}</th>
                            ))}
                          </tr>
                        )}
                        <tr>
                          <th className="left">Date</th>
                          <th className="left">Opp</th>
                          <th className="left">Result</th>
                          {logCols.visible.map((i) => (
                            <th key={i} title={player.log.displayNames[i] || undefined}>{player.log.labels[i]}</th>
                          ))}
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
                            {logCols.visible.map((i) => <td key={i}>{r.stats[i]}</td>)}
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

            {activeCareer && (
              <section className="pg-card">
                <div className="pg-card-head">
                  <h2 className="pg-card-title">Career</h2>
                  {career.tabs.length > 1 && (
                    <div className="pp-career-tabs" role="tablist" aria-label="Career stat type">
                      {career.tabs.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          role="tab"
                          aria-selected={c.key === activeCareer.key}
                          className={c.key === activeCareer.key ? 'active' : ''}
                          onClick={() => setCareerTab(c.key)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pg-table-scroll">
                  <table className="pg-table">
                    <thead>
                      <tr>
                        <th className="left">Season</th>
                        <th className="left">Team</th>
                        {activeCareer.labels.map((l, i) => <th key={i}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {activeCareer.rows.map((r, n) => (
                        <tr key={`${r.season}-${r.team}-${n}`} className={r.subtotal ? 'pp-career-subtotal' : ''}>
                          <td className="left strong">{r.season}</td>
                          <td className="left">
                            <span className="pp-career-team">
                              {r.logo && <img src={r.logo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                              {r.team}
                            </span>
                          </td>
                          {r.stats.map((s, i) => <td key={i}>{s}</td>)}
                        </tr>
                      ))}
                    </tbody>
                    {activeCareer.totals && (
                      <tfoot>
                        <tr>
                          <td className="left strong" colSpan={2}>Career</td>
                          {activeCareer.totals.map((s, i) => <td key={i} className="strong">{s}</td>)}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
            )}

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
        </>
      )}
    </div>
  )
}
