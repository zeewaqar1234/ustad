import type { DiffPart } from '../lib/api'

/** Your answer vs the expected one. Grayscale-safe: struck-through = remove, underlined = add. */
export function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="font-mono text-base break-words" aria-label="Difference to the correct answer">
      {parts.map(([op, text], i) =>
        op === 'equal' ? (
          <span key={i}>{text}</span>
        ) : op === 'delete' ? (
          <del key={i} className="bg-neutral-200 text-neutral-500" title="remove">
            {text}
          </del>
        ) : (
          <ins key={i} className="bg-neutral-900 text-white no-underline" title="add">
            {text}
          </ins>
        ),
      )}
    </p>
  )
}
