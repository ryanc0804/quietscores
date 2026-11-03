// Baseball Savant–style percentile marker for a stat tile: a thin track with a
// bubble at the player's percentile, red for elite, gray around average, blue
// for poor.

const BLUE = [52, 101, 192]
const GRAY = [140, 140, 148]
const RED = [214, 47, 52]

/** Color for a percentile: blue (0) → gray (50) → red (100). */
function percentileColor(p) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  const [r, g, b] = p <= 50 ? mix(BLUE, GRAY, p / 50) : mix(GRAY, RED, (p - 50) / 50)
  return `rgb(${r}, ${g}, ${b})`
}

/** No percentile (not qualified): an empty gray track, no bubble. */
export function PercentileTrack({ percentile }) {
  const has = Number.isFinite(percentile)
  const color = has ? percentileColor(percentile) : null
  return (
    <span className="pct-track" aria-hidden="true">
      {has && (
        <>
          <span className="pct-fill" style={{ width: `${percentile}%`, background: color }} />
          <span className="pct-bubble" style={{ left: `${percentile}%`, background: color }}>{percentile}</span>
        </>
      )}
    </span>
  )
}
