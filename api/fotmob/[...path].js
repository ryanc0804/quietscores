// Serverless proxy for FotMob's internal API.
//
// FotMob sends no CORS headers, so the browser can't call it directly. In dev
// the Vite server proxies /fotmob -> www.fotmob.com; in production this Vercel
// function does the same. The client always calls /fotmob/<path> and vercel.json
// rewrites that to /api/fotmob/<path>, which lands here.
//
// We send a clean browser-like request (just UA + Referer) rather than
// forwarding all of the browser's headers, which is what reliably returns 200.

module.exports = async (req, res) => {
  const { path = [], ...query } = req.query
  const suffix = Array.isArray(path) ? path.join('/') : path
  const qs = new URLSearchParams(query).toString()
  const target = `https://www.fotmob.com/${suffix}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.fotmob.com/',
        Accept: 'application/json, text/plain, */*',
      },
    })

    const body = await upstream.text()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    // Cache briefly at the edge; live games still refresh often enough.
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40')
    res.status(upstream.status).send(body)
  } catch (err) {
    res.status(502).json({ error: 'FotMob proxy failed', detail: String(err) })
  }
}
