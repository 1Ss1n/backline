import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Toutes les requêtes /api sont redirigées vers le backend Express
      '/api': 'http://localhost:4000',
      '/stems': 'http://localhost:4000'
    }
  }
})
