import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Only allow same-site relative paths, e.g. "/plan/abc". Blocks "//evil.com", backslash tricks
// and control characters (browsers strip tabs/newlines, so "/\t/evil.com" would become "//evil.com").
function safeNext(raw) {
  if (!raw || typeof raw !== 'string') return null
  if (/[\x00-\x1f\x7f]/.test(raw)) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  return raw
}

export default function VerifyPage() {
  const { t } = useTranslation('common')
  const [status, setStatus] = useState('verifying') // verifying | saving | error

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search)
    const token   = params.get('token')
    const urlNext = safeNext(params.get('next'))

    if (!token) {
      if (urlNext) { window.location.replace(urlNext); return }
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
          // Expired / already used: still open the plan (public view) instead of dead-ending
          if (urlNext) { window.location.replace(urlNext); return }
          setStatus('error')
          return
        }

        const { userId, email } = await verifyRes.json()

        localStorage.setItem('lecka_user_id',    userId)
        localStorage.setItem('lecka_user_email', email)

        // 2a. New flow: plan already saved server-side → go straight to it
        if (urlNext) {
          localStorage.removeItem('lecka_pending_plan')
          localStorage.removeItem('lecka_auth_next')
          window.location.replace(urlNext)
          return
        }

        // 2b. Legacy flow (unchanged): save pending plan if one was stored
        const pending = localStorage.getItem('lecka_pending_plan')
        const next    = localStorage.getItem('lecka_auth_next')

        if (pending) {
          setStatus('saving')
          try {
            const { inputs, targets, selection, region, lang } = JSON.parse(pending)
            const saveRes = await fetch('/api/plans', {
              method:  'POST',
              headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${userId}`,
              },
              body: JSON.stringify({ inputs, targets, selection, region, lang }),
            })
            if (!saveRes.ok) {
              console.error('[verify] plan save failed:', saveRes.status, await saveRes.text())
            }
          } catch (err) {
            console.error('[verify] plan save error:', err)
          }
          localStorage.removeItem('lecka_pending_plan')
          localStorage.removeItem('lecka_auth_next')
          window.location.replace('/dashboard?saved=true')
        } else if (next) {
          localStorage.removeItem('lecka_auth_next')
          window.location.replace(next)
        } else {
          window.location.replace('/dashboard')
        }
      } catch {
        if (urlNext) { window.location.replace(urlNext); return }
        setStatus('error')
      }
    }

    run()
  }, [])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center">
        <img src="/Lecka-Logo-New%20Green%20Font.png" alt="Lecka" className="h-8 mx-auto mb-8" />

        {status === 'verifying' && (
          <>
            <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">{t('verify.signingIn')}</p>
          </>
        )}

        {status === 'saving' && (
          <>
            <div className="w-8 h-8 border-2 border-[#48C4B0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">{t('verify.savingPlan')}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-base font-bold text-[#1B1B1B] mb-2">{t('verify.expiredTitle')}</p>
            <p className="text-sm text-gray-500 mb-6">
              {t('verify.expiredBody')}
            </p>
            <a
              href="/auth/login"
              className="inline-block px-6 py-3 bg-[#48C4B0] text-white rounded-xl
                         text-sm font-semibold hover:bg-[#3db09d] transition-colors"
            >
              {t('verify.requestNew')}
            </a>
          </>
        )}
      </div>
    </div>
  )
}
