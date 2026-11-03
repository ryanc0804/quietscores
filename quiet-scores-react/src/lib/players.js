// Search + player data from ESPN's public web APIs.
import { SPORT_PATHS } from './espnApi'

// ESPN league slug → this app's sport key. Only leagues the app supports.
const LEAGUE_TO_SPORT = {
  nfl: 'nfl',
  nba: 'nba',
  mlb: 'mlb',
  nhl: 'nhl',
  'college-football': 'college-football',
  'mens-college-basketball': 'college-basketball',
}

export const SPORT_LABEL = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  'college-football': 'College Football',
  'college-basketball': 'College Basketball',
}

const WEB = 'https://site.web.api.espn.com/apis'

// uid looks like "s:20~l:28~a:3918298" (athlete) or "s:20~l:28~t:2" (team).
function idFromUid(uid, kind) {
  const m = new RegExp(`${kind}:(\\d+)`).exec(uid || '')
  return m ? m[1] : null
}

/**
 * Universal search across supported leagues.
 * Returns { teams: [...], players: [...] }, each already ranked by ESPN.
 */
export async function searchEspn(query, { signal } = {}) {
  const q = query.trim()
  if (q.length < 2) return { teams: [], players: [] }
  const res = await fetch(`${WEB}/search/v2?query=${encodeURIComponent(q)}&limit=40`, { signal })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  const data = await res.json()
  const teams = []
  const players = []
  for (const group of data.results || []) {
    if (group.type !== 'team' && group.type !== 'player') continue
    for (const c of group.contents || []) {
      const sport = LEAGUE_TO_SPORT[c.defaultLeagueSlug]
      if (!sport) continue
      if (group.type === 'team') {
        const teamId = idFromUid(c.uid, 't')
        if (!teamId) continue
        teams.push({
          kind: 'team',
          key: `team:${sport}:${teamId}`,
          sport,
          teamId,
          name: c.displayName,
          logo: c.image?.default || null,
          subtitle: SPORT_LABEL[sport],
        })
      } else {
        const athleteId = idFromUid(c.uid, 'a')
        if (!athleteId) continue
        players.push({
          kind: 'player',
          key: `player:${sport}:${athleteId}`,
          sport,
          athleteId,
          name: c.displayName,
          headshot: c.image?.default || null,
          // subtitle is the team for pros, school for college
          team: c.subtitle || null,
          subtitle: [c.subtitle, SPORT_LABEL[sport]].filter(Boolean).join(' · '),
        })
      }
    }
  }
  return { teams: teams.slice(0, 6), players: players.slice(0, 8) }
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

/** Player profile, season summary, splits and game log in one call. */
export async function fetchPlayer(sport, athleteId, { signal } = {}) {
  const path = SPORT_PATHS[sport]
  if (!path) throw new Error(`Unsupported sport: ${sport}`)
  const base = `${WEB}/common/v3/sports/${path}/athletes/${athleteId}`
  const [profile, overview, gamelog] = await Promise.all([
    getJson(base, signal),
    getJson(`${base}/overview`, signal).catch(() => null),
    getJson(`${base}/gamelog`, signal).catch(() => null),
  ])
  return normalizePlayer(sport, profile?.athlete, overview, gamelog)
}

function normalizePlayer(sport, a, overview, gamelog) {
  if (!a) throw new Error('Player not found')
  const team = a.team
    ? {
        id: String(a.team.id),
        name: a.team.displayName,
        abbreviation: a.team.abbreviation,
        color: a.team.color ? `#${a.team.color}` : null,
        logo: a.team.logos?.[0]?.href || a.team.logo || null,
      }
    : null

  const bio = [
    a.displayHeight && { label: 'Height', value: a.displayHeight },
    a.displayWeight && { label: 'Weight', value: a.displayWeight },
    a.age && { label: 'Age', value: String(a.age) },
    a.displayBirthPlace && { label: 'Born', value: a.displayBirthPlace },
    (a.college?.name || a.collegeTeam?.displayName) && { label: 'College', value: a.college?.name || a.collegeTeam?.displayName },
    a.displayDraft && { label: 'Draft', value: a.displayDraft },
    a.displayExperience && { label: 'Experience', value: a.displayExperience },
  ].filter(Boolean)

  // Season headline stats (with league rank when ESPN has it).
  const summary = a.statsSummary
  const tiles = (summary?.statistics || []).map((s) => ({
    key: s.name,
    label: s.displayName || s.shortDisplayName || s.abbreviation,
    value: s.displayValue,
    rank: s.rankDisplayValue && !/^tied/i.test(s.rankDisplayValue) && s.rank && s.rank <= 50 ? s.rankDisplayValue : null,
    // Unfiltered rank, for the leaderboard's "where you are" row.
    rankFull: s.rankDisplayValue || null,
    rankNumber: s.rank || null,
  }))

  // Splits table (Regular season / Last N / Career …)
  const st = overview?.statistics
  const splits = st?.labels?.length
    ? {
        labels: st.labels,
        rows: (st.splits || []).filter((s) => s.displayName !== 'Projected').map((s) => ({ name: s.displayName, stats: s.stats })),
      }
    : null

  // Game log: most recent first.
  let log = null
  if (gamelog?.labels?.length && gamelog.events) {
    const seasonType = (gamelog.seasonTypes || []).find((t) => /regular|postseason/i.test(t.displayName || '')) || gamelog.seasonTypes?.[0]
    const rows = (seasonType?.categories || [])
      .flatMap((c) => c.events || [])
      .map((e) => {
        const ev = gamelog.events[e.eventId]
        if (!ev) return null
        return {
          id: e.eventId,
          date: ev.gameDate,
          week: ev.week,
          opponent: ev.opponent?.abbreviation || ev.opponent?.displayName || '',
          opponentLogo: ev.opponent?.logo || null,
          atVs: ev.atVs || '',
          result: ev.gameResult || '',
          score: ev.score || '',
          stats: e.stats || [],
        }
      })
      .filter(Boolean)
      .sort((x, y) => new Date(y.date) - new Date(x.date))
    if (rows.length) {
      log = {
        season: seasonType?.displayName,
        labels: gamelog.labels,
        displayNames: gamelog.displayNames || [],
        // Column groups, e.g. Receiving (6) · Rushing (5) · Fumbles (4).
        groups: (gamelog.categories || []).map((c) => ({ label: c.displayName, count: c.count })),
        rows,
      }
    }
  }

  // overview.nextGame is "Next Game", "Current Game" or "Previous Game";
  // the event itself is under league.events[0].
  const ng = overview?.nextGame
  const ev = ng?.league?.events?.[0]
  let nextGame = null
  if (ev) {
    const comps = ev.competitors || []
    const abbr = (c) => c.abbreviation || c.team?.abbreviation
    const us = comps.find((c) => team && (String(c.id) === team.id || abbr(c) === team.abbreviation))
    const them = comps.find((c) => c !== us)
    const label = /current/i.test(ng.displayName) ? 'Live now' : /previous/i.test(ng.displayName) ? 'Last game' : 'Next game'
    nextGame = {
      label,
      name: us && them
        ? `${us.homeAway === 'home' ? 'vs' : '@'} ${them.displayName || them.team?.displayName || abbr(them)}`
        : ev.shortName || ev.name,
      date: ev.date || null,
    }
  }

  return {
    id: String(a.id),
    sport,
    name: a.displayName,
    firstName: a.firstName,
    lastName: a.lastName,
    jersey: a.jersey || a.displayJersey?.replace('#', '') || null,
    position: a.position?.displayName || a.position?.name || null,
    positionAbbr: a.position?.abbreviation || null,
    headshot: a.headshot?.href || null,
    birthDate: a.displayDOB || null, // "26/4/1992"
    status: a.status?.name && a.status.name !== 'Active' ? a.status.name : null,
    injury: a.injuries?.[0]?.status || null,
    team,
    bio,
    seasonLabel: summary?.displayName || null,
    tiles: sport === 'nfl' ? withPace(tiles, st, log) : tiles,
    splits,
    log,
    nextGame,
  }
}

// Pace is hidden until a few games in; a big Week 1 shouldn't read as a 3,400-yard pace.
const PACE_MIN_GAMES = 4
// Which split column each NFL tile reads, so "YDS" picks receiving vs rushing correctly.
const PACE_LABEL = {
  receptions: 'REC',
  receivingYards: 'YDS',
  receivingTouchdowns: 'TD',
  passingYards: 'YDS',
  passingTouchdowns: 'TD',
  interceptions: 'INT',
  rushingYards: 'YDS',
  rushingTouchdowns: 'TD',
  totalTackles: 'TOT',
  soloTackles: 'SOLO',
  sacks: 'SACK',
  fumblesForced: 'FF',
  passesDefended: 'PD',
}

/**
 * NFL "on pace for" values. ESPN's overview has a Projected split (season
 * total ÷ games played × 17); each counting-stat tile takes the column whose
 * label matches and whose season value equals the tile's. Rate stats (AVG,
 * CMP%) are identical in both rows, so they never get a pace.
 */
function withPace(tiles, st, log) {
  const season = st?.splits?.find((s) => s.displayName === 'Regular Season')
  const projected = st?.splits?.find((s) => s.displayName === 'Projected')
  const games = log?.rows?.length ?? 0
  if (!season || !projected || games < PACE_MIN_GAMES) return tiles
  return tiles.map((t) => {
    const label = PACE_LABEL[t.key]
    if (!label) return t
    const i = st.labels.findIndex((l, n) => l === label && season.stats[n] === t.value)
    const pace = i >= 0 ? projected.stats[i] : null
    return pace && pace !== t.value ? { ...t, pace } : t
  })
}

// Which game-log column to chart, per sport (first label found wins).
const TREND_STATS = {
  nfl: ['YDS'],
  'college-football': ['YDS'],
  nba: ['PTS'],
  'college-basketball': ['PTS'],
  nhl: ['PTS', 'G', 'SV%'],
  mlb: ['H', 'K', 'IP'],
}

/** { label, points: [{ label, value }] } for the last few games, oldest first. */
export function trendFor(player, count = 8) {
  if (!player?.log) return null
  const labels = player.log.labels
  const wanted = TREND_STATS[player.sport] || []
  const idx = wanted.map((w) => labels.indexOf(w)).find((i) => i >= 0)
  if (idx == null || idx < 0) return null
  const pts = player.log.rows
    .slice(0, count)
    .map((r) => ({ label: r.opponent, value: parseFloat(String(r.stats[idx]).replace(/,/g, '')) }))
    .filter((p) => !Number.isNaN(p.value))
    .reverse()
  return pts.length >= 2 ? { label: labels[idx], points: pts } : null
}
