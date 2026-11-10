// Pure helpers that turn an ESPN /summary response into the shapes the
// game-detail components render. Kept free of React so they're easy to test.

const FOOTBALL = new Set(['nfl', 'college-football'])

export function isFootball(sport) {
  return FOOTBALL.has(sport)
}

// Regulation periods per sport and how to label them.
const PERIOD_CONFIG = {
  nfl: { regulation: 4, minutes: 15, label: (n) => (n <= 4 ? String(n) : n === 5 ? 'OT' : `${n - 4}OT`) },
  'college-football': { regulation: 4, minutes: 15, label: (n) => (n <= 4 ? String(n) : n === 5 ? 'OT' : `${n - 4}OT`) },
  nba: { regulation: 4, minutes: 12, label: (n) => (n <= 4 ? String(n) : n === 5 ? 'OT' : `${n - 4}OT`) },
  'college-basketball': { regulation: 2, minutes: 20, label: (n) => (n <= 2 ? String(n) : n === 3 ? 'OT' : `${n - 2}OT`) },
  nhl: { regulation: 3, minutes: 20, label: (n) => (n <= 3 ? String(n) : n === 4 ? 'OT' : 'SO') },
  mlb: { regulation: 9, minutes: null, label: (n) => String(n) },
}

export function getPeriodConfig(sport) {
  return PERIOD_CONFIG[sport] || { regulation: 4, minutes: null, label: (n) => String(n) }
}

export function ordinal(n) {
  const num = Number(n)
  if (!num) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = num % 100
  return num + (s[(v - 20) % 10] || s[v] || s[0])
}

export function periodName(sport, n) {
  const num = Number(n)
  if (!num) return ''
  const cfg = getPeriodConfig(sport)
  if (num > cfg.regulation) return cfg.label(num)
  if (sport === 'mlb') return `${ordinal(num)} Inning`
  if (sport === 'college-basketball') return `${ordinal(num)} Half`
  if (sport === 'nhl') return `${ordinal(num)} Period`
  return `${ordinal(num)} Quarter`
}

function competitorsOf(summary) {
  return summary?.header?.competitions?.[0]?.competitors || []
}

/**
 * Period-by-period scores from the summary header.
 * Returns null when no linescore data is available.
 */
export function buildLinescore(summary, game) {
  const comps = competitorsOf(summary)
  const away = comps.find((c) => c.homeAway === 'away')
  const home = comps.find((c) => c.homeAway === 'home')
  const awayLs = away?.linescores || []
  const homeLs = home?.linescores || []
  if (!awayLs.length && !homeLs.length) return null

  const cfg = getPeriodConfig(game.sport)
  const count = Math.max(cfg.regulation, awayLs.length, homeLs.length)
  const val = (ls, i) => {
    const entry = ls[i]
    if (entry == null) return '-'
    const v = entry.displayValue ?? entry.value
    return v == null ? '-' : String(v)
  }

  const periods = Array.from({ length: count }, (_, i) => cfg.label(i + 1))
  const rows = [
    { side: 'away', abbr: game.awayAbbreviation, scores: periods.map((_, i) => val(awayLs, i)), total: away?.score ?? game.awayScore },
    { side: 'home', abbr: game.homeAbbreviation, scores: periods.map((_, i) => val(homeLs, i)), total: home?.score ?? game.homeScore },
  ]

  // Baseball: show hits/errors next to runs when the boxscore has them.
  let extras = []
  if (game.sport === 'mlb') {
    const teams = summary?.boxscore?.teams || []
    const statFor = (side, name) => {
      const teamId = side === 'away' ? game.awayTeamId : game.homeTeamId
      const t = teams.find((x) => String(x.team?.id) === String(teamId))
      const groups = t?.statistics || []
      for (const g of groups) {
        const s = (g.stats || [g]).find((x) => x.name === name || x.abbreviation === name)
        if (s) return s.displayValue ?? s.value
      }
      return null
    }
    const h = rows.map((r) => statFor(r.side, 'hits') ?? statFor(r.side, 'H'))
    const e = rows.map((r) => statFor(r.side, 'errors') ?? statFor(r.side, 'E'))
    if (h.some((x) => x != null)) extras.push({ label: 'H', values: h.map((x) => x ?? '-') })
    if (e.some((x) => x != null)) extras.push({ label: 'E', values: e.map((x) => x ?? '-') })
  }

  return { periods, rows, extras }
}

