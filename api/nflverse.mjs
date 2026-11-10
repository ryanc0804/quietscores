// nflverse season player stats, trimmed for the NFL "Advanced" section.
//
// nflverse publishes its data as GitHub release files, which browsers can't
// read from another site (no CORS). This function fetches the season file and
// nflverse's player id map, keeps the QB/RB/WR/TE columns the app shows, adds
// each player's ESPN id, and returns JSON. Vercel's CDN caches the response
// (see Cache-Control), so nflverse is fetched at most every 30 minutes.
//
// ?set=defense returns defenders instead: Pro Football Reference's charted
// defense stats (pressures, targets allowed, missed tackles…), which nflverse
// republishes per week. PFR's season file lags weeks behind, so the weekly
// rows are summed here.
//
// In dev, quiet-scores-react/vite.config.js serves this same handler at /api/nflverse.
// Lives in the repo-root api/ because the Vercel project's root directory is the
// repo root (vercel.json there builds quiet-scores-react). .mjs because the root
// package.json isn't "type": "module".
import { Buffer } from 'node:buffer'
import { gunzipSync } from 'node:zlib'

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download'

const KEEP = [
  'games',
  // passing
  'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions',
  'sacks_suffered', 'sack_yards_lost', 'passing_air_yards', 'passing_epa', 'passing_cpoe', 'pacr',
  // rushing
  'carries', 'rushing_yards', 'rushing_first_downs', 'rushing_epa',
  // receiving
  'targets', 'receptions', 'receiving_yards', 'receiving_air_yards', 'receiving_yards_after_catch',
  'receiving_epa', 'racr', 'target_share', 'air_yards_share', 'wopr',
]
const GROUPS = new Set(['QB', 'RB', 'WR', 'TE'])

function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res
}

const toNum = (v) => (v === '' || v == null || v === 'NA' ? null : Number(v))

// The NFL season a date belongs to (January/February games are last year's).
function currentSeason() {
  const d = new Date()
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear()
}

async function playerIndex() {
  const res = await download(`${BASE}/players/players.csv.gz`)
  return parseCsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'))
}

async function offense(season) {
  const [statsRes, players, stampRes] = await Promise.all([
    download(`${BASE}/stats_player/stats_player_reg_${season}.csv`),
    playerIndex(),
    download(`${BASE}/stats_player/timestamp.json`).catch(() => null),
  ])
  const stats = parseCsv(await statsRes.text())
  const espnIdOf = new Map(players.filter((p) => p.espn_id).map((p) => [p.gsis_id, p.espn_id]))
  const stamp = stampRes ? await stampRes.json().catch(() => null) : null

  const out = stats
    .filter((r) => GROUPS.has(r.position_group))
    .map((r) => ({
      espnId: espnIdOf.get(r.player_id) || null,
      name: r.player_display_name,
      position: r.position,
      team: r.recent_team,
      headshot: r.headshot_url || null,
      ...Object.fromEntries(KEEP.map((k) => [k, toNum(r[k])])),
    }))
  return { season, updated: stamp?.last_updated || null, players: out }
}

// Weekly PFR columns → the season totals we keep.
const DEF_SUM = {
  def_ints: 'int',
  def_targets: 'tgt',
  def_completions_allowed: 'cmp',
  def_yards_allowed: 'yds',
  def_receiving_td_allowed: 'td',
  def_yards_after_catch: 'yac',
  def_times_blitzed: 'bltz',
  def_times_hurried: 'hrry',
  def_times_hitqb: 'qbhit',
  def_sacks: 'sk',
  def_pressures: 'prss',
  def_tackles_combined: 'comb',
  def_missed_tackles: 'mtkl',
}
const DEF_GROUPS = new Set(['DL', 'LB', 'DB'])

async function defense(season) {
  const [weekRes, players] = await Promise.all([
    download(`${BASE}/pfr_advstats/advstats_week_def_${season}.csv`),
    playerIndex(),
  ])
  const byPfr = new Map(players.filter((p) => p.pfr_id).map((p) => [p.pfr_id, p]))
  const totals = new Map()
  let throughWeek = 0
  for (const r of parseCsv(await weekRes.text())) {
    if (r.game_type !== 'REG') continue
    const week = Number(r.week)
    throughWeek = Math.max(throughWeek, week)
    let t = totals.get(r.pfr_player_id)
    if (!t) {
      t = { pfrId: r.pfr_player_id, name: r.pfr_player_name, team: r.team, lastWeek: 0, games: 0, adotTgt: 0 }
      for (const k of Object.values(DEF_SUM)) t[k] = 0
      totals.set(r.pfr_player_id, t)
    }
    t.games++
    if (week > t.lastWeek) {
      t.lastWeek = week
      t.team = r.team
    }
    for (const [col, k] of Object.entries(DEF_SUM)) t[k] += toNum(r[col]) || 0
    // aDOT allowed is a per-target average; weight it to re-average later.
    t.adotTgt += (toNum(r.def_adot) || 0) * (toNum(r.def_targets) || 0)
  }

  const out = []
  for (const t of totals.values()) {
    const p = byPfr.get(t.pfrId)
    if (!p || !DEF_GROUPS.has(p.position_group)) continue
    const stats = { ...t }
    delete stats.pfrId
    delete stats.lastWeek
    out.push({ ...stats, espnId: p.espn_id || null, group: p.position_group, position: p.position, headshot: p.headshot || null })
  }
  return { season, set: 'defense', throughWeek, players: out }
}

export default async function handler(req, res) {
  const season = Number(req.query?.season) || currentSeason()
  try {
    const body = req.query?.set === 'defense' ? await defense(season) : await offense(season)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // Fresh for 30 min at the CDN; after that, serve the old copy while
    // refreshing in the background, and keep serving it for a week if
    // nflverse/GitHub is down.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400, stale-if-error=604800')
    res.end(JSON.stringify(body))
  } catch (err) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ error: String(err?.message || err) }))
  }
}
