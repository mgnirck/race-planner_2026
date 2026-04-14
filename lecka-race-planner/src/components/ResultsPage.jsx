/**
 * ResultsPage.jsx — stub placeholder
 *
 * Receives the nutrition plan from StepForm and will render:
 *   - Targets summary (carbs/sodium/fluid)
 *   - Product selection list
 *   - Race timeline
 *   - Shopify cart button
 *   - Email capture
 *
 * Full implementation in next session.
 */

import React from 'react'

export default function ResultsPage({ targets, selection, form, onBack }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-5 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <h1 className="text-2xl font-bold text-[#2D6A4F]">Your plan is ready</h1>
        <p className="text-gray-500 text-sm mt-1">
          Results view — coming in the next session
        </p>

        {/* Quick summary of computed targets */}
        <div className="mt-8 border-2 border-gray-100 rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Nutrition targets
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#1B1B1B]">{targets.carb_per_hour}</p>
              <p className="text-xs text-gray-400 mt-0.5">g carbs/h</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1B1B1B]">{targets.sodium_per_hour}</p>
              <p className="text-xs text-gray-400 mt-0.5">mg sodium/h</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1B1B1B]">{targets.fluid_ml_per_hour}</p>
              <p className="text-xs text-gray-400 mt-0.5">ml fluid/h</p>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
            <span>Total carbs: {targets.total_carbs} g</span>
            <span>Total sodium: {targets.total_sodium} mg</span>
          </div>
        </div>

        {/* Selected products (raw) */}
        <div className="mt-6 border-2 border-gray-100 rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Recommended products
          </h2>
          {selection.map((item, i) => (
            <div key={i} className="flex justify-between items-start text-sm">
              <span className="text-[#1B1B1B] font-medium">{item.product.name}</span>
              <span className="text-gray-400 ml-3 text-right">
                ×{item.quantity}
                <span className="block text-xs">{item.note}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Back to form */}
        <button
          type="button"
          onClick={onBack}
          className="mt-8 w-full min-h-[48px] rounded-xl border-2 border-gray-200
                     text-sm font-medium text-[#1B1B1B] hover:border-[#2D6A4F] transition-colors"
        >
          Back to form
        </button>
      </div>
    </div>
  )
}
