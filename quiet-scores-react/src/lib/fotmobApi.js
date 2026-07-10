// FotMob data layer for soccer. FotMob's internal API is unofficial and sends
// no CORS headers, so all requests go through the `/fotmob` proxy (Vite dev
// proxy locally; must be an equivalent serverless proxy in production).
//
// Endpoints (relative to the proxy base):
//   /api/data/matches?date=YYYYMMDD&timezone=TZ   -> all leagues for a date
//   /api/data/matchDetails?matchId=<id>           -> full match detail

const FOTMOB_BASE = '/fotmob'

// FotMob league id (primaryId / parentLeagueId) -> our internal soccer sportKey.
// These sportKeys must match SOCCER_SPORT_KEYS in App.jsx.
const FOTMOB_LEAGUE_TO_SPORT = {
  77: 'worldcup', // FIFA World Cup
  130: 'mls', // MLS
  47: 'epl', // Premier League
  42: 'ucl', // UEFA Champions League
  87: 'laliga', // LaLiga
  54: 'bundesliga', // Bundesliga
  55: 'seriea', // Serie A
  53: 'ligue1', // Ligue 1
}

// Curated stat rows shown in the match detail, in display order.
// key -> matches a FotMob stat key; format 'pct' appends a % sign.
const STAT_DEFS = [
  { key: 'BallPossesion', label: 'Possession', format: 'pct' },
  { key: 'expected_goals', label: 'xG' },
  { key: 'total_shots', label: 'Shots' },
  { key: 'ShotsOnTarget', label: 'On Target' },
  { key: 'big_chance', label: 'Big Chances' },
  { key: 'corners', label: 'Corners' },
  { key: 'keeper_saves', label: 'Saves' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'Offsides', label: 'Offsides' },
  { key: 'yellow_cards', label: 'Yellow Cards' },
  { key: 'red_cards', label: 'Red Cards' },
]

function fotmobLeagueSportKey(league) {
  const id = league?.primaryId ?? league?.parentLeagueId ?? league?.id
  return FOTMOB_LEAGUE_TO_SPORT[id] ?? null
}

function formatDateParam(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function formatDisplayTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return 'TBD'
  }
}

function teamLogo(teamId) {
  if (!teamId) return null
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}_small.png`
}

function abbreviate(name) {
  if (!name) return ''
  const clean = name.replace(/[^A-Za-z ]/g, '').trim()
  if (clean.length <= 3) return clean.toUpperCase()
  const words = clean.split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0] + (words[2]?.[0] ?? words[1][1] ?? '')).toUpperCase()
  }
  return clean.slice(0, 3).toUpperCase()
}

function normalizeStatus(match) {
  const s = match?.status ?? {}
  if (s.cancelled) return 'postponed'
  if (s.finished) return 'final'
  if (s.started) {
    const short = (s.reason?.short ?? '').toUpperCase()
    if (short === 'HT') return 'halftime'
    return 'live'
  }
  return 'scheduled'
}

// A live/finished match shows the elapsed minute or FT/HT; scheduled shows nothing
// here (the card renders displayTime instead).
function statusTimeLabel(match, normalized) {
  const s = match?.status ?? {}
  if (normalized === 'live') {
    return s.liveTime?.short || s.liveTime?.long || s.reason?.short || 'LIVE'
  }
  if (normalized === 'halftime') return 'HT'
  if (normalized === 'final') return s.reason?.short || 'FT'
  return ''
}

// Transform one FotMob match (from the matches-by-date feed) into the app's
// generic `baseGame` shape so the existing scoreboard UI renders it unchanged.
function transformMatch(match, sportKey, leagueName) {
  if (!match?.home || !match?.away) return null
  const status = normalizeStatus(match)
  const utc = match.status?.utcTime ?? null
  const awayName = match.away.longName || match.away.name
  const homeName = match.home.longName || match.home.name

  return {
    id: String(match.id),
    sport: sportKey,
    sportName: leagueName || sportKey.toUpperCase(),
    provider: 'fotmob',
    awayTeam: awayName,
    homeTeam: homeName,
    awayScore: match.away.score ?? '',
    homeScore: match.home.score ?? '',
    awayTeamRecord: null,
    homeTeamRecord: null,
    status,
    time: statusTimeLabel(match, status),
    displayTime: status === 'scheduled' ? formatDisplayTime(utc) : '',
    fullDateTime: utc,
    gameDate: utc,
    period: null,
    clock: null,
    homeLogo: teamLogo(match.home.id),
    awayLogo: teamLogo(match.away.id),
    homeShortName: match.home.name,
    awayShortName: match.away.name,
    homeAbbreviation: abbreviate(match.home.name),
    awayAbbreviation: abbreviate(match.away.name),
    homeConference: null,
    awayConference: null,
    possessionTeam: null,
    awayTeamId: String(match.away.id),
    homeTeamId: String(match.home.id),
    atBatTeam: null,
    situation: null,
    inningNumber: null,
    topBottom: null,
    bases: null,
    balls: null,
    strikes: null,
    outs: null,
  }
}

// Fetch all soccer matches for a date across the leagues we care about.
// Returns an array of `baseGame` objects (mixed leagues, keyed by sportKey).
export async function fetchFotmobSoccerScoreboard(date, { signal } = {}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const url = `${FOTMOB_BASE}/api/data/matches?date=${formatDateParam(date)}&timezone=${encodeURIComponent(tz)}`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch FotMob matches: ${response.status}`)
  }
  const data = await response.json()

  const games = []
  for (const league of data?.leagues ?? []) {
    const sportKey = fotmobLeagueSportKey(league)
    if (!sportKey) continue
    for (const match of league.matches ?? []) {
      const game = transformMatch(match, sportKey, league.name)
      if (game) games.push(game)
    }
  }
  return games
}

