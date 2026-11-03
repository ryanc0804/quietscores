// League leaderboards ("where does this player rank?") from ESPN's public APIs.
//
// Most leagues use the byathlete stats endpoint: one request returns every
// qualified player sorted by a stat, with ESPN's own tie-aware rank. Where
// that endpoint is broken, the core "leaders" feed (top 50, a fixed set of
// stats) supplies the values and names are joined in from byathlete:
//   - college football: byathlete returns the right order but blank values
//   - NFL defensive interceptions: byathlete returns HTTP 400
import { SPORT_PATHS } from './espnApi'

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports'
const CORE = 'https://sports.core.api.espn.com/v2/sports'

// Lower is better for these, so the board is sorted ascending. Keys are a stat
// name, or "category.stat" when it depends on the category.
const ASCENDING = new Set(['ERA', 'WHIP', 'avgGoalsAgainst', 'passing.interceptions'])
const isAscending = (b) => ASCENDING.has(b.stat) || ASCENDING.has(`${b.category}.${b.stat}`)

// Rate stats are only meaningful over a minimum sample, so they're ranked
// among qualified players (as ESPN does); without the filter a 0.00 ERA in one
// inning tops the list. Counting stats (yards, strikeouts, goals) are ranked
// across everyone, which matches the rank ESPN shows on the player page.
const RATE_STAT = /pct|^avg|ERA|WHIP|OPS|onBase|slug|rating|QBR|PerGame|yardsPer|PerNine|GoalsAgainst|^PER$|rangeFactor/i
const isQualifiedBoard = (b) => RATE_STAT.test(b.stat) || b.category === 'passing' && b.stat === 'interceptions'

// ESPN's own ranks are inconsistent for these (QBs with 0 INTs ranked 42nd and
// 1st), so rows are ranked here by value instead; tiles use the same rank.
const OWN_RANK = new Set(['passing.interceptions', 'defensive.avgGoalsAgainst'])

// Lists ESPN serves broken (unsorted all-zero, or no data at all): no board.
const UNAVAILABLE = {
  nfl: new Set(['general.fumblesForced', 'general.fumblesRecovered', 'defensiveinterceptions.interceptionYards', 'defensiveinterceptions.interceptionTouchdowns']),
  'college-basketball': new Set(['general.PER']),
}
const isUnavailable = (sport, category, stat) => !!UNAVAILABLE[sport]?.has(`${category}.${stat}`)

// Boards that come from the core leaders feed instead of byathlete.
// "category.stat" (byathlete naming) → core leaders category, plus a byathlete
// sort used only to look up names/teams for the joined rows.
const CORE_BOARDS = {
  nfl: {
    'defensiveinterceptions.interceptions': { core: 'interceptions', names: 'defensive.passesDefended' },
  },
}

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

// Player-page tiles whose key isn't a leaderboard stat: "12-7" W-L records rank
// by wins; a kicker's points rank on the all-player points board.
const TILE_ALIAS = {
  'wins-losses': 'wins',
  'wins-losses-overtimeLosses': 'wins',
  totalKickingPoints: 'totalPoints',
}

const PITCHER = /^(P|SP|RP|CP)$/i
const LEAGUE_PATH = {
  nfl: 'football/leagues/nfl',
  'college-football': 'football/leagues/college-football',
}

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
 * (MLB strikeouts are batting and pitching; NFL sacks/interceptions are a
 * QB's passing line and a defender's), so the player's position breaks the tie.
 */
function pickCategory(categories, stat, position) {
  const matches = categories.filter((c) => c.names.includes(stat))
  if (matches.length <= 1) return matches[0] || null
  const by = (n) => matches.find((c) => c.name === n)
  const pos = position || ''
  if (by('pitching') || by('batting')) return PITCHER.test(pos) ? by('pitching') : by('batting')
  if (by('passing')) {
    if (pos === 'QB') return by('passing')
    // Anyone else's sacks / interceptions are defensive ones.
    const other = matches.find((c) => !['passing', 'scoring', 'general'].includes(c.name))
    if (other) return other
  }
  // Otherwise prefer the stat's home category over the scoring/general rollups.
  return matches.find((c) => c.name !== 'scoring' && c.name !== 'general') || matches[0]
}

function cfbHasBoard(stat, position) {
  if (!CFB_CORE[stat]) return false
  // A QB's sacks/interceptions are taken/thrown; the core board is defense.
  return !(position === 'QB' && (stat === 'sacks' || stat === 'interceptions'))
}

function toBoard(sport, cat, i, year) {
  const stat = cat.names[i]
  return {
    sport,
    stat,
    category: cat.name,
    label: cat.displayNames[i] || cat.labels[i] || stat,
    abbreviation: cat.labels[i] || null,
    description: cat.descriptions[i] || null,
    year,
    ownRank: OWN_RANK.has(`${cat.name}.${stat}`),
  }
}

/**
 * The season a player-page summary is for, as ESPN numbers seasons
 * ("2026 regular season stats" → 2026, "2026-27 …" → 2027), or null.
 */
function summaryYear(label) {
  const m = /(\d{4})(?:\s*-\s*(\d{2}))?/.exec(label || '')
  if (!m) return null
  return m[2] ? Number(m[1].slice(0, 2) + m[2]) : Number(m[1])
}

/**
 * Can this tile open a leaderboard for this player? `seasonLabel` is the
 * player summary's season; an inactive player's tiles can be last season's,
 * and this season's board would rank something else.
 */
