// nflverse season player stats, trimmed for the NFL "Advanced" section.
//
// nflverse publishes its data as GitHub release files, which browsers can't
// read from another site (no CORS). This function fetches the season file and
// nflverse's player id map, keeps the QB/RB/WR/TE columns the app shows, adds
// each player's ESPN id, and returns JSON. Vercel's CDN caches the response
// (see Cache-Control), so nflverse is fetched at most every 30 minutes.
//
// In dev, vite.config.js serves this same handler at /api/nflverse.
// Lives in quiet-scores-react/api because that folder is the Vercel project root.
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

export default async function handler(req, res) {
  const season = Number(req.query?.season) || currentSeason()
  try {
    const [statsRes, playersRes, stampRes] = await Promise.all([
      download(`${BASE}/stats_player/stats_player_reg_${season}.csv`),
      download(`${BASE}/players/players.csv.gz`),
      download(`${BASE}/stats_player/timestamp.json`).catch(() => null),
    ])
    const stats = parseCsv(await statsRes.text())
    const players = parseCsv(gunzipSync(Buffer.from(await playersRes.arrayBuffer())).toString('utf8'))
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

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // Fresh for 30 min at the CDN; after that, serve the old copy while
    // refreshing in the background, and keep serving it for a week if
    // nflverse/GitHub is down.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400, stale-if-error=604800')
    res.end(JSON.stringify({ season, updated: stamp?.last_updated || null, players: out }))
  } catch (err) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ error: String(err?.message || err) }))
  }
}
