// League standings for the Standings view: ESPN's standings feed, grouped
// the way each league is usually read, with the columns that matter there,
// and sorted (ESPN's NBA and MLB rows don't come in order).
import { fetchStandings } from './espnApi'

/** Sports with a Standings and Leaders view. */
export const LEAGUE_SPORTS = new Set(['nfl', 'nba', 'mlb', 'nhl', 'college-football', 'college-basketball'])

// Division tables for the NFL, MLB and NHL; conferences for the NBA (playoff
// seeding) and college (ESPN's default grouping).
const BY_DIVISION = new Set(['nfl', 'mlb', 'nhl'])

const stat = (e, name) => e.stats?.find((s) => s.name === name)
const num = (e, name) => {
  const v = stat(e, name)?.value
  return Number.isFinite(v) ? v : Number.parseFloat(stat(e, name)?.displayValue) || 0
}
const show = (e, name) => stat(e, name)?.displayValue ?? '–'

// Columns per sport: header, value, and (optionally) a hint on hover.
const COLUMNS = {
  nfl: [
    ['W', (e) => show(e, 'wins')], ['L', (e) => show(e, 'losses')], ['T', (e) => show(e, 'ties')],
    ['PCT', (e) => show(e, 'winPercent')], ['PF', (e) => show(e, 'pointsFor')], ['PA', (e) => show(e, 'pointsAgainst')],
    ['DIFF', (e) => show(e, 'differential')], ['STRK', (e) => show(e, 'streak')],
  ],
  nba: [
    ['W', (e) => show(e, 'wins')], ['L', (e) => show(e, 'losses')], ['PCT', (e) => show(e, 'winPercent')],
    ['GB', (e) => show(e, 'gamesBehind')], ['L10', (e) => show(e, 'Last Ten Games'), 'Last 10 games'], ['STRK', (e) => show(e, 'streak')],
  ],
  mlb: [
    ['W', (e) => show(e, 'wins')], ['L', (e) => show(e, 'losses')], ['PCT', (e) => show(e, 'winPercent')],
    ['GB', (e) => show(e, 'gamesBehind')], ['L10', (e) => show(e, 'Last Ten Games'), 'Last 10 games'], ['STRK', (e) => show(e, 'streak')],
  ],
  nhl: [
    ['GP', (e) => show(e, 'gamesPlayed')], ['W', (e) => show(e, 'wins')], ['L', (e) => show(e, 'losses')],
    ['OTL', (e) => show(e, 'otLosses'), 'Overtime losses'], ['PTS', (e) => show(e, 'points')],
    ['DIFF', (e) => show(e, 'differential'), 'Goal differential'], ['STRK', (e) => show(e, 'streak')],
  ],
  college: [
    ['CONF', (e) => show(e, 'vs. Conf.'), 'Conference record'], ['OVR', (e) => show(e, 'overall'), 'Overall record'],
    ['STRK', (e) => show(e, 'streak')],
  ],
}

function sortEntries(sport, entries) {
  const list = [...entries]
  if (sport === 'nhl') return list.sort((a, b) => num(b, 'points') - num(a, 'points') || num(a, 'gamesPlayed') - num(b, 'gamesPlayed'))
  if (sport.startsWith('college')) {
    // Conference seed when ESPN gives one (0 = none), else overall wins.
    const seed = (e) => num(e, 'playoffSeed') || 999
    return list.sort((a, b) => seed(a) - seed(b) || num(b, 'wins') - num(a, 'wins'))
  }
  return list.sort((a, b) => num(b, 'winPercent') - num(a, 'winPercent') || num(b, 'wins') - num(a, 'wins'))
}

/**
 * { columns: [[label, fn, hint?]], sections: [{ title, tables: [{ name, rows: [entry] }] }] }
 * Pro leagues come as conference sections of division tables; college as
 * one section of conference tables. Each row is an ESPN standings entry.
 */
export async function fetchLeagueStandings(sport) {
  const data = await fetchStandings(sport, { divisions: BY_DIVISION.has(sport) })
  if (!data) throw new Error('No standings')
  const columns = COLUMNS[sport.startsWith('college') ? 'college' : sport] || COLUMNS.nba
  const table = (g) => ({ name: g.name, rows: sortEntries(sport, g.standings?.entries || []) })
  const sections = []
  for (const top of data.children || []) {
    if (top.children?.length) {
      sections.push({ title: top.name, tables: top.children.filter((c) => c.standings?.entries?.length).map(table) })
    } else if (top.standings?.entries?.length) {
      // Conference-level groups: collect them under one untitled section.
      const last = sections[sections.length - 1]
      if (last && !last.title) last.tables.push(table(top))
      else sections.push({ title: null, tables: [table(top)] })
    }
  }
  return { columns, sections: sections.filter((s) => s.tables.length) }
}
