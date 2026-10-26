import type { ShadowResult } from '../../lib/voice'

// Word-match result. Grayscale: missed words are struck through. No time, pace or fluency unless
// Zee turned the fluency setting on (and an engine gives one; Web Speech does not).
export function ShadowScore({ r, showFluency }: { r: ShadowResult; showFluency: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-neutral-900 bg-white p-3" role="status">
      <p className="font-semibold">
        {r.matched} of {r.total} words heard
      </p>
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-lg" lang="de">
        {r.words.map((w, i) => (
          <span key={i} className={w.ok ? '' : 'text-neutral-500 line-through'} aria-label={w.ok ? w.word : `${w.word} (missed)`}>
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
