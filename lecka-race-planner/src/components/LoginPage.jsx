import React, { useState } from 'react'
import Nav from './Nav.jsx'

export default function LoginPage() {
  const [email,   setEmail]   = useState('')
  const [state,   setState]   = useState('idle') // idle | sending | sent | error
  const [touched, setTouched] = useState(false)

  const next    = new URLSearchParams(window.location.search).get('next') || ''
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const showErr = touched && email !== '' && !isValid

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (!isValid) return
    setState('sending')

    if (next) localStorage.setItem('lecka_auth_next', next)

    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      setState('sent')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="bg-white min-h-screen">
      <Nav />

      <div className="max-w-sm mx-auto px-5 pt-16 pb-10">
        <h1 className="text-2xl font-bold text-[#1B1B1B] mb-2">Sign in to Lecka</h1>
        <p className="text-sm text-gray-500 mb-8">
          We'll send a one-click login link to your inbox.
        </p>

        {state === 'sent' ? (
          <div className="border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 rounded-2xl p-5">
            <p className="text-sm font-bold text-[#48C4B0]">Check your inbox</p>
            <p className="text-sm text-gray-500 mt-1">
              We sent a login link to <strong>{email}</strong>. It expires in 15 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setTouched(false) }}
                onBlur={() => setTouched(true)}
                placeholder="you@example.com"
                disabled={state === 'sending'}
                className={[
                  'w-full border-2 rounded-xl px-4 py-3 text-sm',
                  'focus:outline-none focus:border-[#48C4B0] disabled:opacity-50',
                  showErr ? 'border-red-300' : 'border-gray-200',
                ].join(' ')}
              />
              {showErr && (
                <p className="text-xs text-red-500 mt-1.5">Please enter a valid email address.</p>
              )}
            </div>

            {state === 'error' && (
              <p className="text-xs text-red-500">Something went wrong — please try again.</p>
            )}

            <button
              type="submit"
              disabled={state === 'sending'}
              className="w-full min-h-[52px] bg-[#48C4B0] text-white rounded-xl
                         text-sm font-semibold hover:bg-[#3db09d] transition-colors
                         disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending…' : 'Send me a login link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
