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

/** "11 REC · 141 YDS · 1 TD" from a game-log row. */
function statLine(sport, position, labels, row) {
  const slots = statSlots(sport, position)
  const picks = slots
    ? slots.map((cands) => cands.map((l) => labels.indexOf(l)).find((i) => i >= 0)).filter((i) => i != null && i >= 0)
    : labels.slice(0, 3).map((_, i) => i)
  return picks.map((i) => `${row.stats[i]} ${labels[i]}`).join(' · ')
}

/**
 * The last game (or the live one) as the final box in the header's
 * height / weight / age row, styled like its neighbours so it belongs there.
 */
export function PlayerLastGame({ player }) {
  if (player.nextGame?.label === 'Live now') {
    return (
      <div className="pp-bio-game">
        <dt className="live">Live</dt>
        <dd>{player.nextGame.name}</dd>
      </div>
    )
  }

  const last = player.log?.rows?.[0]
  if (!last) return null
  const date = last.date ? new Date(last.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  const line = statLine(player.sport, player.positionAbbr, player.log.labels, last)

  return (
    <div className="pp-bio-game">
      <dt>Last game{date && ` · ${date}`}</dt>
      <dd>
        {last.opponentLogo && (
          <img src={last.opponentLogo} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        )}
        {last.result && <span className={last.result === 'W' ? 'win' : last.result === 'L' ? 'loss' : ''}>{last.result}</span>}
        {last.score && ` ${last.score.replace('-', '–')}`} {last.atVs} {last.opponentAbbr || last.opponent}
      </dd>
      {line && <small>{line}</small>}
    </div>
  )
}
