import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ListRow, PageHeader, StatusPill } from '../../components/ui'
import { api } from '../../lib/api'
import type { PatternList as Patterns, PatternRow } from '../../lib/grammar'

function status(p: PatternRow): string {
  if (p.status === 'needs_review') return 'In check queue'
  const parts: string[] = []
  if (p.done) parts.push('Done')
  if (p.known) parts.push('Known from placement')
  if (p.rounds > 0) parts.push(`Best ${Math.round(p.best_pct * 100)}%`)
  return parts.join(', ') || 'Not started'
}

export function PatternList() {
  const { data, error } = useQuery({ queryKey: ['patterns'], queryFn: () => api<Patterns>('/api/patterns') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const current = data.patterns.find((p) => p.code === data.current)
  const done = data.patterns.filter((p) => p.done || p.known).length
  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Grammatik"
        subtitle={`Patterns for work German. ${done} of ${data.patterns.length} done or known from placement.`}
        actions={
          <Link to="/recitation" className="shrink-0 rounded-lg border border-neutral-900 px-4 py-2 font-semibold">
            Pahara (tables)
          </Link>
        }
      />
      {current ? (
        <section className="mb-6 flex flex-col gap-2">
          <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Today's pattern</h2>
          <ListRow
            to={`/grammar/${current.code}`}
            title={`${current.order}. ${current.title}`}
            status={status(current)}
            right={<span className="shrink-0 font-semibold underline">Open</span>}
          />
        </section>
      ) : (
        <p className="mb-6 rounded-lg border border-neutral-300 bg-white p-3">All patterns done.</p>
      )}
      <h2 className="mb-2 text-xs tracking-wide text-neutral-500 uppercase">All patterns</h2>
      <div className="flex flex-col gap-2">
        {data.patterns.map((p) => (
          <ListRow
            key={p.code}
            to={`/grammar/${p.code}`}
            title={`${p.order}. ${p.title}`}
            status={status(p)}
            right={p.done ? <StatusPill strong>Done</StatusPill> : p.known ? <StatusPill>Known</StatusPill> : undefined}
          />
        ))}
      </div>
    </div>
  )
}
