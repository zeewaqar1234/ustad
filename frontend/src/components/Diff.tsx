import type { DiffPart } from '../lib/api'

/** Your answer vs the expected one. Struck through = remove, bold underlined = add. Colour only helps. */
export function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="font-mono text-base break-words" aria-label="Difference to the correct answer">
      {parts.map(([op, text], i) =>
        op === 'equal' ? (
          <span key={i}>{text}</span>
        ) : op === 'delete' ? (
          <del key={i} className="bg-fix-soft text-fix decoration-2" title="remove">
            {text}
          </del>
        ) : (
          <ins key={i} className="bg-ok-soft font-bold text-ok underline decoration-2 underline-offset-2" title="add">
            {text}
          </ins>
        ),
      )}
    </p>
  )
}
