import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Page, PageHeader, SectionTitle, StatusChip, TutorNote } from '../../components/ui'
import { api } from '../../lib/api'
import { humanTag, shortDate, type Mistake, type Register } from '../../lib/grammar'

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

/** Where a mistake came from, in plain words. */
const SOURCE_LABEL: Record<string, string> = {
  homework: 'writing task',
  tagebuch: 'diary',
  voice: 'speaking',
  drill: 'drill',
  diktat: 'dictation',
}

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source.replaceAll('_', ' ')
}

const DAYS_30 = 30 * 24 * 60 * 60 * 1000

/** "writing task and speaking": distinct sources of this tag's mistakes seen in the last 30 days. */
function sourcesFor(tag: string, rows: Mistake[]): string {
  const since = Date.now() - DAYS_30
  const names = [
    ...new Set(rows.filter((m) => m.tag === tag && new Date(m.last_ts).getTime() >= since).map((m) => sourceLabel(m.source))),
  ]
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function Recurring() {
  return <StatusChip tone="fix">recurring</StatusChip>
}

export function Ghalti() {
  const { data, error } = useQuery({ queryKey: ['mistakes'], queryFn: () => api<Register>('/api/mistakes') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const max = Math.max(0, ...data.by_tag.map((t) => t.count))
  const top = data.top10.filter((m) => m.count > 1)
  const habits = data.top_tags.slice(0, 3)

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Ghalti"
          subtitle="Your mistakes. Each wrong sentence comes back as a Fix this sentence card."
        />

        {data.rows.length === 0 && data.top_tags.length === 0 ? (
          <TutorNote>
            <p>Nothing yet. Mistakes from drills, homework, the diary and speaking land here.</p>
          </TutorNote>
        ) : (
          <>
            {habits.length > 0 && (
              <TutorNote title="Your most repeated mistakes">
                <ol className="flex flex-col gap-2">
                  {habits.map((t) => {
                    const where = sourcesFor(t.tag, data.rows)
                    return (
                      <li key={t.tag} className="flex items-baseline justify-between gap-4">
                        <span>
                          <span className="font-semibold">{humanTag(t.tag)}</span>: {t.errors}{' '}
                          {t.errors === 1 ? 'time' : 'times'} in 30 days{where ? `, in ${where}` : ''}.
                        </span>
                        <Link to={t.pattern ? `/grammar/${t.pattern}` : '/grammar'} className="shrink-0 font-semibold underline">
                          Practise
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </TutorNote>
            )}

            {top.length > 0 && (
              <section>
                <SectionTitle>Most repeated sentences</SectionTitle>
                <ol className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
                  {top.map((m) => (
                    <li key={m.id} className="flex gap-3 p-3">
                      <span className="w-8 shrink-0 font-bold">{m.count}×</span>
                      <div className="min-w-0 text-sm" lang="de">
                        <p className="text-fix line-through">{m.orig}</p>
                        <p className="font-bold text-ok">{m.fix}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section>
              <SectionTitle>All mistakes</SectionTitle>
              <div className="flex flex-col gap-2">
                {data.rows.map((m) => (
                  <article key={m.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-neutral-600">
                      <span>
                        {shortDate(m.last_ts)} · {sourceLabel(m.source)} ·{' '}
                        <span className="font-semibold text-neutral-800">{humanTag(m.tag)}</span>
                      </span>
                      <span className="flex items-baseline gap-2">
                        {m.recurring && <Recurring />}
                        <span className="font-semibold text-neutral-900">{m.count}×</span>
                      </span>
                    </p>
                    <p className="mt-1 text-fix line-through" lang="de">
                      {m.orig}
                    </p>
                    <p className="font-bold text-ok" lang="de">
                      → {m.fix}
                    </p>
                    {m.note && <p className="mt-1 text-neutral-700">{m.note}</p>}
                  </article>
                ))}
              </div>
            </section>

            <details className="rounded-xl border border-neutral-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold">All numbers</summary>
              <div className="mt-3 flex flex-col gap-4">
                <p className="text-sm text-neutral-700">{data.total} mistakes counted in total.</p>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-neutral-600">By type</h3>
                  <div className="grid grid-cols-4 gap-2">
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
                    <h3 className="text-sm font-semibold text-neutral-600">Habits, last 30 days</h3>
                    <ol className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
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
                      Recurring: 3 or more errors from 2 or more different sentences in 30 days. The wrong share needs 5
                      or more uses of the type.
                    </p>
                  </section>
                )}
              </div>
            </details>
          </>
        )}
      </div>
    </Page>
  )
}
