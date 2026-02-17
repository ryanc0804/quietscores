const ESPN_APIS = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  'college-football':
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
  'college-basketball':
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?limit=200&groups=50',
}

const ESPN_SUMMARY_APIS = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary',
  nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary',
  mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary',
  nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary',
  'college-football':
    'https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary',
  'college-basketball':
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary',
}

function formatDateParam(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function normalizeStatus(status, detail, shortDetail) {
  const detailLower = (detail || '').toLowerCase()
  const shortLower = (shortDetail || '').toLowerCase()
  const combined = detailLower || shortLower

  if (combined.includes('postponed') || combined.includes('canceled')) {
    return 'postponed'
  }

  if (combined.includes('halftime')) {
    return 'halftime'
  }

  switch (status) {
    case 'pre':
      return 'scheduled'
    case 'post':
    case 'final':
      return 'final'
    case 'in':
      if (combined.includes('end')) {
        return 'halftime'
      }
      return 'live'
    default:
      if (combined.includes('final')) return 'final'
      if (combined.includes('live')) return 'live'
      return 'scheduled'
  }
}

function formatDisplayTime(eventDate) {
  try {
    const date = new Date(eventDate)
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return 'TBD'
  }
}

function extractRecord(competitor) {
  const records = competitor?.records
  if (!records || records.length === 0) return null
  const total = records.find((record) => record.type === 'total')
  return (total ?? records[0])?.summary ?? null
}

function pickTeamLogo(team) {
  if (!team) return null
  if (Array.isArray(team.logos) && team.logos.length > 0) {
    // Prefer alternate logos (often lighter versions) if available
    // ESPN sometimes provides multiple variants - look for alternates first
    const alternates = team.logos.filter((entry) => 
      Boolean(entry.href) && (
        entry.href.toLowerCase().includes('alternate') ||
        entry.href.toLowerCase().includes('alt') ||
        entry.href.toLowerCase().includes('light') ||
        entry.href.toLowerCase().includes('white')
      )
    )
    
    // If alternates found, use the first one
    if (alternates.length > 0 && alternates[0]?.href) {
      return alternates[0].href
    }
    
    // Otherwise, try to find a logo that's not the primary dark one
    // Look for logos that might be lighter variants
    const nonPrimary = team.logos.find((entry) => 
      Boolean(entry.href) && 
      !entry.href.toLowerCase().includes('dark') &&
      !entry.href.toLowerCase().includes('black')
    ) ?? team.logos.find((entry) => Boolean(entry.href))
    
    if (nonPrimary?.href) return nonPrimary.href
    
    // Fallback to first available logo
    const primary = team.logos.find((entry) => Boolean(entry.href)) ?? team.logos[0]
    if (primary?.href) return primary.href
  }
  if (team.logo) return team.logo
  return null
}

function transformEvent(event, sportKey) {
  if (!event) return null
  const competition = event.competitions?.[0]
  if (!competition) return null

  const competitors = competition.competitors ?? []
  if (competitors.length === 0) return null

  const home =
    competitors.find((comp) => comp.homeAway === 'home') ?? competitors[1] ?? null
  const away =
    competitors.find((comp) => comp.homeAway === 'away') ?? competitors[0] ?? null

  if (!home || !away) return null

  // Debug: Log team structure for college sports to find conference data
  if (sportKey === 'college-football' || sportKey === 'college-basketball') {
    // Log first game only to avoid spam
    if (!window._loggedConferenceDebug) {
      window._loggedConferenceDebug = true
      console.log('=== CONFERENCE DEBUG ===')
      console.log('Home competitor:', home)
      console.log('Home team:', home.team)
      console.log('Home team keys:', home.team ? Object.keys(home.team) : 'no team')
      console.log('Competitor keys:', Object.keys(home))
      if (home.team) {
        console.log('Team group:', home.team.group)
        console.log('Team conference:', home.team.conference)
        console.log('Team groups:', home.team.groups)
        console.log('Full team object:', JSON.stringify(home.team, null, 2).substring(0, 1000))
      }
    }
  }

  const status = event.status ?? {}
  const statusType = status.type ?? {}
  const normalizedStatus = normalizeStatus(
    statusType.state,
    statusType.detail,
    statusType.shortDetail,
  )

  const timeDetail =
    statusType.shortDetail ||
    statusType.detail ||
    statusType.description ||
    ''

  const homeTeamName = home.team?.displayName || home.team?.name
  const awayTeamName = away.team?.displayName || away.team?.name

  if (!homeTeamName || !awayTeamName) return null

  const homeLogo = pickTeamLogo(home.team)
  const awayLogo = pickTeamLogo(away.team)
  const homeShortName = home.team?.shortDisplayName || home.team?.abbreviation
  const awayShortName = away.team?.shortDisplayName || away.team?.abbreviation
  const homeAbbreviation = home.team?.abbreviation || null
  const awayAbbreviation = away.team?.abbreviation || null

  // Extract conference information for college sports
  // ESPN API doesn't reliably provide conference data in scoreboard endpoint
  // We'll use hardcoded team lists for filtering instead
  const homeConference = null
  const awayConference = null

  // Extract possession/at-bat information
  let possessionTeam = null
  const situation = competition?.situation
  
  if (situation?.possession) {
    // Possession might be an ID string/number or an object with team/id
    if (typeof situation.possession === 'object') {
      possessionTeam = situation.possession.team?.id || situation.possession.id || situation.possession
    } else {
      possessionTeam = situation.possession
    }
  }
  // Check situation.lastPlay first (most common location for possession)
  if (!possessionTeam && situation?.lastPlay?.team?.id) {
    possessionTeam = situation.lastPlay.team.id
  }
  // Also check for possession in competition.lastPlay
  if (!possessionTeam && competition?.lastPlay?.team?.id) {
    possessionTeam = competition.lastPlay.team.id
  }
  // Check for possessionTeam property in lastPlay
  if (!possessionTeam && situation?.lastPlay?.possessionTeam) {
    possessionTeam = situation.lastPlay.possessionTeam
  }
  if (!possessionTeam && competition?.lastPlay?.possessionTeam) {
    possessionTeam = competition.lastPlay.possessionTeam
  }
  
  // Debug: Log possession data for first live game (after extraction)
  if (normalizedStatus === 'live' && !window._loggedPossessionDebug) {
    window._loggedPossessionDebug = true
    console.log('=== POSSESSION DEBUG ===')
    console.log('Sport:', sportKey)
    console.log('Situation:', situation)
    console.log('Situation possession:', situation?.possession)
    console.log('Situation lastPlay:', situation?.lastPlay)
    console.log('Situation lastPlay team:', situation?.lastPlay?.team)
    console.log('Situation lastPlay team ID:', situation?.lastPlay?.team?.id, typeof situation?.lastPlay?.team?.id)
    console.log('Competition lastPlay:', competition?.lastPlay)
    console.log('Away team ID:', away.team?.id, typeof away.team?.id)
    console.log('Home team ID:', home.team?.id, typeof home.team?.id)
    console.log('Extracted possessionTeam:', possessionTeam, typeof possessionTeam)
    console.log('Will match away?', possessionTeam && String(possessionTeam) === String(away.team?.id))
    console.log('Will match home?', possessionTeam && String(possessionTeam) === String(home.team?.id))
  }

  // For baseball, determine at-bat team and extract MLB-specific data
  let atBatTeam = null
  let inningNumber = null
  let topBottom = null
  let bases = null
  let balls = null
  let strikes = null
  let outs = null

  if (sportKey === 'mlb') {
    if (situation?.inningHalf) {
      atBatTeam = situation.inningHalf === 'top' ? 'away' : 'home'
    }

    // Extract inning information
    if (situation?.inning !== undefined && situation.inning !== null) {
      inningNumber = situation.inning
    } else if (status.period) {
      inningNumber = status.period
    }

    // Extract top/bottom
    if (situation?.topOfInning !== undefined && situation.topOfInning !== null) {
      topBottom = situation.topOfInning ? 'top' : 'bot'
    } else if (situation?.inningHalf !== undefined && situation.inningHalf !== null) {
      if (situation.inningHalf === 1 || situation.inningHalf === 'top') {
        topBottom = 'top'
      } else if (situation.inningHalf === 2 || situation.inningHalf === 'bottom') {
        topBottom = 'bot'
      }
    } else if (situation?.inningHalf) {
      topBottom = situation.inningHalf === 'top' ? 'top' : 'bot'
    }

    // Extract count (balls, strikes, outs)
    if (situation?.balls !== undefined && situation.balls !== null) {
      balls = situation.balls
    }
    if (situation?.strikes !== undefined && situation.strikes !== null) {
      strikes = situation.strikes
    }
    if (situation?.outs !== undefined && situation.outs !== null) {
      outs = situation.outs
    }

    // Extract base runners
    const onFirst = situation?.onFirst
    const onSecond = situation?.onSecond
    const onThird = situation?.onThird

    if (onFirst && onSecond && onThird) {
      bases = 'loaded'
    } else if (onFirst && onSecond && !onThird) {
      bases = '1st & 2nd'
    } else if (onFirst && !onSecond && onThird) {
      bases = '1st & 3rd'
    } else if (!onFirst && onSecond && onThird) {
      bases = '2nd & 3rd'
    } else if (onFirst && !onSecond && !onThird) {
      bases = '1st'
    } else if (!onFirst && onSecond && !onThird) {
      bases = '2nd'
    } else if (!onFirst && !onSecond && onThird) {
      bases = '3rd'
    } else {
      bases = 'empty'
    }
  }

  const baseGame = {
    id: event.id ?? `${sportKey}-${awayTeamName}-${homeTeamName}`,
    sport: sportKey,
    sportName: event.name || sportKey.toUpperCase(),
    awayTeam: awayTeamName,
    homeTeam: homeTeamName,
    awayScore: away.score ?? '',
    homeScore: home.score ?? '',
    awayTeamRecord: extractRecord(away),
    homeTeamRecord: extractRecord(home),
    status: normalizedStatus,
    time: timeDetail,
    displayTime: normalizedStatus === 'scheduled' ? formatDisplayTime(event.date) : '',
    fullDateTime: event.date,
    gameDate: event.date,
    period: status.period,
    clock: status.clock,
    homeLogo,
    awayLogo,
    homeShortName,
    awayShortName,
    homeAbbreviation,
    awayAbbreviation,
    homeConference,
    awayConference,
    possessionTeam: possessionTeam ? String(possessionTeam) : null,
    awayTeamId: away.team?.id ? String(away.team.id) : null,
    homeTeamId: home.team?.id ? String(home.team.id) : null,
    atBatTeam,
    situation,
    // MLB-specific fields
    inningNumber,
    topBottom,
    bases,
    balls,
    strikes,
    outs,
  }

  // Extract broadcast information - check multiple possible locations
  let broadcastChannel = null
  
  // Try direct broadcast field first
  if (event.broadcast) {
    broadcastChannel = event.broadcast
  }
  // Try competitions[0].broadcasts array (most common location)
  else if (competition?.broadcasts && competition.broadcasts.length > 0) {
    const broadcast = competition.broadcasts[0]
    // Check for names array first
    if (broadcast.names && broadcast.names.length > 0) {
      broadcastChannel = broadcast.names[0]
    }
    // Fallback to media.shortName
    else if (broadcast.media?.shortName) {
      broadcastChannel = broadcast.media.shortName
    }
  }
  // Fallback to geoBroadcasts array
  else if (event.geoBroadcasts && event.geoBroadcasts.length > 0) {
    const geoBroadcast = event.geoBroadcasts[0]
    if (geoBroadcast.media?.shortName) {
      broadcastChannel = geoBroadcast.media.shortName
    }
  }
  // Legacy broadcasts array fallback
  else if (event.broadcasts && event.broadcasts.length > 0) {
    const broadcast = event.broadcasts[0]
    if (broadcast.names && broadcast.names.length > 0) {
      broadcastChannel = broadcast.names[0]
    }
  }

  if (broadcastChannel) {
    baseGame.broadcastChannel = broadcastChannel
  }

  // Extract betting odds for all sports
  let spread = null
  let overUnder = null
  let awayMoneyline = null
  let homeMoneyline = null

  if (competition?.odds && competition.odds.length > 0) {
    const odds = competition.odds[0]

    // Extract point spread
    if (odds.pointSpread) {
      const pointSpread = odds.pointSpread
      if (pointSpread.away?.close?.line !== undefined) {
        spread = pointSpread.away.close.line
      } else if (pointSpread.home?.close?.line !== undefined) {
        // If away doesn't have it, use home and negate it
        spread = -pointSpread.home.close.line
      }
    }

    // Extract over/under (total)
    if (odds.overUnder) {
      const total = odds.overUnder
      if (total.close?.line !== undefined) {
        overUnder = total.close.line
      }
    }

    // Extract moneyline
    if (odds.moneyline) {
      const moneyline = odds.moneyline
      if (moneyline.away?.close?.line !== undefined) {
        awayMoneyline = moneyline.away.close.line
      }
      if (moneyline.home?.close?.line !== undefined) {
        homeMoneyline = moneyline.home.close.line
      }
    }
  }

  if (spread !== null || overUnder !== null || awayMoneyline !== null || homeMoneyline !== null) {
    baseGame.odds = {
      spread,
      overUnder,
      awayMoneyline,
      homeMoneyline,
    }
  }

  return baseGame
}

async function fetchSportScoreboard(sportKey, date, { signal } = {}) {
  const endpoint = ESPN_APIS[sportKey]
  if (!endpoint) return []

  const separator = endpoint.includes('?') ? '&' : '?'
  const url = `${endpoint}${separator}dates=${formatDateParam(date)}`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${sportKey} scoreboard: ${response.status}`)
  }

  const data = await response.json()
  const events = data?.events ?? []

  // Filter events to only include games on the selected date
  // ESPN API sometimes returns games from adjacent dates
  const targetDateStr = formatDateParam(date)
  const targetDateObj = stripTime(new Date(date))
  
  const filteredEvents = events.filter((event) => {
    if (!event.date) return false
    
    // Compare dates by stripping time and comparing date strings
    const eventDate = new Date(event.date)
    const eventDateStr = formatDateParam(eventDate)
    
    // For college football, be more strict - only exact date matches
    if (sportKey === 'college-football' || sportKey === 'college-basketball') {
      return eventDateStr === targetDateStr
    }
    
    // For other sports, allow same day (in case of timezone issues)
    const eventDateObj = stripTime(eventDate)
    return eventDateObj.getTime() === targetDateObj.getTime()
  })

  return filteredEvents
    .map((event) => transformEvent(event, sportKey))
    .filter(Boolean)
}

async function fetchAllScoreboards(date, { signal } = {}) {
  const sportKeys = Object.keys(ESPN_APIS)

  const results = await Promise.allSettled(
    sportKeys.map((sport) => fetchSportScoreboard(sport, date, { signal })),
  )

  const scores = []
  results.forEach((result) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      scores.push(...result.value)
    }
  })

  return scores
}

async function fetchGameSummary(sportKey, gameId, { signal } = {}) {
  const endpoint = ESPN_SUMMARY_APIS[sportKey]
  if (!endpoint) {
    throw new Error(`No summary endpoint for sport: ${sportKey}`)
  }

  const url = `${endpoint}?event=${gameId}`
  
  // Log the URL for Postman testing
  console.log('=== API URL FOR POSTMAN ===')
  console.log('GET', url)
  console.log('Copy this URL to test in Postman')
  
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Failed to fetch game summary: ${response.status}`)
  }

  const data = await response.json()
  return data
}

