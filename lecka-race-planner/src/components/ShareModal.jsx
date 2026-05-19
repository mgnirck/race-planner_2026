/**
 * ShareModal.jsx
 *
 * Modal for sharing / downloading a plan card image.
 * Uses the faux-viewport pattern (no position: fixed) to be compatible
 * with the existing modal conventions in this codebase.
 *
 * Props:
 *   onClose       — called when the user dismisses the modal
 *   planProps     — object passed to generateShareImage (see SharePlanImage.jsx)
 *   planUrl       — shareable plan URL shown in share buttons
 */

import React, { useState, useEffect } from 'react'
import { generateShareImage } from './SharePlanImage.jsx'

export default function ShareModal({ onClose, planProps = {}, planUrl = 'plan.getlecka.com' }) {
  const [format,    setFormat]    = useState('square')
  const [dataUrl,   setDataUrl]   = useState(null)
  const [generating, setGenerating] = useState(false)
  const [copied,    setCopied]    = useState(false)

  async function generate(fmt) {
    setGenerating(true)
    setDataUrl(null)
    try {
      const url = await generateShareImage({ ...planProps, planUrl }, fmt)
      setDataUrl(url)
    } catch (e) {
      console.error('[ShareModal] generation failed:', e)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => { generate('square') }, [])

  function handleFormatChange(fmt) {
    setFormat(fmt)
    generate(fmt)
  }

  function handleCopyLink() {
    const text = planUrl
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    } else {
      fallbackCopy(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function fallbackCopy(text) {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(el)
    el.focus(); el.select()
    try { document.execCommand('copy') } catch (_) {}
    document.body.removeChild(el)
  }

  const fbUrl    = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(planUrl)}`
  const mailUrl  = `mailto:?subject=My Lecka race plan&body=Check out my race nutrition plan: ${encodeURIComponent(planUrl)}`

  return (
    <div
      style={{
        minHeight: 500,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          maxWidth: 400,
          width: '100%',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-bold text-[#1B1B1B]">Share my plan</p>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Preview */}
        <div className="flex items-center justify-center mb-4 min-h-[200px] bg-gray-50 rounded-xl overflow-hidden">
          {generating ? (
            <p className="text-sm text-gray-400">Generating your plan card...</p>
          ) : dataUrl ? (
            <img
              src={dataUrl}
              alt="Plan card preview"
              style={{ maxWidth: 340, borderRadius: 12, display: 'block', margin: '0 auto' }}
            />
          ) : (
            <p className="text-sm text-red-400">Could not generate image</p>
          )}
        </div>

        {/* Format toggle */}
        <div className="flex gap-2 mb-4 justify-center">
          {[['square', 'Square 1:1'], ['story', 'Story 9:16']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleFormatChange(key)}
              disabled={generating}
              className={[
                'px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors disabled:opacity-50',
                format === key
                  ? 'border-[#48C4B0] bg-[#48C4B0] text-white'
                  : 'border-gray-200 text-[#1B1B1B] hover:border-[#48C4B0]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Share buttons — 2×2 grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Download PNG */}
          {dataUrl ? (
            <a
              href={dataUrl}
              download="lecka-race-plan.png"
              className="flex items-center justify-center min-h-[44px] px-3
                         bg-[#48C4B0] text-white rounded-xl text-sm font-semibold
                         hover:bg-[#3db09d] transition-colors text-center"
            >
              Download PNG
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex items-center justify-center min-h-[44px] px-3
                         bg-gray-100 text-gray-400 rounded-xl text-sm font-semibold"
            >
              Download PNG
            </button>
          )}

          {/* Share to Facebook */}
          <a
            href={fbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center min-h-[44px] px-3
                       bg-[#1877F2] text-white rounded-xl text-sm font-semibold
                       hover:bg-[#1060d0] transition-colors text-center"
          >
            Share to Facebook
          </a>

          {/* Copy link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center justify-center min-h-[44px] px-3
                       border-2 border-gray-200 text-[#1B1B1B] rounded-xl text-sm font-semibold
                       hover:border-[#48C4B0] transition-colors"
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>

          {/* Email */}
          <a
            href={mailUrl}
            className="flex items-center justify-center min-h-[44px] px-3
                       border-2 border-gray-200 text-[#1B1B1B] rounded-xl text-sm font-semibold
                       hover:border-[#48C4B0] transition-colors text-center"
          >
            Email
          </a>
        </div>

        {/* Instagram hint */}
        <p className="text-xs text-gray-400 text-center mb-2">
          For Instagram: download the image and post to your Stories or Feed
        </p>

        {/* Footer */}
        <p className="text-xs text-gray-300 text-center" style={{ fontSize: 11 }}>
          Free race plans at plan.getlecka.com
        </p>
      </div>
    </div>
  )
}
