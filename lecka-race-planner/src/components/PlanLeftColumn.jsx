import React from 'react'

export default function PlanLeftColumn({ children }) {
  return (
    <aside
      className="border-r border-gray-100 px-5 py-6 space-y-6"
      style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}
    >
      {children}
    </aside>
  )
}