// Cache for team-to-conference mappings
const conferenceCache = new Map()

async function fetchTeamConferences(sportKey, { signal } = {}) {
  // Check cache first
  if (conferenceCache.has(sportKey)) {
    return conferenceCache.get(sportKey)
  }

  try {
    let teamsEndpoint
    if (sportKey === 'college-football') {
      teamsEndpoint = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams'
    } else if (sportKey === 'college-basketball') {
      teamsEndpoint = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'
    } else {
      return {}
    }

    const response = await fetch(teamsEndpoint, { signal })
    if (!response.ok) {
      console.warn(`Failed to fetch teams for ${sportKey}:`, response.status)
      return {}
    }

    const data = await response.json()
    
    // Debug: log the structure to see what we get
    if (!window._loggedTeamsDebug) {
      window._loggedTeamsDebug = true
      console.log('=== TEAMS ENDPOINT DEBUG ===')
      console.log('Full response structure:', Object.keys(data))
      console.log('Sports:', data?.sports)
      console.log('Sample team structure:', data?.sports?.[0]?.leagues?.[0]?.teams?.[0] || data?.teams?.[0])
      if (data?.sports?.[0]?.leagues?.[0]?.teams?.[0]) {
        const sampleTeam = data.sports[0].leagues[0].teams[0]
        console.log('Sample team keys:', Object.keys(sampleTeam))
        console.log('Sample team.team keys:', sampleTeam.team ? Object.keys(sampleTeam.team) : 'no team')
        console.log('Sample team.team.group:', sampleTeam.team?.group)
        console.log('Sample team.team.conference:', sampleTeam.team?.conference)
        console.log('Full sample team:', JSON.stringify(sampleTeam, null, 2).substring(0, 2000))
      }
    }
    
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || data?.teams || []
    
    const conferenceMap = {}
    teams.forEach((teamData) => {
      const team = teamData.team || teamData
      const teamName = team.displayName || team.name
      const conference = 
        team.group?.name || 
        team.conference?.name || 
        team.groups?.[0]?.name ||
        team.conferences?.[0]?.name ||
        null
      
      if (teamName && conference) {
        conferenceMap[teamName] = conference
        // Also map by ID if available
        if (team.id) {
          conferenceMap[team.id] = conference
        }
      }
    })

    console.log('Conference map created:', Object.keys(conferenceMap).length, 'teams mapped')
    conferenceCache.set(sportKey, conferenceMap)
    return conferenceMap
  } catch (error) {
    console.warn(`Error fetching conferences for ${sportKey}:`, error)
    return {}
  }
}

