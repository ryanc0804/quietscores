// Career stats by season from ESPN's athlete stats endpoint.
import { SPORT_PATHS } from './espnApi'

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports'
const PITCHER = /^(P|SP|RP|CP)$/i

// Which category to open first, by position (football has one per role).
const DEFAULT_CATEGORY = {
  QB: 'passing',
  RB: 'rushing',
  FB: 'rushing',
  WR: 'receiving',
  TE: 'receiving',
  K: 'kicking',
  PK: 'kicking',
  P: 'punting',
}

// ESPN lists seasons oldest first; flip the seasons but keep each season's
// rows (team, team, total) in their original order.
function newestSeasonFirst(stats) {
  const bySeason = []
  for (const s of stats) {
    const key = s.season?.year ?? s.season?.displayName
    const last = bySeason[bySeason.length - 1]
    if (last && last.key === key) last.rows.push(s)
    else bySeason.push({ key, rows: [s] })
  }
  return bySeason.reverse().flatMap((g) => g.rows)
}

/**
 * { tabs:[{ key, label, labels, rows: [{ season, team, logo, stats }], totals }], defaultKey }
 * Rows are newest season first. Postseason tables are left out.
 */
export async function fetchCareer(sport, athleteId, position, { signal } = {}) {
  const path = SPORT_PATHS[sport]
  if (!path) return null
  // MLB defaults to batting; pitchers need their pitching table instead.
  const qs = sport === 'mlb' && PITCHER.test(position || '') ? '?category=pitching' : ''
  const res = await fetch(`${WEB}/${path}/athletes/${athleteId}/stats${qs}`, { signal })
  if (!res.ok) return null
  const d = await res.json()

  const teams = Object.values(d.teams || {})
  const teamFor = (s) => {
    const t = d.teams?.[s.teamSlug] || d.teams?.[s.teamId] || teams.find((x) => String(x.id) === String(s.teamId))
    return { team: t?.abbreviation || '', logo: t?.logos?.[0]?.href || null }
  }

  // A career total of all zeros/dashes (a WR's one kickoff, say) isn't worth a tab.
  // Games played/started appear in every category, so they don't count.
  const hasNumbers = (c) =>
    !c.totals || c.totals.some((v, i) => !/^(GP|GS|G)$/.test(c.labels?.[i] || '') && /[1-9]/.test(String(v)))
  const tabs = (d.categories || [])
    .filter((c) => c.statistics?.length && !/postseason/i.test(c.name) && hasNumbers(c))
    .map((c) => {
      const label = c.displayName.replace(/^(Career|Regular Season)\s*/i, '').trim() || c.displayName
      return {
        key: c.name,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        labels: c.labels || [],
        rows: newestSeasonFirst(c.statistics).map((s) => {
          // A traded player gets one row per team plus a "2026 Totals" row.
          const subtotal = /totals/i.test(s.teamSlug || '')
          return {
            season: s.season?.displayName || String(s.season?.year || ''),
            ...(subtotal ? { team: 'Total', logo: null } : teamFor(s)),
            subtotal,
            stats: s.stats || [],
          }
        }),
        totals: c.totals || null,
      }
    })
  if (!tabs.length) return null

  const want = DEFAULT_CATEGORY[position] || (/(LB|DE|DT|CB|S|DB|DL|NT|OLB|ILB|MLB|EDGE)$/.test(position || '') ? 'defensive' : null)
  const defaultKey = (want && tabs.find((t) => t.key === want)?.key) || tabs[0].key
  return { tabs, defaultKey }
}
