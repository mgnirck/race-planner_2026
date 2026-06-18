import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isEmbedded } from '../embed.js'

const TEAL = '#1D9E75'

export default function FeedbackWidget() {
  const { t } = useTranslation('common')
  const [open, setOpen]           = useState(false)
  const [message, setMessage]     = useState('')
  const [email, setEmail]         = useState('')
  const [status, setStatus]       = useState('idle') // idle | sending | sent | error
  const textareaRef               = useRef(null)
  const modalRef                  = useRef(null)

  // Don't show in Shopify embed
  if (isEmbedded) return null

  // Focus textarea when modal opens
  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
    if (!open) {
      // Reset after close animation
      setTimeout(() => {
        if (!open) {
          setMessage('')
          setEmail('')
          setStatus('idle')
        }
      }, 300)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleSend() {
    if (!message.trim() || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message,
          page:        window.location.pathname,
          senderEmail: email.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('failed')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('feedback.sendFeedback')}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
        style={{ background: TEAL }}
      >
        {/* Chat bubble icon */}
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
        {t('feedback.widget.button')}
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-5 sm:items-end sm:justify-end pointer-events-none">
          <div className="fixed inset-0 bg-black/20 pointer-events-auto" />

          {/* Modal card */}
          <div
            ref={modalRef}
            className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <p className="font-semibold text-base text-gray-900">{t('feedback.widget.title')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('feedback.widget.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('feedback.close')}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {status === 'sent' ? (
              /* Success state */
              <div className="px-5 pb-6 pt-2 flex flex-col items-center text-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: '#E6F7F3' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-semibold text-gray-900">{t('feedback.widget.successTitle')}</p>
                <p className="text-sm text-gray-500">{t('feedback.widget.successBody')}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-1 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: TEAL }}
                >
                  {t('feedback.widget.done')}
                </button>
              </div>
            ) : (
              /* Input state */
              <div className="px-5 pb-5 flex flex-col gap-3">
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t('feedback.widget.placeholder')}
                  rows={4}
                  maxLength={2000}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': TEAL }}
                  onFocus={e => { e.target.style.boxShadow = `0 0 0 2px ${TEAL}40`; e.target.style.borderColor = TEAL }}
                  onBlur={e =>  { e.target.style.boxShadow = ''; e.target.style.borderColor = '' }}
                />

                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('feedback.widget.emailPlaceholder')}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                  onFocus={e => { e.target.style.boxShadow = `0 0 0 2px ${TEAL}40`; e.target.style.borderColor = TEAL }}
                  onBlur={e =>  { e.target.style.boxShadow = ''; e.target.style.borderColor = '' }}
                />

                {status === 'error' && (
                  <p className="text-xs text-red-500">{t('feedback.widget.error')}</p>
                )}

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!message.trim() || status === 'sending'}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ background: TEAL }}
                >
                  {status === 'sending' ? t('feedback.widget.sending') : t('feedback.widget.send')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
