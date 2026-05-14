import React, { useEffect, useState } from 'react'

export default function VerifyPage() {
  const [status, setStatus] = useState('verifying') // verifying | saving | error

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setStatus('error')
      return
    }

    async function run() {
      try {
        // 1. Verify the magic link token
        const verifyRes = await fetch('/api/auth/verify-magic-link', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token }),
        })

        if (!verifyRes.ok) {
          setStatus('error')
          return
        }

        const { userId, email } = await verifyRes.json()

        localStorage.setItem('lecka_user_id',    userId)
        localStorage.setItem('lecka_user_email', email)

        // 2. Save pending plan if one was stored
        const pending = localStorage.getItem('lecka_pending_plan')
        if (pending) {
          setStatus('saving')
          try {
            const { inputs, targets, selection, region, lang } = JSON.parse(pending)
            await fetch('/api/plans/save', {
              method:  'POST',
              headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${userId}`,
              },
              body: JSON.stringify({ inputs, targets, selection, region, lang }),
            })
          } catch {
            // Plan save failure is non-fatal — user is still logged in
          }
          localStorage.removeItem('lecka_pending_plan')
          window.location.replace('/dashboard?saved=true')
        } else {
          window.location.replace('/dashboard')
        }
      } catch {
        setStatus('error')
      }
    }

    run()
  }, [])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center">
        <img src="/logo.svg" alt="Lecka" className="h-8 mx-auto mb-8" />

        {status === 'verifying' && (
          <>
            <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Signing you in…</p>
          </>
        )}

        {status === 'saving' && (
          <>
            <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Saving your plan…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-base font-bold text-[#1B1B1B] mb-2">This link has expired</p>
            <p className="text-sm text-gray-500 mb-6">
              Magic links are valid for 15 minutes and can only be used once.
            </p>
            <a
              href="/auth/login"
              className="inline-block px-6 py-3 bg-[#48C4B0] text-white rounded-xl
                         text-sm font-semibold hover:bg-[#3db09d] transition-colors"
            >
              Request a new link
            </a>
          </>
        )}
      </div>
    </div>
  )
}
