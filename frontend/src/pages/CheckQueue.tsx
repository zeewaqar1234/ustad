import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { GrammarReview, ReviewNote } from '../lib/grammar'

interface Flagged {
  id: number
  deck: string
  de: string
  en: string
  example_de: string | null
  notes: ReviewNote[]
}

/** Items LanguageTool flagged. They stay out of Sabaq until you approve them. */
export function CheckQueue() {
  const { data, refetch } = useQuery({
    queryKey: ['needs-review'],
    queryFn: () => api<Flagged[]>('/api/items/needs-review'),
  })
  if (!data) return <p className="p-4">Loading…</p>
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Check queue ({data.length})</h1>
      <p className="text-sm text-neutral-700">
        LanguageTool flagged these. Approve only if the German is right. Fix wrong ones in the seed
        source and rebuild.
      </p>
      {data.map((it) => (
        <div key={it.id} className="rounded-lg border border-neutral-300 bg-white p-3 text-sm">
          <p className="font-semibold" lang="de">
            {it.de}
          </p>
          <p>{it.en}</p>
          {it.example_de && (
            <p className="mt-1" lang="de">
              {it.deck === 'ghalti' && (
                <span lang="en" className="text-neutral-600">
                  Your sentence:{' '}
                </span>
              )}
              {it.example_de}
            </p>
          )}
          <Notes notes={it.notes} />
          <button
            onClick={async () => {
              await api(`/api/items/${it.id}/approve`, {})
              refetch()
            }}
            className="mt-2 rounded border border-neutral-900 px-3 py-2"
          >
            Approve
          </button>
        </div>
      ))}
      <GrammarQueue />
    </div>
  )
}

function Notes({ notes }: { notes: ReviewNote[] }) {
  return (
    <>
      {(notes ?? []).map((n, i) => (
        <p key={i} className="mt-1 text-neutral-600">
          {n.message} {n.suggestions && n.suggestions.length > 0 && `(${n.suggestions.join(', ')})`}
        </p>
      ))}
    </>
  )
}

/** Grammar patterns and placement answers LanguageTool flagged. Drills and the test skip them until approved. */
function GrammarQueue() {
  const { data, refetch } = useQuery({
    queryKey: ['needs-review', 'grammar'],
    queryFn: () => api<GrammarReview>('/api/items/needs-review/grammar'),
  })
  if (!data) return null
  const n = data.patterns.length + data.placement.length
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-neutral-300 pt-4">
      <h2 className="text-xl font-bold">Grammar and placement ({n})</h2>
      {data.patterns.map((p) => (
        <div key={p.code} className="rounded-lg border border-neutral-300 bg-white p-3 text-sm">
          <p className="text-xs text-neutral-500">Pattern</p>
          <p className="font-semibold">{p.title}</p>
          <Notes notes={p.notes} />
          <button
            onClick={async () => {
              await api(`/api/items/patterns/${p.code}/approve`, {})
              refetch()
            }}
            className="mt-2 rounded border border-neutral-900 px-3 py-2"
          >
            Approve
          </button>
        </div>
      ))}
      {data.placement.map((p) => (
        <div key={p.id} className="rounded-lg border border-neutral-300 bg-white p-3 text-sm">
          <p className="text-xs text-neutral-500">Placement item {p.id}</p>
          <p lang="de">{p.prompt}</p>
          <p>
            Answer:{' '}
            <span className="font-semibold" lang="de">
              {p.answer}
            </span>
          </p>
          <Notes notes={p.notes} />
          <button
            onClick={async () => {
              await api(`/api/items/placement/${p.id}/approve`, {})
              refetch()
            }}
            className="mt-2 rounded border border-neutral-900 px-3 py-2"
          >
            Approve
          </button>
        </div>
      ))}
    </section>
  )
}
