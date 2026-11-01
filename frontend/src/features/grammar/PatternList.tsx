import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Button, Card, Page, PageHeader, SectionTitle, StatusChip, TutorNote } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
import { api } from '../../lib/api'
import type { PatternList as Patterns, PatternRow } from '../../lib/grammar'

function chip(p: PatternRow, current: string | null) {
  if (p.status === 'needs_review') return <StatusChip tone="warn">In check queue</StatusChip>
  if ((p.done || p.known) && p.state === 'shaky') return <StatusChip tone="warn">Done, now shaky</StatusChip>
  if (p.done) return <StatusChip tone="ok">Done</StatusChip>
  if (p.known) return <StatusChip tone="ok">Known</StatusChip>
  if (p.code === current) return <StatusChip tone="accent">Today</StatusChip>
  if (p.rounds > 0) return <StatusChip>Best {Math.round(p.best_pct * 100)}%</StatusChip>
  return <StatusChip>Not started</StatusChip>
}

export function PatternList() {
  const { data, error } = useQuery({ queryKey: ['patterns'], queryFn: () => api<Patterns>('/api/patterns') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const current = data.patterns.find((p) => p.code === data.current)
  const done = data.patterns.filter((p) => p.done || p.known).length
  return (
    <Page wide>
      <PageHeader
        title="Grammatik"
        subtitle={`Patterns for work German. ${done} of ${data.patterns.length} done or known from placement.`}
        actions={
          <Button to="/recitation" title={`Pahara: ${GLOSSARY.Pahara}`}>
            Pahara (tables)
          </Button>
        }
      />
      {current ? (
        <section className="mb-6">
          <SectionTitle>Today's pattern</SectionTitle>
          <Card skill="grammar" className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold">
                {current.order}. {current.title}
              </p>
              <div className="mt-1">{chip(current, data.current)}</div>
            </div>
            <Button kind="primary" to={`/grammar/${current.code}`}>
              Open
            </Button>
          </Card>
        </section>
      ) : (
        <div className="mb-6">
          <TutorNote>
            <p>All patterns done.</p>
          </TutorNote>
        </div>
      )}
      <SectionTitle>All patterns</SectionTitle>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {data.patterns.map((p) => (
          <li key={p.code}>
            <Link
              to={`/grammar/${p.code}`}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-neutral-900"
            >
              <span className="w-6 shrink-0 text-right text-sm text-neutral-600">{p.order}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
              {chip(p, data.current)}
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
