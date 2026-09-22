import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: 5173,
    // Required only while a temporary Cloudflare Quick Tunnel is active.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      // Toutes les requêtes /api sont redirigées vers le backend Express
      '/api': 'http://localhost:4000',
      '/stems': 'http://localhost:4000',
      '/performances': 'http://localhost:4000'
    }
  }
})
