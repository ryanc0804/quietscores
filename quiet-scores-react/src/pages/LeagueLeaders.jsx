import { useEffect, useState } from 'react'
import { fetchLeaderboard, leaderboardFor } from '../lib/leaders'

// Headline categories per league: [stat, a position that picks the right
// category where a stat name repeats (NFL sacks: defense, not a QB's)].
const FEATURED = {
  nfl: [['passingYards', 'QB'], ['passingTouchdowns', 'QB'], ['rushingYards', 'RB'], ['receivingYards', 'WR'], ['receptions', 'WR'], ['sacks', 'LB'], ['interceptions', 'CB'], ['totalTackles', 'LB']],
  'college-football': [['passingYards', 'QB'], ['passingTouchdowns', 'QB'], ['rushingYards', 'RB'], ['receivingYards', 'WR'], ['sacks', 'LB'], ['interceptions', 'CB']],
  nba: [['avgPoints'], ['avgRebounds'], ['avgAssists'], ['avgSteals'], ['avgBlocks'], ['avgThreePointFieldGoalsMade']],
  'college-basketball': [['avgPoints'], ['avgRebounds'], ['avgAssists'], ['avgSteals'], ['avgBlocks'], ['avgThreePointFieldGoalsMade']],
  nhl: [['points', 'C'], ['goals', 'C'], ['assists', 'C'], ['plusMinus', 'D'], ['savePct', 'G'], ['avgGoalsAgainst', 'G']],
  mlb: [['avg', '1B'], ['homeRuns', '1B'], ['RBIs', '1B'], ['stolenBases', 'CF'], ['ERA', 'SP'], ['strikeouts', 'SP'], ['wins', 'SP'], ['saves', 'RP']],
}

function Headshot({ src }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="lb-headshot" aria-hidden="true" />
  return <img className="lb-headshot" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/**
 * A league's leaders (the Leaders view of the scores page): the top five in
 * each headline category. A player opens their page; a category opens its
 * full leaderboard with the other stats in its group as tabs.
 */
export function LeagueLeaders({ sport, onOpenPlayer, onOpenLeaderboard }) {
  const [result, setResult] = useState(null) // { sport, boards: [{ board, position, rows }] }
  const boards = result?.sport === sport ? result.boards : null

  useEffect(() => {
    let cancelled = false
    const featured = FEATURED[sport] || []
    Promise.all(
      featured.map(async ([stat, position]) => {
        const board = await leaderboardFor(sport, stat, position).catch(() => null)
        if (!board) return null
        const data = await fetchLeaderboard(board, { limit: 5 }).catch(() => null)
        return data?.rows?.length ? { board, position, rows: data.rows } : null
      }),
    ).then((list) => !cancelled && setResult({ sport, boards: list.filter(Boolean) }))
    return () => {
      cancelled = true
    }
  }, [sport])

  if (!boards) return <div className="league-status">Loading leaders…</div>
  if (!boards.length) return <div className="league-status">No leaders yet this season.</div>

  return (
    <div className="league-leaders">
      {boards.map(({ board, position, rows }) => {
        const openBoard = () => onOpenLeaderboard({ board, position, player: null, tiles: {} })
        return (
          <section key={`${board.category}.${board.stat}`} className="pg-card league-leader-card">
            <button type="button" className="league-leader-title" onClick={openBoard}>
              <span>{board.label}</span>
              <span aria-hidden="true">→</span>
            </button>
            <ol className="lb-list league-leader-list">
              {rows.map((r) => (
                <li key={r.athleteId || r.mlbId || r.name}>
                  <button
                    type="button"
                    className="lb-row"
                    onClick={() => r.athleteId && onOpenPlayer({ sport, athleteId: r.athleteId, name: r.name, headshot: r.headshot })}
                  >
                    <span className="lb-rank">{r.rank}</span>
                    <Headshot src={r.headshot} />
                    <span className="lb-name">
                      <b>{r.name}</b>
                      <small>{[r.team, r.position].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="lb-value">{r.value}</span>
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="pg-link league-leader-more" onClick={openBoard}>
              Full leaderboard
            </button>
          </section>
        )
      })}
    </div>
  )
}
