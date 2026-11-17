// Dev server for the browser checks (run.mjs): the app's source, no Replit plugins.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
const root = path.resolve(import.meta.dirname, '..')
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  server: { port: 5198, strictPort: true },
  logLevel: 'error',
})
