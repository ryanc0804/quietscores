import { useEffect, useState } from 'react'
import { nextGameDate } from '../lib/upcoming'

function when(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Empty-day message for one sport, with a jump to its next date with games. */
export function NextSlate({ sportKeys, label, from, onGo }) {
  const [state, setState] = useState({ key: null, date: undefined })
  const key = `${sportKeys.join(',')}:${from.toDateString()}`

  useEffect(() => {
    const controller = new AbortController()
    nextGameDate(sportKeys, from, { signal: controller.signal })
      .then((date) => !controller.signal.aborted && setState({ key, date }))
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const date = state.key === key ? state.date : undefined
  return (
    <div className="info empty-state">
      <div>No {label} games on {when(from)}.</div>
      {date === undefined && <div className="next-slate-hint">Finding the next games…</div>}
      {date === null && <div className="next-slate-hint">No {label} games in the next five weeks.</div>}
      {date && (
        <button type="button" className="next-slate-btn" onClick={() => onGo(date)}>
          Next games: {when(date)} →
        </button>
      )}
    </div>
  )
}
