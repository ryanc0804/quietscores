import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Serve the Vercel functions in api/ during `npm run dev` too, so /api/* works
// the same locally as in production.
function vercelApi() {
  return {
    name: 'vercel-api',
    configureServer(server) {
      server.middlewares.use('/api/nflverse', async (req, res) => {
        // The function lives in the repo-root api/ (the Vercel project root).
        const { default: handler } = await import(new URL('../api/nflverse.mjs', import.meta.url).href)
        req.query = Object.fromEntries(new URL(req.originalUrl || req.url, 'http://localhost').searchParams)
        await handler(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), vercelApi()],
  server: {
    proxy: {
      // FotMob's API sends no CORS headers, so the browser can't call it
      // directly. In dev we relay through Vite. In production this same
      // `/fotmob` path must be served by an equivalent serverless proxy.
      '/fotmob': {
        target: 'https://www.fotmob.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fotmob/, ''),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Referer: 'https://www.fotmob.com/',
        },
      },
    },
  },
})
