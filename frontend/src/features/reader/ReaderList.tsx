import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button, ListRow, Page, PageHeader, SectionTitle, StatusChip } from '../../components/ui'
import type { TextList, TextSummary } from '../../lib/reading'

const TOPICS: Record<string, string> = {
  serial: 'Serial',
  markets: 'Markets',
  crypto: 'Crypto',
  history: 'History',
  pk_de: 'Pakistan and Germany',
  life: 'Life',
  work: 'Work',
}

/** Known-word share as a bar. Readable in black and white: outlined track, solid fill, tick at the 95 % target, number beside it. */
export function DensityMeter({ pct, unknown }: { pct: number; unknown?: number }) {
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-800">
      <div
        className="relative h-3 min-w-24 flex-1 overflow-hidden border border-neutral-900 bg-white"
        role="meter"
        aria-label="Known words"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-neutral-900" style={{ width: `${v}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-500" style={{ left: '95%' }} aria-hidden />
      </div>
      <span className="shrink-0 tabular-nums">
        {Math.round(v)}% known{unknown != null ? `, ${unknown} new` : ''}
      </span>
    </div>
  )
}

function TextChip({ t }: { t: TextSummary }) {
  if (t.status === 'needs_review') return <StatusChip tone="warn">Needs check</StatusChip>
  if (t.read) return <StatusChip tone="ok">Read</StatusChip>
  return <StatusChip tone="accent">New</StatusChip>
}

function TextRow({ t }: { t: TextSummary }) {
  return (
    <ListRow
      skill="read"
      to={`/read/${t.id}`}
      title={t.title}
      sub={t.series_episode != null ? `Episode ${t.series_episode}` : undefined}
      status={`${TOPICS[t.topic] ?? t.topic} · ${t.level} · ${t.words} words`}
      right={<TextChip t={t} />}
    />
  )
}

export function ReaderList() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['texts'], queryFn: () => api<TextList>('/api/texts') })
  const gen = useMutation({
    mutationFn: () => api<{ made: number }>('/api/texts/generate', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['texts'] }),
  })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader title="Lesen" subtitle="Short texts at your level, with questions after." />
        <section className="flex flex-col gap-2">
          <SectionTitle>Today</SectionTitle>
          {data.today.length === 0 && <p className="text-sm text-neutral-700">No text for today yet.</p>}
          {data.today.map((t) => (
            <TextRow key={t.id} t={t} />
          ))}
          <div>
            <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
              {gen.isPending ? 'Writing texts…' : 'Generate texts now'}
            </Button>
          </div>
          {gen.isError && <p className="text-sm">{(gen.error as Error).message}</p>}
          {gen.data && <p className="text-sm">{gen.data.made} new texts.</p>}
        </section>
        {data.library.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Library</SectionTitle>
            {data.library.map((t) => (
              <TextRow key={t.id} t={t} />
            ))}
          </section>
        )}
      </div>
    </Page>
  )
}
