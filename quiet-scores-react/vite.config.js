import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
