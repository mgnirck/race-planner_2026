/**
 * api/mcp-usage.js — Vercel serverless function
 *
 * GET  +  X-Admin-Password header
 *   Proxies to lecka-mcp /api/mcp-usage, forwarding the admin password.
 *   Avoids CORS by making the request server-side.
 */

const MCP_USAGE_URL = 'https://lecka-mcp.vercel.app/api/mcp-usage'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const adminPassword = process.env.VITE_ADMIN_PASSWORD ?? ''
  const provided = req.headers['x-admin-password'] ?? ''

  if (!adminPassword || provided !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const upstream = await fetch(MCP_USAGE_URL, {
      headers: { 'X-Admin-Password': provided },
      cache: 'no-store',
    })

    const body = await upstream.json()
    res.status(upstream.status).json(body)
  } catch (err) {
    res.status(502).json({ error: 'Could not reach MCP server', detail: err.message })
  }
}
