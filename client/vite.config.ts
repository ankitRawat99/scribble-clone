import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration with SPA fallback for React Router.
 *
 * REASONING: BrowserRouter uses the HTML5 History API. When a user navigates
 * directly to /room/abc123 (or refreshes on that URL), the request goes to the
 * dev server. Without SPA fallback the server returns 404 because it has no file
 * at that path — only index.html at root.
 *
 * The correct Vite option for this is NOT `historyApiFallback` (that's webpack).
 * In Vite dev server the option is `appType: 'spa'` which is already the default,
 * combined with the dev server automatically returning index.html for 404s.
 *
 * For production (Vercel, Netlify, etc.) you need a rewrite rule:
 *   /room/* → /index.html
 */
export default defineConfig({
  plugins: [react()],
  // 'spa' mode: dev server returns index.html for any unknown path (SPA fallback)
  appType: 'spa',
})
