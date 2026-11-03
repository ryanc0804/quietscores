// Advanced stats for NFL and MLB player pages, with league ranks and
// leaderboards. Every source here allows browser requests (CORS *):
//   MLB  – MLB Stats API (wRC+, wOBA, WAR, FIP, xFIP) and Baseball Savant
//          (expected stats and Statcast batted-ball data)
//   NFL  – ESPN: per-player core stats, plus the byathlete lists, from which
//          rate stats (catch %, ANY/A, …) are computed for every player.
// A stat's leaderboard is the same list its rank comes from, so they agree.
import { formatRank, leaderboardFor } from './leaders'

const STATSAPI = 'https://statsapi.mlb.com/api/v1'
const SAVANT = 'https://baseballsavant.mlb.com/leaderboard'
const ESPN_WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl'
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'

const PITCHER = /^(P|SP|RP|CP)$/i

async function getJson(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

// Simple per-session cache so a page and its leaderboards share requests.
const cache = new Map()
function cached(key, load) {
  if (!cache.has(key)) {
    const p = load()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)
}

const num = (v) => (v == null || v === '' ? NaN : parseFloat(String(v).replace(/,/g, '')))
const fixed = (d) => (v) => (Number.isFinite(v) ? v.toFixed(d) : '–')
const rate3 = (v) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '–') // .372
const pct1 = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '–')
const int = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '–')

// Ties share a rank, like ESPN's "Tied-9th".
function ranked(rows, asc) {
  const sorted = rows.filter((r) => Number.isFinite(r.raw)).sort((a, b) => (asc ? a.raw - b.raw : b.raw - a.raw))
  let prev = null
  let prevRank = 0
  return sorted.map((r, n) => {
    const rank = r.raw === prev ? prevRank : n + 1
    prev = r.raw
    prevRank = rank
    return { ...r, rank }
  })
}

/** "T-5th" / "12th" for an entry in a ranked list, or null. */
function rankText(list, match) {
  const me = list.find(match)
  if (!me) return null
  const tied = list.filter((r) => r.rank === me.rank).length > 1
  return `${tied ? 'T-' : ''}${formatRank(me.rank)}`
}

/* ------------------------------------------------------------------ MLB */

const mlbHeadshot = (id) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_96,q_auto:best/v1/people/${id}/headshot/67/current`

const mlbTeams = () =>
  cached('mlb:teams', () =>
    getJson(`${STATSAPI}/teams?sportId=1`).then((d) => new Map((d.teams || []).map((t) => [t.id, t.abbreviation]))),
  )

/** ESPN player → MLB id, by name search; birthdate breaks ties. */
export function mlbIdFor(player) {
  return cached(`mlb:id:${player.id}`, async () => {
    const d = await getJson(`${STATSAPI}/people/search?names=${encodeURIComponent(player.name)}`)
    const people = d.people || []
    if (people.length <= 1) return people[0]?.id ?? null
    // ESPN gives "26/4/1992"; MLB gives "1992-04-26".
    const [dd, mm, yyyy] = (player.birthDate || '').split('/')
    const iso = yyyy ? `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : null
    return (people.find((p) => p.birthDate === iso) || people.find((p) => p.active) || people[0]).id
  })
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split('\n')
  const split = (line) => {
    const out = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const head = split(lines[0])
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])))
}

// Savant lists: q = qualified (ranks); 1 = everyone (a player's own value).
function savant(kind, type, year, min) {
  const path = kind === 'x' ? 'expected_statistics' : 'statcast'
  return cached(`savant:${kind}:${type}:${year}:${min}`, async () => {
    const res = await fetch(`${SAVANT}/${path}?type=${type}&year=${year}&min=${min}&csv=true`)
    if (!res.ok) throw new Error(`Savant ${res.status}`)
    return parseCsv(await res.text()).map((r) => {
      const [last, first] = (r['last_name, first_name'] || '').split(',').map((s) => s.trim())
      return { ...r, mlbId: Number(r.player_id), name: first ? `${first} ${last}` : last }
    })
  })
}

