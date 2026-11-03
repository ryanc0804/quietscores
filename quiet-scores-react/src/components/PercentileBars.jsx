// Baseball Savant–style percentile marker for a stat tile: a thin track with a
// bubble at the player's percentile, red for elite, gray around average, blue
// for poor. When the track scrolls into view the bubble slides out from 0,
// counting up and warming from blue to red as it goes.
import { useEffect, useRef, useState } from 'react'

const BLUE = [52, 101, 192]
const GRAY = [140, 140, 148]
const RED = [214, 47, 52]

const DURATION = 900 // ms
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/** Color for a percentile: blue (0) → gray (50) → red (100). */
function percentileColor(p) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  const [r, g, b] = p <= 50 ? mix(BLUE, GRAY, p / 50) : mix(GRAY, RED, (p - 50) / 50)
  return `rgb(${r}, ${g}, ${b})`
}

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Animates 0 → `target` once `ref` is on screen, after `delay` ms (so a row of
 * tiles staggers). Returns the current value.
 */
function useCountUp(target, delay, ref) {
  const [value, setValue] = useState(() => (Number.isFinite(target) && prefersReducedMotion() ? target : 0))
  useEffect(() => {
    if (!Number.isFinite(target) || prefersReducedMotion()) return
    const el = ref.current
    let raf = 0
    let timer = 0
    const run = () => {
      timer = setTimeout(() => {
        const start = performance.now()
        const tick = (now) => {
          const t = Math.min(1, (now - start) / DURATION)
          setValue(Math.round(target * easeOut(t)))
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      }, delay)
    }
    // Start when the track is visible, not while it's still below the fold.
    const io = 'IntersectionObserver' in window && el
      ? new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect()
            run()
          }
        }, { threshold: 0.6 })
      : null
    if (io) io.observe(el)
    else run()
    return () => {
      io?.disconnect()
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, delay, ref])
  return value
}

/** No percentile (not qualified): an empty gray track, no bubble. */
export function PercentileTrack({ percentile, index = 0 }) {
  const ref = useRef(null)
  const has = Number.isFinite(percentile)
  const shown = useCountUp(has ? percentile : NaN, index * 90, ref)
  const color = has ? percentileColor(shown) : null
  return (
    <span className="pct-track" aria-hidden="true" ref={ref}>
      {has && (
        <>
          <span className="pct-fill" style={{ width: `${shown}%`, background: color }} />
          <span className="pct-bubble" style={{ left: `${shown}%`, background: color }}>{shown}</span>
        </>
      )}
    </span>
  )
}
