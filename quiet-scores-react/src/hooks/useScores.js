import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAllScoreboards } from '../lib/espnApi'

const LIVE_REFRESH_INTERVAL = 5_000
const IDLE_REFRESH_INTERVAL = 60_000

export function useScores(date) {
  const [scores, setScores] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const abortRef = useRef(null)

  const hasLiveGames = useMemo(
    () => scores.some((game) => game.status === 'live'),
    [scores],
  )

  const loadScores = useCallback(
    async ({ silent = false } = {}) => {
      if (!date) return

      if (!silent) {
        setIsLoading(true)
        setError(null)
      }

      if (abortRef.current) {
        abortRef.current.abort()
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const result = await fetchAllScoreboards(date, {
          signal: controller.signal,
        })
        setScores(result)
      } catch (err) {
        if (err.name === 'AbortError') return
        console.error('Failed to load scoreboards', err)
        setError(err)
      } finally {
        if (!silent) {
          setIsLoading(false)
        }
      }
    },
    [date],
  )

  useEffect(() => {
    loadScores()

    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [loadScores])

  // Refresh on a timer only while the tab is visible (a background tab would
  // keep polling ESPN, and FotMob through our proxy, for nobody), and catch
  // up the moment it's visible again.
  useEffect(() => {
    if (!date) return

    const interval = setInterval(() => {
      if (!document.hidden) loadScores({ silent: true })
    }, hasLiveGames ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL)

    const onVisible = () => {
      if (!document.hidden) loadScores({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [date, hasLiveGames, loadScores])

  return {
    scores,
    isLoading,
    error,
    reload: loadScores,
  }
}