// MLB Stats API sabermetrics, qualified pool (one sorted request).
function saberList(group, year) {
  return cached(`saber:${group}:${year}`, async () => {
    const [d, teams] = await Promise.all([
      getJson(`${STATSAPI}/stats?stats=sabermetrics&group=${group}&season=${year}&playerPool=qualified&limit=500`),
      mlbTeams(),
    ])
    return (d.stats?.[0]?.splits || []).map((s) => ({
      ...s.stat,
      mlbId: s.player.id,
      name: s.player.fullName,
      team: teams.get(s.team?.id) || null,
    }))
  })
}
function saberFor(mlbId, group, year) {
  return cached(`saber:${mlbId}:${group}:${year}`, () =>
    getJson(`${STATSAPI}/people/${mlbId}/stats?stats=sabermetrics&group=${group}&season=${year}`).then(
      (d) => d.stats?.[0]?.splits?.[0]?.stat || null,
    ),
  )
}

// Each stat: where it comes from, which field, how to show it, which way is better.
const MLB_STATS = {
  hitting: [
    { key: 'wRcPlus', label: 'wRC+', name: 'Weighted Runs Created Plus', desc: 'Runs created per plate appearance, park- and league-adjusted; 100 is league average.', src: 'saber', field: 'wRcPlus', fmt: int },
    { key: 'war', label: 'WAR', name: 'Wins Above Replacement', desc: 'Total value in wins over a replacement-level player.', src: 'saber', field: 'war', fmt: fixed(1) },
    { key: 'woba', label: 'wOBA', name: 'Weighted On-Base Average', desc: 'On-base average that weights each way of reaching base by its run value.', src: 'saber', field: 'woba', fmt: rate3 },
    { key: 'xwoba', label: 'xwOBA', name: 'Expected wOBA', desc: 'wOBA expected from quality of contact (exit velocity and launch angle), strikeouts and walks.', src: 'x', field: 'est_woba', fmt: rate3 },
    { key: 'xba', label: 'xBA', name: 'Expected Batting Average', desc: 'Batting average expected from quality of contact.', src: 'x', field: 'est_ba', fmt: rate3 },
    { key: 'xslg', label: 'xSLG', name: 'Expected Slugging', desc: 'Slugging percentage expected from quality of contact.', src: 'x', field: 'est_slg', fmt: rate3 },
    { key: 'barrel', label: 'Barrel %', name: 'Barrel Rate', desc: 'Share of batted balls hit at an ideal exit velocity and launch angle.', src: 'sc', field: 'brl_percent', fmt: pct1 },
    { key: 'hardhit', label: 'Hard-hit %', name: 'Hard-Hit Rate', desc: 'Share of batted balls hit 95 mph or harder.', src: 'sc', field: 'ev95percent', fmt: pct1 },
    { key: 'ev', label: 'Avg exit velo', name: 'Average Exit Velocity', desc: 'Average speed of the ball off the bat (mph).', src: 'sc', field: 'avg_hit_speed', fmt: fixed(1) },
  ],
  pitching: [
    { key: 'fip', label: 'FIP', name: 'Fielding Independent Pitching', desc: 'ERA estimate from strikeouts, walks, hit batters and home runs only.', src: 'saber', field: 'fip', fmt: fixed(2), asc: true },
    { key: 'xfip', label: 'xFIP', name: 'Expected FIP', desc: 'FIP with a league-average home run rate on fly balls.', src: 'saber', field: 'xfip', fmt: fixed(2), asc: true },
    { key: 'xera', label: 'xERA', name: 'Expected ERA', desc: 'ERA expected from quality of contact allowed, strikeouts and walks.', src: 'x', field: 'xera', fmt: fixed(2), asc: true },
    { key: 'war', label: 'WAR', name: 'Wins Above Replacement', desc: 'Total value in wins over a replacement-level pitcher.', src: 'saber', field: 'war', fmt: fixed(1) },
    { key: 'xwoba', label: 'xwOBA allowed', name: 'Expected wOBA Allowed', desc: 'Opponents’ expected wOBA from quality of contact; lower is better.', src: 'x', field: 'est_woba', fmt: rate3, asc: true },
    { key: 'barrel', label: 'Barrel % allowed', name: 'Barrel Rate Allowed', desc: 'Share of batted balls against that were barrels; lower is better.', src: 'sc', field: 'brl_percent', fmt: pct1, asc: true },
    { key: 'hardhit', label: 'Hard-hit % allowed', name: 'Hard-Hit Rate Allowed', desc: 'Share of batted balls against hit 95+ mph; lower is better.', src: 'sc', field: 'ev95percent', fmt: pct1, asc: true },
  ],
}

