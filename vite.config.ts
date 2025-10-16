import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all interfaces for Docker
    port: 3000,
    allowedHosts: [
      'localhost',
      '.ngrok-free.app',
      '.ngrok.io',
    ],
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
  preview: {
    host: '0.0.0.0', // Listen on all interfaces for Docker
    port: 3000,
    allowedHosts: [
      'localhost',
      '.ngrok-free.app',
      '.ngrok.io',
      'radar.ayushhrmsingh.engineer',
      '.ayushhrmsingh.engineer', // Allow all subdomains
    ],
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