// --- Match detail ------------------------------------------------------------

// Flatten every stat across all groups into a key -> {home, away, highlighted}
// map. Some keys appear multiple times (a null header row, then the real row);
// the first non-null occurrence wins.
function flattenStats(data) {
  const groups = data?.content?.stats?.Periods?.All?.stats ?? []
  const map = {}
  for (const group of groups) {
    for (const stat of group.stats ?? []) {
      if (!stat.key || !Array.isArray(stat.stats)) continue
      if (stat.key in map) continue
      if (stat.stats[0] == null) continue
      map[stat.key] = {
        home: stat.stats[0],
        away: stat.stats[1],
        highlighted: stat.highlighted ?? null,
      }
    }
  }
  return map
}

function buildStatRows(data) {
  const map = flattenStats(data)
  const rows = []
  for (const def of STAT_DEFS) {
    const s = map[def.key]
    if (!s) continue
    const fmt = (v) => {
      if (v == null) return '-'
      return def.format === 'pct' ? `${v}%` : String(v)
    }
    rows.push({
      key: def.key,
      label: def.label,
      home: fmt(s.home),
      away: fmt(s.away),
      highlighted: s.highlighted,
    })
  }
  return rows
}

// All stat groups for each period (All / FirstHalf / SecondHalf).
function buildStatPeriods(data) {
  const periods = data?.content?.stats?.Periods
  if (!periods) return null
  const mapItem = (s) => ({
    key: s.key,
    label: s.title,
    home: s.stats?.[0],
    away: s.stats?.[1],
    highlighted: s.highlighted ?? null,
    type: s.type ?? 'text',
  })
  const out = {}
  for (const [pk, pv] of Object.entries(periods)) {
    const groups = (pv?.stats ?? [])
      .map((g) => ({
        key: g.key,
        title: g.title,
        items: (g.stats ?? [])
          .filter((s) => s.key && Array.isArray(s.stats) && (s.stats[0] != null || s.stats[1] != null))
          .map(mapItem),
      }))
      .filter((g) => g.items.length)
    if (groups.length) out[pk] = groups
  }
  return Object.keys(out).length ? out : null
}

