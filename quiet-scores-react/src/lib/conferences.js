// ESPN conference ids (team.conferenceId on scoreboard competitors) → labels.
// Ids are per-sport. Sourced from ESPN's standings endpoints; they are stable
// across seasons. Unknown ids fall back to the competition's own group name.

const CFB = {
  1: 'ACC', 4: 'Big 12', 5: 'Big Ten', 8: 'SEC', 9: 'Pac-12', 12: 'CUSA', 15: 'MAC',
  17: 'Mountain West', 18: 'FBS Indep.', 37: 'Sun Belt', 151: 'American',
  // FCS
  20: 'Big Sky', 21: 'MVFC', 22: 'Ivy', 24: 'MEAC', 25: 'NEC', 27: 'Patriot', 28: 'Pioneer',
  29: 'Southern', 30: 'Southland', 31: 'SWAC', 32: 'FCS Indep.', 48: 'CAA', 177: 'UAC', 179: 'OVC',
}

const CBB = {
  1: 'America East', 2: 'ACC', 3: 'A-10', 4: 'Big East', 5: 'Big Sky', 6: 'Big South', 7: 'Big Ten',
  8: 'Big 12', 9: 'Big West', 10: 'CAA', 11: 'CUSA', 12: 'Ivy', 13: 'Metro', 14: 'MAC', 16: 'MEAC',
  18: 'MVC', 19: 'NEC', 20: 'OVC', 21: 'Pac-12', 22: 'Patriot', 23: 'SEC', 24: 'SoCon', 25: 'Southland',
  26: 'SWAC', 27: 'Sun Belt', 29: 'WCC', 30: 'UAC', 43: 'Independent', 44: 'Mountain West',
  45: 'Horizon', 46: 'ASUN', 49: 'Summit', 62: 'American',
}

const MAPS = { 'college-football': CFB, 'college-basketball': CBB }

// Power conferences are listed first in the filter, then the rest A–Z.
const POWER = {
  'college-football': ['SEC', 'Big Ten', 'Big 12', 'ACC'],
  'college-basketball': ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Big East'],
}

export const COLLEGE_SPORTS = new Set(Object.keys(MAPS))

export function isCollegeSport(sport) {
  return COLLEGE_SPORTS.has(sport)
}

/** Conference label for a scoreboard competitor, or null. */
export function conferenceFor(sport, competitor, competition) {
  const map = MAPS[sport]
  if (!map) return null
  const id = competitor?.team?.conferenceId
  if (id != null && map[id]) return map[id]
  // Conference games carry the group on the competition itself.
  if (competition?.conferenceCompetition && competition.groups?.isConference) {
    return competition.groups.shortName || competition.groups.name || null
  }
  return null
}

/**
 * Conferences that appear in a list of games, with game counts,
 * ordered power-first then alphabetically.
 */
export function conferencesInGames(sport, games) {
  const counts = new Map()
  for (const g of games) {
    const confs = new Set([g.awayConference, g.homeConference].filter(Boolean))
    for (const c of confs) counts.set(c, (counts.get(c) || 0) + 1)
  }
  const power = POWER[sport] || []
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      const pa = power.indexOf(a.name)
      const pb = power.indexOf(b.name)
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
      return a.name.localeCompare(b.name)
    })
}

export function gameInConference(game, conference) {
  return game.awayConference === conference || game.homeConference === conference
}

/** Section a game is listed under when grouping by conference. */
export function conferenceGroupOf(game) {
  if (game.homeConference && game.homeConference === game.awayConference) return game.homeConference
  return 'Non-Conference'
}

export function groupGamesByConference(sport, games) {
  const order = conferencesInGames(sport, games).map((c) => c.name)
  const groups = new Map()
  for (const g of games) {
    const key = conferenceGroupOf(g)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(g)
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'Non-Conference') return 1
    if (b === 'Non-Conference') return -1
    return order.indexOf(a) - order.indexOf(b)
  })
}