/** All drives (football), oldest first, de-duplicating the current drive. */
export function getDrives(summary) {
  const previous = summary?.drives?.previous || []
  const current = summary?.drives?.current
  if (!current) return previous
  const exists = previous.some((d) => d.id === current.id)
  return exists ? previous : [...previous, { ...current, isCurrent: true }]
}

/** Every play in chronological order, for any sport. */
export function getAllPlays(summary, sport) {
  if (isFootball(sport)) {
    return getDrives(summary).flatMap((d) => (d.plays || []).map((p) => ({ ...p, driveId: d.id })))
  }
  return summary?.plays || []
}

// Offensive snaps in ESPN's play types (fumbles are sorted by their text).
const RUN_TYPES = new Set(['Rush', 'Rushing Touchdown'])
const PASS_TYPES = new Set(['Pass Reception', 'Pass Incompletion', 'Sack', 'Pass Interception Return', 'Passing Touchdown', 'Interception Return Touchdown'])
const FUMBLE_TYPES = new Set(['Fumble Recovery (Opponent)', 'Fumble Recovery (Own)', 'Fumble Return Touchdown'])

/**
 * Football efficiency per team from the play-by-play: success rate (a play
 * succeeds if it gains 40% of the yards needed on 1st down, 60% on 2nd, all
 * of them on 3rd/4th, or scores; turnovers fail), split by pass and run, plus
 * yards per play, explosive plays (runs of 10+, passes of 20+) and how often
 * a team throws on 1st and 2nd down. Kneels, spikes, penalties with no play
 * and special teams are left out. Returns { [teamId]: stats } or null.
 */
export function getFootballEfficiency(summary, sport) {
  if (!isFootball(sport)) return null
  const teams = {}
  for (const p of getAllPlays(summary, sport)) {
    const type = p.type?.text
    const text = p.text || ''
    const down = p.start?.down
    const dist = p.start?.distance
    if (!(down >= 1 && down <= 4) || !(dist > 0)) continue
    if (/kneels|spiked/i.test(text)) continue
    const pass = PASS_TYPES.has(type) || (FUMBLE_TYPES.has(type) && /\bpass\b|sacked/i.test(text))
    const run = !pass && (RUN_TYPES.has(type) || FUMBLE_TYPES.has(type))
    if (!pass && !run) continue
    const team = String(p.start?.team?.id || p.teamParticipants?.find((t) => t.type === 'offense')?.id || '')
    if (!team) continue

    const yards = Number(p.statYardage) || 0
    const offenseScored = p.scoringPlay && /Rushing Touchdown|Passing Touchdown/.test(type) && !p.isTurnover
    const needed = down === 1 ? 0.4 * dist : down === 2 ? 0.6 * dist : dist
    const success = offenseScored || (!p.isTurnover && yards >= needed)
    const explosive = !p.isTurnover && (pass ? yards >= 20 && type !== 'Sack' : yards >= 10)

    const t = (teams[team] ??= { plays: 0, success: 0, passPlays: 0, passSuccess: 0, runPlays: 0, runSuccess: 0, yards: 0, explosive: 0, early: 0, earlyPass: 0 })
    t.plays++
    t.yards += yards
    if (success) t.success++
    if (explosive) t.explosive++
    if (pass) {
      t.passPlays++
      if (success) t.passSuccess++
    } else {
      t.runPlays++
      if (success) t.runSuccess++
    }
    if (down <= 2) {
      t.early++
      if (pass) t.earlyPass++
    }
  }
  return Object.keys(teams).length ? teams : null
}

/* ---------------------------------------------------------- team stats */

// Fewer is better (bolding picks the lower side).
const LOWER_BETTER = new Set([
  'turnovers', 'totalTurnovers', 'teamTurnovers', 'interceptions', 'fumblesLost', 'totalPenaltiesYards',
  'sacksYardsLost', 'giveaways', 'penalties', 'penaltyMinutes', 'fouls', 'technicalFouls',
  'totalTechnicalFouls', 'flagrantFouls', 'mlb:SO', 'mlb:LOB', 'mlb:E',
])
// A style or a count with no better side: no bolding.
const NEUTRAL = new Set([
  'totalOffensivePlays', 'totalDrives', 'rushingAttempts', 'possessionTime', 'leadChanges', 'turnoverPoints',
  'firstDownsPenalty', 'earlyPassRate', 'teamTurnovers',
])
// "made-attempts" stats compared by their rate rather than the first number.
const RATIO = new Set(['thirdDownEff', 'fourthDownEff', 'redZoneAttempts', 'completionAttempts', 'powerPlay'])
const PERCENT = /(Pct|Percent|percentage)$/
// ESPN labels that read wrong.
const LABEL_FIX = { turnoverPoints: 'Points off turnovers', leadChanges: 'Lead changes', defensiveTouchdowns: 'Defensive / ST TDs' }