async function mlbList(def, group, year) {
  if (def.src === 'saber') return saberList(group, year)
  const type = group === 'pitching' ? 'pitcher' : 'batter'
  return savant(def.src, type, year, 'q')
}

// Savant's lists have no teams; MLB's people endpoint returns current teams
// for many ids in one request.
function mlbCurrentTeams(ids) {
  const key = `mlb:cur:${ids.length}:${ids[0]}:${ids[ids.length - 1]}`
  return cached(key, async () => {
    const [d, teams] = await Promise.all([
      getJson(`${STATSAPI}/people?personIds=${ids.join(',')}&hydrate=currentTeam`),
      mlbTeams(),
    ])
    return new Map((d.people || []).map((p) => [p.id, teams.get(p.currentTeam?.id) || null]))
  })
}

async function mlbBoardRows(board) {
  const def = MLB_STATS[board.group].find((d) => d.key === board.stat)
  let list = await mlbList(def, board.group, board.year)
  if (def.src !== 'saber') {
    // Savant's "qualified" is a looser cut (relievers, part-timers); rank every
    // tab among MLB's qualified players so the tabs compare the same group.
    const qualified = new Set((await saberList(board.group, board.year)).map((r) => r.mlbId))
    list = list.filter((r) => qualified.has(r.mlbId))
  }
  const needTeams = list.some((r) => !r.team)
  const teamOf = needTeams ? await mlbCurrentTeams(list.map((r) => r.mlbId)).catch(() => new Map()) : new Map()
  const rows = list.map((r) => ({
    athleteId: null,
    mlbId: r.mlbId,
    name: r.name,
    team: r.team || teamOf.get(r.mlbId) || null,
    headshot: mlbHeadshot(r.mlbId),
    raw: num(r[def.field]),
  }))
  return ranked(rows, def.asc).map((r) => ({ ...r, value: def.fmt(r.raw) }))
}

async function mlbAdvanced(player, year) {
  const group = PITCHER.test(player.positionAbbr || '') ? 'pitching' : 'hitting'
  const mlbId = await mlbIdFor(player)
  if (!mlbId) return null
  const type = group === 'pitching' ? 'pitcher' : 'batter'
  const [own, x, sc] = await Promise.all([
    saberFor(mlbId, group, year).catch(() => null),
    savant('x', type, year, 1).catch(() => []),
    savant('sc', type, year, 1).catch(() => []),
  ])
  const mine = { saber: own, x: x.find((r) => r.mlbId === mlbId), sc: sc.find((r) => r.mlbId === mlbId) }
  const tiles = (
    await Promise.all(
      MLB_STATS[group].map(async (def) => {
        const raw = num(mine[def.src]?.[def.field])
        if (!Number.isFinite(raw)) return null
        const board = { sport: 'mlb', kind: 'mlb', group, stat: def.key, label: def.name, abbreviation: def.label, description: def.desc, year }
        const list = await mlbBoardRows(board).catch(() => [])
        const rank = rankText(list, (r) => r.mlbId === mlbId)
        return { key: def.key, label: def.label, value: def.fmt(raw), desc: def.desc, board, rank, reason: rank ? null : 'Not qualified' }
      }),
    )
  ).filter(Boolean)
  return tiles.length ? { mlbId, tiles, source: 'MLB Stats API · Baseball Savant' } : null
}

/* ------------------------------------------------------------------ NFL */

