// "What's next" for favorite teams and quiet days, from ESPN schedules.
import { fetchSportScoreboard, fetchTeamSchedule, SPORT_PATHS } from './espnApi'
import { parseSchedule } from './schedule'

const HOUR = 3_600_000
const DAY = 24 * HOUR

// A final stays up overnight (until 6 AM the next day); a title game, a week.
const FINAL_UNTIL_HOUR = 6
const TITLE_FINAL_DAYS = 7
const TITLE_GAME = /super bowl|nba finals|world series|stanley cup final|national championship|cfp national|championship game/i

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// `seasonOver`: the week-long window only applies once the team has nothing
// left to play. ESPN labels every series game "World Series - Game N", so mid-
// series the next game must win over the last one.
function finalStillShowing(game, now, seasonOver) {
  const played = new Date(game.date)
  if (seasonOver && TITLE_GAME.test(game.headline || '')) return now - played < TITLE_FINAL_DAYS * DAY
  const cutoff = new Date(startOfDay(played).getTime() + DAY + FINAL_UNTIL_HOUR * HOUR)
  return now < cutoff
}

// Team schedules, cached for a few minutes so the Favorites tab stays quick.
const scheduleCache = new Map()
async function teamGames(sport, teamId, signal) {
  const key = `${sport}:${teamId}`
  const hit = scheduleCache.get(key)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.games
  const regular = parseSchedule(await fetchTeamSchedule(sport, teamId, { signal }), teamId)
  let games = regular
  // ESPN's default schedule is the regular season; playoff games live under
  // seasontype=3, so look there once the regular season has nothing left.
  if (!regular.some((g) => !g.completed)) {
    const path = SPORT_PATHS[sport]
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/schedule?seasontype=3`, { signal })
      if (res.ok) {
        const post = parseSchedule(await res.json(), teamId)
        const seen = new Set(regular.map((g) => g.id))
        games = [...regular, ...post.filter((g) => !seen.has(g.id))]
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e
    }
  }
  scheduleCache.set(key, { at: Date.now(), games })
  return games
}

/**
 * What a favorite team's card should show right now, in priority order:
 * live → recent final (overnight, or a week for a title game) → next game →
 * offseason. Returns { kind: 'live' | 'final' | 'next' | 'offseason', game? }.
 */
export async function favoriteStatus(fav, { now = new Date(), signal } = {}) {
  if (!SPORT_PATHS[fav.sport] || SPORT_PATHS[fav.sport].startsWith('soccer/')) return { kind: 'unknown' }
  const games = await teamGames(fav.sport, fav.teamId, signal)
  const live = games.find((g) => g.state === 'in')
  if (live) return { kind: 'live', game: live }

  const finals = games.filter((g) => g.completed).sort((a, b) => new Date(b.date) - new Date(a.date))
  const next = games
    .filter((g) => !g.completed && g.state !== 'post')
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]
  if (finals[0] && finalStillShowing(finals[0], now, !next)) return { kind: 'final', game: finals[0] }
  if (next) return { kind: 'next', game: next }
  return { kind: 'offseason' }
}

/**
 * The next date after `from` that has games for these sport keys (e.g.
 * ['nfl'], or every soccer league), looking up to `maxDays` ahead a week at
 * a time. Returns a Date or null.
 */
const slateCache = new Map()
export async function nextGameDate(sportKeys, from, { maxDays = 35, signal } = {}) {
  const start = startOfDay(from)
  const key = `${sportKeys.join(',')}:${start.toDateString()}`
  if (slateCache.has(key)) return slateCache.get(key)

  for (let offset = 1; offset <= maxDays; offset += 7) {
    const days = Array.from({ length: Math.min(7, maxDays - offset + 1) }, (_, i) => new Date(start.getTime() + (offset + i) * DAY))
    const counts = await Promise.all(
      days.map((d) =>
        Promise.all(sportKeys.map((s) => fetchSportScoreboard(s, d, { signal }).catch((e) => {
          if (e.name === 'AbortError') throw e
          return []
        }))).then((lists) => lists.reduce((n, l) => n + (l?.length || 0), 0)),
      ),
    )
    const i = counts.findIndex((n) => n > 0)
    if (i >= 0) {
      slateCache.set(key, days[i])
      return days[i]
    }
  }
  slateCache.set(key, null)
  return null
}
