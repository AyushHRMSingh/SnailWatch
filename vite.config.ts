import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://opendata.adsb.fi/api/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/details-api': {
        target: 'https://hexdb.io/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/details-api/, ''),
      },
    },
  },
})