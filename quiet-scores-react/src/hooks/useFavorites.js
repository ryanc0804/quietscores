import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistentState } from './usePersistentState'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

// Favorites are keyed by sport + team id, since ids are only unique within a
// league. Name/logo are stored so lists render without extra requests.
export function favoriteKey(sport, teamId) {
  return `${sport}:${teamId}`
}

const fromRow = (r) => ({
  key: r.team_key,
  sport: r.sport,
  teamId: r.team_id,
  name: r.name,
  logo: r.logo,
  abbreviation: r.abbreviation,
})

const toRow = (userId, f) => ({
  user_id: userId,
  team_key: f.key,
  sport: f.sport,
  team_id: String(f.teamId),
  name: f.name ?? null,
  logo: f.logo ?? null,
  abbreviation: f.abbreviation ?? null,
})

/**
 * With Supabase configured, favorites belong to the signed-in account and
 * following a team asks signed-out visitors to log in. Without Supabase
 * (e.g. local dev with no keys) they fall back to this browser only.
 */
export function useFavorites() {
  const { configured, user, openLogin } = useAuth()
  const [local, setLocal] = usePersistentState('qs:favorites:v1', [])
  const [remote, setRemote] = useState([])
  const [syncError, setSyncError] = useState(null)
  const userId = user?.id ?? null

  // Load the account's favorites; move any browser-only favorites into it once.
  useEffect(() => {
    if (!configured || !userId) {
      setRemote([])
      return
    }
    let cancelled = false
    ;(async () => {
      if (local.length) {
        const { error } = await supabase
          .from('favorites')
          .upsert(local.map((f) => toRow(userId, f)), { onConflict: 'user_id,team_key', ignoreDuplicates: true })
        if (!error) setLocal([])
      }
      const { data, error } = await supabase
        .from('favorites')
        .select('team_key, sport, team_id, name, logo, abbreviation')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) setSyncError('Couldn’t load your favorites.')
      else {
        setSyncError(null)
        setRemote(data.map(fromRow))
      }
    })()
    return () => {
      cancelled = true
    }
    // local is only read for the one-time migration on sign-in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, userId])

  const favorites = configured ? remote : local
  const keys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites])

  const isFavorite = useCallback(
    (sport, teamId) => !!teamId && keys.has(favoriteKey(sport, teamId)),
    [keys],
  )

  const toggleFavorite = useCallback(
    async (team) => {
      if (!team?.teamId || !team?.sport) return
      const key = favoriteKey(team.sport, team.teamId)
      const entry = {
        key,
        sport: team.sport,
        teamId: String(team.teamId),
        name: team.name,
        logo: team.logo,
        abbreviation: team.abbreviation,
      }

      if (!configured) {
        setLocal((prev) => (prev.some((f) => f.key === key) ? prev.filter((f) => f.key !== key) : [...prev, entry]))
        return
      }
      if (!userId) {
        openLogin(`Sign in to follow ${team.name || 'teams'}`)
        return
      }

      const removing = keys.has(key)
      // Optimistic update, rolled back if the request fails.
      setRemote((prev) => (removing ? prev.filter((f) => f.key !== key) : [...prev, entry]))
      const { error } = removing
        ? await supabase.from('favorites').delete().eq('user_id', userId).eq('team_key', key)
        : await supabase.from('favorites').insert(toRow(userId, entry))
      if (error) {
        setRemote((prev) => (removing ? [...prev, entry] : prev.filter((f) => f.key !== key)))
        setSyncError('Couldn’t save that change. Please try again.')
      } else {
        setSyncError(null)
      }
    },
    [configured, userId, keys, openLogin, setLocal],
  )

  const gameHasFavorite = useCallback(
    (game) => isFavorite(game.sport, game.awayTeamId) || isFavorite(game.sport, game.homeTeamId),
    [isFavorite],
  )

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    gameHasFavorite,
    syncError,
    needsLogin: configured && !userId,
  }
}
