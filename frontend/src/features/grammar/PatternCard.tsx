import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Button, Card as Box, Page, PageHeader, SectionTitle } from '../../components/ui'
import { api } from '../../lib/api'
import { CONTEXT_LABEL, humanTag, type PatternCard as Card } from '../../lib/grammar'

export function PatternCard() {
  const { code = '' } = useParams()
  const { data, error } = useQuery({
    queryKey: ['pattern', code],
    queryFn: () => api<Card>(`/api/patterns/${code}`),
  })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const { slot_diagram: slots, common_error: err } = data
  const blocked = data.status === 'needs_review'

  return (
    <Page>
      <div className="flex flex-col gap-4">
      <PageHeader
        back={{ to: '/grammar', label: 'Back to Grammatik' }}
        title={data.title}
        subtitle={`Pattern ${data.order}${data.done ? ', done' : ''}.`}
      />

      <Box skill="grammar">
        <p className="text-sm font-semibold text-neutral-600">The rule</p>
        <p className="mt-1 text-lg">{data.rule_en}</p>
      </Box>

      <section className="max-w-full overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full border-collapse text-sm" lang="de">
          <thead>
            <tr>
              {slots.labels.map((l, i) => (
                <th
                  key={i}
                  lang="en"
                  className="border-b-2 border-neutral-900 px-2 py-2 text-left text-xs font-semibold whitespace-nowrap"
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
        <SectionTitle>Examples</SectionTitle>
        {data.examples.map((ex) => (
          <div key={ex.de} className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs text-neutral-500">{CONTEXT_LABEL[ex.context] ?? ex.context}</p>
            <p className="font-semibold" lang="de">
              {ex.de}
            </p>
            <p className="text-sm text-neutral-700">{ex.en}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-neutral-600">Common error: {humanTag(err.tag)}</h2>
        <p className="mt-1 text-fix line-through" lang="de">
          {err.wrong}
        </p>
        <p className="font-bold text-ok" lang="de">
          {err.right}
        </p>
        <p className="mt-1 text-sm text-neutral-700">{err.note_en}</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {blocked ? (
          <p className="w-full rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm">
            In check queue. Drills open after you approve this pattern.{' '}
            <Link to="/check" className="underline">
              Check queue
            </Link>
          </p>
        ) : (
          <Button kind="primary" to={`/grammar/${data.code}/drills`}>
            Start drills
          </Button>
        )}
        <Button to="/homework">Homework for this pattern</Button>
      </div>
      </div>
    </Page>
  )
}
