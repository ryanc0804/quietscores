// League leaderboards ("where does this player rank?") from ESPN's public APIs.
//
// Most leagues use the byathlete stats endpoint: one request returns every
// qualified player sorted by a stat, with ESPN's own tie-aware rank. College
// football is the exception: that endpoint returns the right order but blank
// values, so CFB values come from the core "leaders" feed (top 50, a fixed set
// of stats) and names/teams are joined in from byathlete.
import { SPORT_PATHS } from './espnApi'

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports'
const CORE = 'https://sports.core.api.espn.com/v2/sports'

// Lower is better for these, so the board is sorted ascending.
const ASCENDING = new Set(['ERA', 'WHIP', 'avgGoalsAgainst'])

// Rate stats are only meaningful over a minimum sample, so they're ranked
// among qualified players (as ESPN does); without the filter a 0.00 ERA in one
// inning tops the list. Counting stats (yards, strikeouts, goals) are ranked
// across everyone, which matches the rank ESPN shows on the player page.
const RATE_STAT = /pct|^avg|ERA|WHIP|OPS|onBase|slug|rating|QBR|PerGame|yardsPer|PerNine|GoalsAgainst|^PER$|rangeFactor/i

// CFB: player-summary stat name → core leaders category.
const CFB_CORE = {
  passingYards: 'passingYards',
  passingTouchdowns: 'passingTouchdowns',
  QBRating: 'quarterbackRating',
  rushingYards: 'rushingYards',
  rushingTouchdowns: 'rushingTouchdowns',
  receivingYards: 'receivingYards',
  receptions: 'receptions',
  receivingTouchdowns: 'receivingTouchdowns',
  totalTackles: 'totalTackles',
  sacks: 'sacks',
  interceptions: 'interceptions',
  interceptionYards: 'interceptionYards',
}

const PITCHER = /^(P|SP|RP|CP)$/i

async function getJson(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

// Category metadata per sport, fetched once (a 1-row request).
const metaCache = new Map()
function leaderMeta(sport) {
  if (!metaCache.has(sport)) {
    const path = SPORT_PATHS[sport]
    const p = path
      ? getJson(`${WEB}/${path}/statistics/byathlete?seasontype=2&limit=1`).then((d) => ({
          year: d.requestedSeason?.year,
          categories: (d.categories || []).map((c) => ({
            name: c.name,
            names: c.names || [],
            labels: c.labels || [],
            displayNames: c.displayNames || [],
            descriptions: c.descriptions || [],
          })),
        }))
      : Promise.reject(new Error(`Unsupported sport: ${sport}`))
    p.catch(() => metaCache.delete(sport)) // allow a retry after a failure
    metaCache.set(sport, p)
  }
  return metaCache.get(sport)
}

/**
 * Which byathlete category a player's stat belongs to. Some names repeat
 * (MLB strikeouts are batting and pitching; NFL sacks/interceptions are
 * passing and defense), so the player's position breaks the tie.
 */
function pickCategory(categories, stat, position) {
  const matches = categories.filter((c) => c.names.includes(stat))
  if (matches.length <= 1) return matches[0] || null
  const by = (n) => matches.find((c) => c.name === n)
  const pos = position || ''
  if (by('pitching') || by('batting')) return PITCHER.test(pos) ? by('pitching') : by('batting')
  if (by('passing') && pos === 'QB') return by('passing')
  // Otherwise prefer the stat's home category over the scoring/general rollups.
  return matches.find((c) => c.name !== 'scoring' && c.name !== 'general') || matches[0]
}

function cfbHasBoard(stat, position) {
  if (!CFB_CORE[stat]) return false
  // A QB's sacks/interceptions are taken/thrown; the core board is defense.
  return !(position === 'QB' && (stat === 'sacks' || stat === 'interceptions'))
}

function toBoard(sport, cat, i, year) {
  return {
    sport,
    stat: cat.names[i],
    category: cat.name,
    label: cat.displayNames[i] || cat.labels[i] || cat.names[i],
    abbreviation: cat.labels[i] || null,
    description: cat.descriptions[i] || null,
    year,
  }
}

/** Can this stat be opened as a leaderboard for this player? */
export async function leaderboardFor(sport, stat, position) {
  if (sport === 'college-football' && !cfbHasBoard(stat, position)) return null
  const meta = await leaderMeta(sport)
  const cat = pickCategory(meta.categories, stat, position)
  if (!cat) return null
  return toBoard(sport, cat, cat.names.indexOf(stat), meta.year)
}

// Stats that make poor standalone leaderboards (games played, fumbles lost…).
const SKIP_TAB = /^gamesPlayed$|^games$|Fumbles|FumblesLost|^gamesStarted$|flagrant|ejections/i

/** Every board in the same category as `board`, for the stat tabs. */
export async function boardsInCategory(board, position) {
  const meta = await leaderMeta(board.sport)
  const cat = meta.categories.find((c) => c.name === board.category)
  if (!cat) return [board]
  return cat.names
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n === board.stat || !SKIP_TAB.test(n))
    .filter(({ n }) => board.sport !== 'college-football' || cfbHasBoard(n, position))
    .map(({ i }) => toBoard(board.sport, cat, i, meta.year))
}

