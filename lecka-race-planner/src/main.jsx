import './i18n.js'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './App.jsx'
import './index.css'
import { initHeightSync } from './embed.js'

inject()

// ── Embed: keep parent iframe sized to our content ────────────────────────────
// Sets up load, resize, and ResizeObserver triggers — no-op when not embedded.
initHeightSync()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<div />}>
      <App />
    </Suspense>
  </React.StrictMode>,
)
