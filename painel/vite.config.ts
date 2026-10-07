import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const servicos = {
  coleta: process.env.COLETA_URL ?? 'http://localhost:8001',
  transporte: process.env.TRANSPORTE_URL ?? 'http://localhost:8002',
  consolidacao: process.env.CONSOLIDACAO_URL ?? 'http://localhost:8003',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(servicos).map(([nome, alvo]) => [
        `/api/${nome}`,
        { target: alvo, ws: true, changeOrigin: true, rewrite: (p: string) => p.replace(new RegExp(`^/api/${nome}`), '') },
      ]),
    ),
  },
})
