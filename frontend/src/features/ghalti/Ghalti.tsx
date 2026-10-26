import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import { humanTag, shortDate, type Register } from '../../lib/grammar'

/** Grayscale steps, light to dark. Text flips to white on the dark half. */
const SHADES = [
  'bg-neutral-100',
  'bg-neutral-200',
  'bg-neutral-300',
  'bg-neutral-400',
  'bg-neutral-500 text-white',
  'bg-neutral-600 text-white',
  'bg-neutral-700 text-white',
  'bg-neutral-800 text-white',
  'bg-neutral-900 text-white',
]

function shade(count: number, max: number): string {
  if (max <= 0) return SHADES[0]
  return SHADES[Math.min(SHADES.length - 1, Math.round((count / max) * (SHADES.length - 1)))]
}

function Recurring() {
  return (
    <span className="text-xs font-semibold whitespace-nowrap underline">recurring</span>
  )
}

export function Ghalti() {
  const { data, error } = useQuery({ queryKey: ['mistakes'], queryFn: () => api<Register>('/api/mistakes') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const max = Math.max(0, ...data.by_tag.map((t) => t.count))
  const top = data.top10.filter((m) => m.count > 1)

  return (
    <div className="flex max-w-[960px] flex-col gap-4">
      <PageHeader
        title="Ghalti Register"
        subtitle={`Your mistakes. ${data.total} counted. Each wrong sentence comes back as a Fix this sentence card.`}
      />

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-neutral-300 bg-white p-3">
          Nothing yet. Mistakes from drills, homework and Tagebuch land here.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-neutral-500 uppercase">By type</h2>
            <div className="grid grid-cols-5 gap-2">
              {data.by_tag.map((t) => (
                <div
                  key={t.tag}
                  className={`flex min-h-16 flex-col justify-between rounded border border-neutral-300 p-2 ${shade(t.count, max)}`}
                >
                  <span className="text-2xl font-bold">{t.count}</span>
                  <span className="text-xs leading-tight break-words">{humanTag(t.tag)}</span>
                  <span className="text-xs">
                    {t.rate === null ? 'too few uses' : `${Math.round(t.rate * 100)}% wrong`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {data.top_tags.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Habits, last 30 days</h2>
              <ol className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-300 bg-white">
                {data.top_tags.map((t) => (
                  <li key={t.tag} className="flex items-baseline gap-3 p-3 text-sm">
                    <span className="w-8 shrink-0 font-bold">{t.errors}×</span>
                    <span className="min-w-0 flex-1">{humanTag(t.tag)}</span>
                    <span className="text-neutral-600">
                      {t.rate === null ? 'too few uses' : `${t.errors} wrong, ${t.correct} right`}
                    </span>
                    {t.recurring && <Recurring />}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-neutral-600">
                Recurring: 3 or more errors from 2 or more different sentences in 30 days. The wrong share needs 5 or
                more uses of the type.
              </p>
            </section>
          )}

          {top.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Most repeated sentences</h2>
              <ol className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-300 bg-white">
                {top.map((m) => (
                  <li key={m.id} className="flex gap-3 p-3">
                    <span className="w-8 shrink-0 font-bold">{m.count}×</span>
                    <div className="min-w-0 text-sm" lang="de">
                      <p className="text-neutral-600 line-through">{m.orig}</p>
                      <p className="font-semibold">{m.fix}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-neutral-500 uppercase">All mistakes</h2>
            {data.rows.map((m) => (
              <article key={m.id} className="rounded-lg border border-neutral-300 bg-white p-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-neutral-600">
                  <span>
                    {shortDate(m.last_ts)} · {m.source} · <span className="uppercase">{humanTag(m.tag)}</span>
                  </span>
                  <span className="flex items-baseline gap-2">
                    {m.recurring && <Recurring />}
                    <span className="font-semibold text-neutral-900">{m.count}×</span>
                  </span>
                </p>
                <p className="mt-1 text-neutral-600 line-through" lang="de">
                  {m.orig}
                </p>
                <p className="font-semibold" lang="de">
                  → {m.fix}
                </p>
                {m.note && <p className="mt-1 text-neutral-700">{m.note}</p>}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
