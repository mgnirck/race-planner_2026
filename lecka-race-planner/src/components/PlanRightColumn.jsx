import React, { useState } from 'react'

export default function PlanRightColumn({ tabs, defaultTab }) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key)
  const activeTab = tabs.find(t => t.key === active) ?? tabs[0]
  return (
    <div className="flex flex-col" style={{ minHeight: '100vh' }}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex px-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={[
              'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              active === tab.key
                ? 'border-[#48C4B0] text-[#1B1B1B]'
                : 'border-transparent text-gray-400 hover:text-[#1B1B1B]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 px-5 py-4">
        {activeTab?.content}
      </div>
    </div>
  )
}
