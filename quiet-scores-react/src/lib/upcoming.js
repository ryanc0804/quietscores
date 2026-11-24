// The next day with games, for quiet days, from ESPN scoreboards.
import { fetchSportScoreboard } from './espnApi'

const HOUR = 3_600_000
const DAY = 24 * HOUR

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
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