// Rate stats computed from a byathlete category row. `vol` is the volume the
// rate needs; players below a per-game minimum (as qualified lists do) are
// left out of the ranking.
const NFL_DERIVED = {
  catchPct: { cat: 'receiving', label: 'Catch %', name: 'Catch Rate', desc: 'Receptions per target.', vol: 'receivingTargets', minPerGame: 3, calc: (s) => (100 * s.receptions) / s.receivingTargets, fmt: pct1 },
  yardsPerTarget: { cat: 'receiving', label: 'Yds / target', name: 'Yards per Target', desc: 'Receiving yards per target.', vol: 'receivingTargets', minPerGame: 3, calc: (s) => s.receivingYards / s.receivingTargets, fmt: fixed(1) },
  yacPerRec: { cat: 'receiving', label: 'YAC / catch', name: 'Yards After Catch per Reception', desc: 'Yards gained after the catch, per reception.', vol: 'receptions', minPerGame: 1.875, calc: (s) => s.receivingYardsAfterCatch / s.receptions, fmt: fixed(1) },
  anyA: {
    cat: 'passing', label: 'ANY/A', name: 'Adjusted Net Yards per Attempt',
    desc: 'Passing yards plus 20 per TD minus 45 per INT, less sack yards, per dropback.',
    vol: 'passingAttempts', minPerGame: 14,
    calc: (s) => (s.passingYards + 20 * s.passingTouchdowns - 45 * s.interceptions - s.sackYardsLost) / (s.passingAttempts + s.sacks),
    fmt: fixed(2),
  },
  tdPct: { cat: 'passing', label: 'TD %', name: 'Touchdown Rate', desc: 'Touchdown passes per attempt.', vol: 'passingAttempts', minPerGame: 14, calc: (s) => (100 * s.passingTouchdowns) / s.passingAttempts, fmt: pct1 },
  intPct: { cat: 'passing', label: 'INT %', name: 'Interception Rate', desc: 'Interceptions per attempt; lower is better.', vol: 'passingAttempts', minPerGame: 14, calc: (s) => (100 * s.interceptions) / s.passingAttempts, fmt: pct1, asc: true },
  sackPct: { cat: 'passing', label: 'Sack %', name: 'Sack Rate', desc: 'Sacks per dropback; lower is better.', vol: 'passingAttempts', minPerGame: 14, calc: (s) => (100 * s.sacks) / (s.passingAttempts + s.sacks), fmt: pct1, asc: true },
  rushFdRate: { cat: 'rushing', label: '1st down %', name: 'Rushing First Down Rate', desc: 'Share of carries that gained a first down.', vol: 'rushingAttempts', minPerGame: 6.25, calc: (s) => (100 * s.rushingFirstDowns) / s.rushingAttempts, fmt: pct1 },
}

// Raw ESPN stats shown in the Advanced section (ranked on the normal boards).
const NFL_NATIVE = {
  receivingTargets: { label: 'Targets', fmt: int },
  receivingYardsAfterCatch: { label: 'YAC', fmt: int },
  receivingFirstDowns: { label: '1st downs', fmt: int },
  receivingBigPlays: { label: 'Big plays (20+)', fmt: int },
  rushingFirstDowns: { label: '1st downs', fmt: int },
  rushingBigPlays: { label: 'Big runs (10+)', fmt: int },
  QBRating: { label: 'Passer rating', fmt: fixed(1), minPerGame: 14 },
  tacklesForLoss: { label: 'TFL', fmt: int },
  passesDefended: { label: 'Passes defended', fmt: int },
}
// ESPN's core stats also list QBHits, hurries and stuffs, but leave them at 0
// for everyone (T.J. Watt: 7.5 sacks, 0 QB hits), so they aren't shown.

// The volume stat each category's shared list is sorted by.
const NFL_VOLUME = { receiving: 'receivingTargets', rushing: 'rushingAttempts', passing: 'passingAttempts', defensive: 'totalTackles' }

const NFL_LAYOUT = {
  QB: ['QBRating', 'anyA', 'tdPct', 'intPct', 'sackPct'],
  receiver: ['receivingTargets', 'catchPct', 'yardsPerTarget', 'receivingYardsAfterCatch', 'yacPerRec', 'receivingFirstDowns', 'receivingBigPlays'],
  RB: ['rushingFirstDowns', 'rushFdRate', 'rushingBigPlays', 'receivingTargets', 'receivingYardsAfterCatch'],
  defense: ['tacklesForLoss', 'passesDefended'],
}
function nflRole(pos) {
  if (pos === 'QB') return 'QB'
  if (pos === 'WR' || pos === 'TE') return 'receiver'
  if (pos === 'RB' || pos === 'FB') return 'RB'
  if (/(LB|DE|DT|CB|S|DB|DL|NT|EDGE)$/.test(pos || '')) return 'defense'
  return null
}

