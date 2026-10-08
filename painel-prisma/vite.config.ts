import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const alvo = process.env.PRISMA_URL ?? 'http://localhost:8004'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api/prisma': { target: alvo, ws: true, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/prisma/, '') },
    },
  },
})
