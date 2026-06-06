import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { goalMinutesFromFields } from '../utils/form-helpers.js'

const TRIATHLON_OPTIONS = [
  { key: 'triathlon_sprint',  sublabel: '750m · 20km · 5km'   },
  { key: 'triathlon_olympic', sublabel: '1.5km · 40km · 10km' },
  { key: 'triathlon_70_3',    sublabel: 'Half Ironman'         },
  { key: 'triathlon_140_6',   sublabel: 'Full 140.6'          },
]

const RACE_KEYS = [
  '5k', '10k', 'half_marathon', 'marathon',
  'ultra_50k', 'ultra_100k', 'cycling', 'triathlon', 'custom',
]

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VN' },
]

export default function HomePage() {
  const { t, i18n } = useTranslation('common')
  const [raceType,      setRaceType]      = useState('')
  const [triathlonType, setTriathlonType] = useState('')
  const [goalH,         setGoalH]         = useState('')
  const [goalM,         setGoalM]         = useState('')
  const minutesRef = useRef(null)

  const goalMinutes = goalMinutesFromFields(goalH, goalM)

  const canSubmit =
    goalMinutes !== null &&
    raceType !== '' &&
    (raceType !== 'triathlon' || triathlonType !== '')

  function handleRaceType(key) {
    setRaceType(key)
    if (key !== 'triathlon') setTriathlonType('')
  }

  function switchLang(lang) {
    i18n.changeLanguage(lang)
    try { localStorage.setItem('lecka_lang', lang) } catch {}
    const url = new URL(window.location.href)
    url.searchParams.set('lang', lang)
    window.history.replaceState({}, '', url)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    const effectiveRaceType = raceType === 'triathlon' ? triathlonType : raceType
    const prefill = {
      race_type:      effectiveRaceType,
      triathlon_type: raceType === 'triathlon' ? triathlonType : '',
      goal_time_h:    goalH,
      goal_time_m:    goalM,
    }
    sessionStorage.setItem('lecka_homepage_prefill', JSON.stringify(prefill))
    window.location.href = '/planner'
  }

  function pillClass(selected) {
    return [
      'bg-white text-[#555] border border-black/10 rounded-full px-3.5 py-1.5',
      'text-[11.5px] font-semibold cursor-pointer transition-colors',
      selected ? 'bg-[#1a1a1a] !text-white border-[#1a1a1a]' : 'hover:border-black/30',
    ].join(' ')
  }

  function triPillClass(selected) {
    return [
      'border rounded-full px-3 py-1.5 text-[10.5px] font-semibold cursor-pointer transition-colors',
      selected
        ? 'bg-[#48C4B0] text-white border-[#48C4B0]'
        : 'bg-white text-[#555] border-black/10 hover:border-[#48C4B0]',
    ].join(' ')
  }

  const activeLang = LANGS.find(l => i18n.language?.startsWith(l.code))?.code ?? 'en'

  return (
    <div className="bg-white min-h-screen">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#F64866', position: 'relative', overflow: 'hidden' }}>
        {/* diagonal stripe overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 18px)',
          pointerEvents: 'none',
        }} />

        <div className="max-w-xl mx-auto px-6 pt-5 pb-6 md:px-8 md:pt-7 md:pb-7" style={{ position: 'relative' }}>
          {/* inline nav */}
          <div className="flex items-center justify-between mb-5">
            <img
              src="/Lecka-Logo-New%20Green%20Font.png"
              alt="Lecka"
              className="h-7"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <div className="flex items-center gap-2">
              {/* language switcher */}
              <div className="flex items-center gap-0.5">
                {LANGS.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => switchLang(l.code)}
                    className={[
                      'text-xs font-semibold rounded-full px-2.5 py-1 transition-colors',
                      activeLang === l.code
                        ? 'bg-white/20 text-white'
                        : 'text-white/60 hover:text-white/90',
                    ].join(' ')}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <a
                href="/auth/login"
                className="text-xs text-white/80 border border-white/30 rounded-full px-3 py-1.5"
              >
                {t('nav.logIn')}
              </a>
            </div>
          </div>

          {/* headline */}
          <h1 className="font-black text-white leading-[1.05] tracking-[-0.04em] mb-2.5"
              style={{ fontSize: 'clamp(26px, 7vw, 36px)', whiteSpace: 'pre-line' }}>
            {t('home.hero.headline')}
          </h1>
          <p className="text-xs text-white/70 leading-relaxed mb-4 max-w-sm">
            {t('home.hero.tagline')}
          </p>

          {/* stat chips */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { num: '30s',   labelKey: 'home.stat.time.label'  },
              { num: 'g/h',   labelKey: 'home.stat.carbs.label' },
              { num: '1-tap', labelKey: 'home.stat.shop.label'  },
            ].map(chip => (
              <div
                key={chip.num}
                style={{
                  background: 'rgba(255,255,255,0.14)',
                  borderRadius: 10,
                  padding: '10px 6px',
                  textAlign: 'center',
                }}
              >
                <div className="text-base font-black text-white">{chip.num}</div>
                <div className="text-white/65" style={{ fontSize: 9 }}>{t(chip.labelKey)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form section ─────────────────────────────────────────────────── */}
      <div style={{ background: '#f5f4f1' }}>
        <div className="max-w-xl mx-auto px-6 pt-6 pb-8 md:px-8">
          <form onSubmit={handleSubmit} noValidate>

            {/* Race type */}
            <div className="mb-5">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">
                {t('home.form.whatRace')}
              </p>
              <div className="flex flex-wrap gap-2">
                {RACE_KEYS.map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleRaceType(key)}
                    className={pillClass(raceType === key)}
                  >
                    {t(`racetype.${key}`)}
                  </button>
                ))}
              </div>

              {/* Triathlon sub-options */}
              {raceType === 'triathlon' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {TRIATHLON_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTriathlonType(opt.key)}
                      className={triPillClass(triathlonType === opt.key)}
                    >
                      {t(`racetype.${opt.key}`)}
                      <span className="font-normal opacity-60 ml-1">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Goal time */}
            <div className="mb-5">
              <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">
                {t('home.form.goalTime')}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    max="200"
                    placeholder="hh"
                    value={goalH}
                    onChange={e => {
                      setGoalH(e.target.value)
                      if (e.target.value.length >= 2) minutesRef.current?.focus()
                    }}
                    className="w-full border-2 border-white rounded-xl px-4 py-3 text-center
                               text-lg font-semibold focus:outline-none focus:border-[#48C4B0]
                               text-[#1B1B1B] bg-white"
                  />
                  <p className="text-xs text-center text-gray-400 mt-1">hours</p>
                </div>
                <span className="text-2xl font-bold text-gray-300 mb-4">:</span>
                <div className="flex-1">
                  <input
                    ref={minutesRef}
                    type="number"
                    min="0"
                    max="59"
                    placeholder="mm"
                    value={goalM}
                    onChange={e => setGoalM(e.target.value)}
                    className="w-full border-2 border-white rounded-xl px-4 py-3 text-center
                               text-lg font-semibold focus:outline-none focus:border-[#48C4B0]
                               text-[#1B1B1B] bg-white"
                  />
                  <p className="text-xs text-center text-gray-400 mt-1">minutes</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#F64866] hover:bg-[#e03558] disabled:opacity-40
                         text-white rounded-[14px] text-[15px] font-extrabold
                         py-[15px] transition-colors"
            >
              {t('home.form.cta')}
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              {t('home.form.free')}
            </p>

            {/* Pro planner block */}
            <div className="mt-5 bg-[#1a1a1a] rounded-xl px-4 py-3.5
                            flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white mb-0.5">{t('home.pro.title')}</p>
                <p className="text-[10px] text-white/40 leading-relaxed">
                  {t('home.pro.body')}
                </p>
              </div>
              <a
                href="/planner/pro"
                className="flex-shrink-0 bg-[#48C4B0] text-white text-[11px]
                           font-bold rounded-full px-3.5 py-1.5 whitespace-nowrap"
              >
                {t('home.pro.cta')}
              </a>
            </div>

          </form>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 mt-8 pb-12">
        <div className="max-w-lg mx-auto px-5 pt-8 space-y-6">

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-400">{t('home.trust')}</p>
            <p className="text-xs text-gray-400">
              Provided by{' '}
              <a
                href="https://www.getlecka.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#48C4B0] hover:underline"
              >
                www.getlecka.com
              </a>
            </p>
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs text-gray-400">
              {t('home.footer.questions')}{' '}
              <a href="mailto:info@getlecka.com" className="text-[#48C4B0] hover:underline">
                info@getlecka.com
              </a>
              {' '}·{' '}
              <a
                href="https://www.instagram.com/leckanutrition"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#48C4B0] hover:underline"
              >
                @leckanutrition
              </a>
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400 mb-2">{t('home.footer.findLecka')}</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {[
                { label: 'US',          href: 'https://www.getlecka.com' },
                { label: 'Vietnam',     href: 'https://www.getlecka.vn' },
                { label: 'Germany',     href: 'https://www.getlecka.de' },
                { label: 'Denmark',     href: 'https://www.getlecka.dk' },
                { label: 'Switzerland', href: 'https://www.getlecka.ch' },
                { label: 'Singapore',   href: 'https://rdrc.sg/collections/lecka' },
                { label: 'Hong Kong',   href: 'https://foodisdom.is/collections/lecka' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-[#48C4B0] transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          <p className="text-center mt-6">
            <a href="/claude" className="text-[10px] text-gray-400 hover:text-gray-600">
              Use Lecka in Claude →
            </a>
          </p>

        </div>
      </footer>
    </div>
  )
}
