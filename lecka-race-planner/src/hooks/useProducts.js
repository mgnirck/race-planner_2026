import { useState, useEffect } from 'react'

const CACHE_KEY = 'lecka_products_v1'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useProducts() {
  const [products, setProducts] = useState(() => {
    // Serve from localStorage cache instantly on first render to avoid flash
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, ts } = JSON.parse(cached)
        if (Date.now() - ts < CACHE_TTL) return data
      }
    } catch {}
    return null
  })
  const [loading, setLoading] = useState(!products)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Always re-fetch in background to keep cache fresh
    fetch('/api/products')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        setProducts(data)
        setLoading(false)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
        } catch {}
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return { products, loading, error }
}
