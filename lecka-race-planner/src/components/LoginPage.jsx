import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Nav from './Nav.jsx'

export default function LoginPage() {
  const { t } = useTranslation('common')
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
        <h1 className="text-2xl font-bold text-[#1B1B1B] mb-2">{t('login.title')}</h1>
        <p className="text-sm text-gray-500 mb-8">
          {t('login.subtitle')}
        </p>

        {state === 'sent' ? (
          <div className="border-2 border-[#48C4B0]/40 bg-[#48C4B0]/5 rounded-2xl p-5">
            <p className="text-sm font-bold text-[#48C4B0]">{t('login.sentTitle')}</p>
            <p className="text-sm text-gray-500 mt-1"
               dangerouslySetInnerHTML={{ __html: t('login.sentBody', { email }) }} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setTouched(false) }}
                onBlur={() => setTouched(true)}
                placeholder={t('login.placeholder')}
                disabled={state === 'sending'}
                className={[
                  'w-full border-2 rounded-xl px-4 py-3 text-sm',
                  'focus:outline-none focus:border-[#48C4B0] disabled:opacity-50',
                  showErr ? 'border-red-300' : 'border-gray-200',
                ].join(' ')}
              />
              {showErr && (
                <p className="text-xs text-red-500 mt-1.5">{t('login.invalidEmail')}</p>
              )}
            </div>

            {state === 'error' && (
              <p className="text-xs text-red-500">{t('login.error')}</p>
            )}

            <button
              type="submit"
              disabled={state === 'sending'}
              className="w-full min-h-[52px] bg-[#48C4B0] text-white rounded-xl
                         text-sm font-semibold hover:bg-[#3db09d] transition-colors
                         disabled:opacity-50"
            >
              {state === 'sending' ? t('login.sending') : t('login.send')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