export async function leaderboardFor(sport, tileStat, position, seasonLabel) {
  const stat = TILE_ALIAS[tileStat] || tileStat
  if (sport === 'college-football' && !cfbHasBoard(stat, position)) return null
  const meta = await leaderMeta(sport)
  const tileYear = summaryYear(seasonLabel)
  if (tileYear && meta.year && tileYear !== meta.year) return null
  const cat = pickCategory(meta.categories, stat, position)
  if (!cat || isUnavailable(sport, cat.name, stat)) return null
  return { ...toBoard(sport, cat, cat.names.indexOf(stat), meta.year), aliased: stat !== tileStat }
}

// Stats that make poor standalone leaderboards (games played, fumbles lost…).
const SKIP_TAB = /^gamesPlayed$|^games$|Fumbles$|FumblesLost$|^gamesStarted$|^flagrantFouls$|^ejections$/

/** Every board in the same category as `board`, for the stat tabs. */
export async function boardsInCategory(board, position) {
  const meta = await leaderMeta(board.sport)
  const cat = meta.categories.find((c) => c.name === board.category)
  if (!cat) return [board]
  return cat.names
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n === board.stat || (!SKIP_TAB.test(n) && !isUnavailable(board.sport, cat.name, n)))
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
 * The player's rank for a board when the player page's own rank can't be used
 * (none given, a different pool, or ranked here). Looks deeper than the page.
 * Returns { rank: "T-4th" } or { rank: null, reason }.
 */
export async function findRank(board, athleteId, { signal } = {}) {
  const deep = board.sport === 'college-football' || coreBoard(board) ? 50 : 200
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

const num = (v) => parseFloat(String(v ?? '').replace(/,/g, ''))
const isBlank = (v) => v == null || v === '' || v === '-' || v === '–'

// Ties share a rank, matching how ESPN shows "Tied-9th".
function rankByValue(rows) {
  let prev = null
  let prevRank = 0
  return rows.map((r, n) => {
    const rank = r.value === prev ? prevRank : n + 1
    prev = r.value
    prevRank = rank
    return { ...r, rank }
  })
}

const coreBoard = (b) => CORE_BOARDS[b.sport]?.[`${b.category}.${b.stat}`] || null

// Lowest-first lists ESPN fills with players who never did the thing (NHL
// skaters' 0.00 GAA): build them from a pool sorted by another stat (goalies
// by saves) and order that pool here.
const POOLED = {
  nhl: { 'defensive.avgGoalsAgainst': { pool: 'defensive.saves', size: 60 } },
}
const pooledBoard = (b) => POOLED[b.sport]?.[`${b.category}.${b.stat}`] || null

/** Top `limit` players for a board from leaderboardFor(). */
export async function fetchLeaderboard(board, { limit = 50, signal } = {}) {
  const path = SPORT_PATHS[board.sport]
  const qualified = isQualifiedBoard(board)
  const byathlete = (category, stat, dir, lim) =>
    `${WEB}/${path}/statistics/byathlete?seasontype=2&sort=${category}.${stat}:${dir}&limit=${lim}${qualified ? '' : '&isqualified=false'}`

  if (board.sport === 'college-football') {
    return fetchCoreLeaderboard(board, CFB_CORE[board.stat], byathlete(board.category, board.stat, 'desc', limit), 'groups/80/', limit, signal)
  }
  const viaCore = coreBoard(board)
  if (viaCore) {
    const [cat, stat] = viaCore.names.split('.')
    return fetchCoreLeaderboard(board, viaCore.core, byathlete(cat, stat, 'desc', 200), '', limit, signal)
  }

  const asc = isAscending(board)
  const pooled = pooledBoard(board)
  const url = pooled
    ? byathlete(...pooled.pool.split('.'), 'desc', pooled.size)
    : byathlete(board.category, board.stat, asc ? 'asc' : 'desc', limit)
  const d = await getJson(url, signal)
  const cat = (d.categories || []).find((c) => c.name === board.category)
  const i = cat ? cat.names.indexOf(board.stat) : -1
  let rows = (d.athletes || [])
    .map((r, n) => {
      const c = r.categories?.find((x) => x.name === board.category)
      const rank = parseInt(c?.ranks?.[i], 10)
      return { ...athleteRow(r.athlete), rank: Number.isNaN(rank) ? n + 1 : rank, value: c?.totals?.[i] }
    })
    // Players with no value for this stat (a non-kicker's longest field goal).
    .filter((r) => !isBlank(r.value))
  if (pooled) {
    rows = rows.filter((r) => num(r.value) > 0).sort((a, b) => (asc ? num(a.value) - num(b.value) : num(b.value) - num(a.value))).slice(0, limit)
  }
  if (board.ownRank || pooled) rows = rankByValue(rows)
  // Nobody has a non-zero value yet (early season): show it as empty.
  if (rows.length && rows.every((r) => num(r.value) === 0)) rows = []
  return { rows, total: d.pagination?.count ?? rows.length, qualified }
}

/**
 * Values from the core leaders feed (top 50); names/teams joined from a
 * byathlete page, anyone missing looked up individually.
 */
async function fetchCoreLeaderboard(board, coreName, namesUrl, group, limit, signal) {
  const league = LEAGUE_PATH[board.sport]
  const [leaders, names] = await Promise.all([
    getJson(`${CORE}/${league}/seasons/${board.year}/types/2/${group}leaders?limit=${limit}`, signal),
    getJson(namesUrl, signal).catch(() => null),
  ])
  const list = (leaders.categories || []).find((c) => c.name === coreName)?.leaders || []
  const known = new Map((names?.athletes || []).map((r) => [String(r.athlete.id), athleteRow(r.athlete)]))
  const idOf = (ref) => /athletes\/(\d+)/.exec(ref || '')?.[1]

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

  const rows = rankByValue(
    list.map((l) => {
      const id = idOf(l.athlete?.$ref)
      return { ...(known.get(id) || { athleteId: id, name: 'Unknown player' }), value: l.displayValue }
    }),
  )
  return { rows, total: rows.length, capped: true }
}
