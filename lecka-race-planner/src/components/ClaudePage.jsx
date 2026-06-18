import React from 'react'
import { useTranslation } from 'react-i18next'
import Nav from './Nav.jsx'

export default function ClaudePage() {
  const { t } = useTranslation('common')

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="max-w-lg mx-auto px-5 pt-12 pb-20">

        {/* Eyebrow */}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-3">
          {t('claude.eyebrow')}
        </p>

        {/* Heading */}
        <h1 className="text-2xl font-extrabold text-[#1B1B1B] mb-4">
          {t('claude.heading')}
        </h1>

        {/* Body */}
        <p className="text-sm text-gray-600 leading-relaxed mb-8">
          {t('claude.body')}
        </p>

        {/* What you can ask */}
        <div className="bg-[#F9F9F9] rounded-2xl px-5 py-5 mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            {t('claude.whatYouCanAsk')}
          </p>
          <ul className="space-y-2">
            {[
              t('claude.example1'),
              t('claude.example2'),
              t('claude.example3'),
              t('claude.example4'),
            ].map((q, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-2">
                <span className="text-[#48C4B0] font-bold flex-shrink-0">→</span>
                <span>"{q}"</span>
              </li>
            ))}
          </ul>
        </div>

        {/* MCP URL */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
          {t('claude.mcpUrlLabel')}
        </p>
        <div className="bg-[#1B1B1B] rounded-xl px-4 py-3 mb-2 flex items-center justify-between gap-3">
          <code className="text-xs text-[#48C4B0] break-all">
            https://lecka-mcp.vercel.app/mcp
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText('https://lecka-mcp.vercel.app/mcp')}
            className="text-[10px] text-white/50 hover:text-white/80 flex-shrink-0 transition-colors"
          >
            {t('claude.copyButton')}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mb-2">
          {t('claude.setupInstructions')}
        </p>
        <p className="text-[10px] text-gray-400 mb-8">
          {t('claude.reconnectNote')}
        </p>

        {/* CTA */}
        <a
          href="https://claude.ai/new?hint=lecka+race+nutrition"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#1B1B1B] text-white text-sm
                     font-semibold rounded-full px-5 py-3 hover:opacity-80 transition-opacity"
        >
          {t('claude.openClaude')}
        </a>

        {/* Footer note */}
        <p className="text-[10px] text-gray-400 mt-8">
          {t('claude.freeNote')}{' '}
          <a href="/" className="text-[#48C4B0] hover:underline">
            {t('claude.backToPlanner')}
          </a>
        </p>

      </div>
    </div>
  )
}
