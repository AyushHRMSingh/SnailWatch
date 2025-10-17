import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    minify: 'esbuild', // Use esbuild (default, faster than terser)
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'map-vendor': ['maplibre-gl'],
          'ui-vendor': ['lucide-react', 'framer-motion'],
        },
        // Optimize chunk naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Enable compression hints
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
  },
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