// Standings API endpoints
const ESPN_STANDINGS_APIS = {
  nfl: 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings',
  nba: 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
  mlb: 'https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings',
  nhl: 'https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings',
  'college-football': 'https://site.api.espn.com/apis/v2/sports/football/college-football/standings',
  'college-basketball': 'https://site.api.espn.com/apis/v2/sports/basketball/mens-college-basketball/standings',
}

// Cache for standings data
const standingsCache = new Map()

async function fetchStandings(sportKey, { signal } = {}) {
  const endpoint = ESPN_STANDINGS_APIS[sportKey]
  if (!endpoint) {
    console.warn(`No standings endpoint for sport: ${sportKey}`)
    return null
  }

  // Check cache first (cache for 5 minutes)
  const cacheKey = sportKey
  const cached = standingsCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data
  }

  try {
    const response = await fetch(endpoint, { signal })
    if (!response.ok) {
      console.warn(`Failed to fetch standings for ${sportKey}:`, response.status)
      return null
    }

    const data = await response.json()
    
    // Debug: log the structure
    console.log('=== STANDINGS API RESPONSE ===')
    console.log('Sport:', sportKey)
    console.log('Top-level keys:', Object.keys(data))
    console.log('Has children?', !!data.children, 'count:', data.children?.length)
    if (data.children?.[0]) {
      console.log('First child keys:', Object.keys(data.children[0]))
      console.log('First child name:', data.children[0].name)
      console.log('First child has children?', !!data.children[0].children)
      console.log('First child has standings?', !!data.children[0].standings)
    }
    
    // Cache the result
    standingsCache.set(cacheKey, { data, timestamp: Date.now() })
    
    return data
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn(`Error fetching standings for ${sportKey}:`, error)
    }
    return null
  }
}

