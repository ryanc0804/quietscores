import { useEffect } from 'react'
import { usePersistentState } from './usePersistentState'

const ORDER = ['system', 'dark', 'light']

function systemPrefersLight() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches
  } catch {
    return false
  }
}

// 'system' follows the OS; 'dark' / 'light' are explicit overrides.
export function useTheme() {
  const [mode, setMode] = usePersistentState('qs:theme', 'system')

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const resolved = mode === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : mode
      root.dataset.theme = resolved
      root.style.colorScheme = resolved
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', resolved === 'light' ? '#f6f7f9' : '#141414')
    }
    apply()
    if (mode !== 'system') return
    let mq
    try {
      mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', apply)
    } catch {
      return
    }
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  const cycle = () => setMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length])
  return { mode, setMode, cycle }
}