// A player's own season numbers: ESPN core stats, flattened by stat name.
function nflCoreStats(athleteId, year) {
  return cached(`nfl:core:${athleteId}:${year}`, async () => {
    const d = await getJson(`${ESPN_CORE}/seasons/${year}/types/2/athletes/${athleteId}/statistics`)
    const out = {}
    for (const c of d.splits?.categories || []) for (const s of c.stats || []) out[s.name] ??= s.value
    return out
  })
}

// Every player's line in one byathlete category (sorted by volume).
function nflCategoryRows(cat, vol) {
  return cached(`nfl:by:${cat}:${vol}`, async () => {
    const d = await getJson(`${ESPN_WEB}/statistics/byathlete?seasontype=2&sort=${cat}.${vol}:desc&limit=400&isqualified=false`)
    const meta = (d.categories || []).find((c) => c.name === cat)
    const gpCat = (d.categories || []).find((c) => c.name === 'general')
    return (d.athletes || []).map((r) => {
      const c = r.categories?.find((x) => x.name === cat)
      const g = r.categories?.find((x) => x.name === 'general')
      const s = Object.fromEntries((meta?.names || []).map((n, i) => [n, c?.values?.[i] ?? 0]))
      s.gamesPlayed = g?.values?.[gpCat?.names.indexOf('gamesPlayed')] ?? 0
      const a = r.athlete
      return { athleteId: String(a.id), name: a.displayName, team: a.teamShortName || null, headshot: a.headshot?.href || null, position: a.position?.abbreviation || null, s }
    })
  })
}

async function nflDerivedRows(board) {
  const def = NFL_DERIVED[board.stat]
  const rows = await nflCategoryRows(def.cat, def.vol)
  const teamGames = Math.max(1, ...rows.map((r) => r.s.gamesPlayed || 0))
  const qualified = rows.filter((r) => r.s[def.vol] >= def.minPerGame * teamGames)
  return ranked(qualified.map((r) => ({ ...r, raw: def.calc(r.s) })), def.asc).map((r) => ({ ...r, value: def.fmt(r.raw) }))
}

async function nflAdvanced(player, year) {
  const role = nflRole(player.positionAbbr)
  if (!role) return null
  const core = await nflCoreStats(player.id, year).catch(() => null)
  if (!core) return null
  const mine = (r) => r.athleteId === String(player.id)
  const tiles = []
  for (const key of NFL_LAYOUT[role]) {
    if (NFL_DERIVED[key]) {
      const def = NFL_DERIVED[key]
      const raw = def.calc(core)
      if (!Number.isFinite(raw) || !(core[def.vol] > 0)) continue
      const board = { sport: 'nfl', kind: 'nfl-derived', group: def.cat, stat: key, label: def.name, abbreviation: def.label, description: def.desc, year }
      const rank = rankText(await nflDerivedRows(board).catch(() => []), mine)
      tiles.push({ key, label: def.label, value: def.fmt(raw), desc: def.desc, board, rank, reason: rank ? null : 'Not qualified' })
    } else if (NFL_NATIVE[key]) {
      const def = NFL_NATIVE[key]
      const raw = num(core[key])
      if (!Number.isFinite(raw)) continue
      // Opens the normal ESPN board; the rank comes from the same category
      // list (one shared request), ranked by this stat.
      const board = await leaderboardFor('nfl', key, player.positionAbbr).catch(() => null)
      let rank = null
      if (board) {
        const vol = NFL_VOLUME[board.category] || key
        let rows = await nflCategoryRows(board.category, vol).catch(() => [])
        if (def.minPerGame) {
          // A rate (passer rating): ranked among qualified players only.
          const teamGames = Math.max(1, ...rows.map((r) => r.s.gamesPlayed || 0))
          rows = rows.filter((r) => r.s[vol] >= def.minPerGame * teamGames)
        }
        rank = rankText(ranked(rows.map((r) => ({ ...r, raw: num(r.s[key]) }))), mine)
      }
      tiles.push({ key, label: def.label, value: def.fmt(raw), board, rank })
    }
  }
  return tiles.length ? { tiles, source: 'ESPN' } : null
}

