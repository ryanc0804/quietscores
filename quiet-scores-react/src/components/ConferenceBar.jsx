import { useCallback, useEffect, useRef, useState } from 'react'

function Chevron({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

/**
 * College conference filter, styled like the sport bar. When the chips don't
 * fit, arrow buttons appear on the side(s) that have more, and the edges fade.
 */
export function ConferenceBar({ options, selected, onSelect, showAll = true }) {
  const trackRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    })
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, options])

  // Keep the selected chip in view (e.g. a conference remembered from last time).
  useEffect(() => {
    trackRef.current?.querySelector('.conf-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  const page = (dir) => {
    const el = trackRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' })
  }

  const chip = (name, label, count) => (
    <button
      key={name}
      type="button"
      className={`conf-chip ${selected === name ? 'active' : ''}`}
      aria-pressed={selected === name}
      onClick={() => onSelect(name)}
    >
      {label}
      {count != null && <span className="conf-count">{count}</span>}
    </button>
  )

  return (
    <div className={`conf-wrap ${edges.left ? 'more-left' : ''} ${edges.right ? 'more-right' : ''}`}>
      {edges.left && (
        <button type="button" className="conf-arrow left" onClick={() => page(-1)} aria-label="Scroll conferences left">
          <Chevron dir="left" />
        </button>
      )}
      <div className="conference-bar" role="toolbar" aria-label="Filter by conference" ref={trackRef} onScroll={measure}>
        {showAll && chip('all', 'All', null)}
        {options.map((c) => chip(c.name, c.name, c.count))}
      </div>
      {edges.right && (
        <button type="button" className="conf-arrow right" onClick={() => page(1)} aria-label="Scroll conferences right">
          <Chevron dir="right" />
        </button>
      )}
    </div>
  )
}
