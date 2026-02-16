import { useEffect, useMemo, useRef, useState } from 'react'
import { useScores } from './hooks/useScores'
import { fetchGameSummary, fetchStandings, filterStandingsByTeams, fetchTeamInfo, fetchTeamRoster, fetchTeamSchedule } from './lib/espnApi'

const SPORT_BUTTONS = [
  { label: 'All Sports', value: 'all' },
  { label: 'NFL', value: 'nfl' },
  { label: 'NBA', value: 'nba' },
  { label: 'MLB', value: 'mlb' },
  { label: 'NHL', value: 'nhl' },
  { label: 'CFB', value: 'college-football' },
  { label: 'CBB', value: 'college-basketball' },
]


const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const JS_DAY_TO_KEY = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

const MILLISECONDS_IN_DAY = 86_400_000

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getMonday(date) {
  const jsDay = date.getDay()
  const diff = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(date)
  monday.setDate(date.getDate() + diff)
  return stripTime(monday)
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatWeekLabel(offset) {
  if (offset === 0) return 'Current Week'
  const abs = Math.abs(offset)
  const suffix = abs === 1 ? 'Week' : 'Weeks'
  return offset > 0 ? `${abs} ${suffix} Ahead` : `${abs} ${suffix} Ago`
}

function formatDateLabel(date) {
  if (!date) return '-'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayKeyFromDate(date) {
  return JS_DAY_TO_KEY[date.getDay()]
}

function getSportDisplayName(sport) {
  switch (sport) {
    case 'nfl':
      return 'NFL'
    case 'nba':
      return 'NBA'
    case 'mlb':
      return 'MLB'
    case 'nhl':
      return 'NHL'
    case 'college-football':
      return 'CFB'
    case 'college-basketball':
      return 'CBB'
    default:
      return sport?.toUpperCase() ?? 'SPORT'
  }
}

function abbreviateNetwork(network) {
  if (!network) return ''
  
  const networkLower = network.toLowerCase()
  
  // Common network abbreviations
  const abbreviations = {
    'espn': 'ESPN',
    'espn2': 'ESPN2',
    'espnu': 'ESPNU',
    'espn+': 'ESPN+',
    'abc': 'ABC',
    'cbs': 'CBS',
    'nbc': 'NBC',
    'fox': 'FOX',
    'fs1': 'FS1',
    'fs2': 'FS2',
    'fox sports 1': 'FS1',
    'fox sports 2': 'FS2',
    'sec network': 'SECN',
    'secn': 'SECN',
    'big ten network': 'BTN',
    'btn': 'BTN',
    'acc network': 'ACCN',
    'accn': 'ACCN',
    'pac-12 network': 'PAC12',
    'pac12': 'PAC12',
    'tnt': 'TNT',
    'tbs': 'TBS',
    'nfl network': 'NFLN',
    'nfln': 'NFLN',
    'nba tv': 'NBATV',
    'nbav': 'NBATV',
    'mlb network': 'MLBN',
    'mlbn': 'MLBN',
    'nhl network': 'NHLN',
    'nhl': 'NHL',
  }
  
  // Check for exact match first
  if (abbreviations[networkLower]) {
    return abbreviations[networkLower]
  }
  
  // Check for partial matches
  for (const [key, abbrev] of Object.entries(abbreviations)) {
    if (networkLower.includes(key)) {
      return abbrev
    }
  }
  
  // If network name is long, abbreviate it
  if (network.length > 8) {
    // Take first 3-4 letters and make uppercase
    const words = network.split(' ')
    if (words.length > 1) {
      // Multiple words - take first letter of each
      return words.map(w => w[0]?.toUpperCase() || '').join('').slice(0, 4)
    } else {
      // Single word - take first 4-5 chars
      return network.slice(0, 5).toUpperCase()
    }
  }
  
  return network
}

function getTeamInitials(teamName) {
  if (!teamName) return '?'
  const cleaned = teamName.trim()
  if (cleaned.length <= 4 && !cleaned.includes(' ')) {
    return cleaned.toUpperCase()
  }
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return (
    words[0].charAt(0).toUpperCase() + words[words.length - 1].charAt(0).toUpperCase()
  )
}

function getFallbackText(fullName, shortName, abbreviation) {
  if (abbreviation) return abbreviation.toUpperCase()
  if (shortName) return getTeamInitials(shortName)
  return getTeamInitials(fullName)
}

function getTeamColor(team, fallbackColor = '#007bff') {
  if (!team) return fallbackColor
  // ESPN API provides color in team.color or team.alternateColor
  const color = team.color || team.alternateColor || team.team?.color || team.team?.alternateColor
  if (color) {
    // Ensure it has a # at the start
    return color.startsWith('#') ? color : `#${color}`
  }
  return fallbackColor
}

function hexToRgba(hex, alpha = 0.9) {
  if (!hex || typeof hex !== 'string') return `rgba(0, 123, 255, ${alpha})`
  // Remove # if present
  const cleaned = hex.replace('#', '')
  // Handle 3-character hex codes
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16)
    const g = parseInt(cleaned[1] + cleaned[1], 16)
    const b = parseInt(cleaned[2] + cleaned[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Handle 6-character hex codes
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16)
    const g = parseInt(cleaned.slice(2, 4), 16)
    const b = parseInt(cleaned.slice(4, 6), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0, 123, 255, ${alpha})`
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Fallback for invalid hex
  return `rgba(0, 123, 255, ${alpha})`
}

function getWinner(game) {
  const awayScore = Number(game.awayScore)
  const homeScore = Number(game.homeScore)
  if (Number.isNaN(awayScore) || Number.isNaN(homeScore)) return null
  if (awayScore === homeScore) return null
  return awayScore > homeScore ? 'away' : 'home'
}

function getInningDisplay(game) {
  if (game.sport !== 'mlb' || !game.inningNumber) return ''
  
  const inningText = game.inningNumber === 1 ? '1st' :
                     game.inningNumber === 2 ? '2nd' :
                     game.inningNumber === 3 ? '3rd' :
                     `${game.inningNumber}th`
  
  let inningState = ''
  if (game.topBottom === 'top') {
    inningState = 'Top'
  } else if (game.topBottom === 'bot' || game.topBottom === 'bottom') {
    inningState = 'Bot'
  } else if (game.topBottom === 'mid' || game.topBottom === 'middle') {
    inningState = 'Mid'
  } else if (game.topBottom === 'end') {
    inningState = 'End'
  }
  
  return inningState ? `${inningState} ${inningText}` : ''
}

function getStatusBadge(game) {
  const timeText = game.time || ''
  
  // For MLB live games, show inning display
  if (game.sport === 'mlb' && game.status === 'live' && game.inningNumber) {
    const inningDisplay = getInningDisplay(game)
    if (inningDisplay) {
      return { className: 'inning-display live', text: inningDisplay }
    }
  }
  
  switch (game.status) {
    case 'live':
      return { className: 'inning-display live', text: timeText || 'Live' }
    case 'halftime':
      return { className: 'inning-display halftime', text: 'HALFTIME' }
    case 'final':
      if (game.sport === 'mlb') {
        return { className: 'inning-display final', text: 'FINAL' }
      }
      return { className: 'inning-display final', text: 'FINAL' }
    case 'postponed':
      return { className: 'inning-display scheduled', text: 'POSTPONED' }
    default:
      return {
        className: 'inning-display scheduled',
        text: game.displayTime || timeText || 'TBD',
      }
  }
}

function BasesVisual({ bases }) {
  if (!bases || bases === 'empty') return null
  
  const secondBase = bases === '2nd' || bases === '1st & 2nd' || bases === '2nd & 3rd' || bases === 'loaded'
  const firstBase = bases === '1st' || bases === '1st & 2nd' || bases === '1st & 3rd' || bases === 'loaded'
  const thirdBase = bases === '3rd' || bases === '1st & 3rd' || bases === '2nd & 3rd' || bases === 'loaded'
  
  return (
    <div className="bases-diamond">
      <div className={`base second-base ${secondBase ? 'occupied' : 'empty'}`}></div>
      <div className="bases-row">
        <div className={`base third-base ${thirdBase ? 'occupied' : 'empty'}`}></div>
        <div className={`base first-base ${firstBase ? 'occupied' : 'empty'}`}></div>
      </div>
    </div>
  )
}

function CountDots({ game }) {
  if (game.sport !== 'mlb') return null
  
  return (
    <div className="count-dots-container">
      {game.balls !== null && game.balls !== undefined && (
        <div className="count-dots balls-dots">
          <span className="count-label">B</span>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`count-dot ${i < game.balls ? 'active' : ''}`}>●</span>
          ))}
        </div>
      )}
      {game.strikes !== null && game.strikes !== undefined && (
        <div className="count-dots strikes-dots">
          <span className="count-label">S</span>
          {[0, 1].map((i) => (
            <span key={i} className={`count-dot ${i < game.strikes ? 'active' : ''}`}>●</span>
          ))}
        </div>
      )}
      {game.outs !== null && game.outs !== undefined && (
        <div className="count-dots outs-dots">
          <span className="count-label">O</span>
          {[0, 1].map((i) => (
            <span key={i} className={`count-dot ${i < game.outs ? 'active' : ''}`}>●</span>
          ))}
        </div>
      )}
    </div>
  )
}


function TeamLogo({ name, logoUrl, fallbackText }) {
  const [failed, setFailed] = useState(false)
  const fallback = fallbackText || getTeamInitials(name)

  if (!logoUrl || failed) {
    return (
      <div className="fallback-logo">
        {fallback}
      </div>
    )
  }

  return (
    <>
      <img
        src={logoUrl}
        alt={`${name} logo`}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain' }}
      />
      <div className="fallback-logo" style={{ display: 'none' }}>
        {fallback}
      </div>
    </>
  )
}


function TeamRow({ game, side, onOpenTeam }) {
  const isAway = side === 'away'
  const teamName = isAway ? game.awayTeam : game.homeTeam
  const teamShortName = isAway ? game.awayShortName : game.homeShortName
  const teamAbbreviation = isAway ? game.awayAbbreviation : game.homeAbbreviation
  const score = isAway ? game.awayScore : game.homeScore
  const record = isAway ? game.awayTeamRecord : game.homeTeamRecord
  const isWinner = getWinner(game) === side
  const scheduled = game.status === 'scheduled'
  const logoUrl = isAway ? game.awayLogo : game.homeLogo
  const displayName = teamShortName || teamName
  const fallbackText = getFallbackText(teamName, teamShortName, teamAbbreviation)

  // Check for possession/at-bat highlighting
  let hasPossession = false
  if (game.status === 'live' || game.status === 'halftime') {
    if (game.sport === 'nfl' || game.sport === 'college-football') {
      const teamId = isAway ? game.awayTeamId : game.homeTeamId
      // Compare as strings to ensure type matching
      hasPossession = game.possessionTeam && teamId && String(game.possessionTeam) === String(teamId)
      
      // Debug: Log possession check for first live game
      if (game.status === 'live' && (game.sport === 'nfl' || game.sport === 'college-football') && !window._loggedPossessionCheck) {
        window._loggedPossessionCheck = true
        console.log('=== POSSESSION CHECK DEBUG ===')
        console.log('Sport:', game.sport)
        console.log('Game possessionTeam:', game.possessionTeam, typeof game.possessionTeam)
        console.log('Team ID:', teamId, typeof teamId)
        console.log('Side:', side, 'isAway:', isAway)
        console.log('Has possession:', hasPossession)
        console.log('Comparison:', String(game.possessionTeam), '===', String(teamId))
      }
    } else if (game.sport === 'mlb') {
      hasPossession = game.atBatTeam === side
    }
  }

  const classes = ['team']
  if (isWinner && game.status === 'final') classes.push('winner')
  if (hasPossession) classes.push('possession')
  if (hasPossession && game.sport === 'mlb') classes.push('at-bat')

  // Get odds for this team
  let teamSpread = null
  let teamMoneyline = null
  if (scheduled && game.odds) {
    if (isAway) {
      teamSpread = game.odds.spread
      teamMoneyline = game.odds.awayMoneyline
    } else {
      // Home team spread is opposite of away
      teamSpread = game.odds.spread !== null ? -game.odds.spread : null
      teamMoneyline = game.odds.homeMoneyline
    }
  }

  const formatSpread = (spread) => {
    if (spread === null || spread === undefined) return null
    const num = typeof spread === 'string' ? parseFloat(spread.replace('+', '')) : spread
    if (isNaN(num)) return String(spread)
    return num > 0 ? `+${num}` : String(num)
  }

  const formatMoneyline = (ml) => {
    if (ml === null || ml === undefined) return null
    const num = typeof ml === 'string' ? parseFloat(ml.replace('+', '')) : ml
    if (isNaN(num)) return String(ml)
    return num > 0 ? `+${num}` : String(num)
  }

  const handleTeamClick = (e) => {
    if (!onOpenTeam) return
    e.stopPropagation()
    const teamId = isAway ? game.awayTeamId : game.homeTeamId
    if (!teamId) return
    onOpenTeam({
      teamId,
      sport: game.sport,
      teamName,
      teamLogo: logoUrl,
      teamAbbreviation,
    })
  }

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      <div className="team-info team-info-clickable" onClick={handleTeamClick}>
        <div className="team-logo">
          <TeamLogo name={teamName} logoUrl={logoUrl} fallbackText={fallbackText} />
        </div>
        <div className="team-details">
          <span className="team-name">
            {displayName}
            {scheduled && teamSpread !== null && (
              <span className="team-spread"> ({formatSpread(teamSpread)})</span>
            )}
            {scheduled && teamMoneyline !== null && (
              <span className="team-moneyline"> {formatMoneyline(teamMoneyline)}</span>
            )}
          </span>
          {record ? <span className="team-record">{record}</span> : null}
        </div>
      </div>
      <span className={['team-score', scheduled ? 'scheduled' : ''].join(' ')}>
        {scheduled ? '' : score}
      </span>
    </div>
  )
}

function ScoreCard({ game, onOpenSummary, onOpenTeam }) {
  const badge = getStatusBadge(game)
  const statusBadge = badge ? (
    <span className={badge.className}>{badge.text}</span>
  ) : null

  return (
    <div
      className="score-card"
      data-game-id={`${game.sport}-${game.awayTeam}-${game.homeTeam}`}
      onClick={() => onOpenSummary(game)}
    >
      <div className="game-header">
        <span className="sport-type">
          {getSportDisplayName(game.sport)}
          {game.broadcastChannel ? ` • ${abbreviateNetwork(game.broadcastChannel)}` : ''}
        </span>
        {statusBadge}
      </div>
      <div className="game-content">
        <div className="teams">
          <TeamRow game={game} side="away" onOpenTeam={onOpenTeam} />
          {game.status === 'scheduled' && game.odds?.overUnder !== null && game.odds?.overUnder !== undefined && (
            <div className="over-under-display">
              O/U: {game.odds?.overUnder}
            </div>
          )}
          <TeamRow game={game} side="home" onOpenTeam={onOpenTeam} />
        </div>
        {game.sport === 'mlb' && game.status === 'live' && (
          <div className="mlb-game-state live-game">
            <div className="mlb-bases-container">
              <BasesVisual bases={game.bases} />
            </div>
            <div className="mlb-count-container">
              <CountDots game={game} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_ORDER = {
  live: 0,
  halftime: 1,
  scheduled: 2,
  postponed: 3,
  final: 4,
}

function compareGames(a, b) {
  const statusDiff = (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5)
  if (statusDiff !== 0) return statusDiff

  const timeA = a.fullDateTime ? new Date(a.fullDateTime).getTime() : Number.MAX_SAFE_INTEGER
  const timeB = b.fullDateTime ? new Date(b.fullDateTime).getTime() : Number.MAX_SAFE_INTEGER
  if (timeA !== timeB) return timeA - timeB

  const sportDiff = a.sport.localeCompare(b.sport)
  if (sportDiff !== 0) return sportDiff

  return a.homeTeam.localeCompare(b.homeTeam)
}

function GameSummary({ game, onBack, onOpenTeam }) {
  const [summaryData, setSummaryData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [playFilter, setPlayFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('gamecast')
  const [standingsData, setStandingsData] = useState(null)
  const [standingsLoading, setStandingsLoading] = useState(false)
  const [standingsError, setStandingsError] = useState(null)

  // ... (keep all the existing useEffects and extraction logic)

  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      if (!game?.id || !game?.sport) return

      setIsLoading(true)
      setError(null)

      try {
        const data = await fetchGameSummary(game.sport, game.id)
        if (!cancelled) {
          // Immediate debug - log the raw response structure
          console.log('=== SUMMARY API RESPONSE RECEIVED ===')
          console.log('Response keys:', Object.keys(data))
          console.log('Has header?', !!data.header)
          console.log('Has boxscore?', !!data.boxscore)
          if (data.header?.competitions?.[0]?.competitors) {
            data.header.competitions[0].competitors.forEach((comp, idx) => {
              console.log(`Header competitor[${idx}] has linescores:`, !!comp.linescores, comp.linescores)
            })
          }
          if (data.boxscore?.teams) {
            data.boxscore.teams.forEach((team, idx) => {
              console.log(`Boxscore team[${idx}] has linescores:`, !!team.linescores, team.linescores)
            })
          }
          if (data.boxscore?.situation) {
            console.log('Boxscore situation:', data.boxscore.situation)
            console.log('Situation keys:', Object.keys(data.boxscore.situation))
          }
          if (data.header?.competitions?.[0]?.situation) {
            console.log('Header situation:', data.header.competitions[0].situation)
            console.log('Header situation keys:', Object.keys(data.header.competitions[0].situation))
          }
          console.log('Full response structure:', JSON.stringify(data, null, 2).substring(0, 15000))
          
          setSummaryData(data)
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load game summary:', err)
          setError(err.message)
          setIsLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      cancelled = true
    }
  }, [game?.id, game?.sport])

  // Derive game state: 'preview', 'live', or 'final'
  const gameState = (game.status === 'live' || game.status === 'halftime') ? 'live'
    : game.status === 'final' ? 'final'
    : 'preview'

  // Set correct default tab when game state changes
  useEffect(() => {
    if (gameState === 'preview') {
      setActiveTab('preview')
    } else if (gameState === 'final') {
      if (activeTab === 'play-by-play' || activeTab === 'gamecast' || activeTab === 'preview') {
        setActiveTab('boxscore')
      }
    } else if (gameState === 'live') {
      if (activeTab === 'preview') {
        setActiveTab('gamecast')
      }
    }
  }, [gameState])

  // Fetch standings for the teams' divisions
  useEffect(() => {
    let cancelled = false

    async function loadStandings() {
      if (!game?.sport) {
        setStandingsError('No sport specified')
        return
      }

      // Try to get team IDs from multiple sources
      let homeId = game?.homeTeamId
      let awayId = game?.awayTeamId
      
      // If IDs not in game object, try to get from summaryData
      if ((!homeId || !awayId) && summaryData) {
        const competitors = summaryData.header?.competitions?.[0]?.competitors || []
        const homeComp = competitors.find(c => c.homeAway === 'home')
        const awayComp = competitors.find(c => c.homeAway === 'away')
        homeId = homeId || homeComp?.team?.id
        awayId = awayId || awayComp?.team?.id
      }
      
      console.log('=== LOAD STANDINGS ===')
      console.log('game.sport:', game?.sport)
      console.log('homeId:', homeId)
      console.log('awayId:', awayId)
      
      if (!homeId || !awayId) {
        // Don't set error yet - might get IDs from summaryData later
        if (summaryData) {
          setStandingsError('Could not find team IDs')
        }
        return
      }

      setStandingsLoading(true)
      setStandingsError(null)

      try {
        const allStandings = await fetchStandings(game.sport)
        console.log('Fetched standings:', allStandings ? 'success' : 'null')
        
        if (!cancelled) {
          if (allStandings) {
            // Filter to only show divisions containing the two teams in this game
            // Pass multiple identifiers for better matching
            const teamInfo = {
              ids: [homeId, awayId].filter(Boolean).map(String),
              names: [game.homeTeam, game.awayTeam].filter(Boolean),
              abbrs: [game.homeAbbreviation, game.awayAbbreviation].filter(Boolean)
            }
            console.log('Team info for filtering:', teamInfo)
            const filtered = filterStandingsByTeams(allStandings, teamInfo)
            console.log('Filtered standings result:', filtered)
            if (filtered) {
              setStandingsData(filtered)
            } else {
              setStandingsError('No matching divisions found')
            }
          } else {
            setStandingsError('Failed to fetch standings')
          }
          setStandingsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load standings:', err)
          setStandingsError(err.message)
          setStandingsLoading(false)
        }
      }
    }

    loadStandings()

    return () => {
      cancelled = true
    }
  }, [game?.sport, game?.homeTeamId, game?.awayTeamId, summaryData])

  const boxscore = summaryData?.boxscore
  const teams = boxscore?.teams || []
  // Try to match teams by ID first, then by position (away is usually first, home second)
  const awayTeam = teams.find((t) => {
    const teamId = String(t.team?.id || '')
    return teamId === String(game.awayTeamId) || 
           t.team?.displayName === game.awayTeam ||
           t.team?.name === game.awayTeam
  }) || teams[0]
  const homeTeam = teams.find((t) => {
    const teamId = String(t.team?.id || '')
    return teamId === String(game.homeTeamId) ||
           t.team?.displayName === game.homeTeam ||
           t.team?.name === game.homeTeam
  }) || teams[1] || (teams[0] === awayTeam ? null : teams[0])
  
  // Extract quarter/period scores from linescores
  // Check multiple possible locations for linescores data
  // First check header.competitions (most common ESPN API location)
  const headerCompetitors = summaryData?.header?.competitions?.[0]?.competitors || []
  const headerAwayCompetitor = headerCompetitors.find(c => 
    String(c.team?.id) === String(game.awayTeamId) || 
    c.homeAway === 'away'
  )
  const headerHomeCompetitor = headerCompetitors.find(c => 
    String(c.team?.id) === String(game.homeTeamId) || 
    c.homeAway === 'home'
  )
  
  const awayLinescores = headerAwayCompetitor?.linescores ||
                         awayTeam?.linescores || 
                         boxscore?.linescores?.find(ls => String(ls.teamId || ls.team?.id) === String(awayTeam?.team?.id))?.linescores ||
                         summaryData?.linescores?.find(ls => String(ls.teamId || ls.team?.id) === String(awayTeam?.team?.id))?.linescores ||
                         []
  const homeLinescores = headerHomeCompetitor?.linescores ||
                         homeTeam?.linescores || 
                         boxscore?.linescores?.find(ls => String(ls.teamId || ls.team?.id) === String(homeTeam?.team?.id))?.linescores ||
                         summaryData?.linescores?.find(ls => String(ls.teamId || ls.team?.id) === String(homeTeam?.team?.id))?.linescores ||
                         []
  
  // Debug: log the structure to understand the data format
  if (summaryData && !window._loggedLinescoresDebug) {
    window._loggedLinescoresDebug = true
    console.log('=== LINESCORES DEBUG ===')
    console.log('summaryData keys:', Object.keys(summaryData))
    console.log('boxscore keys:', boxscore ? Object.keys(boxscore) : 'no boxscore')
    console.log('awayTeam keys:', awayTeam ? Object.keys(awayTeam) : 'no awayTeam')
    console.log('awayTeam.linescores:', awayTeam?.linescores)
    console.log('boxscore.linescores:', boxscore?.linescores)
    console.log('summaryData.linescores:', summaryData?.linescores)
    
    // Check header.competitions for linescores (common ESPN API location)
    const header = summaryData?.header
    console.log('header:', header)
    console.log('header.competitions:', header?.competitions)
    if (header?.competitions?.[0]?.competitors) {
      console.log('header.competitions[0].competitors:', header.competitions[0].competitors)
      header.competitions[0].competitors.forEach((comp, idx) => {
        console.log(`competitor[${idx}].linescores:`, comp.linescores)
        console.log(`competitor[${idx}].team.id:`, comp.team?.id)
        console.log(`competitor[${idx}].homeAway:`, comp.homeAway)
        if (comp.linescores) {
          console.log(`competitor[${idx}].linescores FULL:`, JSON.stringify(comp.linescores, null, 2))
        }
      })
    }
    
    // Recursively search for all "linescores" in the response
    const findAllLinescores = (obj, path = 'root') => {
      const results = []
      if (!obj || typeof obj !== 'object') return results
      
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => {
          if (item && typeof item === 'object') {
            if ('linescores' in item) {
              results.push({ path: `${path}[${idx}].linescores`, value: item.linescores })
            }
            results.push(...findAllLinescores(item, `${path}[${idx}]`))
          }
        })
      } else {
        if ('linescores' in obj) {
          results.push({ path: `${path}.linescores`, value: obj.linescores })
        }
        Object.keys(obj).forEach(key => {
          if (obj[key] && typeof obj[key] === 'object') {
            results.push(...findAllLinescores(obj[key], `${path}.${key}`))
          }
        })
      }
      return results
    }
    
    const allLinescores = findAllLinescores(summaryData)
    console.log('=== ALL LINESCORES FOUND IN RESPONSE ===')
    if (allLinescores.length > 0) {
      allLinescores.forEach((result, idx) => {
        console.log(`Location ${idx + 1}: ${result.path}`)
        console.log(`Value:`, result.value)
        console.log(`Type:`, Array.isArray(result.value) ? 'array' : typeof result.value)
        if (Array.isArray(result.value) && result.value.length > 0) {
          console.log(`First item:`, result.value[0])
          console.log(`Full array:`, JSON.stringify(result.value, null, 2))
        }
        console.log('---')
      })
    } else {
      console.log('NO LINESCORES FOUND ANYWHERE IN RESPONSE!')
    }
    
    // Log full summaryData structure (first 10000 chars)
    console.log('Full summaryData (first 10000 chars):', JSON.stringify(summaryData, null, 2).substring(0, 10000))
  }
  
  const plays = summaryData?.plays || 
                summaryData?.boxscore?.plays || 
                summaryData?.drives?.previous?.flatMap(d => d.plays || []) ||
                summaryData?.drives?.current?.plays ||
                []

  // Determine if we have any scoring plays to decide the default filter
  const hasScoringPlays = plays.some(p => p.scoringPlay || p.type?.text?.toLowerCase().includes('touchdown') || p.type?.text?.toLowerCase().includes('field goal'))

  // Debug plays
  if (summaryData && !window._loggedPlaysDebug) {
    window._loggedPlaysDebug = true
    console.log('=== PLAYS DEBUG ===')
    console.log('Plays count:', plays.length)
    console.log('Has scoring plays:', hasScoringPlays)
    if (plays.length > 0) {
      console.log('Sample play keys:', Object.keys(plays[0]))
      console.log('Sample play:', JSON.stringify(plays[0], null, 2))
    }
  }
  const headlines = summaryData?.headlines || []
  const commentary = summaryData?.commentary || []
  
  // Calculate quarter scores from scoring plays if linescores aren't available
  const calculateQuarterScores = () => {
    const awayScores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const homeScores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let lastAwayScore = 0
    let lastHomeScore = 0
    
    // Filter to only scoring plays and sort by period
    const scoringPlays = plays.filter(play => 
      play.scoringPlay || 
      play.type?.text?.toLowerCase().includes('touchdown') ||
      play.type?.text?.toLowerCase().includes('field goal') ||
      play.type?.text?.toLowerCase().includes('safety') ||
      play.type?.text?.toLowerCase().includes('goal') ||
      (play.awayScore !== undefined && play.homeScore !== undefined && 
       (play.awayScore !== lastAwayScore || play.homeScore !== lastHomeScore))
    )
    
    // Sort plays by period and time
    const sortedPlays = [...scoringPlays].sort((a, b) => {
      const periodA = a.period?.number || a.period || 0
      const periodB = b.period?.number || b.period || 0
      if (periodA !== periodB) return periodA - periodB
      return 0
    })
    
    sortedPlays.forEach(play => {
      // Try multiple ways to get scores from play
      const awayScore = Number(play.awayScore ?? play.score?.away ?? play.scores?.away ?? 0)
      const homeScore = Number(play.homeScore ?? play.score?.home ?? play.scores?.home ?? 0)
      
      if (!isNaN(awayScore) && !isNaN(homeScore) && (awayScore !== lastAwayScore || homeScore !== lastHomeScore)) {
        const period = play.period?.number ?? play.period ?? play.periodNumber ?? 1
        const periodNum = Number(period)
        
        if (periodNum >= 1 && periodNum <= 5) {
          const awayDiff = awayScore - lastAwayScore
          const homeDiff = homeScore - lastHomeScore
          if (awayDiff > 0) awayScores[periodNum] += awayDiff
          if (homeDiff > 0) homeScores[periodNum] += homeDiff
          lastAwayScore = awayScore
          lastHomeScore = homeScore
        }
      }
    })
    
    // Debug logging
    if (sortedPlays.length > 0 && !window._loggedQuarterCalc) {
      window._loggedQuarterCalc = true
      console.log('=== QUARTER SCORES CALCULATION ===')
      console.log('Scoring plays count:', sortedPlays.length)
      console.log('Calculated away scores:', awayScores)
      console.log('Calculated home scores:', homeScores)
      console.log('Sample play:', sortedPlays[0])
    }
    
    return { away: awayScores, home: homeScores }
  }
  
  const calculatedScores = calculateQuarterScores()
  
  // Try to get linescores from event data if not found in team data
  const eventLinescores = summaryData?.boxscore?.linescores || summaryData?.linescores || []
  const awayLinescoresFinal = awayLinescores.length > 0 ? awayLinescores : 
    (eventLinescores.find(ls => ls.teamId === awayTeam?.team?.id || ls.team?.id === awayTeam?.team?.id)?.linescores || [])
  const homeLinescoresFinal = homeLinescores.length > 0 ? homeLinescores : 
    (eventLinescores.find(ls => ls.teamId === homeTeam?.team?.id || ls.team?.id === homeTeam?.team?.id)?.linescores || [])
  
  // Helper to get score for a specific period
  const getPeriodScore = (linescores, periodNumber, teamType) => {
    // First try calculated scores from plays (more reliable if API doesn't provide linescores)
    if (calculatedScores && calculatedScores[teamType] && calculatedScores[teamType][periodNumber] > 0) {
      return String(calculatedScores[teamType][periodNumber])
    }
    
    // Then try linescores if available
    if (!linescores || linescores.length === 0) {
      return '-'
    }
    
    // If linescores is an array, try index-based access (0-based, so period 1 = index 0)
    if (Array.isArray(linescores)) {
      const scoreEntry = linescores[periodNumber - 1]
      if (scoreEntry) {
        // Handle different data structures
        if (typeof scoreEntry === 'number') {
          return String(scoreEntry)
        }
        if (typeof scoreEntry === 'object') {
          const result = scoreEntry.value || scoreEntry.displayValue || scoreEntry.score || scoreEntry.text || '-'
          if (result !== '-') return result
        } else {
          return String(scoreEntry)
        }
      }
      
      // Also try finding by period number
      const found = linescores.find(ls => {
        if (typeof ls === 'object' && ls !== null) {
          return ls.period === periodNumber || 
                 ls.period?.number === periodNumber || 
                 ls.period?.displayValue === String(periodNumber) ||
                 ls.period?.value === periodNumber
        }
        return false
      })
      if (found) {
        const result = found.value || found.displayValue || found.score || found.text || '-'
        if (result !== '-') return result
      }
    }
    
    // Fallback to calculated scores from plays
    if (calculatedScores && calculatedScores[teamType] && calculatedScores[teamType][periodNumber] > 0) {
      return String(calculatedScores[teamType][periodNumber])
    }
    
    return '-'
  }
  
  // Extract player stats and leaders
  // The structure is: leaders = [{ team: {...}, leaders: [{ name: "passingYards", displayName: "Passing Yards", leaders: [{ athlete: {...}, ... }] }] }]
  let leadersData = summaryData?.leaders || boxscore?.leaders || []
  
  // Also check if leaders are in header.competitions[0].leaders
  if (leadersData.length === 0 && summaryData?.header?.competitions?.[0]?.leaders) {
    leadersData = summaryData.header.competitions[0].leaders
  }
  
  // Transform the leaders data structure to match what we need
  // Group stat categories together, finding the leader from each team
  const statCategories = []
  if (leadersData.length > 0) {
    // Get all unique stat categories from all teams
    const categoryMap = new Map()
    
    leadersData.forEach((teamLeader) => {
      const teamId = teamLeader.team?.id
      if (!teamId || !teamLeader.leaders) return
      
      teamLeader.leaders.forEach((category) => {
        const categoryName = category.name || category.displayName
        if (!categoryName || !category.leaders || category.leaders.length === 0) return
        
        if (!categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, {
          name: category.name,
          displayName: category.displayName,
          leaders: []
        })
        }
        
        const categoryData = categoryMap.get(categoryName)
        // Add the player leader from this team
        const playerLeader = category.leaders[0] // Get top leader for this category
        if (playerLeader) {
          categoryData.leaders.push({
            ...playerLeader,
            teamId: teamId
          })
        }
      })
    })
    
    // Convert map to array
    const categories = Array.from(categoryMap.values())
    
    // Enforce specific order: Passing, Rushing, Receiving, Sacks, Tackles
    const order = ['passingYards', 'rushingYards', 'receivingYards', 'sacks', 'totalTackles']
    
    statCategories.push(...categories.sort((a, b) => {
      const indexA = order.indexOf(a.name)
      const indexB = order.indexOf(b.name)
      if (indexA === -1 && indexB === -1) return 0
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    }))
  }
  
  // Debug: Log leaders structure
  if (summaryData && !window._loggedLeadersDebug) {
    window._loggedLeadersDebug = true
    console.log('=== GAME LEADERS DEBUG ===')
    console.log('Raw leadersData:', leadersData)
    console.log('Transformed statCategories:', statCategories)
    console.log('Away team ID:', awayTeam?.team?.id, game.awayTeamId)
    console.log('Home team ID:', homeTeam?.team?.id, game.homeTeamId)
  }
  const awayPlayers = awayTeam?.statistics?.[0]?.athletes || awayTeam?.players || []
  const homePlayers = homeTeam?.statistics?.[0]?.athletes || homeTeam?.players || []
  
  // Get top performers by category
  const getTopPlayers = (category) => {
    const categoryLeaders = leaders.find((l) => l.name === category || l.displayName === category)
    if (!categoryLeaders) return null
    
    const awayLeader = categoryLeaders.leaders?.find((l) => l.team?.id === awayTeam?.team?.id)
    const homeLeader = categoryLeaders.leaders?.find((l) => l.team?.id === homeTeam?.team?.id)
    
    return { away: awayLeader, home: homeLeader, category: categoryLeaders.displayName || categoryLeaders.name }
  }

  const parseNumericValue = (value) => {
    if (value === null || value === undefined) return NaN
    if (typeof value === 'number') return value
    const str = String(value)
    const cleaned = str.replace(/[^\d.-]/g, '')
    const num = parseFloat(cleaned)
    return Number.isNaN(num) ? NaN : num
  }

  const awayScore = Number(game.awayScore) || 0
  const homeScore = Number(game.homeScore) || 0
  const totalScore = awayScore + homeScore
  const awayPercent = totalScore > 0 ? (awayScore / totalScore) * 100 : 50
  const homePercent = totalScore > 0 ? (homeScore / totalScore) * 100 : 50

  // Get team colors and logos from boxscore data if available, otherwise use game data
  const awayColor = getTeamColor(awayTeam?.team, '#888888')
  const homeColor = getTeamColor(homeTeam?.team, '#888888')
  const awayTeamColor = '#e0e0e0' // Keep headers neutral as requested
  const homeTeamColor = '#e0e0e0'
  const awayTeamLogo = awayTeam?.team?.logos?.[0]?.href || awayTeam?.team?.logo || game.awayLogo
  const homeTeamLogo = homeTeam?.team?.logos?.[0]?.href || homeTeam?.team?.logo || game.homeLogo

  // Snapshot Data Extraction
  const currentDrive = summaryData?.drives?.current
  
  // Exhaustive recursive search for situation data in the API response
  const findSituationInObject = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 10) return null;
    
    // Check if THIS object is a situation object
    const hasDown = obj.down !== undefined && obj.down !== null;
    const hasDist = obj.distance !== undefined && obj.distance !== null;
    const hasText = !!(obj.downDistanceText || obj.shortDownDistanceText || obj.yardLineText || obj.possessionText);
    
    if ((hasDown && hasDist) || hasText) {
      // Basic validation - if it has down/dist but they are 0/null, keep looking unless it has text
      if (hasText || (obj.down > 0)) return obj;
    }
    
    // Check children - prioritizing keys that sound like situation
    const keys = Object.keys(obj);
    const priorityKeys = keys.filter(k => k.toLowerCase().includes('situation') || k.toLowerCase().includes('lastplay') || k === 'status');
    const otherKeys = keys.filter(k => !priorityKeys.includes(k) && k !== 'plays' && k !== 'athletes' && k !== 'links');
    
    for (const key of [...priorityKeys, ...otherKeys]) {
      try {
        if (obj[key] && typeof obj[key] === 'object') {
          const found = findSituationInObject(obj[key], depth + 1);
          if (found) return found;
        }
      } catch (e) { /* ignore */ }
    }
    return null;
  };

  const situation = game?.situation || 
                    findSituationInObject(summaryData) || 
                    summaryData?.situation || 
                    summaryData?.boxscore?.situation || 
                    summaryData?.header?.competitions?.[0]?.situation ||
                    summaryData?.header?.competitions?.[0]?.status?.situation ||
                    summaryData?.drives?.current?.plays?.[summaryData?.drives?.current?.plays?.length - 1]?.situation ||
                    summaryData?.header?.competitions?.[0]?.status
  
  const winProbabilityData = summaryData?.winprobability || 
                             summaryData?.winProbability || 
                             summaryData?.boxscore?.winprobability ||
                             summaryData?.boxscore?.winProbability ||
                             summaryData?.predictor?.homeTeam?.winProbability ||
                             summaryData?.analytics?.winProbability ||
                             summaryData?.header?.competitions?.[0]?.predictor?.homeTeam?.winProbability ||
                             summaryData?.header?.competitions?.[0]?.winProbability
  
  const getWinProbObj = (data) => {
    if (!data) return null;
    
    // If it's the array from ESPN's winprobability key
    if (Array.isArray(data)) {
      if (data.length === 0) return null;
      const last = data[data.length - 1];
      
      // Look for any key that represents home win percentage
      const hProb = last.homeWinPercentage ?? last.homeWinProbability ?? last.homeProbability ?? last.homeTeamProbability ?? 0.5;
      const aProb = last.awayWinPercentage ?? last.awayWinProbability ?? last.awayProbability ?? last.awayTeamProbability ?? (1 - hProb);
      
      // Normalize to 0-1 scale
      const hNorm = hProb > 1 ? hProb / 100 : hProb;
      const aNorm = aProb > 1 ? aProb / 100 : aProb;

      return {
        homeWinPercentage: hNorm,
        awayWinPercentage: aNorm,
        play: last.play,
        playId: last.playId
      };
    }
    
    // If it's a single number
    if (typeof data === 'number') {
      const norm = data > 1 ? data / 100 : data;
      return { homeWinPercentage: norm, awayWinPercentage: 1 - norm };
    }
    
    // If it's a single object (like 'predictor' or 'analytics')
    const hProb = data.homeWinPercentage ?? data.homeWinProbability ?? data.homeTeam?.winProbability ?? data.homeTeamProbability ?? data.homeProbability;
    const aProb = data.awayWinPercentage ?? data.awayWinProbability ?? data.awayTeam?.winProbability ?? data.awayTeamProbability ?? data.awayProbability ?? (hProb !== undefined ? (hProb > 1 ? 100 - hProb : 1 - hProb) : undefined);
    
    if (hProb !== undefined) {
      const hNorm = hProb > 1 ? hProb / 100 : hProb;
      const aNorm = aProb > 1 ? aProb / 100 : aProb;
      return { 
        homeWinPercentage: hNorm, 
        awayWinPercentage: aNorm,
        playId: data.playId
      };
    }
    return null;
  };

  const winProbability = getWinProbObj(winProbabilityData) || 
                         getWinProbObj(summaryData?.predictor) || 
                         getWinProbObj(summaryData?.analytics) ||
                         getWinProbObj(summaryData?.header?.competitions?.[0]?.predictor);
  
  // Try to find the matching play if details are missing from the win prob object
  if (winProbability && !winProbability.play) {
    const allPlays = [
      ...(summaryData?.plays || []),
      ...(summaryData?.boxscore?.plays || []),
      ...(summaryData?.drives?.previous?.flatMap(d => d.plays || []) || []),
      ...(summaryData?.drives?.current?.plays || [])
    ];
    const targetPlayId = winProbability.playId;
    
    if (targetPlayId) {
      // Try exact match and partial match (ESPN sometimes has IDs that are prefixes or suffixes)
      winProbability.play = allPlays.find(p => 
        String(p.id) === String(targetPlayId) || 
        String(targetPlayId).includes(String(p.id)) ||
        String(p.id).includes(String(targetPlayId))
      );
    }
    
    // If still no play, use the absolute last play from the game summary data
    if (!winProbability.play && allPlays.length > 0) {
      winProbability.play = allPlays[allPlays.length - 1];
    }
  }

  const possessionTeamId = String(
    situation?.possession || 
    situation?.possessionTeam?.id || 
    situation?.lastPlay?.team?.id || 
    summaryData?.drives?.current?.team?.id ||
    summaryData?.header?.competitions?.[0]?.competitors?.find(c => c.possession || c.possessionTeam?.id)?.team?.id ||
    ''
  )
  const isAwayPossession = possessionTeamId !== '' && possessionTeamId === String(awayTeam?.team?.id || game.awayTeamId)
  const isHomePossession = possessionTeamId !== '' && possessionTeamId === String(homeTeam?.team?.id || game.homeTeamId)
  
  // Is it currently halftime?
  const isHalftime = game.status === 'halftime' || game.statusName?.toLowerCase() === 'halftime'

  // Robust extraction of down and distance
  const downDistanceText = isHalftime ? 'HALFTIME' : situation?.downDistanceText || 
                          situation?.shortDownDistanceText ||
                          (situation?.down !== undefined && situation?.distance !== undefined && situation?.down > 0 ? 
                            `${situation.down}${situation.down === 1 ? 'st' : situation.down === 2 ? 'nd' : situation.down === 3 ? 'rd' : 'th'} & ${situation.distance}` : null) ||
                          (summaryData?.drives?.current?.lastPlay?.text?.match(/\d[a-z]{2}\s&\s\d+/) || [])[0] ||
                          (game.status === 'live' ? 'Live' : '-')
                          
  const yardLineText = situation?.yardLineText || 
                      situation?.possessionText ||
                      (situation?.yardLine !== undefined ? 
                        (situation.yardLine === 50 ? 'Midfield' : 
                         situation.yardLine > 50 ? `${game.homeAbbreviation} ${100 - situation.yardLine}` : 
                         `${game.awayAbbreviation} ${situation.yardLine}`) : null) ||
                      (summaryData?.drives?.current?.lastPlay?.text?.match(/at\s([A-Z]+\s\d+)/) || [])[1] ||
                      '-'

  // Calculate normalized yard line (0-100 where 0 is Away Goal, 100 is Home Goal)
  const getNormalizedYardLine = () => {
    const text = String(yardLineText || '').toUpperCase()
    const homeAbbr = String(game.homeAbbreviation || '').toUpperCase()
    const awayAbbr = String(game.awayAbbreviation || '').toUpperCase()
    const rawYL = situation?.yardLine ?? situation?.yardline ?? situation?.location
    
    // 1. Try to parse from text (most reliable for territory)
    if (homeAbbr && text.includes(homeAbbr)) {
      const match = text.match(/\d+/)
      if (match) {
        const dist = parseInt(match[0])
        if (dist === 50) return 50
        return 100 - dist
      }
    }
    if (awayAbbr && text.includes(awayAbbr)) {
      const match = text.match(/\d+/)
      if (match) return parseInt(match[0])
    }
    
    // 2. Fallback to raw yardLine (if absolute 0-100)
    if (rawYL !== undefined && rawYL !== null) {
      const ylNum = parseInt(rawYL)
      if (ylNum <= 50) {
        if (text.includes('OPP') || text.includes('OPPONENT') || (homeAbbr && text.includes(homeAbbr) && isAwayPossession)) return 100 - ylNum
        if (text.includes('OWN') || (awayAbbr && text.includes(awayAbbr) && isAwayPossession)) return ylNum
      }
      return ylNum
    }
    
    return null
  }

  const normalizedYardLine = getNormalizedYardLine()

  const isRedZone = (isAwayPossession && (normalizedYardLine >= 80)) || (isHomePossession && (normalizedYardLine <= 20))

  // Debug win probability
  useEffect(() => {
    if (!summaryData) return;
    console.log('=== WIN PROBABILITY DEBUG ===');
    console.log('Data found at winprobability:', !!summaryData.winprobability);
    console.log('Calculated winProbability:', winProbability);
    if (summaryData.winprobability?.length > 0) {
      console.log('Last Raw Entry:', summaryData.winprobability[summaryData.winprobability.length - 1]);
    }
  }, [summaryData, winProbability]);

  const getTeamStat = (team, statName) => {
    const stat = team?.statistics?.find(s => s.name === statName)
    if (!stat) return '0'
    return typeof stat.displayValue === 'string' ? stat.displayValue : String(stat.value || '0')
  }

  // Win Probability Chart Component
  const WinProbabilityChart = ({ data }) => {
    if (!data || !Array.isArray(data) || data.length < 2) return null;

    const width = 1000;
    const height = 280; // Slightly taller for labels
    const padding = 45;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    const centerLineY = height / 2;

    // Helper to calculate seconds elapsed in a standard football game (60 mins)
    const getSecondsElapsed = (point) => {
      // Check for period and clock in various locations
      const period = point.period?.number || point.play?.period?.number || 1;
      const clockStr = point.clock?.displayValue || point.play?.clock?.displayValue || "15:00";
      
      try {
        const [mins, secs] = clockStr.split(':').map(Number);
        const secondsInPeriod = (15 * 60) - (mins * 60 + secs);
        return ((period - 1) * 15 * 60) + secondsInPeriod;
      } catch (e) {
        return 0;
      }
    };

    const totalGameSeconds = 3600; // 60 minutes for NFL/CFB

    // Map points to SVG coordinates
    const points = data.map((d, i) => {
      // Calculate X based on game time elapsed
      let secondsElapsed = getSecondsElapsed(d);
      
      // Fallback if seconds calculation fails or is obviously wrong (e.g. all points at 0)
      if (isNaN(secondsElapsed) || (secondsElapsed === 0 && i > 0)) {
        // Linear fallback: assume points are spread across time up to current game clock
        secondsElapsed = (i / (data.length - 1)) * totalGameSeconds * 0.75;
      }

      const x = padding + (Math.min(secondsElapsed, totalGameSeconds) / totalGameSeconds) * chartWidth;
      
      let homeProb = d.homeWinPercentage ?? d.homeWinProbability ?? d.homeProbability ?? d.homeTeamProbability ?? 0.5;
      if (homeProb > 1) homeProb = homeProb / 100;
      
      // Away win prob 1.0 is top (Y = padding), Away win prob 0.0 is bottom (Y = height - padding)
      const prob = 1 - homeProb; 
      const y = height - (padding + (prob * chartHeight));
      return { x, y, prob };
    });

    const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
    const areaPath = `${pathD} L ${points[points.length-1].x},${centerLineY} L ${points[0].x},${centerLineY} Z`;
    
    const hColor = getTeamColor(homeTeam?.team, '#888888');
    const aColor = getTeamColor(awayTeam?.team, '#444444');

  return (
      <div className="win-prob-chart-container" style={{ height: '220px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="win-prob-chart-svg" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="awayGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={aColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={aColor} stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="homeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hColor} stopOpacity="0.1" />
              <stop offset="100%" stopColor={hColor} stopOpacity="0.4" />
            </linearGradient>
            <clipPath id="clip-away">
              <rect x="0" y="0" width={width} height={centerLineY} />
            </clipPath>
            <clipPath id="clip-home">
              <rect x="0" y={centerLineY} width={width} height={height - centerLineY} />
            </clipPath>
          </defs>

          {/* Vertical Grid Lines (Quarter Markers) */}
          {[0, 0.25, 0.5, 0.75, 1].map(p => (
            <line 
              key={p} 
              x1={padding + (chartWidth * p)} 
              y1={padding} 
              x2={padding + (chartWidth * p)} 
              y2={height-padding} 
              stroke="rgba(255,255,255,0.15)" 
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          ))}

          {/* Horizontal Grid Lines */}
          <line x1={padding} y1={centerLineY} x2={width-padding} y2={centerLineY} stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          <line x1={padding} y1={padding} x2={width-padding} y2={padding} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
          <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />

          {/* Right side labels */}
          <text x={width-padding + 15} y={padding + 8} fill="var(--text-muted)" fontSize="26" fontWeight="600">100</text>
          <text x={width-padding + 15} y={centerLineY + 10} fill="var(--text-muted)" fontSize="26" fontWeight="600">50</text>
          <text x={width-padding + 15} y={height-padding + 8} fill="var(--text-muted)" fontSize="26" fontWeight="600">100</text>

          {/* Shaded Areas */}
          <path d={areaPath} fill="url(#awayGradient)" clipPath="url(#clip-away)" />
          <path d={areaPath} fill="url(#homeGradient)" clipPath="url(#clip-home)" />
          
          {/* The Data Path (Solid White) */}
          <path 
            d={pathD} 
            fill="none" 
            stroke="#fff" 
            strokeWidth="5" 
            strokeLinecap="round" 
            style={{ filter: 'drop-shadow(0px 0px 4px rgba(0,0,0,0.5))' }}
          />
          
          {/* Current Position Marker */}
          {points.length > 0 && (
            <circle 
              cx={points[points.length-1].x} 
              cy={points[points.length-1].y} 
              r="7" 
              fill="#fff" 
              style={{ filter: 'drop-shadow(0px 0px 8px rgba(255,255,255,1))' }}
            />
          )}
        </svg>
        <div className="chart-labels" style={{ 
          display: 'flex', 
          width: '100%', 
          padding: `0 ${padding}px`, 
          marginTop: '15px',
          justifyContent: 'space-between'
        }}>
          <span style={{ width: '0', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}></span>
          <span style={{ flex: '1', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', transform: 'translateX(-50%)' }}>1ST</span>
          <span style={{ flex: '1', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', transform: 'translateX(-50%)' }}>2ND</span>
          <span style={{ flex: '1', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', transform: 'translateX(-50%)' }}>3RD</span>
          <span style={{ flex: '1', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', transform: 'translateX(-50%)' }}>4TH</span>
          <span style={{ width: '0' }}></span>
        </div>
      </div>
    );
  };

  // Helper Components for the new layout
  const StandingsSection = ({ data }) => {
    if (!data?.groups) return null;
    
    // Helper to check if a team is one of the game teams
    const isGameTeam = (entry) => {
      const teamId = String(entry.team?.id || '')
      const teamName = (entry.team?.displayName || entry.team?.name || '').toLowerCase()
      const teamAbbr = (entry.team?.abbreviation || '').toLowerCase()
      
      // Check by ID
      if (game.homeTeamId && teamId === String(game.homeTeamId)) return true
      if (game.awayTeamId && teamId === String(game.awayTeamId)) return true
      
      // Check by name
      if (game.homeTeam && teamName.includes(game.homeTeam.toLowerCase())) return true
      if (game.awayTeam && teamName.includes(game.awayTeam.toLowerCase())) return true
      
      // Check by abbreviation
      if (game.homeAbbreviation && teamAbbr === game.homeAbbreviation.toLowerCase()) return true
      if (game.awayAbbreviation && teamAbbr === game.awayAbbreviation.toLowerCase()) return true
      
      return false
    }
    
    return (
      <div className="standings-section">
        <div className="section-header">
          <h3>DIVISION STANDINGS</h3>
        </div>
        {data.groups.map((group, gIdx) => (
          <div key={gIdx} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px' }}>
              {group.name}
            </div>
            <table className="standings-table">
              <thead>
                <tr>
                  <th>TEAM</th>
                  <th style={{ textAlign: 'center' }}>W</th>
                  <th style={{ textAlign: 'center' }}>L</th>
                  <th style={{ textAlign: 'center' }}>PCT</th>
                </tr>
              </thead>
              <tbody>
                {group.standings?.entries?.map((entry, eIdx) => {
                  const highlighted = isGameTeam(entry);
                  return (
                    <tr key={eIdx} style={highlighted ? { background: 'rgba(0, 123, 255, 0.15)' } : {}}>
                      <td>
                        <div className="standings-team">
                          <img src={entry.team?.logos?.[0]?.href} alt="" style={{ width: '16px', height: '16px' }} />
                          <span style={highlighted ? { fontWeight: '700', color: 'var(--text-primary)' } : {}}>{entry.team?.displayName}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{entry.stats?.find(s => s.name === 'wins')?.value ?? '-'}</td>
                      <td style={{ textAlign: 'center' }}>{entry.stats?.find(s => s.name === 'losses')?.value ?? '-'}</td>
                      <td style={{ textAlign: 'center' }}>{entry.stats?.find(s => s.name === 'winPercent')?.displayValue ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  // Reusable: Leaders block (used in preview middle + live/final sidebar)
  const renderLeaders = (title, maxCategories = 3) => {
    if (statCategories.length === 0) return null
    return (
      <div className="standings-section" style={{ padding: 0 }}>
        <div className="section-header" style={{ padding: '15px 20px', marginBottom: 0 }}>
          <h3>{title}</h3>
        </div>
        <div className="game-leaders-container" style={{ border: 'none' }}>
          <div className="game-leaders-header" style={{ background: 'transparent' }}>
            <div className="game-leaders-team-header away">
              <div className="team-logo">
                <TeamLogo name={game.awayTeam} logoUrl={awayTeamLogo} fallbackText={getFallbackText(game.awayTeam, game.awayShortName, game.awayAbbreviation)} />
              </div>
              <span className="game-leaders-team-abbr">{game.awayAbbreviation}</span>
            </div>
            <div className="game-leaders-team-header home">
              <div className="team-logo">
                <TeamLogo name={game.homeTeam} logoUrl={homeTeamLogo} fallbackText={getFallbackText(game.homeTeam, game.homeShortName, game.homeAbbreviation)} />
              </div>
              <span className="game-leaders-team-abbr">{game.homeAbbreviation}</span>
            </div>
          </div>
          {statCategories.slice(0, maxCategories).map((category, idx) => {
            const aId = String(awayTeam?.team?.id || game.awayTeamId || '')
            const hId = String(homeTeam?.team?.id || game.homeTeamId || '')
            const awayL = category.leaders?.find(l => String(l.teamId || '') === aId)
            const homeL = category.leaders?.find(l => String(l.teamId || '') === hId)
            return (
              <div key={idx} className="game-leaders-row" style={{ gridTemplateColumns: '1fr auto 1fr', padding: '10px 15px' }}>
                <div className="game-leaders-player game-leaders-away" style={{ flexDirection: 'column', alignItems: 'center' }}>
                  <div className="player-headshot-stat-group" style={{ marginBottom: '5px' }}>
                    <div className="game-leaders-player-image" style={{ width: '40px', height: '40px' }}>
                      {awayL?.athlete?.headshot?.href ? <img src={awayL.athlete.headshot.href} alt="" /> : <div className="game-leaders-player-placeholder" />}
                    </div>
                    <div className="game-leaders-player-stat-large" style={{ fontSize: '1.1rem' }}>{awayL?.mainStat?.value || '-'}</div>
                  </div>
                  <div className="game-leaders-player-name" style={{ fontSize: '0.75rem', textAlign: 'center' }}>{awayL?.athlete?.shortName}</div>
                </div>
                <div className="game-leaders-category-label" style={{ fontSize: '0.7rem' }}>{category.displayName || category.name}</div>
                <div className="game-leaders-player game-leaders-home" style={{ flexDirection: 'column', alignItems: 'center' }}>
                  <div className="player-headshot-stat-group" style={{ marginBottom: '5px' }}>
                    <div className="game-leaders-player-stat-large" style={{ fontSize: '1.1rem' }}>{homeL?.mainStat?.value || '-'}</div>
                    <div className="game-leaders-player-image" style={{ width: '40px', height: '40px' }}>
                      {homeL?.athlete?.headshot?.href ? <img src={homeL.athlete.headshot.href} alt="" /> : <div className="game-leaders-player-placeholder" />}
                    </div>
                  </div>
                  <div className="game-leaders-player-name" style={{ fontSize: '0.75rem', textAlign: 'center' }}>{homeL?.athlete?.shortName}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Reusable: Team Stats compact bar chart (used in live/final sidebar)
  const renderTeamStatsSidebar = () => {
    if (!awayTeam?.statistics) return null
    return (
      <div className="standings-section">
        <div className="section-header">
          <h3>TEAM STATS</h3>
        </div>
        <div className="boxscore-header-teams-unified" style={{ marginBottom: '15px' }}>
          <div className="boxscore-header-team-unified">
            <div className="boxscore-header-logo" style={{ width: '20px', height: '20px' }}>
              <TeamLogo name={game.awayTeam} logoUrl={awayTeamLogo} />
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: '700' }}>{game.awayAbbreviation}</span>
          </div>
          <div className="boxscore-header-team-unified">
            <span style={{ fontSize: '0.7rem', fontWeight: '700' }}>{game.homeAbbreviation}</span>
            <div className="boxscore-header-logo" style={{ width: '20px', height: '20px' }}>
              <TeamLogo name={game.homeTeam} logoUrl={homeTeamLogo} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {awayTeam.statistics.slice(0, 5).map((stat, idx) => {
            const homeStat = homeTeam?.statistics?.[idx]
            const awayVal = parseNumericValue(stat.displayValue ?? stat.value)
            const homeVal = parseNumericValue(homeStat?.displayValue ?? homeStat?.value)
            const total = (isNaN(awayVal) ? 0 : awayVal) + (isNaN(homeVal) ? 0 : homeVal)
            const awayP = total > 0 ? (awayVal / total) * 100 : 50
            const homeP = total > 0 ? (homeVal / total) * 100 : 50
            return (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', marginBottom: '5px' }}>
                  <span>{stat.displayValue}</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{stat.label || stat.name}</span>
                  <span>{homeStat?.displayValue}</span>
                </div>
                <div className="boxscore-row-bar" style={{ height: '4px' }}>
                  <div className="boxscore-row-bar-segment away" style={{ width: `${awayP}%`, background: awayColor }} />
                  <div className="boxscore-row-bar-segment home" style={{ width: `${homeP}%`, background: homeColor }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Reusable: Full Team Stats table (used in team-stats tab)
  const renderTeamStatsTab = () => (
    <div className="boxscore-container">
      <table className="boxscore-table">
        <thead>
          <tr>
            <th colSpan={3} className="boxscore-title-header">
              <div className="boxscore-header-teams-unified">
                <div className="boxscore-header-team-unified">
                  <div className="boxscore-header-logo"><TeamLogo name={game.awayTeam} logoUrl={awayTeamLogo} /></div>
                  <span style={{ color: '#e0e0e0' }}>{game.awayTeam}</span>
                </div>
                <div className="boxscore-header-team-unified">
                  <div className="boxscore-header-logo"><TeamLogo name={game.homeTeam} logoUrl={homeTeamLogo} /></div>
                  <span style={{ color: '#e0e0e0' }}>{game.homeTeam}</span>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {awayTeam?.statistics?.map((stat, idx) => {
            const homeStat = homeTeam?.statistics?.[idx]
            const awayVal = parseNumericValue(stat.displayValue ?? stat.value)
            const homeVal = parseNumericValue(homeStat?.displayValue ?? homeStat?.value)
            const total = (isNaN(awayVal) ? 0 : awayVal) + (isNaN(homeVal) ? 0 : homeVal)
            const awayP = total > 0 ? (awayVal / total) * 100 : 50
            const homeP = total > 0 ? (homeVal / total) * 100 : 50
            return (
              <tr key={idx}>
                <td className="stat-label">{stat.label || stat.name}</td>
                <td colSpan={2} className="boxscore-bar-cell">
                  <div className="boxscore-row-with-values">
                    <span className="boxscore-value away">{stat.displayValue}</span>
                    <div className="boxscore-row-bar">
                      <div className="boxscore-row-bar-segment away" style={{ width: `${awayP}%`, background: awayColor }} />
                      <div className="boxscore-row-bar-segment home" style={{ width: `${homeP}%`, background: homeColor }} />
                    </div>
                    <span className="boxscore-value home">{homeStat?.displayValue}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // Reusable: Box Score tab content
  const renderBoxScoreTab = () => (
    <div className="full-boxscore-container">
      {boxscore?.players?.map((teamData, tIdx) => (
        <div key={tIdx} className="team-boxscore">
          <h4 style={{ color: tIdx === 0 ? awayTeamColor : homeTeamColor }}>{(tIdx === 0 ? game.awayTeam : game.homeTeam).toUpperCase()}</h4>
          {teamData.statistics?.map((statCat, sIdx) => (
            <div key={sIdx} className="stat-category-block">
              <h5 className="stat-category-title">{statCat.name.toUpperCase()}</h5>
              <div className="table-responsive">
                <table className="full-boxscore-table">
                  <thead>
                    <tr>
                      <th>PLAYER</th>
                      {statCat.labels?.map((label, lIdx) => <th key={lIdx}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {statCat.athletes?.map((player, pIdx) => (
                      <tr key={pIdx}>
                        <td className="player-cell">
                          <div className="player-name">{player.athlete?.displayName}</div>
                          <div className="player-pos">{player.athlete?.position?.abbreviation}</div>
                        </td>
                        {player.stats?.map((stat, stIdx) => <td key={stIdx}>{stat}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  // Reusable: Win Probability section
  const renderWinProbability = () => {
    if (!winProbability) return null
    return (
      <div className="win-probability-section">
        <div className="section-header-row" style={{ borderBottom: '1px dotted rgba(255,255,255,0.2)', paddingBottom: '10px' }}>
          <span className="section-title-main" style={{ fontSize: '0.9rem', fontWeight: '800', letterSpacing: '1px' }}>WIN PROBABILITY</span>
        </div>
        <div className="win-prob-header-new" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0' }}>
          <div className="win-prob-side away" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src={awayTeamLogo} alt="" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
            <div className="win-prob-data" style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: '800', lineHeight: '1' }}>{((winProbability.awayWinPercentage ?? 0.5) * 100).toFixed(1)}%</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                <span style={{ width: '12px', height: '3px', borderRadius: '1.5px', backgroundColor: getTeamColor(awayTeam?.team, '#888888') }}></span>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>{game.awayAbbreviation}</span>
              </div>
            </div>
          </div>
          <div className="win-prob-side home" style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'right' }}>
            <div className="win-prob-data" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: '800', lineHeight: '1' }}>{((winProbability.homeWinPercentage ?? 0.5) * 100).toFixed(1)}%</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>{game.homeAbbreviation}</span>
                <span style={{ width: '12px', height: '3px', borderRadius: '1.5px', backgroundColor: getTeamColor(homeTeam?.team, '#888888') }}></span>
              </div>
            </div>
            <img src={homeTeamLogo} alt="" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          </div>
        </div>
        {Array.isArray(winProbabilityData) && <WinProbabilityChart data={winProbabilityData} />}
        {winProbability.play && (
          <div className="last-play-card-simple" style={{ marginTop: '15px', padding: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)' }}>
            <div className="last-play-summary-text" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
              <strong style={{ color: 'var(--text-muted)' }}>Last Play:</strong> {winProbability.play.text}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Reusable: Standings section
  const renderStandings = () => (
    <>
      {standingsLoading && (
        <div className="standings-section">
          <div className="section-header"><h3>DIVISION STANDINGS</h3></div>
          <div style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading standings...</div>
        </div>
      )}
      {standingsError && !standingsData && (
        <div className="standings-section">
          <div className="section-header"><h3>DIVISION STANDINGS</h3></div>
          <div style={{ padding: '15px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Could not load standings.
          </div>
        </div>
      )}
      {standingsData && <StandingsSection data={standingsData} />}
    </>
  )

  // ─── SHARED HEADER ───
  const renderHeader = () => (
    <div className="game-info-header-new" style={{ marginBottom: '20px' }}>
      <div className="game-header-top">
        <div className="game-time-status">
          {gameState === 'live' && game.clock != null && game.period ? (() => {
            const clockStr = String(game.clock)
            let formattedClock = clockStr
            const clockNum = Number(game.clock)
            if (!isNaN(clockNum) && clockStr.indexOf(':') === -1) {
              const totalSeconds = Math.abs(clockNum)
              const minutes = Math.floor(totalSeconds / 60)
              const seconds = totalSeconds % 60
              formattedClock = `${minutes}:${String(seconds).padStart(2, '0')}`
            }
            const periodText = game.period === 1 ? '1st' : game.period === 2 ? '2nd' : game.period === 3 ? '3rd' : game.period === 4 ? '4th' : game.period ? `${game.period}th` : ''
            return <span className="game-clock">{formattedClock} - {periodText}</span>
          })() : gameState === 'live' ? <span className="game-status-live">LIVE</span>
            : gameState === 'final' ? <span className="game-status-final">FINAL</span>
            : null}
        </div>
      </div>

      <div className="game-teams-header-new">
        <div className="team-header-new team-away">
          <div className="team-header-clickable" onClick={() => onOpenTeam && game.awayTeamId && onOpenTeam({ teamId: game.awayTeamId, sport: game.sport, teamName: game.awayTeam, teamLogo: awayTeamLogo, teamAbbreviation: game.awayAbbreviation })}>
            <div className="team-logo-side">
              <TeamLogo name={game.awayTeam} logoUrl={awayTeamLogo} fallbackText={getFallbackText(game.awayTeam, game.awayShortName, game.awayAbbreviation)} />
            </div>
            <div className="team-info-side">
              <div className="team-name-side" style={{ color: awayTeamColor }}>{game.awayTeam}</div>
              <div className="team-record-side">{game.awayTeamRecord || ''}</div>
            </div>
          </div>
          {gameState !== 'preview' && (
            <div className="team-score-side" style={{ color: awayTeamColor }}>{game.awayScore || '0'}</div>
          )}
        </div>

        <div className="game-center-section">
          {gameState === 'preview' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {game.displayTime || 'TBD'}
              </div>
              {game.broadcastChannel && (
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)' }}>
                  {abbreviateNetwork(game.broadcastChannel)}
                </div>
              )}
              {game.odds?.overUnder != null && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  O/U: {game.odds.overUnder}
                  {game.odds?.spread != null && ` | Spread: ${game.odds.spread > 0 ? '+' : ''}${game.odds.spread}`}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="quarter-scores-table">
                <table className="quarter-table">
                  <thead>
                    <tr>
                      <th></th>
                      {[1, 2, 3, 4].map(q => <th key={q}>{q}</th>)}
                      {game.sport === 'nfl' && <th>OT</th>}
                      <th className="total-score">T</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="team-abbr">{game.awayAbbreviation || 'AWY'}</td>
                      {[1, 2, 3, 4].map(q => <td key={q}>{getPeriodScore(awayLinescoresFinal, q, 'away')}</td>)}
                      {game.sport === 'nfl' && <td>{getPeriodScore(awayLinescoresFinal, 5, 'away')}</td>}
                      <td className="total-score">{game.awayScore || '0'}</td>
                    </tr>
                    <tr>
                      <td className="team-abbr">{game.homeAbbreviation || 'HME'}</td>
                      {[1, 2, 3, 4].map(q => <td key={q}>{getPeriodScore(homeLinescoresFinal, q, 'home')}</td>)}
                      {game.sport === 'nfl' && <td>{getPeriodScore(homeLinescoresFinal, 5, 'home')}</td>}
                      <td className="total-score">{game.homeScore || '0'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {game.broadcastChannel && <div className="broadcast-info">{abbreviateNetwork(game.broadcastChannel)}</div>}
            </>
          )}
        </div>

        <div className="team-header-new team-home">
          {gameState !== 'preview' && (
            <div className="team-score-side" style={{ color: homeTeamColor }}>{game.homeScore || '0'}</div>
          )}
          <div className="team-header-clickable" onClick={() => onOpenTeam && game.homeTeamId && onOpenTeam({ teamId: game.homeTeamId, sport: game.sport, teamName: game.homeTeam, teamLogo: homeTeamLogo, teamAbbreviation: game.homeAbbreviation })}>
            <div className="team-info-side">
              <div className="team-name-side" style={{ color: homeTeamColor }}>{game.homeTeam}</div>
              <div className="team-record-side">{game.homeTeamRecord || ''}</div>
            </div>
            <div className="team-logo-side">
              <TeamLogo name={game.homeTeam} logoUrl={homeTeamLogo} fallbackText={getFallbackText(game.homeTeam, game.homeShortName, game.homeAbbreviation)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── PREVIEW LAYOUT (scheduled games) ───
  const renderPreviewLayout = () => (
    <div className="preview-layout">
      {/* Team Comparison */}
      {awayTeam?.statistics && homeTeam?.statistics && (
        <div className="standings-section">
          <div className="section-header">
            <h3>TEAM COMPARISON</h3>
          </div>
          <div className="boxscore-header-teams-unified" style={{ marginBottom: '15px' }}>
            <div className="boxscore-header-team-unified">
              <div className="boxscore-header-logo" style={{ width: '24px', height: '24px' }}>
                <TeamLogo name={game.awayTeam} logoUrl={awayTeamLogo} />
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>{game.awayAbbreviation}</span>
            </div>
            <div className="boxscore-header-team-unified">
              <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>{game.homeAbbreviation}</span>
              <div className="boxscore-header-logo" style={{ width: '24px', height: '24px' }}>
                <TeamLogo name={game.homeTeam} logoUrl={homeTeamLogo} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {awayTeam.statistics.map((stat, idx) => {
              const homeStat = homeTeam?.statistics?.[idx]
              const awayVal = parseNumericValue(stat.displayValue ?? stat.value)
              const homeVal = parseNumericValue(homeStat?.displayValue ?? homeStat?.value)
              const total = (isNaN(awayVal) ? 0 : awayVal) + (isNaN(homeVal) ? 0 : homeVal)
              const awayP = total > 0 ? (awayVal / total) * 100 : 50
              const homeP = total > 0 ? (homeVal / total) * 100 : 50
              return (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', marginBottom: '5px' }}>
                    <span>{stat.displayValue}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{stat.label || stat.name}</span>
                    <span>{homeStat?.displayValue}</span>
                  </div>
                  <div className="boxscore-row-bar" style={{ height: '4px' }}>
                    <div className="boxscore-row-bar-segment away" style={{ width: `${awayP}%`, background: awayColor }} />
                    <div className="boxscore-row-bar-segment home" style={{ width: `${homeP}%`, background: homeColor }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Season Leaders */}
      {renderLeaders('SEASON LEADERS')}

      {/* Division Standings */}
      {renderStandings()}
    </div>
  )

  // ─── LIVE LAYOUT (in-progress games) ───
  const renderLiveLayout = () => {
    const isFootball = game.sport === 'nfl' || game.sport === 'college-football'
    const liveTabs = ['gamecast', 'boxscore', 'play-by-play', 'team-stats']

    return (
      <>
        <div className="summary-tabs">
          {liveTabs.map(tab => (
            <button
              key={tab}
              className={`summary-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'play-by-play' ? 'Play-by-Play' : tab === 'team-stats' ? 'Team Stats' : tab === 'boxscore' ? 'Box Score' : 'Gamecast'}
            </button>
          ))}
        </div>

        <div className="game-summary-grid">
          {/* Left Sidebar */}
          <aside className="summary-sidebar-left">
            {renderLeaders('GAME LEADERS')}
            {renderTeamStatsSidebar()}
          </aside>

          {/* Middle */}
          <main className="summary-main-content">
            {activeTab === 'gamecast' && (
              <>
                {/* Current Drive + Situation (football only) */}
                {isFootball && (
                  <div className="game-snapshot-container">
                    <div className="snapshot-header-row">
                      {currentDrive && (
                        <div className="current-drive-section">
                          <span className="current-drive-label">CURRENT DRIVE</span>
                          <span className="current-drive-info">
                            {Array.isArray(currentDrive.plays) ? currentDrive.plays.length : (currentDrive.plays || 0)} plays, {currentDrive.yards || 0} yards
                          </span>
                        </div>
                      )}
                      <div className="snapshot-situation">
                        <div className="situation-item">
                          <span className="snapshot-label">Down:</span>
                          <span className="snapshot-value">{downDistanceText}</span>
                        </div>
                        <div className="situation-item">
                          <span className="snapshot-label">Ball On:</span>
                          <span className="snapshot-value">{yardLineText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="football-field-wrapper" style={{ marginTop: '20px' }}>
                      <div className="football-field" style={{ height: '180px' }}>
                        <div className="field-arc"></div>
                        <div className="field-endzone away-endzone" style={{ backgroundColor: `#${awayTeam?.team?.color || '333'}` }}>
                          <span className="endzone-text">{game.awayAbbreviation}</span>
                        </div>
                        <div className="field-grid">
                          <div className="yard-line-container">
                            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(line => (
                              <div key={line} className="field-yard-line" style={{ left: `${line}%` }}>
                                <span className="yard-num">{line > 50 ? 100 - line : line}</span>
                              </div>
                            ))}
                          </div>
                          {normalizedYardLine !== null && (
                            <div className="ball-marker-container" style={{ left: `${normalizedYardLine}%` }}>
                              <div className="ball-marker-icon">
                                <img src={isAwayPossession ? awayTeamLogo : isHomePossession ? homeTeamLogo : awayTeamLogo} alt="" className="marker-logo" />
                                <div className="marker-pointer" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="field-endzone home-endzone" style={{ backgroundColor: `#${homeTeam?.team?.color || '444'}` }}>
                          <span className="endzone-text">{game.homeAbbreviation}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mini Play-by-Play */}
                <div className="news-section" style={{ padding: 0 }}>
                  <div className="section-header-row" style={{ padding: '15px 20px', marginBottom: 0 }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '800' }}>PLAY-BY-PLAY</h3>
                    <div className="play-toggle-container">
                      <button className={`play-toggle-btn ${playFilter === 'scoring' ? 'active' : ''}`} onClick={() => setPlayFilter('scoring')}>Scoring</button>
                      <button className={`play-toggle-btn ${playFilter === 'all' ? 'active' : ''}`} onClick={() => setPlayFilter('all')}>All</button>
                    </div>
                  </div>
                  <div className="play-by-play-list" style={{ border: 'none', background: 'transparent' }}>
                    {plays.filter(p => playFilter === 'all' || p.scoringPlay).slice(-5).reverse().map((play, idx) => (
                      <div key={idx} className="play-card" style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div className="play-card-left">
                          <div className="play-team-logo" style={{ width: '24px', height: '24px' }}>
                            <img src={String(play.team?.id) === String(game.awayTeamId) ? awayTeamLogo : homeTeamLogo} alt="" />
                          </div>
                          <div className="play-content">
                            <div className="play-type-row">
                              <span className="play-type-text" style={{ fontSize: '0.75rem', fontWeight: '800' }}>{play.type?.text}</span>
                              <span className="play-time-text" style={{ fontSize: '0.7rem' }}>{play.clock?.displayValue}</span>
                            </div>
                            <div className="play-description" style={{ fontSize: '0.85rem' }}>{play.text}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ textAlign: 'center', padding: '15px' }}>
                      <button className="summary-tab" style={{ fontSize: '0.75rem' }} onClick={() => setActiveTab('play-by-play')}>Full Play-by-Play</button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'boxscore' && renderBoxScoreTab()}

            {activeTab === 'play-by-play' && (
              <div className="play-by-play-list" style={{ border: 'none', background: 'transparent' }}>
                {plays.filter(p => playFilter === 'all' || p.scoringPlay).reverse().map((play, idx) => (
                  <div key={idx} className="play-card">
                    <div className="play-card-left">
                      <div className="play-team-logo"><img src={String(play.team?.id) === String(game.awayTeamId) ? awayTeamLogo : homeTeamLogo} alt="" /></div>
                      <div className="play-content">
                        <div className="play-type-row">
                          <span className="play-type-text">{play.type?.text}</span>
                          <span className="play-time-text">{play.clock?.displayValue}</span>
                        </div>
                        <div className="play-description">{play.text}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'team-stats' && renderTeamStatsTab()}
          </main>

          {/* Right Sidebar */}
          <aside className="summary-sidebar-right">
            {renderWinProbability()}
            {renderStandings()}
          </aside>
        </div>
      </>
    )
  }

  // ─── FINAL LAYOUT (completed games) ───
  const renderFinalLayout = () => {
    const finalTabs = ['boxscore', 'team-stats']

    return (
      <>
        <div className="summary-tabs">
          {finalTabs.map(tab => (
            <button
              key={tab}
              className={`summary-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'team-stats' ? 'Team Stats' : 'Box Score'}
            </button>
          ))}
        </div>

        <div className="game-summary-grid">
          {/* Left Sidebar */}
          <aside className="summary-sidebar-left">
            {renderLeaders('GAME LEADERS')}
            {renderTeamStatsSidebar()}
          </aside>

          {/* Middle */}
          <main className="summary-main-content">
            {activeTab === 'boxscore' && renderBoxScoreTab()}
            {activeTab === 'team-stats' && renderTeamStatsTab()}
          </main>

          {/* Right Sidebar */}
          <aside className="summary-sidebar-right">
            {renderWinProbability()}
            {renderStandings()}
          </aside>
        </div>
      </>
    )
  }

  return (
    <div className="game-summary-container">
      {isLoading && <div className="info">Loading game summary...</div>}
      {error && <div className="error">Error loading summary: {error}</div>}

      {summaryData && (
        <>
          {renderHeader()}
          {gameState === 'preview' && renderPreviewLayout()}
          {gameState === 'live' && renderLiveLayout()}
          {gameState === 'final' && renderFinalLayout()}
        </>
      )}
    </div>
  )
}

function TeamPage({ team, onBack }) {
  const [teamInfo, setTeamInfo] = useState(null)
  const [roster, setRoster] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [standings, setStandings] = useState(null)
  const [activeTab, setActiveTab] = useState('roster')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    async function loadData() {
      const [info, rost, sched, stand] = await Promise.all([
        fetchTeamInfo(team.sport, team.teamId),
        fetchTeamRoster(team.sport, team.teamId),
        fetchTeamSchedule(team.sport, team.teamId),
        fetchStandings(team.sport),
      ])
      if (cancelled) return

      setTeamInfo(info)
      setRoster(rost)
      setSchedule(sched)

      if (stand) {
        const t = info?.team
        const teamIdentifiers = {
          ids: [String(team.teamId), t?.id ? String(t.id) : ''].filter(Boolean),
          names: [team.teamName, t?.displayName, t?.shortDisplayName, t?.name].filter(Boolean),
          abbrs: [team.teamAbbreviation, t?.abbreviation].filter(Boolean),
        }
        const filtered = filterStandingsByTeams(stand, teamIdentifiers)
        setStandings(filtered)
      }
      setIsLoading(false)
    }

    loadData()
    return () => { cancelled = true }
  }, [team.teamId, team.sport])

  const teamData = teamInfo?.team
  const teamColor = teamData?.color ? `#${teamData.color}` : '#007bff'
  const teamLogo = teamData?.logos?.[0]?.href || team.teamLogo
  const teamName = teamData?.displayName || team.teamName
  const teamRecord = teamData?.record?.items?.[0]?.summary || ''

  // Group roster by position
  const rosterGroups = useMemo(() => {
    if (!roster) return []
    const athletes = roster.athletes || []
    if (athletes.length > 0 && athletes[0].items) {
      return athletes.map(group => ({
        name: group.position || group.name || 'Players',
        players: group.items || [],
      }))
    }
    const grouped = {}
    athletes.forEach(player => {
      const pos = player.position?.displayName || player.position?.name || 'Other'
      if (!grouped[pos]) grouped[pos] = []
      grouped[pos].push(player)
    })
    return Object.entries(grouped).map(([name, players]) => ({ name, players }))
  }, [roster])

  // Parse schedule events
  const scheduleEvents = useMemo(() => {
    if (!schedule) return []
    const events = schedule.events || schedule.items || []
    return events.map(evt => {
      const comp = evt.competitions?.[0]
      const competitors = comp?.competitors || []
      const us = competitors.find(c => String(c.id) === String(team.teamId) || String(c.team?.id) === String(team.teamId))
      const them = competitors.find(c => c !== us) || competitors[1] || competitors[0]
      const isHome = us?.homeAway === 'home'
      const ourScore = us?.score?.value ?? us?.score
      const theirScore = them?.score?.value ?? them?.score
      const winner = us?.winner
      const dateStr = evt.date || comp?.date
      let dateDisplay = ''
      if (dateStr) {
        const d = new Date(dateStr)
        dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      const status = comp?.status?.type?.name || evt.status?.type?.name || ''
      const isCompleted = status === 'STATUS_FINAL' || comp?.status?.type?.completed
      const isScheduled = status === 'STATUS_SCHEDULED' || (!isCompleted && !ourScore)

      return {
        id: evt.id,
        date: dateStr,
        dateDisplay,
        isHome,
        opponentName: them?.team?.displayName || them?.team?.name || 'TBD',
        opponentAbbr: them?.team?.abbreviation || '',
        opponentLogo: them?.team?.logos?.[0]?.href || them?.team?.logo,
        ourScore: ourScore != null ? String(ourScore) : '',
        theirScore: theirScore != null ? String(theirScore) : '',
        isCompleted,
        isScheduled,
        won: winner === true,
        lost: winner === false,
        statusText: isCompleted ? 'Final' : isScheduled ? (evt.status?.type?.shortDetail || 'Scheduled') : (comp?.status?.type?.shortDetail || ''),
      }
    })
  }, [schedule, team.teamId])

  // Standings section reuse
  const StandingsBlock = () => {
    if (!standings || !standings.groups?.length) return <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No standings available.</div>
    return (
      <div>
        {standings.groups.map((group, gIdx) => (
          <div key={gIdx} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px' }}>
              {group.name}
            </div>
            <table className="roster-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>TEAM</th>
                  <th>W</th>
                  <th>L</th>
                  <th>PCT</th>
                </tr>
              </thead>
              <tbody>
                {group.standings?.entries?.map((entry, eIdx) => {
                  const isUs = String(entry.team?.id) === String(team.teamId)
                  return (
                    <tr key={eIdx} style={isUs ? { background: 'rgba(0, 123, 255, 0.15)' } : {}}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img src={entry.team?.logos?.[0]?.href} alt="" style={{ width: '16px', height: '16px' }} />
                          <span style={isUs ? { fontWeight: '700', color: 'var(--text-primary)' } : {}}>{entry.team?.displayName}</span>
                        </div>
                      </td>
                      <td>{entry.stats?.find(s => s.name === 'wins')?.value ?? '-'}</td>
                      <td>{entry.stats?.find(s => s.name === 'losses')?.value ?? '-'}</td>
                      <td>{entry.stats?.find(s => s.name === 'winPercent')?.displayValue ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="team-page-container">
      {isLoading ? (
        <div className="info">Loading team data...</div>
      ) : (
        <>
          {/* Team Header */}
          <div className="team-page-header">
            <div className="team-page-logo">
              <img src={teamLogo} alt="" />
            </div>
            <div className="team-page-info">
              <h1 style={{ color: teamColor }}>{teamName}</h1>
              {teamRecord && <div className="team-page-record">{teamRecord}</div>}
              {teamData?.standingSummary && (
                <div className="team-page-standing">{teamData.standingSummary}</div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="summary-tabs">
            {['roster', 'schedule', 'standings'].map(tab => (
              <button
                key={tab}
                className={`summary-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'roster' && (
            <div>
              {rosterGroups.length === 0 ? (
                <div style={{ padding: '20px', color: 'var(--text-muted)' }}>No roster data available.</div>
              ) : (
                rosterGroups.map((group, gIdx) => (
                  <div key={gIdx} className="standings-section" style={{ marginBottom: '16px' }}>
                    <div className="section-header">
                      <h3>{group.name.toUpperCase()}</h3>
                    </div>
                    <table className="roster-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>#</th>
                          <th style={{ textAlign: 'left' }}>NAME</th>
                          <th>POS</th>
                          <th>AGE</th>
                          <th>HT</th>
                          <th>WT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.players.map((player, pIdx) => (
                          <tr key={pIdx}>
                            <td>{player.jersey || '-'}</td>
                            <td style={{ textAlign: 'left' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {player.headshot?.href && (
                                  <img src={player.headshot.href} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)' }} />
                                )}
                                <span style={{ fontWeight: '600' }}>{player.displayName || player.fullName}</span>
                              </div>
                            </td>
                            <td>{player.position?.abbreviation || '-'}</td>
                            <td>{player.age || '-'}</td>
                            <td>{player.displayHeight || '-'}</td>
                            <td>{player.displayWeight || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="standings-section">
              <div className="section-header">
                <h3>SCHEDULE</h3>
              </div>
              {scheduleEvents.length === 0 ? (
                <div style={{ padding: '20px', color: 'var(--text-muted)' }}>No schedule data available.</div>
              ) : (
                <div className="schedule-list">
                  {scheduleEvents.map((evt, idx) => (
                    <div key={idx} className="schedule-row">
                      <div className="schedule-date">{evt.dateDisplay}</div>
                      <div className="schedule-matchup">
                        <span className="schedule-home-away">{evt.isHome ? 'vs' : '@'}</span>
                        {evt.opponentLogo && <img src={evt.opponentLogo} alt="" className="schedule-opp-logo" />}
                        <span className="schedule-opp-name">{evt.opponentName}</span>
                      </div>
                      <div className="schedule-result">
                        {evt.isCompleted ? (
                          <>
                            <span className={`schedule-wl ${evt.won ? 'win' : 'loss'}`}>{evt.won ? 'W' : 'L'}</span>
                            <span className="schedule-score">{evt.ourScore}-{evt.theirScore}</span>
                          </>
                        ) : (
                          <span className="schedule-status">{evt.statusText}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'standings' && (
            <div className="standings-section">
              <div className="section-header">
                <h3>DIVISION STANDINGS</h3>
              </div>
              <StandingsBlock />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function App() {
  const today = useMemo(() => stripTime(new Date()), [])
  const baseMonday = useMemo(() => getMonday(today), [today])
  const todayKey = useMemo(() => getDayKeyFromDate(today), [today])

  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDay, setActiveDay] = useState(todayKey === 'sunday' ? 'sunday' : todayKey)
  const [currentDate, setCurrentDate] = useState(() => new Date(today))
  const [selectedSport, setSelectedSport] = useState('all')
  const [selectedGame, setSelectedGame] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [showLiveOnly, setShowLiveOnly] = useState(false)

  const { scores, isLoading, error } = useScores(currentDate)

  const dateInputRef = useRef(null)

  const dayDates = useMemo(() => {
    const monday = addDays(baseMonday, weekOffset * 7)
    const map = {}
    DAY_KEYS.forEach((key, index) => {
      map[key] = addDays(monday, index)
    })
    // Sunday should be six days from Monday
    map.sunday = addDays(monday, 6)
    return map
  }, [baseMonday, weekOffset])

  const handleSportClick = (sport) => {
    setSelectedSport(sport)
    setShowLiveOnly(false)
    setSelectedGame(null)
  }

  const handleDaySelect = (dayKey) => {
    const targetDate = dayDates[dayKey]
    if (!targetDate) return
    setActiveDay(dayKey)
    setCurrentDate(targetDate)
    setShowLiveOnly(false)
  }

  const goToWeek = (newOffset) => {
    const monday = addDays(baseMonday, newOffset * 7)
    const defaultDay = newOffset === 0 ? todayKey : 'monday'
    const newActiveDay = DAY_KEYS.includes(defaultDay) ? defaultDay : 'monday'
    const dayIndex = newActiveDay === 'sunday' ? 6 : DAY_KEYS.indexOf(newActiveDay)
    const newDate = addDays(monday, dayIndex)
    setWeekOffset(newOffset)
    setActiveDay(newActiveDay)
    setCurrentDate(newDate)
  }

  const handlePreviousWeek = () => {
    goToWeek(weekOffset - 1)
  }

  const handleNextWeek = () => {
    goToWeek(weekOffset + 1)
  }

  const handleCustomDateChange = (event) => {
    const value = event.target.value
    if (!value) return
    const [year, month, day] = value.split('-').map(Number)
    const selected = new Date(year, month - 1, day)
    const selectedMonday = getMonday(selected)
    const diffWeeks = Math.round((stripTime(selectedMonday) - baseMonday) / MILLISECONDS_IN_DAY / 7)
    setWeekOffset(diffWeeks)
    const newActiveDay = getDayKeyFromDate(selected)
    setActiveDay(DAY_KEYS.includes(newActiveDay) ? newActiveDay : 'monday')
    setCurrentDate(selected)
  }

  const toggleDatePicker = () => {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker()
    } else {
      dateInputRef.current?.click()
    }
  }

  const handleOpenGameSummary = (game) => {
    setSelectedTeam(null)
    setSelectedGame(game)
  }

  const handleOpenTeamPage = (teamInfo) => {
    setSelectedTeam(teamInfo)
  }

  const handleBackFromTeam = () => {
    setSelectedTeam(null)
  }

  const handleBackToScores = () => {
    setSelectedTeam(null)
    setSelectedGame(null)
    setWeekOffset(0)
    setActiveDay(todayKey)
    setCurrentDate(new Date(today))
  }

  const weekLabel = formatWeekLabel(weekOffset)

  const sortedScores = useMemo(() => {
    let baseScores =
      selectedSport === 'all'
        ? scores
        : scores.filter((game) => game.sport === selectedSport)
    
    if (showLiveOnly) {
      baseScores = baseScores.filter(game => game.status === 'live' || game.status === 'halftime')
    }
    
    const copy = [...baseScores]
    copy.sort(compareGames)
    return copy
  }, [scores, selectedSport, showLiveOnly])


  const liveCount = useMemo(() => {
    const sportScores = selectedSport === 'all'
      ? scores
      : scores.filter((game) => game.sport === selectedSport)
    return sportScores.filter((game) => game.status === 'live' || game.status === 'halftime').length
  }, [scores, selectedSport])

  // Show team page > game summary > score list (priority order)
  const mainContent = selectedTeam ? (
    <TeamPage team={selectedTeam} onBack={handleBackFromTeam} />
  ) : selectedGame ? (
    <GameSummary game={selectedGame} onBack={handleBackToScores} onOpenTeam={handleOpenTeamPage} />
  ) : (
    <>
      <div className="date-navigation">
        <div className="week-display" onClick={toggleDatePicker} style={{ cursor: 'pointer' }}>
          <div className="week-label" id="weekLabel">
            {weekLabel}
          </div>
        </div>

        <div className="week-buttons">
          <button className="week-nav-btn" onClick={handlePreviousWeek}>
            ◀
          </button>
          {DAY_KEYS.map((dayKey) => (
            <div className="day-button" key={dayKey}>
              <button
                className={['week-btn', activeDay === dayKey ? 'active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleDaySelect(dayKey)}
              >
                {dayKey.slice(0, 3).charAt(0).toUpperCase() + dayKey.slice(1, 3)}
              </button>
              <div className="day-date" id={`${dayKey}Date`}>
                {formatDateLabel(dayDates[dayKey])}
              </div>
            </div>
          ))}
          <button className="week-nav-btn" onClick={handleNextWeek}>
            ▶
          </button>
        </div>

        <div className="date-picker" id="datePicker">
          <input
            ref={dateInputRef}
            type="date"
            id="customDate"
            value={formatDateInputValue(currentDate)}
            onChange={handleCustomDateChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className="scores-container" id="scoresContainer">
        {error ? (
          <div className="error">Unable to load scores. Please try again.</div>
        ) : sortedScores.length === 0 ? (
          <div className="info">
            {isLoading ? 'Loading scores…' : 'No games scheduled for this date.'}
          </div>
        ) : (
          sortedScores.map((game) => (
            <ScoreCard
              key={game.id ?? `${game.sport}-${game.awayTeam}-${game.homeTeam}`}
              game={game}
              onOpenSummary={handleOpenGameSummary}
              onOpenTeam={handleOpenTeamPage}
            />
          ))
        )}
      </div>
    </>
  )

  return (
    <div className="container">
      <div className="site-header">
        <div className="header-left">
          <div className="header-logo-group" onClick={handleBackToScores} style={{ cursor: 'pointer' }}>
            <h1>Quiet Scores</h1>
          </div>
        </div>

        <div className="header-center">
          <div className="sport-filters">
            <div
              className={`live-games-indicator ${showLiveOnly ? 'active' : ''}`}
              style={{ display: liveCount > 0 ? 'flex' : 'none', cursor: 'pointer' }}
              onClick={() => {
                setShowLiveOnly(!showLiveOnly)
                setSelectedGame(null)
              }}
            >
              <span className="count" id="liveGamesCount">
                {liveCount}
              </span>
              <span>Live</span>
            </div>
            <div className="filter-divider"></div>
            {SPORT_BUTTONS.map((button) => (
              <button
                key={button.value}
                className={['sport-btn', selectedSport === button.value ? 'active' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-sport={button.value}
                onClick={() => handleSportClick(button.value)}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>

        <div className="header-right">
        </div>
      </div>

      <div>
        {mainContent}
      </div>

      {!selectedGame && (
        <footer className="site-footer">
          <a 
            href="https://buymeacoffee.com/ryanc0804" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bmc-text-link"
          >
            Buy me a coffee
          </a>
        </footer>
      )}
    </div>
  )
}

export default App