/* ------------------------------------------------------- NFL (nflverse) */

// Season stats from nflverse via our /api/nflverse function (see api/), which
// adds ESPN ids so rows open the right player. ESPN's QBR feed adds QBR and
// points added for quarterbacks. If /api/nflverse is unavailable, the NFL
// section falls back to the ESPN-only tiles above.
const nflverse = (year) =>
  cached(`nflverse:${year}`, async () => {
    const d = await getJson(`/api/nflverse?season=${year}`)
    if (!Array.isArray(d.players)) throw new Error('No nflverse data')
    // Per-team games played (capped at 17) sets each player's qualifying bar.
    const teamGames = new Map()
    for (const p of d.players) teamGames.set(p.team, Math.min(17, Math.max(teamGames.get(p.team) || 0, p.games || 0)))
    return { updated: d.updated, players: d.players.map((p) => ({ ...p, teamGames: teamGames.get(p.team) || p.games || 1 })) }
  })

const per = (a, b) => (b > 0 ? a / b : NaN)
const signed2 = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : '–')
const signed1 = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}` : '–')
const pctOf = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}%` : '–') // 0.234 → 23.4%

const dropbacks = (p) => (p.attempts || 0) + (p.sacks_suffered || 0)
const passers = (p) => p.attempts >= 14 * p.teamGames
const targeted = (p) => p.targets >= 3 * p.teamGames
// Rushing boards compare running backs; QB scrambles and sneaks are a different kind of run.
const rushers = (p) => (p.position === 'RB' || p.position === 'FB') && p.carries >= 6.25 * p.teamGames

// group = leaderboard tab group; pool = who qualifies for the ranking.
const NFLV_STATS = {
  epaDb: { group: 'passing', label: 'EPA / dropback', name: 'EPA per Dropback', desc: 'Expected points added per pass attempt or sack: how much each dropback moved the scoreboard odds.', pool: passers, calc: (p) => per(p.passing_epa, dropbacks(p)), fmt: signed2 },
  cpoe: { group: 'passing', label: 'CPOE', name: 'Completion % Over Expected', desc: 'Completion percentage above what an average QB would hit on the same throws (depth, coverage, pressure).', pool: passers, calc: (p) => p.passing_cpoe, fmt: signed1 },
  ayPerAtt: { group: 'passing', label: 'Air yards / att', name: 'Intended Air Yards per Attempt', desc: 'How far downfield the average pass travels, caught or not.', pool: passers, calc: (p) => per(p.passing_air_yards, p.attempts), fmt: fixed(1) },
  pacr: { group: 'passing', label: 'PACR', name: 'Passing Air Conversion Ratio', desc: 'Passing yards per air yard thrown; above 1 means receivers add yards after the catch.', pool: passers, calc: (p) => p.pacr, fmt: fixed(2) },
  anyA: {
    group: 'passing', label: 'ANY/A', name: 'Adjusted Net Yards per Attempt',
    desc: 'Passing yards plus 20 per TD minus 45 per INT, less sack yards, per dropback.', pool: passers,
    calc: (p) => per(p.passing_yards + 20 * p.passing_tds - 45 * p.passing_interceptions - Math.abs(p.sack_yards_lost || 0), dropbacks(p)),
    fmt: fixed(2),
  },
  targetShare: { group: 'receiving', label: 'Target share', name: 'Target Share', desc: 'Share of the team’s targets that went to this player.', pool: targeted, calc: (p) => p.target_share, fmt: pctOf },
  airShare: { group: 'receiving', label: 'Air yards share', name: 'Air Yards Share', desc: 'Share of the team’s passing air yards thrown at this player.', pool: targeted, calc: (p) => p.air_yards_share, fmt: pctOf },
  wopr: { group: 'receiving', label: 'WOPR', name: 'Weighted Opportunity Rating', desc: 'Target share and air yards share combined (1.5 × target share + 0.7 × air yards share): how much of the passing game runs through a player.', pool: targeted, calc: (p) => p.wopr, fmt: fixed(2) },
  adot: { group: 'receiving', label: 'aDOT', name: 'Average Depth of Target', desc: 'Average air yards per target: how far downfield a player is being thrown to.', pool: targeted, calc: (p) => per(p.receiving_air_yards, p.targets), fmt: fixed(1) },
  racr: { group: 'receiving', label: 'RACR', name: 'Receiver Air Conversion Ratio', desc: 'Receiving yards per air yard targeted; high means efficient after the catch or on short throws.', pool: targeted, calc: (p) => p.racr, fmt: fixed(2) },
  epaTgt: { group: 'receiving', label: 'EPA / target', name: 'Receiving EPA per Target', desc: 'Expected points added per target.', pool: targeted, calc: (p) => per(p.receiving_epa, p.targets), fmt: signed2 },
  yacRec: { group: 'receiving', label: 'YAC / catch', name: 'Yards After Catch per Reception', desc: 'Yards gained after the catch, per reception.', pool: targeted, calc: (p) => per(p.receiving_yards_after_catch, p.receptions), fmt: fixed(1) },
  epaCarry: { group: 'rushing', label: 'EPA / carry', name: 'Rushing EPA per Carry', desc: 'Expected points added per rush; most backs are below zero, so anything positive is strong.', pool: rushers, calc: (p) => per(p.rushing_epa, p.carries), fmt: signed2 },
  rushFd: { group: 'rushing', label: '1st down %', name: 'Rushing First Down Rate', desc: 'Share of carries that gained a first down.', pool: rushers, calc: (p) => 100 * per(p.rushing_first_downs, p.carries), fmt: pct1 },
  ypc: { group: 'rushing', label: 'Yds / carry', name: 'Yards per Carry', desc: 'Rushing yards per carry.', pool: rushers, calc: (p) => per(p.rushing_yards, p.carries), fmt: fixed(1) },
}

