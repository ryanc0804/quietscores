// Shareable URLs for the detail pages:
//   /nfl/player/4362628/jamarr-chase
//   /nfl/team/4/cincinnati-bengals
//   /nfl/game/401772936?date=20261109
// The name at the end is only for people and search engines; the id is what
// loads the page. Games carry their date because the app finds a game in
// that day's scoreboard. Leaderboards keep the URL of the page they were
// opened from.

const SPORTS = new Set([
  'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'college-football', 'college-basketball',
  'worldcup', 'mls', 'epl', 'ucl', 'laliga', 'bundesliga', 'seriea', 'ligue1',
])

const slug = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** "20261109" for a date, in the viewer's time zone (as the scoreboard is). */
export function dateParam(date) {
  const d = new Date(date)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** The URL for a view-stack entry, or null to keep the current URL. */
export function pathFor(view) {
  if (!view) return '/'
  const { type, value } = view
  const join = (...parts) => '/' + parts.filter(Boolean).map(encodeURIComponent).join('/')
  if (type === 'player') return join(value.sport, 'player', value.athleteId, slug(value.name))
  if (type === 'team') return join(value.sport, 'team', value.teamId, slug(value.teamName))
  if (type === 'game') {
    const date = value.gameDate ? `?date=${dateParam(value.gameDate)}` : ''
    return join(value.sport, 'game', value.id) + date
  }
  return null
}

/** A league's Standings or Leaders view: /nfl/standings, /nba/leaders. */
export const leaguePath = (sport, view) => (view === 'scores' ? '/' : `/${sport}/${view}`)

/**
 * The page a URL points at: { type: 'player' | 'team', value },
 * { type: 'game', sport, id, date }, { type: 'league', sport, view }, or
 * null for the scores list.
 */
export function routeFrom(location) {
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const [sport, type, id] = parts
  if (!SPORTS.has(sport)) return null
  if (parts.length === 2 && (type === 'standings' || type === 'leaders')) return { type: 'league', sport, view: type }
  if (!id) return null
  if (type === 'player') return { type, value: { sport, athleteId: id } }
  if (type === 'team') return { type, value: { sport, teamId: id } }
  if (type === 'game') {
    const raw = new URLSearchParams(location.search).get('date') || ''
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
    return { type, sport, id, date }
  }
  return null
}

/**
 * Once a player/team page has loaded its name: set the tab title, and add
 * the name to the URL if the page was opened from a link without it. Only
 * touches the URL while it still points at this page.
 */
export function nameLoaded(view) {
  document.title = titleFor(view)
  const path = pathFor(view)
  const here = window.location.pathname
  const [, sport, type, id] = here.split('/')
  const [, vSport, vType, vId] = path.split('/')
  if (here !== path && sport === vSport && type === vType && id === vId) {
    try { window.history.replaceState(window.history.state, '', path) } catch { /* ignore */ }
  }
}

/** Browser tab title for a view (pages refine it once their data loads). */
export function titleFor(view) {
  const base = 'Scores n Stats'
  if (!view) return `${base} - Live Scores and Stats | NFL, NBA, MLB, NHL, College`
  const { type, value } = view
  if (type === 'player' && value.name) return `${value.name} Stats | ${base}`
  if (type === 'team' && value.teamName) return `${value.teamName} | ${base}`
  if (type === 'game' && value.awayTeam) return `${value.awayTeam} at ${value.homeTeam} | ${base}`
  if (type === 'leaders' && value.board?.label) return `${value.board.label} Leaders | ${base}`
  return base
}