// Normalized shot map: one entry per shot, tagged home/away.
function buildShotmap(data) {
  const sm = data?.content?.shotmap
  const shots = Array.isArray(sm) ? sm : sm?.shots
  if (!Array.isArray(shots) || !shots.length) return null
  const homeId = data?.general?.homeTeam?.id ?? data?.header?.teams?.[0]?.id
  return shots.map((s) => ({
    id: s.id,
    side: s.teamId === homeId ? 'home' : 'away',
    player: s.playerName || s.fullName || '',
    playerId: s.playerId ?? null,
    min: s.min ?? null,
    minAdded: s.minAdded ?? null,
    xg: s.expectedGoals != null ? Number(s.expectedGoals) : null,
    xgot: s.expectedGoalsOnTarget != null ? Number(s.expectedGoalsOnTarget) : null,
    shotType: s.shotType || null,
    situation: s.situation || null,
    result: s.eventType || null,
    isGoal: s.eventType === 'Goal',
    isOwnGoal: !!s.isOwnGoal,
    onTarget: !!s.isOnTarget,
    x: s.x,
    y: s.y,
    // Position within the goal frame: goalX (horizontal), goalZ (height, m).
    goalX: s.onGoalShot?.x ?? null,
    goalZ: s.goalCrossedZ ?? null,
  }))
}

function buildTimeline(data) {
  const raw = data?.content?.matchFacts?.events?.events ?? []
  const out = []
  for (const e of raw) {
    const time = e.time != null ? e.time : e.timeStr != null ? parseInt(e.timeStr, 10) : null
    const base = { type: e.type, time, overloadTime: e.overloadTime ?? null, isHome: !!e.isHome }
    if (e.type === 'Goal') {
      out.push({
        ...base,
        player: e.nameStr || e.fullName || e.player?.name || '',
        score: Array.isArray(e.newScore) ? e.newScore : null,
        assist: e.assistStr || null,
        description: e.goalDescription || null,
        ownGoal: !!e.ownGoal,
      })
    } else if (e.type === 'Card') {
      out.push({ ...base, player: e.nameStr || e.player?.name || '', card: e.card || 'Yellow' })
    } else if (e.type === 'Substitution') {
      const swap = e.swap ?? []
      out.push({ ...base, playerIn: swap[0]?.name ?? '', playerOut: swap[1]?.name ?? '' })
    } else if (e.type === 'Half') {
      out.push({ ...base, label: e.halfStrShort || '', homeScore: e.homeScore, awayScore: e.awayScore })
    } else if (e.type === 'AddedTime') {
      const txt = e.minutesAddedStr || (e.minutesAddedInput ? `+${e.minutesAddedInput} minutes added` : '')
      out.push({ ...base, minutesText: txt.replace(/^\+\s*/, '+') })
    }
  }
  return out
}

// Build a per-player event summary keyed by (string) player id, so pitch nodes
// can show goal / card / substitution markers.
function buildPlayerEvents(data) {
  const raw = data?.content?.matchFacts?.events?.events ?? []
  const map = {}
  const ensure = (id) => {
    const key = String(id)
    map[key] ??= { goals: 0, yellow: false, red: false, subOut: null, subIn: null }
    return map[key]
  }
  for (const e of raw) {
    const time = e.timeStr != null ? String(e.timeStr) : e.time != null ? String(e.time) : ''
    if (e.type === 'Goal') {
      const id = e.player?.id ?? e.playerId
      if (id != null && !e.ownGoal) ensure(id).goals += 1
    } else if (e.type === 'Card') {
      const id = e.player?.id ?? e.playerId
      if (id != null) {
        const rec = ensure(id)
        if (e.card === 'Red' || e.card === 'SecondYellow') rec.red = true
        else rec.yellow = true
      }
    } else if (e.type === 'Substitution') {
      const swap = e.swap ?? []
      if (swap[0]?.id != null) ensure(swap[0].id).subIn = time
      if (swap[1]?.id != null) ensure(swap[1].id).subOut = time
    }
  }
  return map
}

function playerImage(id) {
  if (id == null) return null
  return `https://images.fotmob.com/image_resources/playerimages/${id}.png`
}

function mapLineupSide(team, evMap) {
  if (!team) return null
  const mapPlayer = (p) => ({
    id: p.id ?? null,
    name: p.name,
    shirt: p.shirtNumber ?? '',
    rating: p.performance?.rating ?? null,
    isCaptain: !!p.isCaptain,
    img: playerImage(p.id),
    // Portrait coords (per-team pitch): x 0=left..1=right, y 0=own..1=opp goal.
    x: p.verticalLayout?.x ?? null,
    y: p.verticalLayout?.y ?? null,
    // Landscape coords (combined pitch): each team in its own frame, x 0=own goal.
    hx: p.horizontalLayout?.x ?? null,
    hy: p.horizontalLayout?.y ?? null,
    events: evMap[String(p.id)] ?? null,
  })
  return {
    teamName: team.name,
    formation: team.formation ?? null,
    rating: team.rating ?? null,
    starters: (team.starters ?? []).map(mapPlayer),
    subs: (team.subs ?? []).map(mapPlayer),
  }
}

