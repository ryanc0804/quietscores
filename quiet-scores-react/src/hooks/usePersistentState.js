import { useCallback, useEffect, useRef, useState } from 'react'

// localStorage-backed state. Storage can throw (private mode, blocked
// cookies) so every access is guarded and the app still works without it.
function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback))
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key) setValue(read(key, fallback))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // fallback is a constant default; re-subscribing on identity change is unnecessary
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Write through immediately (not in an effect) so a component that
  // unmounts right after updating — e.g. a closing dialog — still persists.
  const update = useCallback(
    (next) => {
      const v = typeof next === 'function' ? next(latest.current) : next
      latest.current = v
      try {
        window.localStorage.setItem(key, JSON.stringify(v))
      } catch {
        /* storage unavailable: keep in-memory value */
      }
      setValue(v)
    },
    [key],
  )
  return [value, update]
}
