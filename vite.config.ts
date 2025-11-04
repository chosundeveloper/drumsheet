import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages needs assets served from the repo sub-path
const base = process.env.GITHUB_ACTIONS ? '/drumsheet/' : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