// Stadium / attendance / weather / highlights from the match facts.
function buildInfo(data) {
  const mf = data?.content?.matchFacts ?? {}
  const box = mf.infoBox ?? {}
  const stadium = box.Stadium ?? null
  const referee = box.Referee ?? null
  const attendance = box.Attendance ?? null
  const w = data?.content?.weather ?? null
  const hl = mf.highlights ?? null

  let weather = null
  if (w && typeof w.temperature === 'number') {
    weather = {
      tempF: Math.round((w.temperature * 9) / 5 + 32),
      tempC: w.temperature,
      description: w.defaultTitle || w.description || null,
    }
  }

  let highlights = null
  if (hl?.url) {
    highlights = {
      url: hl.url,
      image: hl.image || hl.imageUrl || hl.thumbnailUrl || null,
      source: hl.source || null,
    }
  }

  return {
    stadium: stadium && {
      name: stadium.name ?? null,
      city: stadium.city ?? null,
      country: stadium.country ?? null,
      capacity: stadium.capacity ?? null,
      surface: stadium.surface ?? null,
    },
    attendance,
    referee: referee && { name: referee.text ?? null, country: referee.country ?? null },
    weather,
    highlights,
  }
}

function buildPotm(data) {
  const p = data?.content?.matchFacts?.playerOfTheMatch
  if (!p) return null
  const name = p.name?.fullName || [p.name?.firstName, p.name?.lastName].filter(Boolean).join(' ')
  return {
    id: p.id ?? null,
    name,
    team: p.teamName ?? null,
    rating: p.rating?.num ?? null,
    img: playerImage(p.id),
  }
}

// Transform the FotMob matchDetails payload into a compact, UI-friendly object.
function transformDetail(data) {
  const evMap = buildPlayerEvents(data)
  const teams = data?.header?.teams ?? []
  const home = teams[0] ?? null
  const away = teams[1] ?? null
  const status = data?.header?.status ?? {}
  const general = data?.general ?? {}
  const teamColors = general.teamColors?.darkMode ?? general.teamColors?.lightMode ?? {}

  return {
    provider: 'fotmob',
    matchId: general.matchId ?? null,
    league: general.leagueName ?? null,
    round: general.leagueRoundName ?? general.matchRound ?? null,
    colors: {
      home: teamColors.home ?? null,
      away: teamColors.away ?? null,
    },
    status: {
      started: !!status.started,
      finished: !!status.finished,
      scoreStr: status.scoreStr ?? null,
      reason: status.reason?.long ?? status.reason?.short ?? null,
    },
    home: home && {
      id: home.id,
      name: home.name,
      score: home.score,
      logo: home.imageUrl || teamLogo(home.id),
    },
    away: away && {
      id: away.id,
      name: away.name,
      score: away.score,
      logo: away.imageUrl || teamLogo(away.id),
    },
    stats: buildStatRows(data),
    statPeriods: buildStatPeriods(data),
    shotmap: buildShotmap(data),
    timeline: buildTimeline(data),
    info: buildInfo(data),
    potm: buildPotm(data),
    momentum: data?.content?.momentum?.main?.data ?? null,
    lineups: {
      home: mapLineupSide(data?.content?.lineup?.homeTeam, evMap),
      away: mapLineupSide(data?.content?.lineup?.awayTeam, evMap),
    },
  }
}

// Fetch and normalize a single match's detail.
export async function fetchFotmobMatchDetail(matchId, { signal } = {}) {
  const url = `${FOTMOB_BASE}/api/data/matchDetails?matchId=${matchId}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch FotMob match detail: ${response.status}`)
  }
  const data = await response.json()
  return transformDetail(data)
}

export { FOTMOB_LEAGUE_TO_SPORT }
