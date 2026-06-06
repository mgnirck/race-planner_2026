import React from 'react'
import Nav from './Nav.jsx'

export default function ClaudePage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="max-w-lg mx-auto px-5 pt-12 pb-20">

        {/* Eyebrow */}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#48C4B0] mb-3">
          AI Integration
        </p>

        {/* Heading */}
        <h1 className="text-2xl font-extrabold text-[#1B1B1B] mb-4">
          Lecka Nutrition Tools for Claude
        </h1>

        {/* Body */}
        <p className="text-sm text-gray-600 leading-relaxed mb-8">
          Lecka's product catalog and race fueling calculator are available as tools
          inside Claude. Ask about carb targets, product recommendations, or race-day
          strategy — Claude will call Lecka's data directly and give you a personalised answer.
        </p>

        {/* What you can ask */}
        <div className="bg-[#F9F9F9] rounded-2xl px-5 py-5 mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            What you can ask
          </p>
          <ul className="space-y-2">
            {[
              'What Lecka gels work for a hot marathon?',
              'I\'m 70kg, racing a 70.3 in 5h30. How many gels do I need?',
              'Which Lecka products are vegan and gluten-free?',
              'What\'s the sodium content of the Ultra Gel?',
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
          MCP Server URL
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
            Copy
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mb-2">
          In Claude, go to Settings → Integrations → Add MCP Server and paste the URL above.
        </p>
        <p className="text-[10px] text-gray-400 mb-8">
          If the tools stop responding mid-conversation, go to Settings → Integrations and reconnect the Lecka server. This is a known Claude limitation with remote connections.
        </p>

        {/* CTA */}
        <a
          href="https://claude.ai/new?hint=lecka+race+nutrition"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#1B1B1B] text-white text-sm
                     font-semibold rounded-full px-5 py-3 hover:opacity-80 transition-opacity"
        >
          Open Claude →
        </a>

        {/* Footer note */}
        <p className="text-[10px] text-gray-400 mt-8">
          Lecka MCP tools are free to use. Requires a Claude account.{' '}
          <a href="/" className="text-[#48C4B0] hover:underline">
            Back to the planner →
          </a>
        </p>

      </div>
    </div>
  )
}
