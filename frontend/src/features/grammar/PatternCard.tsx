import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api } from '../../lib/api'
import { CONTEXT_LABEL, humanTag, type PatternCard as Card } from '../../lib/grammar'

export function PatternCard() {
  const { code = '' } = useParams()
  const { data, error } = useQuery({
    queryKey: ['pattern', code],
    queryFn: () => api<Card>(`/api/patterns/${code}`),
  })
  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  const { slot_diagram: slots, common_error: err } = data
  const blocked = data.status === 'needs_review'

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 p-4">
      <header>
        <p className="text-sm text-neutral-600">
          <Link to="/grammar" className="underline">
            Grammar
          </Link>{' '}
          · Pattern {data.order}
          {data.done && ' · ✓ Done'}
        </p>
        <h1 className="text-xl font-bold">{data.title}</h1>
        <p className="mt-1 text-neutral-800">{data.rule_en}</p>
      </header>

      <section className="max-w-full overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full border-collapse text-sm" lang="de">
          <thead>
            <tr>
              {slots.labels.map((l, i) => (
                <th
                  key={i}
                  lang="en"
                  className="border-b-2 border-neutral-900 px-2 py-2 text-left text-xs font-semibold whitespace-nowrap uppercase"
                >
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.rows.map((r, ri) => (
              <tr key={ri} className="border-b border-neutral-200 last:border-0">
                {r.map((c, ci) => (
                  <td key={ci} className="px-2 py-2 whitespace-nowrap">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Examples</h2>
        {data.examples.map((ex) => (
          <div key={ex.de} className="rounded-lg border border-neutral-300 bg-white p-3">
            <p className="text-xs text-neutral-500">{CONTEXT_LABEL[ex.context] ?? ex.context}</p>
            <p className="font-semibold" lang="de">
              {ex.de}
            </p>
            <p className="text-sm text-neutral-700">{ex.en}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-neutral-300 bg-white p-3">
        <h2 className="text-xs tracking-wide text-neutral-500 uppercase">
          Common error · {humanTag(err.tag)}
        </h2>
        <p className="mt-1 text-neutral-600 line-through" lang="de">
          {err.wrong}
        </p>
        <p className="font-semibold" lang="de">
          {err.right}
        </p>
        <p className="mt-1 text-sm text-neutral-700">{err.note_en}</p>
      </section>

      <div className="mt-auto flex flex-col gap-2">
        {blocked ? (
          <p className="rounded-lg border-2 border-neutral-900 p-3 text-sm">
            In check queue. Drills open after you approve this pattern.{' '}
            <Link to="/check" className="underline">
              Check queue
            </Link>
          </p>
        ) : (
          <Link
            to={`/grammar/${data.code}/drills`}
            className="rounded-lg bg-neutral-900 p-4 text-center text-lg text-white"
          >
            Start drills
          </Link>
        )}
        <Link to="/homework" className="rounded-lg border border-neutral-400 p-4 text-center">
          Homework for this pattern
        </Link>
      </div>
    </div>
  )
}