// The few that lead the sidebar, per sport (the tab shows everything).
const FEATURED = {
  football: ['successRate', 'totalYards', 'yardsPerPlay', 'thirdDownEff', 'turnovers', 'possessionTime'],
  basketball: ['fieldGoalPct', 'threePointFieldGoalPct', 'totalRebounds', 'assists', 'totalTurnovers', 'pointsInPaint'],
  hockey: ['shotsTotal', 'powerPlay', 'faceoffPercent', 'hits', 'blockedShots', 'giveaways'],
  baseball: ['mlb:H', 'mlb:HR', 'mlb:BB', 'mlb:SO', 'mlb:LOB', 'mlb:E'],
}
const MLB_ROWS = [
  ['batting', 'H', 'Hits'], ['batting', 'HR', 'Home runs'], ['batting', 'BB', 'Walks'], ['batting', 'SO', 'Strikeouts'],
  ['batting', 'SB', 'Stolen bases'], ['batting', 'LOB', 'Left on base'], ['fielding', 'E', 'Errors'], ['fielding', 'DP', 'Double plays'],
]

function familyOf(sport) {
  if (isFootball(sport)) return 'football'
  if (sport === 'nba' || sport === 'college-basketball' || sport === 'wnba') return 'basketball'
  if (sport === 'nhl') return 'hockey'
  if (sport === 'mlb') return 'baseball'
  return null
}

