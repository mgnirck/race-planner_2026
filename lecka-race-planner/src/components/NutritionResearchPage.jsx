import rawContent from '../../NUTRITION_RESEARCH_ANALYSIS.md?raw'

export default function NutritionResearchPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-10">

        <div className="mb-6 flex items-center justify-between">
          <a href="/" className="text-sm text-[#48C4B0] hover:underline">
            ← Back to home
          </a>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-10">
          <pre className="whitespace-pre-wrap font-mono text-xs text-gray-700 leading-relaxed overflow-x-auto">
            {rawContent}
          </pre>
        </div>

        <p className="text-center mt-8 text-xs text-gray-400">
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
    </div>
  )
}
