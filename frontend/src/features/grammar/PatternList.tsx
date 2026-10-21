import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import type { PatternList as Patterns, PatternRow } from '../../lib/grammar'

function mark(p: PatternRow): string {
  if (p.done) return '✓'
  if (p.known) return '○'
  return `${p.order}`
}

function status(p: PatternRow): string {
  if (p.status === 'needs_review') return 'In check queue'
  const parts: string[] = []
  if (p.done) parts.push('Done')
  if (p.known) parts.push('Known from placement')
  if (p.rounds > 0) parts.push(`Best ${Math.round(p.best_pct * 100)}%`)
  return parts.join(' · ') || 'Not started'
}

function Row({ p }: { p: PatternRow }) {
  return (
    <Link
      to={`/grammar/${p.code}`}
      className="flex items-center gap-3 rounded-lg border border-neutral-300 bg-white p-3 active:bg-neutral-100"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-neutral-900 text-sm font-semibold ${p.done ? 'bg-neutral-900 text-white' : ''}`}
        aria-hidden
      >
        {mark(p)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{p.title}</p>
        <p className="text-sm text-neutral-700">{status(p)}</p>
      </div>
      <span aria-hidden>›</span>
    </Link>
  )
}

export function PatternList() {
  const { data, error } = useQuery({ queryKey: ['patterns'], queryFn: () => api<Patterns>('/api/patterns') })
  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  const current = data.patterns.find((p) => p.code === data.current)
  const done = data.patterns.filter((p) => p.done || p.known).length
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Grammar</h1>
      <p className="text-sm text-neutral-700">
        {done} of {data.patterns.length} done or known. ✓ done, ○ known from placement.
      </p>
      {current ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Today's pattern</h2>
          <Link
            to={`/grammar/${current.code}`}
            className="block rounded-lg border-2 border-neutral-900 bg-white p-4 active:bg-neutral-100"
          >
            <p className="text-lg font-bold">
              {current.order}. {current.title}
            </p>
            <p className="text-sm text-neutral-700">{status(current)}</p>
          </Link>
        </section>
      ) : (
        <p className="rounded-lg border border-neutral-300 bg-white p-3">All patterns done.</p>
      )}
      <h2 className="mt-2 text-xs tracking-wide text-neutral-500 uppercase">All patterns</h2>
      {data.patterns.map((p) => (
        <Row key={p.code} p={p} />
      ))}
    </div>
  )
}
