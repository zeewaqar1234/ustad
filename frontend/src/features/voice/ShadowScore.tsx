import { shadowLine } from '../../lib/shadow'
import type { ShadowResult } from '../../lib/voice'

// Word-match result. A checked word was heard; a struck-through word was not. This is recognition, not
// a pronunciation score (Web Speech has none). No time, pace or fluency unless Zee turned the fluency
// setting on (and an engine gives one; Web Speech does not).
export function ShadowScore({ r, showFluency }: { r: ShadowResult; showFluency: boolean }) {
  return (
    <div className="animate-fade flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4" role="status">
      <p className="font-semibold">{shadowLine(r.matched, r.total)}</p>
      <p className="flex flex-wrap gap-2 text-lg" lang="de">
        {r.words.map((w, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 ${
              w.ok ? 'border-neutral-900 font-semibold' : 'border-neutral-400 text-neutral-600 line-through decoration-2'
            }`}
            aria-label={w.ok ? `${w.word} (heard)` : `${w.word} (not heard)`}
          >
            {w.ok && <span aria-hidden="true">✓</span>}
            {w.word}
          </span>
        ))}
      </p>
      <p className="text-sm text-neutral-600" lang="de">
        Heard: {r.heard || '(nothing)'}
      </p>
      {showFluency && typeof r.fluency === 'number' && <p className="text-sm">Fluency: {r.fluency}</p>}
    </div>
  )
}
