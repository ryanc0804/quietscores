import { useEffect, useState } from 'react'
import { fetchTeamSchedule } from '../lib/espnApi'
import { parseSchedule } from '../lib/schedule'

const PITCHER = /^(P|SP|RP|CP)$/i
const DEFENSE = /(LB|DE|DT|CB|S|DB|DL|NT|EDGE)$/

// Three game-log columns that sum up a game, by sport/position. Each slot
// lists label candidates; the first label found in the log wins.
function statSlots(sport, pos = '') {
  if (sport === 'nfl' || sport === 'college-football') {
    if (pos === 'QB') return [['YDS'], ['TD'], ['INT']]
    if (pos === 'RB' || pos === 'FB') return [['CAR'], ['YDS'], ['TD']]
    if (pos === 'WR' || pos === 'TE') return [['REC'], ['YDS'], ['TD']]
    if (DEFENSE.test(pos)) return [['TOT'], ['SACK'], ['INT']]
    return null
  }
  if (sport === 'nba' || sport === 'college-basketball') return [['PTS'], ['REB'], ['AST']]
  if (sport === 'nhl') return pos === 'G' ? [['SV'], ['GA'], ['SV%']] : [['G'], ['A'], ['PTS']]
  if (sport === 'mlb') return PITCHER.test(pos) ? [['IP'], ['ER'], ['K', 'SO']] : [['H'], ['HR'], ['RBI']]
  return null
}

/** "11 REC · 141 YDS · 1 TD" from the most recent game-log row. */
function statLine(sport, position, labels, row) {
  const slots = statSlots(sport, position)
  const picks = slots
    ? slots.map((cands) => cands.map((l) => labels.indexOf(l)).find((i) => i >= 0)).filter((i) => i != null && i >= 0)
    : labels.slice(0, 3).map((_, i) => i)
  return picks.map((i) => `${row.stats[i]} ${labels[i]}`).join(' · ')
}

function shortDate(iso, withTime) {
  if (!iso) return ''
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return withTime ? `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : day
}

function Logo({ src }) {
  if (!src) return null
  return <img className="pgs-logo" src={src} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
}

/**
 * Slim strip under the player header: last game (result + stat line) and
 * next game, or the live game while one is on.
 */
export function PlayerGameStrip({ player }) {
  const [schedule, setSchedule] = useState(null)
  const teamId = player.team?.id

  useEffect(() => {
    if (!teamId) return
    const controller = new AbortController()
    fetchTeamSchedule(player.sport, teamId, { signal: controller.signal }).then((s) => {
      if (!controller.signal.aborted) setSchedule(parseSchedule(s, teamId))
    })
    return () => controller.abort()
  }, [player.sport, teamId])

  const last = player.log?.rows?.[0] || null
  const live = schedule?.find((g) => g.state === 'in') || null
  const next = schedule?.filter((g) => !g.completed && g.state !== 'in').sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null
  if (!last && !live && !next) return null

  return (
    <section className="pgs" aria-label="Recent and upcoming games">
      {live ? (
        <div className="pgs-item">
          <span className="pgs-label live">Live</span>
          <span className="pgs-main">
            <Logo src={live.opponentLogo} />
            <span>
              {live.home || live.neutral ? 'vs' : '@'} {live.opponentShort || live.opponent}
              {live.ours != null && live.theirs != null && <b> · {live.ours}–{live.theirs}</b>}
            </span>
          </span>
          {live.status && <span className="pgs-sub">{live.status}</span>}
        </div>
      ) : (
        last && (
          <div className="pgs-item">
            <span className="pgs-label">Last game</span>
            <span className="pgs-main">
              <Logo src={last.opponentLogo} />
              <span>
                {last.result && <b className={last.result === 'W' ? 'pg-win' : last.result === 'L' ? 'pg-loss' : ''}>{last.result} </b>}
                {last.score && <b>{last.score.replace('-', '–')} </b>}
                {last.atVs} {last.opponent}
                <span className="pgs-date"> · {shortDate(last.date)}</span>
              </span>
            </span>
            <span className="pgs-sub">{statLine(player.sport, player.positionAbbr, player.log.labels, last)}</span>
          </div>
        )
      )}
      {next && (
        <div className="pgs-item">
          <span className="pgs-label">Next game</span>
          <span className="pgs-main">
            <Logo src={next.opponentLogo} />
            <span>{next.home || next.neutral ? 'vs' : '@'} {next.opponentShort || next.opponent}</span>
          </span>
          <span className="pgs-sub">{[shortDate(next.date, true), next.neutral && next.venue].filter(Boolean).join(' · ')}</span>
        </div>
      )}
    </section>
  )
}
