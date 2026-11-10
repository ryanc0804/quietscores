import { useEffect, useState } from 'react'
import { conferenceOrder, fetchLeagueStandings } from '../lib/standings'
import { ConferenceBar } from '../components/ConferenceBar'

function Logo({ src }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="pg-logo-fallback pg-team-cell-logo" aria-hidden="true" />
  return <img className="pg-team-cell-logo" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/**
 * A league's standings (the Standings view of the scores page): conference
 * sections of division tables, or for college one conference at a time with
 * a picker (`conference` is the one remembered from the scores page, by its
 * short name; SEC otherwise). Teams open their team page.
 */
export function LeagueStandings({ sport, onOpenTeam, conference, onConference }) {
  // Tagged with the sport so switching sports never shows the old table.
  const [result, setResult] = useState(null) // { sport, data } | { sport, error }
  const data = result?.sport === sport ? result.data : null
  const error = result?.sport === sport ? result.error : null

  useEffect(() => {
    let cancelled = false
    fetchLeagueStandings(sport)
      .then((d) => !cancelled && setResult({ sport, data: d }))
      .catch(() => !cancelled && setResult({ sport, error: 'Couldn’t load standings.' }))
    return () => {
      cancelled = true
    }
  }, [sport])

  if (error) return <div className="league-status">{error}</div>
  if (!data) return <div className="league-status">Loading standings…</div>

  const openTeam = (e) =>
    onOpenTeam({
      teamId: String(e.team.id),
      sport,
      teamName: e.team.displayName,
      teamLogo: e.team.logos?.[0]?.href,
      teamAbbreviation: e.team.abbreviation,
    })

  let sections = data.sections
  let picker = null
  if (sport.startsWith('college')) {
    const tables = conferenceOrder(sections.flatMap((s) => s.tables))
    const current = tables.find((t) => t.short === conference) || tables.find((t) => t.short === 'SEC') || tables[0]
    sections = current ? [{ title: null, tables: [current] }] : []
    picker = (
      <ConferenceBar
        options={tables.map((t) => ({ name: t.short }))}
        selected={current?.short}
        onSelect={onConference}
        showAll={false}
      />
    )
  }

  return (
    <div className={`league-standings ${picker ? 'one-table' : ''}`}>
      {picker}
      {sections.map((section, si) => (
        <section key={section.title || si} className="league-section">
          {section.title && <h2 className="pg-section-title">{section.title}</h2>}
          <div className="league-tables">
            {section.tables.map((t) => (
              <div key={t.name} className="pg-card league-table-card">
                <div className="pg-table-scroll">
                  <table className="pg-table">
                    <thead>
                      <tr>
                        <th className="left">{t.name}</th>
                        {data.columns.map(([label, , hint]) => (
                          <th key={label} title={hint}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((e) => (
                        <tr key={e.team?.id}>
                          <td className="left">
                            <button type="button" className="league-team" onClick={() => openTeam(e)}>
                              <span className="pg-team-cell">
                                <Logo src={e.team?.logos?.[0]?.href} />
                                <span className="league-team-name">{e.team?.displayName}</span>
                                <span className="league-team-abbr">{e.team?.abbreviation}</span>
                              </span>
                            </button>
                          </td>
                          {data.columns.map(([label, value]) => (
                            <td key={label}>{value(e)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
