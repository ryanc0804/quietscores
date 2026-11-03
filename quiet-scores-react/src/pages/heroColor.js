// Team colors drive the page heroes. White text sits on them, so pick the
// darker of the primary/alternate colors and darken it further if needed.

function parse(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
const darken = (rgb, amt) => rgb.map((c) => c * (1 - amt))

export function heroColors(color, alternate) {
  const options = [parse(color), parse(alternate)].filter(Boolean)
  if (!options.length) return { base: '#1f3a6b', deep: '#0f1d36' }
  let base = options.reduce((a, b) => (luminance(b) < luminance(a) ? b : a))
  // Keep white text at ≥ 4.5:1: luminance must stay under ~0.18.
  let guard = 0
  while (luminance(base) > 0.18 && guard++ < 10) base = darken(base, 0.15)
  // Near-black colors read as "no color"; lift them slightly toward slate.
  if (luminance(base) < 0.005) base = [28, 32, 40]
  return { base: toHex(base), deep: toHex(darken(base, 0.45)) }
}
