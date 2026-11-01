import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Page, PageHeader, SectionTitle, TutorNote } from '../components/ui'
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

/** Approve button with its own error line: a failed approve says so instead of failing silently. */
function Approve({ path, onDone }: { path: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="mt-2 flex items-center gap-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setErr(null)
          try {
            await api(path, {})
            onDone()
          } catch (e) {
            setErr((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        Approve
      </Button>
      {err && (
        <p role="alert" className="text-sm font-semibold text-fix">
          Could not approve: {err}
        </p>
      )}
    </div>
  )
}

/** Items LanguageTool flagged. They stay out of Sabaq until you approve them. */
export function CheckQueue() {
  const { data, error, refetch } = useQuery({
    queryKey: ['needs-review'],
    queryFn: () => api<Flagged[]>('/api/items/needs-review'),
  })
  const grammar = useQuery({
    queryKey: ['needs-review', 'grammar'],
    queryFn: () => api<GrammarReview>('/api/items/needs-review/grammar'),
  })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const g = grammar.data
  const grammarCount = g ? g.patterns.length + g.placement.length : 0
  const empty = data.length === 0 && g !== undefined && grammarCount === 0
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <PageHeader
          back={{ to: '/settings', label: 'Back to Settings' }}
          title={`Check queue (${data.length})`}
          subtitle="LanguageTool flagged these. Approve only if the German is right."
        />
        {empty && (
          <TutorNote>
            <p>Nothing to check.</p>
          </TutorNote>
        )}
        {data.map((it) => (
          <div key={it.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
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
            <Approve path={`/api/items/${it.id}/approve`} onDone={() => void refetch()} />
          </div>
        ))}
        {g && grammarCount > 0 && <GrammarQueue data={g} refetch={() => void grammar.refetch()} />}
        <details className="mt-4 text-sm text-neutral-700">
          <summary className="cursor-pointer">For the builder</summary>
          <p className="mt-1">Fix wrong ones in the seed source and rebuild.</p>
        </details>
      </div>
    </Page>
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
function GrammarQueue({ data, refetch }: { data: GrammarReview; refetch: () => void }) {
  const n = data.patterns.length + data.placement.length
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-neutral-200 pt-4">
      <SectionTitle>Grammar and placement ({n})</SectionTitle>
      {data.patterns.map((p) => (
        <div key={p.code} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          <p className="text-xs text-neutral-600">Pattern</p>
          <p className="font-semibold">{p.title}</p>
          <Notes notes={p.notes} />
          <Approve path={`/api/items/patterns/${p.code}/approve`} onDone={refetch} />
        </div>
      ))}
      {data.placement.map((p) => (
        <div key={p.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          <p className="text-xs text-neutral-600">Placement question {p.id}</p>
          <p lang="de">{p.prompt}</p>
          <p>
            Answer:{' '}
            <span className="font-semibold" lang="de">
              {p.answer}
            </span>
          </p>
          <Notes notes={p.notes} />
          <Approve path={`/api/items/placement/${p.id}/approve`} onDone={refetch} />
        </div>
      ))}
    </section>
  )
}
