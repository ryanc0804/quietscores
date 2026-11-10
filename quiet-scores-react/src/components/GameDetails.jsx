import { useMemo, useState } from 'react'
import { getDrives, getAllPlays, getPeriodConfig, isFootball, ordinal, periodName } from '../lib/gameDetails'

function Logo({ src, alt = '', size = 20 }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="gd-logo-fallback" style={{ width: size, height: size }} />
  return <img className="gd-logo" src={src} alt={alt} width={size} height={size} onError={() => setFailed(true)} />
}

/**
 * Football efficiency, away vs home (from getFootballEfficiency). Each row's
 * bar leans toward the better side; early-down pass rate is a style, not a
 * score, so its bar is neutral.
 */
export function FootballEfficiency({ efficiency, game, awayColor, homeColor }) {
  const away = efficiency?.[String(game.awayTeamId)]
  const home = efficiency?.[String(game.homeTeamId)]
  if (!away || !home || away.plays < 5 || home.plays < 5) return null
  const rate = (a, b) => (b ? (100 * a) / b : NaN)
  const pct = (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : '–')
  const rows = [
    { label: 'Success rate', a: rate(away.success, away.plays), h: rate(home.success, home.plays), fmt: pct },
    { label: 'Pass success rate', a: rate(away.passSuccess, away.passPlays), h: rate(home.passSuccess, home.passPlays), fmt: pct },
    { label: 'Rush success rate', a: rate(away.runSuccess, away.runPlays), h: rate(home.runSuccess, home.runPlays), fmt: pct },
    { label: 'Yards per play', a: away.yards / away.plays, h: home.yards / home.plays, fmt: (v) => v.toFixed(1) },
    { label: 'Explosive plays', a: away.explosive, h: home.explosive, fmt: String },
    { label: 'Early-down pass rate', a: rate(away.earlyPass, away.early), h: rate(home.earlyPass, home.early), fmt: pct, neutral: true },
  ]
  return (
    <Section title="Efficiency" right={<span className="gd-muted gd-eff-plays">{away.plays} – {home.plays} plays</span>}>
      <div className="gd-eff">
        <div className="gd-eff-teams">
          <span>{game.awayAbbreviation}</span>
          <span>{game.homeAbbreviation}</span>
        </div>
        {rows.map((r) => {
          const a = Number.isFinite(r.a) ? Math.max(0, r.a) : 0
          const h = Number.isFinite(r.h) ? Math.max(0, r.h) : 0
          const awayShare = a + h > 0 ? (100 * a) / (a + h) : 50
          return (
            <div key={r.label} className="gd-eff-row">
              <div className="gd-eff-values">
                <span className={!r.neutral && a > h ? 'lead' : ''}>{Number.isFinite(r.a) ? r.fmt(r.a) : '–'}</span>
                <span className="gd-muted">{r.label}</span>
                <span className={!r.neutral && h > a ? 'lead' : ''}>{Number.isFinite(r.h) ? r.fmt(r.h) : '–'}</span>
              </div>
              <div className={`gd-eff-bar ${r.neutral ? 'neutral' : ''}`}>
                <span style={{ width: `${awayShare}%`, background: r.neutral ? undefined : awayColor }} />
                <span style={{ background: r.neutral ? undefined : homeColor }} />
              </div>
            </div>
          )
        })}
        <p className="gd-eff-note gd-muted">
          A play is a success if it gains 40% of the yards needed on 1st down, 60% on 2nd, or all of them on 3rd and 4th.
          Explosive: runs of 10+ yards, passes of 20+.
        </p>
      </div>
    </Section>
  )
}