const NFLV_LAYOUT = {
  QB: ['epaDb', 'cpoe', 'ayPerAtt', 'pacr', 'anyA'],
  receiver: ['targetShare', 'airShare', 'wopr', 'adot', 'racr', 'epaTgt', 'yacRec'],
  RB: ['epaCarry', 'rushFd', 'targetShare', 'epaTgt', 'yacRec'],
}

async function nflverseRows(board) {
  const def = NFLV_STATS[board.stat]
  const { players } = await nflverse(board.year)
  const rows = players.filter(def.pool).map((p) => ({
    athleteId: p.espnId,
    name: p.name,
    team: p.team,
    position: p.position,
    headshot: p.headshot,
    raw: def.calc(p),
  }))
  return ranked(rows, def.asc).map((r) => ({ ...r, value: def.fmt(r.raw) }))
}

// ESPN's QBR feed (qualified QBs): QBR and points added, with ESPN athlete ids.
const QBR_STATS = {
  qbr: { label: 'QBR', name: 'ESPN Total QBR', desc: 'ESPN’s 0–100 rating of a QB’s contribution to winning on every play: passes, runs, sacks, penalties.', field: 'qbr', fmt: fixed(1) },
  qbpaa: { label: 'Points added', name: 'Points Added Above Average', desc: 'Points the QB contributed beyond an average QB on the same plays (ESPN).', field: 'qbpaa', fmt: signed1 },
}
const qbrList = (year) =>
  cached(`qbr:${year}`, async () => {
    const d = await getJson(`${ESPN_CORE}/seasons/${year}/types/2/groups/9/qbr/0?limit=100`)
    return (d.items || []).map((it) => {
      const stats = Object.fromEntries((it.splits?.categories?.[0]?.stats || []).map((s) => [s.name, s.value]))
      return { athleteId: /athletes\/(\d+)/.exec(it.athlete?.$ref || '')?.[1] || null, stats }
    })
  })

