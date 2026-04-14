import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { notifyResize } from './embed.js'

// ── Embed: keep parent iframe sized to our content ────────────────────────────
// ResizeObserver fires whenever the document height changes (step transitions,
// results page rendering, etc.) and posts the new height to the parent frame.
// This is a no-op when not running inside an iframe.
const ro = new ResizeObserver(notifyResize)
ro.observe(document.documentElement)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
