import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export default function SharePlanImage({ plan, format, onReady }) {
  const ref = useRef(null)
  const { t } = useTranslation('common')

  const {
    raceName, duration, conditions, effort,
    carbsPerHour, sodiumPerHour, fluidPerHour,
    totalCarbs, totalSodium, products = [], region,
  } = plan

  const MAX_PILLS = 5
  const displayProducts = products.slice(0, MAX_PILLS)
  const hiddenCount = Math.max(0, products.length - MAX_PILLS)

  const isInternational = region === 'international'

  const w = 1080
  const h = format === 'story' ? 1920 : 1080
  const scale = format === 'story' ? 1.4 : 1

  const fs = n => Math.round(n * scale)

  useEffect(() => {
    if (!ref.current) return
    let cancelled = false

    async function capture() {
      let html2canvas
      try {
        html2canvas = (await import('html2canvas')).default
      } catch {
        const mod = await import(
          'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js'
        )
        html2canvas = mod.default
      }
      if (cancelled) return
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#48C4B0',
        width: w,
        height: h,
        logging: false,
      })
      if (!cancelled) onReady(canvas.toDataURL('image/png'))
    }

    capture()
    return () => { cancelled = true }
  }, [plan, format])

  const pad = format === 'story' ? 80 : 60
  const vGap = format === 'story' ? 32 : 20

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', left: '-9999px', top: 0,
        width: w, height: h,
        background: '#48C4B0',
        fontFamily: '-apple-system, Helvetica Neue, Arial, sans-serif',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-between',
        overflow: 'hidden', boxSizing: 'border-box',
      }}
    >
      {/* TOP: wordmark */}
      <div style={{ textAlign: 'center', padding: `${pad}px ${pad}px 0` }}>
        <div style={{ fontSize: fs(72), fontWeight: 800, color: '#fff',
                      letterSpacing: '-1px', lineHeight: 1 }}>
          {t('share.wordmark')}
        </div>
        <div style={{ fontSize: fs(20), color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>
          {t('share.tagline')}
        </div>
      </div>

      {/* RACE NAME */}
      <div style={{ textAlign: 'center', padding: `0 ${pad}px` }}>
        <div style={{
          fontSize: fs(raceName && raceName.length > 28 ? 40 : 52),
          fontWeight: 800, color: '#fff', lineHeight: 1.15,
        }}>
          {raceName || t('share.defaultRaceName')}
        </div>
      </div>

      {/* BADGES */}
      <div style={{
        display: 'flex', gap: 16, justifyContent: 'center',
        flexWrap: 'wrap', padding: `0 ${pad}px`,
      }}>
        {[duration, conditions, effort].filter(Boolean).map(label => (
          <div key={label} style={{
            background: 'rgba(0,0,0,0.2)', borderRadius: 40,
            padding: `${fs(10)}px ${fs(28)}px`,
            fontSize: fs(20), color: '#fff',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* STATS */}
      <div style={{ display: 'flex', width: '100%', padding: `0 ${pad}px` }}>
        {[
          { value: carbsPerHour, unit: 'g', label: t('share.carbsPerHour') },
          { value: sodiumPerHour, unit: 'mg', label: t('share.sodiumPerHour') },
          { value: fluidPerHour, unit: 'ml', label: t('share.fluidPerHour') },
        ].map((stat, i) => (
          <div key={stat.label} style={{
            flex: 1, textAlign: 'center',
            borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.25)' : 'none',
            padding: `${vGap}px 0`,
          }}>
            <div style={{ fontSize: fs(80), fontWeight: 800, color: '#fff', lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: fs(22), color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {stat.unit}
            </div>
            <div style={{
              fontSize: fs(15), color: 'rgba(255,255,255,0.55)',
              marginTop: 6, letterSpacing: '0.08em',
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* TOTALS */}
      <div style={{ fontSize: fs(19), color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        {totalCarbs}g carbs total · {totalSodium}mg sodium total
      </div>

      {/* PRODUCTS or international message */}
      {isInternational ? (
        <div style={{
          fontSize: fs(22), color: 'rgba(255,255,255,0.8)',
          fontStyle: 'italic', textAlign: 'center',
          padding: `0 ${pad}px`,
        }}>
          {t('share.useWithGels')}
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap',
          justifyContent: 'center', padding: `0 ${pad}px`,
        }}>
          {displayProducts.map(p => (
            <div key={p.name} style={{
              background: '#fff', borderRadius: 40,
              padding: `${fs(10)}px ${fs(24)}px`,
              fontSize: fs(18), color: '#0F6E56', fontWeight: 500,
            }}>
              {p.name} × {p.quantity}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.25)', borderRadius: 40,
              padding: `${fs(10)}px ${fs(24)}px`,
              fontSize: fs(18), color: '#fff',
            }}>
              {t('share.moreItems', { count: hiddenCount })}
            </div>
          )}
        </div>
      )}

      {/* BOTTOM STRIP */}
      <div style={{
        background: 'rgba(0,0,0,0.22)', width: '100%',
        textAlign: 'center', padding: `${pad * 0.5}px ${pad}px`,
      }}>
        <div style={{ fontSize: fs(28), fontWeight: 800, color: '#fff' }}>
          {t('share.buildPlan')}
        </div>
        <div style={{ fontSize: fs(22), color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>
          {t('share.websiteUrl')}
        </div>
      </div>
    </div>
  )
}
