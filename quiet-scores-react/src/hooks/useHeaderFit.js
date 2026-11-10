import { useLayoutEffect } from 'react'

const GAP = 16 // px the centred sport bar keeps from either side

/**
 * Keeps the header's centred sport bar clear of the logo and the right-hand
 * buttons. Starting from the centred layout, it adds `hdr-icons` (Standings
 * / Leaders as icons) if the bar would touch a side, then `hdr-flow` (bar
 * after the logo) if it still would. Re-checked whenever the header or its
 * contents change size (window resize, sport switch, live counts). Phones
 * (≤480px) have their own two-row layout and are left alone.
 */
export function useHeaderFit(headerRef) {
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return
    const part = (sel) => header.querySelector(sel)?.getBoundingClientRect()
    const fits = () => {
      const bar = part('.header-center')
      const left = part('.header-left')
      const right = part('.header-right')
      if (!bar || !left || !right) return true
      return bar.left >= left.right + GAP && bar.right <= right.left - GAP
    }
    let fitting = false
    const fit = () => {
      if (fitting) return
      fitting = true
      header.classList.remove('hdr-icons', 'hdr-flow')
      if (window.innerWidth > 480 && !fits()) {
        header.classList.add('hdr-icons')
        if (!fits()) header.classList.add('hdr-flow')
      }
      fitting = false
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(header)
    for (const el of header.querySelectorAll('.header-left, .sport-filters, .header-right')) ro.observe(el)
    return () => ro.disconnect()
  })
}
