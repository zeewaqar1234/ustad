import { shadowLine, shadowStars } from '../../lib/stars'
import type { ShadowResult } from '../../lib/voice'
import { Icon, StarRow } from './ui'

// Word-match result. Green = the recogniser heard the word, rose + struck through = not heard. This is
// recognition, not a pronunciation score (Web Speech has none). No time, pace or fluency unless Zee
// turned the fluency setting on (and an engine gives one; Web Speech does not).
export function ShadowScore({ r, showFluency }: { r: ShadowResult; showFluency: boolean }) {
  const stars = shadowStars(r.matched, r.total)
  return (
    <div className="motion-safe:animate-rise flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200" role="status">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{shadowLine(r.matched, r.total)}</p>
        <StarRow stars={stars} size="size-7" />
      </div>
      <p className="flex flex-wrap gap-1.5 text-lg" lang="de">
        {r.words.map((w, i) => (
          <span
            key={i}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`motion-safe:animate-pop inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 ${
              w.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900 line-through decoration-2'
            }`}
            aria-label={w.ok ? w.word : `${w.word} (missed)`}
          >
            {w.ok && <Icon name="check" className="size-3.5" />}
            {w.word}
          </span>
        ))}
      </p>
      <p className="text-sm text-neutral-500" lang="de">
        Heard: {r.heard || '(nothing)'}
      </p>
      {showFluency && typeof r.fluency === 'number' && <p className="text-sm">Fluency: {r.fluency}</p>}
    </div>
  )
}