/** "Tied-9th" → "T-9th"; 18 → "18th". */
export function formatRank(rank) {
  if (rank == null) return null
  if (typeof rank === 'string') return rank.replace(/^Tied-/i, 'T-')
  const n = Number(rank)
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
  return `${n}${suffix}`
}

/**
 * The player's rank for a board when ESPN's player page doesn't give one
 * (all of college basketball, for example). Looks deeper than the page does.
 * Returns { rank: "T-4th" } or { rank: null, reason }.
 */
export async function findRank(board, athleteId, { signal } = {}) {
  const deep = board.sport === 'college-football' ? 50 : 200
  const data = await fetchLeaderboard(board, { limit: deep, signal })
  const me = data.rows.find((r) => r.athleteId === String(athleteId))
  if (me) {
    const tied = data.rows.filter((r) => r.rank === me.rank).length > 1
    return { rank: `${tied ? 'T-' : ''}${formatRank(me.rank)}` }
  }
  return { rank: null, reason: data.qualified ? 'Not qualified' : `Outside top ${deep}` }
}

function athleteRow(a) {
  return {
    athleteId: String(a.id),
    name: a.displayName,
    team: a.teamShortName || null,
    teamLogo: a.teamLogos?.[0]?.href || null,
    headshot: a.headshot?.href || null,
    position: a.position?.abbreviation || null,
  }
}

/** Top `limit` players for a board from leaderboardFor(). */
export async function fetchLeaderboard(board, { limit = 50, signal } = {}) {
  const path = SPORT_PATHS[board.sport]
  const dir = ASCENDING.has(board.stat) ? 'asc' : 'desc'
  const qualified = RATE_STAT.test(board.stat)
  const url = `${WEB}/${path}/statistics/byathlete?seasontype=2&sort=${board.category}.${board.stat}:${dir}&limit=${limit}${qualified ? '' : '&isqualified=false'}`

  if (board.sport === 'college-football') return fetchCfbLeaderboard(board, url, limit, signal)

  const d = await getJson(url, signal)
  const cat = (d.categories || []).find((c) => c.name === board.category)
  const i = cat ? cat.names.indexOf(board.stat) : -1
  const rows = (d.athletes || []).map((r, n) => {
    const c = r.categories?.find((x) => x.name === board.category)
    const rank = parseInt(c?.ranks?.[i], 10)
    return { ...athleteRow(r.athlete), rank: Number.isNaN(rank) ? n + 1 : rank, value: c?.totals?.[i] ?? '–' }
  })
  return { rows, total: d.pagination?.count ?? rows.length, qualified }
}

async function fetchCfbLeaderboard(board, byathleteUrl, limit, signal) {
  const core = CFB_CORE[board.stat]
  const [leaders, names] = await Promise.all([
    // groups/80 = FBS, the pool ESPN ranks college players against.
    getJson(`${CORE}/football/leagues/college-football/seasons/${board.year}/types/2/groups/80/leaders?limit=${limit}`, signal),
    getJson(byathleteUrl, signal).catch(() => null),
  ])
  const list = (leaders.categories || []).find((c) => c.name === core)?.leaders || []
  const known = new Map((names?.athletes || []).map((r) => [String(r.athlete.id), athleteRow(r.athlete)]))
  const idOf = (ref) => /athletes\/(\d+)/.exec(ref || '')?.[1]

  // Anyone the byathlete page missed is looked up individually (player + team).
  const https = (ref) => ref.replace(/^http:/, 'https:')
  const missing = list.filter((l) => {
    const id = idOf(l.athlete?.$ref)
    return id && !known.has(id)
  })
  await Promise.all(
    missing.map((l) => {
      const id = idOf(l.athlete.$ref)
      return Promise.all([
        getJson(https(l.athlete.$ref), signal),
        l.team?.$ref ? getJson(https(l.team.$ref), signal).catch(() => null) : null,
      ])
        .then(([a, t]) =>
          known.set(id, {
            athleteId: id,
            name: a.displayName,
            team: t?.abbreviation || null,
            teamLogo: t?.logos?.[0]?.href || null,
            headshot: a.headshot?.href || null,
            position: a.position?.abbreviation || null,
          }),
        )
        .catch(() => {})
    }),
  )

  // Ties share a rank, matching how ESPN shows "Tied-9th".
  let prevValue = null
  let prevRank = 0
  const rows = list.map((l, n) => {
    const id = idOf(l.athlete?.$ref)
    const rank = l.value === prevValue ? prevRank : n + 1
    prevValue = l.value
    prevRank = rank
    return { ...(known.get(id) || { athleteId: id, name: 'Unknown player' }), rank, value: l.displayValue }
  })
  return { rows, total: rows.length, capped: true }
}
