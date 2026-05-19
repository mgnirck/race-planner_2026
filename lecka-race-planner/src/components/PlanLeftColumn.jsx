import React, { useRef, useState, useEffect } from 'react'

export default function PlanLeftColumn({ children }) {
  const ref = useRef(null)
  const [showIndicator, setShowIndicator] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function check() {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      const hasOverflow = el.scrollHeight > el.clientHeight
      setShowIndicator(hasOverflow && !atBottom)
    }

    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [])

  return (
    <aside
      ref={ref}
      className="border-r border-gray-100 px-5 py-6 space-y-6"
      style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}
    >
      {children}

      {showIndicator && (
        <div
          aria-hidden="true"
          style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            height: '48px',
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.95))',
            pointerEvents: 'none',
            marginTop: '-48px',
          }}
        />
      )}
    </aside>
  )
}
