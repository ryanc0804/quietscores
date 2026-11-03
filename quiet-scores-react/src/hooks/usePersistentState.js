import { useCallback, useEffect, useState } from 'react'

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

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable: keep in-memory value */
    }
  }, [key, value])

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

  const update = useCallback((next) => setValue(next), [])
  return [value, update]
}
