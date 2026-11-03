import { useCallback, useMemo } from 'react'
import { usePersistentState } from './usePersistentState'

// Favorites are keyed by sport + ESPN/FotMob team id, since ids are only
// unique within a league. Name/logo are stored so the list can be shown
// without a network call.
export function favoriteKey(sport, teamId) {
  return `${sport}:${teamId}`
}

export function useFavorites() {
  const [favorites, setFavorites] = usePersistentState('qs:favorites:v1', [])

  const keys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites])

  const isFavorite = useCallback(
    (sport, teamId) => !!teamId && keys.has(favoriteKey(sport, teamId)),
    [keys],
  )

  const toggleFavorite = useCallback(
    (team) => {
      if (!team?.teamId || !team?.sport) return
      const key = favoriteKey(team.sport, team.teamId)
      setFavorites((prev) =>
        prev.some((f) => f.key === key)
          ? prev.filter((f) => f.key !== key)
          : [...prev, { key, sport: team.sport, teamId: String(team.teamId), name: team.name, logo: team.logo, abbreviation: team.abbreviation }],
      )
    },
    [setFavorites],
  )

  const gameHasFavorite = useCallback(
    (game) => isFavorite(game.sport, game.awayTeamId) || isFavorite(game.sport, game.homeTeamId),
    [isFavorite],
  )

  return { favorites, isFavorite, toggleFavorite, gameHasFavorite }
}