// Helper to check if a team matches our identifiers
function teamMatches(entry, teamIdentifiers) {
  const entryTeamId = String(entry.team?.id || '')
  const entryTeamName = (entry.team?.displayName || entry.team?.name || '').toLowerCase()
  const entryTeamAbbr = (entry.team?.abbreviation || '').toLowerCase()
  
  return teamIdentifiers.ids.includes(entryTeamId) ||
         teamIdentifiers.names.some(n => entryTeamName.includes(n.toLowerCase())) ||
         teamIdentifiers.abbrs.some(a => entryTeamAbbr === a.toLowerCase())
}

// Helper to process a standings group - adds to matchingGroups if it has matching teams,
// or to allGroups if we're collecting all groups
function processStandingsGroup(group, teamIdentifiers, matchingGroups, allGroups, logDetails = false) {
  const entries = group.standings?.entries || []
  
  if (entries.length === 0) {
    if (logDetails) console.log('    No entries in group:', group.name)
    return
  }
  
  // Log first entry structure to debug
  if (logDetails && entries[0]) {
    console.log('    First entry structure:', {
      teamId: entries[0].team?.id,
      teamName: entries[0].team?.displayName || entries[0].team?.name,
      teamAbbr: entries[0].team?.abbreviation,
      entryKeys: Object.keys(entries[0])
    })
    console.log('    Sample teams in group:', entries.slice(0, 4).map(e => ({ 
      id: e.team?.id, 
      name: e.team?.displayName,
      abbr: e.team?.abbreviation 
    })))
    console.log('    Looking for:', teamIdentifiers)
  }
  
  const sortedEntries = [...entries].sort((a, b) => {
    const aWins = a.stats?.find(s => s.name === 'wins')?.value || 0
    const bWins = b.stats?.find(s => s.name === 'wins')?.value || 0
    if (bWins !== aWins) return bWins - aWins
    const aPct = a.stats?.find(s => s.name === 'winPercent')?.value || 0
    const bPct = b.stats?.find(s => s.name === 'winPercent')?.value || 0
    return bPct - aPct
  })
  
  const groupData = {
    name: group.name || group.abbreviation || group.shortName,
    standings: { entries: sortedEntries }
  }
  
  // Check if any team matches
  const hasMatchingTeam = entries.some(entry => teamMatches(entry, teamIdentifiers))
  
  if (logDetails) {
    console.log('    Has matching team:', hasMatchingTeam)
  }
  
  if (hasMatchingTeam) {
    matchingGroups.push(groupData)
  }
  
  // Always add to allGroups for fallback
  if (allGroups) {
    allGroups.push(groupData)
  }
}