async function qbrRows(board) {
  const def = QBR_STATS[board.stat]
  const [list, nv] = await Promise.all([qbrList(board.year), nflverse(board.year).catch(() => null)])
  const info = new Map((nv?.players || []).map((p) => [p.espnId, p]))
  const rows = list.map((r) => {
    const p = info.get(r.athleteId)
    return { athleteId: r.athleteId, name: p?.name || 'Unknown player', team: p?.team || null, position: 'QB', headshot: p?.headshot || null, raw: num(r.stats[def.field]) }
  })
  return ranked(rows, false).map((r) => ({ ...r, value: def.fmt(r.raw) }))
}

async function nflverseAdvanced(player, year) {
  const role = nflRole(player.positionAbbr)
  if (!role || role === 'defense') return null
  const { updated, players } = await nflverse(year)
  const me = players.find((p) => p.espnId === String(player.id))
  if (!me) return null
  const mine = (r) => r.athleteId === String(player.id)
  const tiles = []
  for (const key of NFLV_LAYOUT[role]) {
    const def = NFLV_STATS[key]
    const raw = def.calc(me)
    if (!Number.isFinite(raw)) continue
    const board = { sport: 'nfl', kind: 'nflverse', group: def.group, stat: key, label: def.name, abbreviation: def.label, description: def.desc, year }
    const rank = rankText(await nflverseRows(board), mine)
    tiles.push({ key, label: def.label, value: def.fmt(raw), desc: def.desc, board, rank, reason: rank ? null : 'Not qualified' })
  }
  if (role === 'QB') {
    const list = await qbrList(year).catch(() => [])
    const row = list.find(mine)
    for (const [key, def] of Object.entries(QBR_STATS)) {
      const raw = num(row?.stats?.[def.field])
      if (!Number.isFinite(raw)) continue
      const board = { sport: 'nfl', kind: 'qbr', group: 'qbr', stat: key, label: def.name, abbreviation: def.label, description: def.desc, year }
      const rank = rankText(await qbrRows(board), mine)
      tiles.push({ key, label: def.label, value: def.fmt(raw), desc: def.desc, board, rank, reason: rank ? null : 'Not qualified' })
    }
  }
  return tiles.length ? { tiles, source: role === 'QB' ? 'nflverse · ESPN QBR' : 'nflverse', updated } : null
}

/* -------------------------------------------------------------- public */

/** { tiles: [{ key, label, value, desc?, board? }], source, updated?, mlbId? } or null. */
export async function fetchAdvanced(player, year) {
  if (player.sport === 'mlb') return mlbAdvanced(player, year)
  if (player.sport === 'nfl') {
    // Real advanced stats from nflverse; ESPN-only tiles if nflverse is
    // unavailable or doesn't have the player. Defenders get no section:
    // nflverse has no advanced defensive stats.
    const role = nflRole(player.positionAbbr)
    if (!role || role === 'defense') return null
    return (await nflverseAdvanced(player, year).catch(() => null)) || nflAdvanced(player, year)
  }
  return null
}

/** Leaderboard rows for an advanced board (same shape as leaders.js). */
export async function fetchAdvancedLeaderboard(board, { limit = 50 } = {}) {
  const all =
    board.kind === 'mlb' ? await mlbBoardRows(board)
      : board.kind === 'nflverse' ? await nflverseRows(board)
        : board.kind === 'qbr' ? await qbrRows(board)
          : await nflDerivedRows(board)
  return { rows: all.slice(0, limit), total: all.length, qualified: true, all }
}

/** The other advanced boards in the same group, for the stat tabs. */
export function advancedSiblings(board) {
  const as = (k, d) => ({ ...board, stat: k, label: d.name, abbreviation: d.label, description: d.desc })
  if (board.kind === 'mlb') return MLB_STATS[board.group].map((d) => as(d.key, d))
  if (board.kind === 'nflverse') return Object.entries(NFLV_STATS).filter(([, d]) => d.group === board.group).map(([k, d]) => as(k, d))
  if (board.kind === 'qbr') return Object.entries(QBR_STATS).map(([k, d]) => as(k, d))
  return Object.entries(NFL_DERIVED)
    .filter(([, d]) => d.cat === board.group)
    .map(([k, d]) => as(k, d))
}

export const isAdvancedBoard = (b) => ['mlb', 'nfl-derived', 'nflverse', 'qbr'].includes(b?.kind)
