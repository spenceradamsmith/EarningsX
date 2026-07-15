import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static SPA — builds to dist/ and can be hosted anywhere (Netlify, GitHub
// Pages, S3…). No backend required: predictions come from public/data.json.
export default defineConfig({
  plugins: [react()],
  base: './',
})
