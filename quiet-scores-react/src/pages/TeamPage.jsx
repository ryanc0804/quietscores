import { useEffect, useMemo, useState } from 'react'
import { fetchStandings, fetchTeamInfo, fetchTeamRoster, fetchTeamSchedule, filterStandingsByTeams } from '../lib/espnApi'
import { parseSchedule } from '../lib/schedule'
import { SPORT_LABEL } from '../lib/players'
import { heroColors } from './heroColor'
import { SummarySkeleton } from '../components/Skeletons'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'roster', label: 'Roster' },
  { id: 'standings', label: 'Standings' },
]

function Logo({ src, alt = '', className = '' }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className={`pg-logo-fallback ${className}`} aria-hidden="true" />
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />
}

function formatWhen(iso, withTime = true) {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (!withTime) return date
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

const GROUP_NAMES = {
  offense: 'Offense',
  defense: 'Defense',
  specialTeam: 'Special Teams',
  injuredReserveOrOut: 'Injured Reserve / Out',
  suspended: 'Suspended',
  practiceSquad: 'Practice Squad',
}

function rosterGroupsFrom(roster) {
  const athletes = roster?.athletes || []
  if (athletes[0]?.items) {
    return athletes
      .map((g) => {
        const raw = g.position || g.name || 'Players'
        return { name: GROUP_NAMES[raw] || raw, players: g.items || [] }
      })
      .filter((g) => g.players.length)
  }
  const grouped = {}
  for (const p of athletes) {
    const pos = p.position?.displayName || p.position?.name || 'Players'
    ;(grouped[pos] ||= []).push(p)
  }
  return Object.entries(grouped).map(([name, players]) => ({ name, players }))
}

function StandingsTable({ group, teamId, compact }) {
  const entries = group.standings?.entries || []
  const stat = (e, n) => e.stats?.find((s) => s.name === n)
  return (
    <table className="pg-table">
      <thead>
        <tr>
          <th className="left">{compact ? group.name : 'Team'}</th>
          <th>W</th>
          <th>L</th>
          <th>PCT</th>
          {!compact && <th>GB</th>}
          {!compact && <th>STRK</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const us = String(e.team?.id) === String(teamId)
          return (
            <tr key={e.team?.id} className={us ? 'pg-row-us' : ''}>
              <td className="left">
                <span className="pg-team-cell">
                  <Logo src={e.team?.logos?.[0]?.href} className="pg-team-cell-logo" />
                  <span className={us ? 'strong' : ''}>{compact ? e.team?.abbreviation || e.team?.shortDisplayName : e.team?.displayName}</span>
                </span>
              </td>
              <td>{stat(e, 'wins')?.displayValue ?? '-'}</td>
              <td>{stat(e, 'losses')?.displayValue ?? '-'}</td>
              <td>{stat(e, 'winPercent')?.displayValue ?? '-'}</td>
              {!compact && <td>{stat(e, 'gamesBehind')?.displayValue ?? '-'}</td>}
              {!compact && <td>{stat(e, 'streak')?.displayValue ?? '-'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function TeamPage({ team, onBack, isFavorite, onToggleFavorite, onOpenPlayer }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    // The page is keyed per team in App, so state starts fresh for each one.
    let cancelled = false
    Promise.all([
      fetchTeamInfo(team.sport, team.teamId),
      fetchTeamRoster(team.sport, team.teamId),
      fetchTeamSchedule(team.sport, team.teamId),
      fetchStandings(team.sport),
    ]).then(([info, roster, schedule, standings]) => {
      if (cancelled) return
      const t = info?.team
      let division = null
      if (standings) {
        division = filterStandingsByTeams(standings, {
          ids: [String(team.teamId)],
          names: [team.teamName, t?.displayName].filter(Boolean),
          abbrs: [team.teamAbbreviation, t?.abbreviation].filter(Boolean),
        })
      }
      setData({ info: t, roster, schedule, division })
    })
    return () => {
      cancelled = true
    }
  }, [team.sport, team.teamId, team.teamName, team.teamAbbreviation])

  const t = data?.info
  const games = useMemo(() => parseSchedule(data?.schedule, team.teamId), [data, team.teamId])
  const played = games.filter((g) => g.completed)
  const upcoming = games.filter((g) => !g.completed).sort((a, b) => new Date(a.date) - new Date(b.date))
  const rosterGroups = useMemo(() => rosterGroupsFrom(data?.roster), [data])

  const name = t?.displayName || team.teamName
  const logo = t?.logos?.[0]?.href || team.teamLogo
  const colors = heroColors(t?.color ? `#${t.color}` : null, t?.alternateColor ? `#${t.alternateColor}` : null)
  const records = t?.record?.items || []
  const total = records.find((r) => r.type === 'total') || records[0]
  const home = records.find((r) => r.type === 'home')
  const road = records.find((r) => r.type === 'road' || r.type === 'away')
  const favorite = !!isFavorite?.(team.sport, team.teamId)
  const next = upcoming[0]

  const scoring = useMemo(() => {
    const withScores = played.filter((g) => g.ours != null && g.theirs != null)
    if (!withScores.length) return null
    const pf = withScores.reduce((s, g) => s + g.ours, 0)
    const pa = withScores.reduce((s, g) => s + g.theirs, 0)
    const n = withScores.length
    const close = withScores.filter((g) => Math.abs(g.ours - g.theirs) <= (team.sport === 'nfl' || team.sport === 'college-football' ? 8 : team.sport === 'nba' || team.sport === 'college-basketball' ? 5 : 1))
    const closeW = close.filter((g) => g.result === 'W').length
    return {
      pf, pa, n,
      pfPer: (pf / n).toFixed(1),
      paPer: (pa / n).toFixed(1),
      diff: pf - pa,
      close: `${closeW}-${close.length - closeW}`,
    }
  }, [played, team.sport])

  const streak = useMemo(() => {
    if (!played.length) return null
    const last = played[played.length - 1].result
    let n = 0
    for (let i = played.length - 1; i >= 0 && played[i].result === last; i--) n++
    return last === 'W' ? `Won ${n}` : last === 'L' ? `Lost ${n}` : null
  }, [played])

  const pointsWord = team.sport === 'nhl' ? 'Goals' : team.sport === 'mlb' ? 'Runs' : 'Points'
  const groupLabel = data?.division?.groups?.[0]?.name

  const openPlayer = (p) => onOpenPlayer?.({ athleteId: String(p.id), sport: team.sport, name: p.displayName || p.fullName, headshot: p.headshot?.href })

  if (!data) {
    return (
      <div className="pg-page">
        <div className="pg-wrap">
          <button className="back-btn" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
          <SummarySkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="pg-page">
      <section className="pg-hero" style={{ '--hero': colors.base, '--hero-deep': colors.deep }}>
        <div className="pg-wrap">
          <button className="pg-back" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            Back
          </button>
          <div className="tp-hero-main">
            <div className="tp-hero-id">
              <span className="tp-logo-tile"><Logo src={logo} alt={`${name} logo`} /></span>
              <div>
                <span className="pg-eyebrow">{[SPORT_LABEL[team.sport], groupLabel].filter(Boolean).join(' · ')}</span>
                <h1 className="pg-title">{name}</h1>
                <div className="tp-hero-record">
                  {total?.summary && <b>{total.summary}</b>}
                  {t?.standingSummary && <span>{t.standingSummary}</span>}
                  {home?.summary && <span className="dim">Home {home.summary}</span>}
                  {road?.summary && <span className="dim">Away {road.summary}</span>}
                </div>
              </div>
            </div>
            <div className="tp-hero-actions">
              {next && (
                <div className="pg-next">
                  <span className="pg-next-label">Next game{next.week ? ` · Week ${next.week}` : ''}</span>
                  <span className="pg-next-name">{next.home ? 'vs' : '@'} {next.opponent}</span>
                  <span className="pg-next-when">{formatWhen(next.date)}</span>
                </div>
              )}
              {onToggleFavorite && (
                <button
                  type="button"
                  className={`tp-follow ${favorite ? 'on' : ''}`}
                  aria-pressed={favorite}
                  onClick={() => onToggleFavorite({ sport: team.sport, teamId: team.teamId, name, logo, abbreviation: t?.abbreviation || team.teamAbbreviation })}
                >
                  {favorite ? '★ Following' : '☆ Follow'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <nav className="pg-tabs" aria-label="Team sections">
        <div className="pg-wrap pg-tabs-inner" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={`pg-tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="pg-wrap pg-main">
        {tab === 'overview' && (
          <div className="pg-two-col">
            <div className="pg-col-main pg-stack">
              {played.length > 0 && (
                <section className="pg-card">
                  <div className="pg-card-head">
                    <h2 className="pg-card-title">Season so far</h2>
                    <span className="pg-muted">{[total?.summary, streak].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="tp-form">
                    {played.slice(-10).map((g) => (
                      <div key={g.id} className="tp-form-game" title={`${g.home ? 'vs' : '@'} ${g.opponent}`}>
                        <span className="tp-form-when">{g.week ? `WK ${g.week}` : formatWhen(g.date, false).split(', ')[1]}</span>
                        <span className={`tp-form-badge ${g.result === 'W' ? 'w' : g.result === 'L' ? 'l' : ''}`}>{g.result}</span>
                        <span className="tp-form-opp">{g.home ? '' : '@ '}{g.opponentShort}</span>
                        <span className="tp-form-score">{g.ours}-{g.theirs}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {scoring && (
                <section className="tp-stat-row">
                  <div className="pg-card tp-stat">
                    <div className="tp-stat-label">{pointsWord} per game</div>
                    <div className="tp-stat-value">{scoring.pfPer}</div>
                    <div className="pg-muted">{scoring.pf} total</div>
                  </div>
                  <div className="pg-card tp-stat">
                    <div className="tp-stat-label">Allowed per game</div>
                    <div className="tp-stat-value">{scoring.paPer}</div>
                    <div className="pg-muted">{scoring.pa} total</div>
                  </div>
                  <div className="pg-card tp-stat">
                    <div className="tp-stat-label">Differential</div>
                    <div className={`tp-stat-value ${scoring.diff > 0 ? 'pg-win' : scoring.diff < 0 ? 'pg-loss' : ''}`}>
                      {scoring.diff > 0 ? '+' : ''}{scoring.diff}
                    </div>
                    <div className="pg-muted">{scoring.close} in close games</div>
                  </div>
                </section>
              )}

              {upcoming.length > 0 && (
                <section className="pg-card">
                  <div className="pg-card-head">
                    <h2 className="pg-card-title">Upcoming</h2>
                    <button type="button" className="pg-link" onClick={() => setTab('schedule')}>Full schedule</button>
                  </div>
                  <ul className="pg-list">
                    {upcoming.slice(0, 5).map((g) => (
                      <li key={g.id} className="tp-upcoming">
                        <span className="pg-muted tp-up-wk">{g.week ? `WEEK ${g.week}` : formatWhen(g.date, false)}</span>
                        <span className="tp-up-opp">
                          <Logo src={g.opponentLogo} className="pg-team-cell-logo" />
                          {g.home ? 'vs' : '@'} {g.opponent}
                        </span>
                        <span className="pg-muted">{formatWhen(g.date)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <aside className="pg-stack">
              {(home || road) && (
                <section className="pg-card">
                  <h2 className="pg-card-title">Splits</h2>
                  <dl className="pg-dl">
                    {total?.summary && <div><dt>Overall</dt><dd>{total.summary}</dd></div>}
                    {home?.summary && <div><dt>Home</dt><dd>{home.summary}</dd></div>}
                    {road?.summary && <div><dt>Away</dt><dd>{road.summary}</dd></div>}
                    {scoring && <div><dt>Close games</dt><dd>{scoring.close}</dd></div>}
                  </dl>
                </section>
              )}
              {data.division?.groups?.[0] && (
                <section className="pg-card">
                  <div className="pg-card-head">
                    <h2 className="pg-card-title">Standings</h2>
                    <button type="button" className="pg-link" onClick={() => setTab('standings')}>Full</button>
                  </div>
                  <StandingsTable group={data.division.groups[0]} teamId={team.teamId} compact />
                </section>
              )}
            </aside>
          </div>
        )}

        {tab === 'schedule' && (
          <section className="pg-card">
            <h2 className="pg-card-title">Schedule</h2>
            {games.length === 0 ? (
              <div className="pg-muted">No schedule available.</div>
            ) : (
              <ul className="pg-list">
                {games.map((g) => (
                  <li key={g.id} className="tp-sched">
                    <span className="pg-muted tp-sched-when">{g.week ? `WK ${g.week} · ` : ''}{formatWhen(g.date, false)}</span>
                    <span className="tp-up-opp">
                      <Logo src={g.opponentLogo} className="pg-team-cell-logo" />
                      {g.home ? 'vs' : '@'} {g.opponent}
                    </span>
                    {g.completed ? (
                      <span className="tp-sched-result">
                        <b className={g.result === 'W' ? 'pg-win' : g.result === 'L' ? 'pg-loss' : ''}>{g.result}</b> {g.ours}-{g.theirs}
                      </span>
                    ) : (
                      <span className="pg-muted">{formatWhen(g.date).split(' · ')[1] || g.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'roster' && (
          <div className="pg-stack">
            {rosterGroups.length === 0 && <div className="pg-card pg-muted">No roster available.</div>}
            {rosterGroups.map((g) => (
              <section key={g.name} className="pg-card">
                <h2 className="pg-card-title">{g.name}</h2>
                <div className="pg-table-scroll">
                  <table className="pg-table">
                    <thead>
                      <tr>
                        <th className="left">Player</th>
                        <th>#</th>
                        <th>POS</th>
                        <th>AGE</th>
                        <th>HT</th>
                        <th>WT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.players.map((p) => (
                        <tr key={p.id || p.displayName}>
                          <td className="left">
                            <button type="button" className="tp-player-btn" onClick={() => openPlayer(p)} disabled={!p.id}>
                              <Logo src={p.headshot?.href} className="tp-player-head" />
                              <span>{p.displayName || p.fullName}</span>
                              {p.injuries?.[0]?.status && <span className="pg-badge-out sm">{p.injuries[0].status}</span>}
                            </button>
                          </td>
                          <td>{p.jersey || '-'}</td>
                          <td>{p.position?.abbreviation || '-'}</td>
                          <td>{p.age || '-'}</td>
                          <td>{p.displayHeight || '-'}</td>
                          <td>{p.displayWeight || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        {tab === 'standings' && (
          <div className="pg-stack">
            {!data.division?.groups?.length && <div className="pg-card pg-muted">No standings available.</div>}
            {data.division?.groups?.map((g) => (
              <section key={g.name} className="pg-card">
                <h2 className="pg-card-title">{g.name}</h2>
                <div className="pg-table-scroll">
                  <StandingsTable group={g} teamId={team.teamId} />
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
