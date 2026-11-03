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
