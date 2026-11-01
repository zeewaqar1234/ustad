import type { ReactNode } from 'react'

/** Split the original text into plain runs and underlined, numbered error spans. */
export function marked(text: string, errors: { start: number; end: number }[]): ReactNode[] {
  const out: ReactNode[] = []
  let pos = 0
  errors.forEach((e, i) => {
    if (e.start < pos || e.end > text.length || e.start >= e.end) return
    if (e.start > pos) out.push(<span key={`t${i}`}>{text.slice(pos, e.start)}</span>)
    out.push(
      <span key={`e${i}`} data-testid="error-span" className="text-fix">
        <u className="decoration-fix decoration-wavy decoration-2 underline-offset-4">{text.slice(e.start, e.end)}</u>
        <sup className="ml-0.5 font-sans text-xs font-bold">{i + 1}</sup>
      </span>,
    )
    pos = e.end
  })
  if (pos < text.length) out.push(<span key="end">{text.slice(pos)}</span>)
  return out
}