export function Section({ title, right, children, className = '' }) {
  return (
    <section className={`gd-card ${className}`}>
      {(title || right) && (
        <header className="gd-card-head">
          {title && <h3>{title}</h3>}
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

/* ───────────────────────── Linescore ───────────────────────── */

export function Linescore({ linescore }) {
  if (!linescore) return null
  const { periods, rows, extras } = linescore
  return (
    <div className="gd-linescore" role="table" aria-label="Score by period">
      <table>
        <thead>
          <tr>
            <th />
            {periods.map((p) => <th key={p}>{p}</th>)}
            <th className="gd-ls-total">{extras.length ? 'R' : 'T'}</th>
            {extras.map((e) => <th key={e.label} className="gd-ls-extra">{e.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.side}>
              <td className="gd-ls-team">{r.abbr}</td>
              {r.scores.map((s, i) => <td key={i}>{s}</td>)}
              <td className="gd-ls-total">{r.total}</td>
              {extras.map((e) => <td key={e.label} className="gd-ls-extra">{e.values[ri]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ───────────────────────── Football field ───────────────────────── */

export function FootballField({ situation, game, awayColor, homeColor }) {
  if (!situation || situation.yardLine == null) return null
  const awayHasBall = situation.possession && situation.possession === String(game.awayTeamId)
  const homeHasBall = situation.possession && situation.possession === String(game.homeTeamId)
  // yardLine is measured from the HOME goal line. Away end zone is drawn on the left.
  const ballFromLeft = 100 - situation.yardLine
  const dir = awayHasBall ? 1 : homeHasBall ? -1 : 0
  const firstDown = situation.distance && dir ? Math.max(0, Math.min(100, ballFromLeft + dir * situation.distance)) : null
  // Field is 120 units wide: 10 + 100 + 10.
  const pct = (yd) => `${((yd + 10) / 120) * 100}%`
  const offenseAbbr = awayHasBall ? game.awayAbbreviation : homeHasBall ? game.homeAbbreviation : null

  return (
    <div className="gd-field-wrap">
      <div className="gd-field-meta">
        <span className="gd-field-dd">
          {situation.downDistanceText || '—'}
          {situation.possessionText && <span className="gd-muted"> at {situation.possessionText}</span>}
        </span>
        {situation.isRedZone && <span className="gd-redzone">RED ZONE</span>}
      </div>
      <div className="gd-field" aria-label={`Ball at ${situation.possessionText || ''}`}>
        <div className="gd-endzone left" style={{ background: awayColor }}><span>{game.awayAbbreviation}</span></div>
        <div className="gd-endzone right" style={{ background: homeColor }}><span>{game.homeAbbreviation}</span></div>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <div key={yd} className="gd-yardline" style={{ left: pct(yd) }}>
            <span>{yd <= 50 ? yd : 100 - yd}</span>
          </div>
        ))}
        {firstDown != null && <div className="gd-firstdown" style={{ left: pct(firstDown) }} />}
        <div className="gd-scrimmage" style={{ left: pct(ballFromLeft) }} />
        <div
          className={`gd-ball ${dir > 0 ? 'to-right' : dir < 0 ? 'to-left' : ''}`}
          style={{ left: pct(ballFromLeft), '--team': awayHasBall ? awayColor : homeColor }}
          title={offenseAbbr ? `${offenseAbbr} ball` : 'Ball'}
        >
          {offenseAbbr && <span className="gd-ball-tag">{offenseAbbr}</span>}
        </div>
      </div>
      {situation.drive?.description && (
        <div className="gd-drive-line">
          <span className="gd-muted">Drive:</span> {situation.drive.description}
          {situation.drive.start && <span className="gd-muted"> · started {situation.drive.start}</span>}
        </div>
      )}
    </div>
  )
}

export function Timeouts({ count, max = 3 }) {
  if (count == null) return null
  return (
    <span className="gd-timeouts" aria-label={`${count} timeouts left`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < count ? 'on' : ''} />)}
    </span>
  )
}

/* ───────────────────────── Win probability ───────────────────────── */

// Team colors are often near-black or near-white; nudge them so the chart
// stays readable against the current theme's background.
function readableColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const light = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
  const mix = (t, amt) => [r, g, b].map((c) => Math.round(c + (t - c) * amt))
  if (!light && lum < 0.3) [r, g, b] = mix(255, 0.45 - lum)
  else if (light && lum > 0.75) [r, g, b] = mix(0, lum - 0.45)
  return `rgb(${r}, ${g}, ${b})`
}

export function WinProbability({ series, game, awayColor: rawAway, homeColor: rawHome, awayLogo, homeLogo }) {
  const [hover, setHover] = useState(null)
  if (!series?.length) return null
  const awayColor = readableColor(rawAway)
  const homeColor = readableColor(rawHome)
  const W = 600
  const H = 180
  const pad = 8
  const last = series[series.length - 1]
  const shown = hover != null ? series[hover] : last
  const xOf = (p) => pad + p.x * (W - pad * 2)
  // Top of chart = away 100%, bottom = home 100%.
  const yOf = (p) => pad + p.home * (H - pad * 2)
  const mid = H / 2
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${xOf(p).toFixed(1)},${yOf(p).toFixed(1)}`).join(' ')
  const area = `${line} L${xOf(last).toFixed(1)},${mid} L${xOf(series[0]).toFixed(1)},${mid} Z`
  const cfg = getPeriodConfig(game.sport)
  const ticks = cfg.minutes ? Array.from({ length: cfg.regulation - 1 }, (_, i) => (i + 1) / cfg.regulation) : []

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    let best = 0
    let bestD = Infinity
    series.forEach((p, i) => {
      const d = Math.abs(p.x - fx)
      if (d <= bestD) { bestD = d; best = i }
    })
    setHover(best)
  }

  const awayPct = Math.round(shown.away * 1000) / 10
  const homePct = Math.round(shown.home * 1000) / 10
  const favoredAway = shown.away >= shown.home

  return (
    <div className="gd-wp">
      <div className="gd-wp-top">
        <div className={`gd-wp-team ${favoredAway ? 'lead' : ''}`}>
          <Logo src={awayLogo} size={28} />
          <div>
            <b>{awayPct.toFixed(1)}%</b>
            <span><i style={{ background: awayColor }} />{game.awayAbbreviation}</span>
          </div>
        </div>
        <div className={`gd-wp-team right ${!favoredAway ? 'lead' : ''}`}>
          <div>
            <b>{homePct.toFixed(1)}%</b>
            <span>{game.homeAbbreviation}<i style={{ background: homeColor }} /></span>
          </div>
          <Logo src={homeLogo} size={28} />
        </div>
      </div>
      <svg
        className="gd-wp-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)}
        onTouchMove={(e) => onMove({ currentTarget: e.currentTarget, clientX: e.touches[0].clientX })}
        role="img"
        aria-label={`Win probability: ${game.awayAbbreviation} ${awayPct}%, ${game.homeAbbreviation} ${homePct}%`}
      >
        <defs>
          <clipPath id="wp-top"><rect x="0" y="0" width={W} height={mid} /></clipPath>
          <clipPath id="wp-bot"><rect x="0" y={mid} width={W} height={H - mid} /></clipPath>
        </defs>
        {ticks.map((t) => (
          <line key={t} x1={pad + t * (W - pad * 2)} x2={pad + t * (W - pad * 2)} y1={pad} y2={H - pad} className="gd-wp-grid" />
        ))}
        <line x1={pad} x2={W - pad} y1={mid} y2={mid} className="gd-wp-mid" />
        <path d={area} fill={awayColor} opacity="0.35" clipPath="url(#wp-top)" />
        <path d={area} fill={homeColor} opacity="0.35" clipPath="url(#wp-bot)" />
        <path d={line} className="gd-wp-line" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <line x1={xOf(shown)} x2={xOf(shown)} y1={pad} y2={H - pad} className="gd-wp-cursor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {cfg.minutes && (
        <div className="gd-wp-axis">
          {Array.from({ length: cfg.regulation }, (_, i) => <span key={i}>{cfg.label(i + 1)}</span>)}
        </div>
      )}
      {shown.text && (
        <div className="gd-wp-play">
          {shown.period ? (
            <span className="gd-muted">
              {shown.clock ? `${shown.clock} · ` : ''}
              {game.sport === 'mlb' || shown.period > cfg.regulation ? cfg.label(shown.period) : ordinal(shown.period)} —{' '}
            </span>
          ) : null}
          {shown.text}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Scoring summary ───────────────────────── */

function teamSide(game, teamId) {
  if (teamId == null) return null
  if (String(teamId) === String(game.awayTeamId)) return 'away'
  if (String(teamId) === String(game.homeTeamId)) return 'home'
  return null
}

export function ScoringSummary({ plays, game, awayLogo, homeLogo }) {
  const grouped = useMemo(() => {
    const map = new Map()
    for (const p of plays || []) {
      const period = p.period?.number ?? p.period ?? 0
      if (!map.has(period)) map.set(period, [])
      map.get(period).push(p)
    }
    return [...map.entries()]
  }, [plays])
  if (!grouped.length) return null

  return (
    <div className="gd-scoring">
      {grouped.map(([period, list]) => (
        <div key={period}>
          <div className="gd-period-label">{periodName(game.sport, period)}</div>
          {list.map((p, i) => {
            const side = teamSide(game, p.team?.id)
            return (
              <div key={p.id ?? i} className="gd-score-row">
                <Logo src={side === 'away' ? awayLogo : side === 'home' ? homeLogo : p.team?.logo} size={22} />
                <div className="gd-score-text">
                  <div className="gd-score-type">
                    {p.type?.abbreviation || p.type?.text}
                    {p.clock?.displayValue && <span className="gd-muted"> · {p.clock.displayValue}</span>}
                  </div>
                  <div>{p.text?.trim()}</div>
                </div>
                <div className="gd-score-tally">
                  <span className={side === 'away' ? 'hl' : ''}>{p.awayScore}</span>
                  <span className="gd-muted">–</span>
                  <span className={side === 'home' ? 'hl' : ''}>{p.homeScore}</span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────── Play-by-play ───────────────────────── */

function PlayRow({ play, game, showScore }) {
  const side = teamSide(game, play.team?.id ?? play.start?.team?.id)
  return (
    <li className={`gd-play ${play.scoringPlay ? 'is-scoring' : ''} ${side ? `side-${side}` : ''}`}>
      <span className="gd-play-clock">{play.clock?.displayValue || ''}</span>
      <div className="gd-play-body">
        {play.start?.downDistanceText && <div className="gd-play-dd">{play.start.downDistanceText}</div>}
        {!play.start?.downDistanceText && side && (
          <span className="gd-play-team">{side === 'away' ? game.awayAbbreviation : game.homeAbbreviation}</span>
        )}
        <div>{play.text?.trim() || play.type?.text}</div>
      </div>
      {showScore && (play.scoringPlay || play.scoreValue > 0) && (
        <span className="gd-play-score">{play.awayScore}–{play.homeScore}</span>
      )}
    </li>
  )
}

function FootballDrives({ summary, game, awayLogo, homeLogo, scoringOnly }) {
  const drives = useMemo(() => getDrives(summary).slice().reverse(), [summary])
  const [open, setOpen] = useState(() => new Set(drives[0] ? [drives[0].id] : []))
  const list = scoringOnly ? drives.filter((d) => d.isScore) : drives
  if (!list.length) return <div className="gd-empty">{scoringOnly ? 'No scoring drives yet.' : 'No plays yet.'}</div>

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <ul className="gd-drives">
      {list.map((d) => {
        const side = teamSide(game, d.team?.id)
        const isOpen = open.has(d.id)
        const plays = (d.plays || []).slice().reverse()
        const lastPlay = d.plays?.[d.plays.length - 1]
        return (
          <li key={d.id} className={`gd-drive ${d.isScore ? 'is-score' : ''} ${d.isCurrent ? 'is-current' : ''}`}>
            <button className="gd-drive-head" onClick={() => toggle(d.id)} aria-expanded={isOpen}>
              <Logo src={side === 'away' ? awayLogo : side === 'home' ? homeLogo : d.team?.logos?.[0]?.href} size={24} />
              <div className="gd-drive-title">
                <b>{d.isCurrent ? 'Current drive' : d.displayResult || d.result || 'Drive'}</b>
                <span className="gd-muted">{d.description}</span>
              </div>
              {lastPlay && (
                <span className="gd-drive-score">{lastPlay.awayScore}–{lastPlay.homeScore}</span>
              )}
              <span className={`gd-caret ${isOpen ? 'open' : ''}`}>▾</span>
            </button>
            {isOpen && (
              <ol className="gd-plays">
                {plays.map((p, i) => <PlayRow key={p.id ?? i} play={p} game={game} />)}
              </ol>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function PeriodPlays({ summary, game, scoringOnly }) {
  const plays = useMemo(() => getAllPlays(summary, game.sport), [summary, game.sport])
  const periods = useMemo(() => {
    const set = new Set(plays.map((p) => p.period?.number ?? 0))
    return [...set].sort((a, b) => a - b)
  }, [plays])
  const [period, setPeriod] = useState(null)
  const active = period != null && periods.includes(period) ? period : periods[periods.length - 1]
  const cfg = getPeriodConfig(game.sport)

  const list = plays
    .filter((p) => (p.period?.number ?? 0) === active)
    .filter((p) => !scoringOnly || p.scoringPlay)
    .reverse()

  if (!plays.length) return <div className="gd-empty">No plays yet.</div>

  return (
    <>
      <div className="gd-chips" role="tablist">
        {periods.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={p === active}
            className={`gd-chip ${p === active ? 'active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {game.sport === 'mlb' ? ordinal(p) : cfg.label(p)}
          </button>
        ))}
      </div>
      {list.length ? (
        <ol className="gd-plays">
          {list.map((p, i) => <PlayRow key={p.id ?? i} play={p} game={game} showScore />)}
        </ol>
      ) : (
        <div className="gd-empty">No {scoringOnly ? 'scoring plays' : 'plays'} in this period.</div>
      )}
    </>
  )
}

export function PlayByPlay({ summary, game, awayLogo, homeLogo }) {
  const [scoringOnly, setScoringOnly] = useState(false)
  return (
    <Section
      title="Play-by-Play"
      right={
        <label className="gd-toggle">
          <input type="checkbox" checked={scoringOnly} onChange={(e) => setScoringOnly(e.target.checked)} />
          <span>Scoring only</span>
        </label>
      }
    >
      {isFootball(game.sport) ? (
        <FootballDrives summary={summary} game={game} awayLogo={awayLogo} homeLogo={homeLogo} scoringOnly={scoringOnly} />
      ) : (
        <PeriodPlays summary={summary} game={game} scoringOnly={scoringOnly} />
      )}
    </Section>
  )
}

/* ───────────────────────── Injuries ───────────────────────── */

export function InjuryReport({ injuries, game }) {
  if (!injuries?.length) return null
  // Away team first to match the rest of the page.
  const ordered = [...injuries].sort((a) => (a.teamId === String(game.awayTeamId) ? -1 : 1))
  return (
    <Section title="Injury Report">
      <div className="gd-injuries">
        {ordered.map((t) => (
          <div key={t.teamId} className="gd-inj-team">
            <div className="gd-inj-team-head">
              <Logo src={t.logo} size={20} />
              <b>{t.team}</b>
            </div>
            <ul>
              {t.items.slice(0, 8).map((i) => (
                <li key={i.id || i.name}>
                  <div className="gd-inj-name">
                    {i.name} <span className="gd-muted">{i.position}</span>
                    {i.detail && <div className="gd-inj-detail">{i.detail}</div>}
                  </div>
                  <span className={`gd-inj-status s-${(i.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{i.status}</span>
                </li>
              ))}
            </ul>
            {t.items.length > 8 && <div className="gd-muted gd-small">+{t.items.length - 8} more</div>}
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ───────────────────────── Game info ───────────────────────── */

export function GameInfo({ rows }) {
  if (!rows?.length) return null
  return (
    <Section title="Game Info">
      <dl className="gd-info">
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

/* ───────────────────────── Tabs ───────────────────────── */

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="gd-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`gd-tab ${t.id === active ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