// Get standings filtered by team identifiers - returns divisions containing the specified teams
// If no matches found, returns all divisions as fallback
// teamInfo: { ids: string[], names: string[], abbrs: string[] }
function filterStandingsByTeams(standingsData, teamInfo) {
  console.log('=== FILTER STANDINGS ===')
  console.log('Team info to find:', teamInfo)
  console.log('standingsData keys:', standingsData ? Object.keys(standingsData) : 'null')
  
  if (!standingsData) {
    console.log('No standings data')
    return null
  }
  
  // Build team identifiers object for matching
  const teamIdentifiers = {
    ids: (teamInfo.ids || []).map(id => String(id)).filter(Boolean),
    names: (teamInfo.names || []).filter(Boolean),
    abbrs: (teamInfo.abbrs || []).filter(Boolean)
  }
  
  const matchingGroups = []
  const allGroups = [] // Fallback - collect all groups

  // Try different ESPN API structures
  
  // Structure 1: data.children (conferences) -> children (divisions) -> standings.entries
  if (standingsData.children?.length > 0) {
    console.log('Using children structure, count:', standingsData.children.length)
    
    let loggedOne = false
    standingsData.children.forEach((conference, cIdx) => {
      console.log(`Conference ${cIdx}:`, conference.name, 'has children?', !!conference.children)
      
      if (conference.children?.length > 0) {
        // Has divisions under conferences (NFL, NBA structure)
        conference.children.forEach((division, dIdx) => {
          console.log(`  Division ${dIdx}:`, division.name, 'entries:', division.standings?.entries?.length || 0)
          // Log details for first division only to see structure
          const shouldLog = !loggedOne
          if (shouldLog) loggedOne = true
          processStandingsGroup(division, teamIdentifiers, matchingGroups, allGroups, shouldLog)
        })
      } else {
        // Conference level standings (no division subdivision)
        console.log(`  Conference-level standings, entries:`, conference.standings?.entries?.length || 0)
        const shouldLog = !loggedOne
        if (shouldLog) loggedOne = true
        processStandingsGroup(conference, teamIdentifiers, matchingGroups, allGroups, shouldLog)
      }
    })
  }
  // Structure 2: data.standings.entries directly
  else if (standingsData.standings?.entries?.length > 0) {
    console.log('Using direct standings.entries structure')
    processStandingsGroup({ name: 'Standings', standings: standingsData.standings }, teamIdentifiers, matchingGroups, allGroups, true)
  }
  // Structure 3: data.groups array
  else if (standingsData.groups?.length > 0) {
    console.log('Using groups structure, count:', standingsData.groups.length)
    standingsData.groups.forEach(group => {
      processStandingsGroup(group, teamIdentifiers, matchingGroups, allGroups)
    })
  }
  // Structure 4: Array at top level
  else if (Array.isArray(standingsData) && standingsData.length > 0) {
    console.log('Using array structure, count:', standingsData.length)
    standingsData.forEach(group => {
      if (group.children) {
        group.children.forEach(division => {
          processStandingsGroup(division, teamIdentifiers, matchingGroups, allGroups)
        })
      } else {
        processStandingsGroup(group, teamIdentifiers, matchingGroups, allGroups)
      }
    })
  }
  else {
    console.log('Unknown standings structure, trying to log full object')
    console.log(JSON.stringify(standingsData, null, 2).substring(0, 3000))
  }

  console.log('Matching groups found:', matchingGroups.length)
  console.log('All groups found:', allGroups.length)
  
  // Return matching groups if found, otherwise return all groups as fallback
  if (matchingGroups.length > 0) {
    return { groups: matchingGroups, teamIdentifiers }
  } else if (allGroups.length > 0) {
    console.log('No matches - returning all groups as fallback')
    // Just return first 2 divisions as a sample since we couldn't find specific matches
    return { groups: allGroups.slice(0, 2), teamIdentifiers, isAllGroups: true }
  }
  return null
}

// Sport key to ESPN path segment mapping
const SPORT_PATHS = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
  'college-football': 'football/college-football',
  'college-basketball': 'basketball/mens-college-basketball',
}

async function fetchTeamInfo(sportKey, teamId, { signal } = {}) {
  const path = SPORT_PATHS[sportKey]
  if (!path) return null
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}`, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('fetchTeamInfo error:', err)
    return null
  }
}

async function fetchTeamRoster(sportKey, teamId, { signal } = {}) {
  const path = SPORT_PATHS[sportKey]
  if (!path) return null
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/roster`, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('fetchTeamRoster error:', err)
    return null
  }
}

async function fetchTeamSchedule(sportKey, teamId, { signal } = {}) {
  const path = SPORT_PATHS[sportKey]
  if (!path) return null
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/schedule`, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('fetchTeamSchedule error:', err)
    return null
  }
}

export { ESPN_APIS, ESPN_SUMMARY_APIS, fetchAllScoreboards, fetchSportScoreboard, fetchGameSummary, fetchTeamConferences, fetchStandings, filterStandingsByTeams, fetchTeamInfo, fetchTeamRoster, fetchTeamSchedule }

