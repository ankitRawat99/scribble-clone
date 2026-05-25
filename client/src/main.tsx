import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

/**
 * BrowserRouter wraps the app to enable React Router URL-based navigation.
 *
 * ROUTING ARCHITECTURE:
 * We use BrowserRouter (HTML5 history API) rather than HashRouter because:
 * 1. Clean URLs: /room/abc123 (not /#/room/abc123)
 * 2. Shareable links look professional
 * 3. Vite dev server is configured with historyApiFallback to handle refreshes
 * 4. No backend route changes needed — server only serves the socket API
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
