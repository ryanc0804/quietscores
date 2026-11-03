// Team schedule (ESPN site API) → simple game rows from that team's point of view.
export function parseSchedule(schedule, teamId) {
  const events = schedule?.events || []
  return events
    .map((evt) => {
      const comp = evt.competitions?.[0]
      const competitors = comp?.competitors || []
      const us = competitors.find((c) => String(c.id) === String(teamId) || String(c.team?.id) === String(teamId))
      const them = competitors.find((c) => c !== us)
      if (!us || !them) return null
      const score = (c) => {
        const v = c?.score?.displayValue ?? c?.score?.value ?? c?.score
        return v == null || v === '' ? null : Number(v)
      }
      const completed = !!comp?.status?.type?.completed
      const ours = score(us)
      const theirs = score(them)
      const won = completed && (us.winner === true || (ours != null && theirs != null && ours > theirs))
      const lost = completed && !won && ours !== theirs
      return {
        id: evt.id,
        date: evt.date || comp?.date,
        week: evt.week?.number ?? null,
        home: us.homeAway === 'home',
        opponent: them.team?.displayName || them.team?.name || 'TBD',
        opponentShort: them.team?.abbreviation || them.team?.shortDisplayName || '',
        opponentLogo: them.team?.logos?.[0]?.href || them.team?.logo || null,
        completed,
        ours,
        theirs,
        result: completed ? (won ? 'W' : lost ? 'L' : 'T') : null,
        status: comp?.status?.type?.shortDetail || '',
        state: comp?.status?.type?.state || null, // 'pre' | 'in' | 'post'
        neutral: !!comp?.neutralSite, // e.g. international games: "vs", not "@"
        venue: comp?.venue?.fullName || null,
      }
    })
    .filter(Boolean)
}
