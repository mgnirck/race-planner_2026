import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import SharePlanImage from './SharePlanImage'

export default function ShareModal({ onClose, plan: planProp, planProps, planUrl: planUrlProp }) {
  const { t } = useTranslation('results')
  const { t: tc } = useTranslation('common')
  // Support both old API (planProps + planUrl) and new API (plan)
  const plan = planProp ?? { ...planProps, planUrl: planUrlProp || planProps?.planUrl || 'https://plan.getlecka.com' }

  const [format, setFormat] = useState('square')
  const [dataUrl, setDataUrl] = useState(null)
  const [generating, setGenerating] = useState(true)
  const [copied, setCopied] = useState(false)

  // Lock body scroll and handle Escape key
  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Regenerate image when format changes
  useEffect(() => {
    setDataUrl(null)
    setGenerating(true)
  }, [format])

  const handleImageReady = url => {
    setDataUrl(url)
    setGenerating(false)
  }

  const handleCopy = async () => {
    const url = plan.planUrl || 'https://plan.getlecka.com'
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(el)
      el.focus(); el.select()
      try { document.execCommand('copy') } catch (_) {}
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const planUrl = plan.planUrl || 'https://plan.getlecka.com'
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(planUrl)}`
  const mailUrl = `mailto:?subject=${encodeURIComponent(tc('share.emailSubject'))}&body=${encodeURIComponent(tc('share.emailBody'))}${planUrl}`

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* Off-screen render target for html2canvas */}
      <SharePlanImage
        plan={plan}
        format={format}
        onReady={handleImageReady}
      />

      <div style={{
        background: '#fff', borderRadius: '16px',
        width: '100%', maxWidth: '420px',
        overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '0.5px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{t('share.button')}</span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#f3f4f6', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#6b7280',
            }}
          >×</button>
        </div>

        <div style={{ padding: '20px 20px 0' }}>
          {/* Card preview */}
          <div style={{
            width: '100%', aspectRatio: format === 'story' ? '9/16' : '1/1',
            background: '#48C4B0', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {generating ? (
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: 13, marginTop: 8 }}>{t('share.generating')}</div>
              </div>
            ) : (
              <img src={dataUrl} style={{ width: '100%', display: 'block', borderRadius: 12 }} />
            )}
          </div>

          {/* Format toggle */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {['square', 'story'].map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                style={{
                  flex: 1, padding: '8px', fontSize: 13, borderRadius: 8,
                  cursor: 'pointer', textAlign: 'center',
                  border: '0.5px solid',
                  borderColor: format === f ? '#48C4B0' : '#d1d5db',
                  background: format === f ? '#48C4B0' : 'transparent',
                  color: format === f ? '#fff' : '#6b7280',
                }}
              >
                {f === 'square' ? t('share.formatSquare') : t('share.formatStory')}
              </button>
            ))}
          </div>

          {/* Download PNG — full width primary */}
          <a
            href={dataUrl || '#'}
            download="lecka-race-plan.png"
            onClick={e => { if (!dataUrl) e.preventDefault() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, marginTop: 12, padding: '12px', width: '100%',
              background: dataUrl ? '#48C4B0' : '#a7d8cf',
              color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 500,
              textDecoration: 'none', border: 'none', cursor: dataUrl ? 'pointer' : 'default',
              boxSizing: 'border-box',
            }}
          >
            ↓ {t('share.download')}
          </a>

          {/* 2×2 share grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {[
              { label: t('share.facebook'), onClick: () => window.open(fbUrl, '_blank') },
              { label: copied ? t('share.copied') : t('share.copyLink'), onClick: handleCopy },
              { label: t('share.email'), onClick: () => window.open(mailUrl) },
              null,
            ].map((btn, i) =>
              btn ? (
                <button
                  key={i}
                  onClick={btn.onClick}
                  style={{
                    padding: '11px 8px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    cursor: 'pointer', border: '0.5px solid #d1d5db',
                    background: '#fff', color: '#1b1b1b',
                  }}
                >
                  {btn.label}
                </button>
              ) : <div key={i} />
            )}
          </div>

          {/* Instagram hint + footer */}
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
            {t('share.instagramHint')}
          </p>
          <p style={{ fontSize: 11, color: '#d1d5db', textAlign: 'center', margin: '6px 0 16px' }}>
            {t('share.footer')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
