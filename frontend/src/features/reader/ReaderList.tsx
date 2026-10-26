import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api'
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

/** Known-word share as a bar. Target band for graded texts is 95 % and up. */
export function DensityMeter({ pct, unknown }: { pct: number; unknown?: number }) {
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-700">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200"
        role="meter"
        aria-label="Known words"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-neutral-900" style={{ width: `${v}%` }} />
      </div>
      <span className="shrink-0">
        {Math.round(v)}% known{unknown != null ? ` · ${unknown} new` : ''}
      </span>
    </div>
  )
}

function TextRow({ t }: { t: TextSummary }) {
  return (
    <Link
      to={`/read/${t.id}`}
      className="flex flex-col gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-3 active:bg-neutral-100"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-semibold">
          {t.title}
          {t.series_episode != null && (
            <span className="font-normal text-neutral-600"> · Episode {t.series_episode}</span>
          )}
        </p>
        <span className="shrink-0 text-sm text-neutral-700">
          {t.read ? (t.score != null ? `Read · ${Math.round(t.score)}%` : 'Read') : 'New'}
        </span>
      </div>
      <p className="text-sm text-neutral-600">
        {TOPICS[t.topic] ?? t.topic} · {t.level} · {t.words} words
        {t.status === 'needs_review' && ' · flagged'}
      </p>
      <DensityMeter pct={t.known_pct} />
    </Link>
  )
}

export function ReaderList() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['texts'], queryFn: () => api<TextList>('/api/texts') })
  const gen = useMutation({
    mutationFn: () => api<{ made: number }>('/api/texts/generate', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['texts'] }),
  })
  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Lesen</h1>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Today</h2>
        {data.today.length === 0 && <p className="text-sm text-neutral-700">No text for today yet.</p>}
        {data.today.map((t) => (
          <TextRow key={t.id} t={t} />
        ))}
        <button
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm disabled:opacity-60"
        >
          {gen.isPending ? 'Writing texts…' : 'Generate texts now'}
        </button>
        {gen.isError && <p className="text-sm">{(gen.error as Error).message}</p>}
        {gen.data && <p className="text-sm">{gen.data.made} new texts.</p>}
      </section>
      {data.library.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Library</h2>
          {data.library.map((t) => (
            <TextRow key={t.id} t={t} />
          ))}
        </section>
      )}
    </div>
  )
}