/** A comparable number for a stat's display value ("4-10" → 0.4 for rates, "20:24" → seconds). */
function statNumber(key, display) {
  const s = String(display ?? '').trim()
  if (!s || s === '-' || s === '--') return NaN
  if (key === 'possessionTime') {
    const [m, sec] = s.split(':').map(Number)
    return m * 60 + (sec || 0)
  }
  const pair = /^(-?\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)$/.exec(s)
  if (pair) {
    const a = Number(pair[1])
    const b = Number(pair[2])
    return RATIO.has(key) ? (b ? a / b : NaN) : a
  }
  const n = parseFloat(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

/**
 * Team stats for a game page, away vs home: ESPN's box score (matched by
 * stat name, duplicates dropped, baseball's grouped stats flattened) plus,
 * for football, success rate and the other play-by-play efficiency numbers.
 * Each row: { key, label, group, away, home, better: 'away' | 'home' | null,
 * awayShare (0–100, for the bar) }. `featured` is the sidebar's short list.
 */
export function getTeamStats(awayBox, homeBox, game, efficiency) {
  const family = familyOf(game.sport)
  const rows = []
  const push = (key, label, group, away, home) => {
    if (rows.some((r) => r.key === key)) return
    rows.push({ key, label, group, away: String(away ?? '–'), home: String(home ?? '–') })
  }

  if (family === 'football' && efficiency) {
    const a = efficiency[String(game.awayTeamId)]
    const h = efficiency[String(game.homeTeamId)]
    if (a && h && a.plays >= 5 && h.plays >= 5) {
      const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–')
      push('successRate', 'Success rate', 'Efficiency', pct(a.success, a.plays), pct(h.success, h.plays))
      push('passSuccessRate', 'Pass success rate', 'Efficiency', pct(a.passSuccess, a.passPlays), pct(h.passSuccess, h.passPlays))
      push('rushSuccessRate', 'Rush success rate', 'Efficiency', pct(a.runSuccess, a.runPlays), pct(h.runSuccess, h.runPlays))
      push('explosivePlays', 'Explosive plays', 'Efficiency', a.explosive, h.explosive)
      push('earlyPassRate', 'Early-down pass rate', 'Efficiency', pct(a.earlyPass, a.early), pct(h.earlyPass, h.early))
    }
  }

  if (family === 'baseball') {
    const stat = (box, group, abbr) =>
      box?.statistics?.find((g) => g.name === group)?.stats?.find((s) => s.abbreviation === abbr)?.displayValue
    for (const [group, abbr, label] of MLB_ROWS) {
      const a = stat(awayBox, group, abbr)
      const h = stat(homeBox, group, abbr)
      if (a != null || h != null) push(`mlb:${abbr}`, label, group === 'batting' ? 'Batting' : 'Fielding', a, h)
    }
  } else {
    const homeByName = new Map((homeBox?.statistics || []).map((s) => [s.name, s]))
    for (const s of awayBox?.statistics || []) {
      if (!s.name || s.displayValue == null) continue
      const pctSign = (v) => (PERCENT.test(s.name) && v != null && !String(v).includes('%') ? `${v}%` : v)
      push(s.name, LABEL_FIX[s.name] || s.label || s.displayName || s.name, null, pctSign(s.displayValue), pctSign(homeByName.get(s.name)?.displayValue))
    }
    // Hockey: power play as goals / chances.
    const pp = (box) => {
      const by = new Map((box?.statistics || []).map((s) => [s.name, s.displayValue]))
      return by.has('powerPlayGoals') ? `${by.get('powerPlayGoals')}/${by.get('powerPlayOpportunities') ?? 0}` : null
    }
    if (family === 'hockey' && pp(awayBox) != null) push('powerPlay', 'Power play', null, pp(awayBox), pp(homeBox))
  }

  for (const r of rows) {
    const a = statNumber(r.key, r.away)
    const h = statNumber(r.key, r.home)
    const av = Number.isFinite(a) ? Math.max(0, a) : 0
    const hv = Number.isFinite(h) ? Math.max(0, h) : 0
    r.awayShare = av + hv > 0 ? (100 * av) / (av + hv) : 50
    r.better = NEUTRAL.has(r.key) || !Number.isFinite(a) || !Number.isFinite(h) || a === h
      ? null
      : (a > h) !== LOWER_BETTER.has(r.key) ? 'away' : 'home'
  }

  const featuredKeys = FEATURED[family] || []
  const featured = featuredKeys.map((k) => rows.find((r) => r.key === k)).filter(Boolean)
  return { rows, featured: featured.length >= 3 ? featured : rows.slice(0, 6) }
}

export function getScoringPlays(summary, sport) {
  if (Array.isArray(summary?.scoringPlays) && summary.scoringPlays.length) return summary.scoringPlays
  return getAllPlays(summary, sport).filter((p) => p.scoringPlay)
}

function clockToSeconds(display) {
  if (display == null) return null
  const str = String(display)
  if (str.includes(':')) {
    const [m, s] = str.split(':').map(Number)
    if (Number.isNaN(m) || Number.isNaN(s)) return null
    return m * 60 + s
  }
  const n = Number(str)
  return Number.isNaN(n) ? null : n
}

/** 0..1 fraction of regulation elapsed for a play, or null if unknown. */
export function elapsedFraction(sport, period, clockDisplay) {
  const cfg = getPeriodConfig(sport)
  const p = Number(period)
  if (!cfg.minutes || !p) return null
  const remaining = clockToSeconds(clockDisplay)
  if (remaining == null) return null
  const periodSecs = cfg.minutes * 60
  const regulationSecs = periodSecs * cfg.regulation
  if (p > cfg.regulation) return 1
  return Math.min(1, ((p - 1) * periodSecs + (periodSecs - remaining)) / regulationSecs)
}

/**
 * Win-probability series joined with play details.
 * Each point: { home, away, x (0..1), period, clock, text }
 */
export function getWinProbabilitySeries(summary, sport) {
  const raw = summary?.winprobability
  if (!Array.isArray(raw) || raw.length < 2) return []
  const byId = new Map()
  for (const p of getAllPlays(summary, sport)) byId.set(String(p.id), p)
  // Football drive ids also appear as playIds in the series.
  if (isFootball(sport)) {
    for (const d of getDrives(summary)) {
      if (!byId.has(String(d.id))) byId.set(String(d.id), { text: d.description, period: d.start?.period, clock: d.start?.clock })
    }
  }

  let lastX = 0
  return raw.map((pt, i) => {
    let home = Number(pt.homeWinPercentage ?? 0.5)
    if (home > 1) home /= 100
    const play = byId.get(String(pt.playId))
    const period = play?.period?.number ?? play?.period
    const clock = play?.clock?.displayValue
    let x = elapsedFraction(sport, period, clock)
    if (x == null) x = sport === 'mlb' || !getPeriodConfig(sport).minutes ? i / (raw.length - 1) : lastX
    x = Math.max(x, lastX) // never step backwards
    lastX = x
    return { home, away: 1 - home, x, period, clock, text: play?.text?.trim() }
  })
}

/** Current football situation (down, distance, field position, possession). */
export function getFootballSituation(summary, game) {
  const drive = summary?.drives?.current
  const lastPlay = drive?.plays?.[drive.plays.length - 1]
  const end = lastPlay?.end
  const sb = game?.situation

  // Prefer the live scoreboard situation (refreshes every few seconds),
  // fall back to the summary's last play.
  const down = sb?.down ?? end?.down
  const distance = sb?.distance ?? end?.distance
  const yardLine = sb?.yardLine ?? end?.yardLine // distance from HOME goal line
  const possession = String(
    (typeof sb?.possession === 'object' ? sb?.possession?.id : sb?.possession) ??
      end?.team?.id ??
      drive?.team?.id ??
      game?.possessionTeam ??
      '',
  )
  if (yardLine == null && !down) return null

  const downDistanceText = sb?.shortDownDistanceText || end?.shortDownDistanceText ||
    (down > 0 ? `${ordinal(down)} & ${distance}` : null)
  const possessionText = sb?.possessionText || end?.possessionText || null
  const isRedZone = sb?.isRedZone ?? (end?.yardsToEndzone != null ? end.yardsToEndzone <= 20 : false)

  return {
    down,
    distance,
    yardLine: yardLine == null ? null : Number(yardLine),
    possession,
    downDistanceText,
    possessionText,
    isRedZone,
    awayTimeouts: sb?.awayTimeouts,
    homeTimeouts: sb?.homeTimeouts,
    lastPlayText: (sb?.lastPlay?.text || lastPlay?.text || '').trim() || null,
    drive: drive
      ? { description: drive.description, team: drive.team?.abbreviation, start: drive.start?.text }
      : null,
  }
}

const INJURY_ORDER = { out: 0, 'injured reserve': 1, doubtful: 2, questionable: 3, 'day-to-day': 4, probable: 5 }

export function getInjuries(summary) {
  const teams = summary?.injuries || []
  return teams
    .map((t) => ({
      teamId: String(t.team?.id ?? ''),
      team: t.team?.displayName,
      abbr: t.team?.abbreviation,
      logo: t.team?.logo || t.team?.logos?.[0]?.href,
      items: (t.injuries || [])
        .map((i) => ({
          id: i.athlete?.id,
          name: i.athlete?.displayName || i.athlete?.fullName,
          shortName: i.athlete?.shortName,
          position: i.athlete?.position?.abbreviation,
          headshot: i.athlete?.headshot?.href,
          status: i.status || i.type?.description,
          detail: [i.details?.type, i.details?.detail !== 'Not Specified' ? i.details?.detail : null]
            .filter(Boolean)
            .join(' · '),
          returnDate: i.details?.returnDate,
        }))
        .sort((a, b) => (INJURY_ORDER[a.status?.toLowerCase()] ?? 9) - (INJURY_ORDER[b.status?.toLowerCase()] ?? 9)),
    }))
    .filter((t) => t.items.length)
}

export function getGameInfo(summary) {
  const info = summary?.gameInfo
  const pick = summary?.pickcenter?.[0]
  const venue = info?.venue
  const referee = info?.officials?.find((o) => /referee|crew chief/i.test(o.position?.displayName || ''))
  const location = [venue?.address?.city, venue?.address?.state].filter(Boolean).join(', ')
  const rows = []
  if (venue?.fullName) rows.push({ label: 'Venue', value: location ? `${venue.fullName} · ${location}` : venue.fullName })
  if (info?.attendance) rows.push({ label: 'Attendance', value: Number(info.attendance).toLocaleString() })
  if (info?.weather?.displayValue || info?.weather?.temperature) {
    const w = info.weather
    rows.push({ label: 'Weather', value: [w.temperature != null ? `${w.temperature}°` : null, w.displayValue].filter(Boolean).join(' · ') })
  }
  if (referee) rows.push({ label: referee.position?.displayName || 'Referee', value: referee.displayName })
  if (pick?.details) {
    rows.push({ label: 'Line', value: [pick.details, pick.overUnder != null ? `O/U ${pick.overUnder}` : null].filter(Boolean).join(' · ') })
  }
  return rows
}

/** Series record between the two teams this season (NBA/NHL). */
export function getSeasonSeries(summary) {
  const s = summary?.seasonseries?.[0]
  if (!s?.summary) return null
  return s.summary
}
