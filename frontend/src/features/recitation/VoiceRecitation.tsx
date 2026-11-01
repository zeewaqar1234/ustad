import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Button, Column, NextStep, PageHeader, Verdict } from '../../components/ui'
import { api } from '../../lib/api'
import { STAGE_NAME, type RecitationResult, type RecitationTable } from '../../lib/grammar'
import { TalkInput, type SendMeta } from '../voice/TalkInput'

// One row at a time: Zee says the row (the cue word may be said or not), checks the text, next row.
// No timer, no auto turn-end: only Send ends a row.
export function VoiceRecitation() {
  const { code = '' } = useParams()
  const qc = useQueryClient()
  const { data, error, refetch } = useQuery({
    queryKey: ['recitation', code],
    queryFn: () => api<RecitationTable>(`/api/recitation/${code}`),
    refetchOnWindowFocus: false,
  })
  const [said, setSaid] = useState<string[]>([])
  const [result, setResult] = useState<(RecitationResult & { heard: string[] }) | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const row = said.length

  async function submit(rows: string[]) {
    setBusy(true)
    setErr(null)
    try {
      setResult(await api(`/api/recitation/${code}/voice`, { rows, elapsed_ms: elapsed }))
      qc.invalidateQueries({ queryKey: ['recitation'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function again() {
    setResult(null)
    setSaid([])
    setElapsed(0)
    await refetch()
  }

  function next(text: string, meta: SendMeta) {
    const rows = [...said, text]
    setSaid(rows)
    setElapsed((ms) => ms + meta.elapsed_ms)
    if (rows.length === data!.rows.length) void submit(rows)
  }

  return (
    <Column>
      <PageHeader
        back={{ to: '/recitation?mode=speak', label: 'Back to Pahara' }}
        title={data.title}
        subtitle={`Spoken. Stage ${data.stage + 1}: ${STAGE_NAME[data.stage] ?? data.stage_name}. Row ${Math.min(row + 1, data.rows.length)} of ${data.rows.length}.`}
      />
      {result && (
        <Verdict kind={result.passed ? 'right' : 'wrong'}>
          {result.passed ? 'Clean table.' : `${result.wrong} ${result.wrong === 1 ? 'cell' : 'cells'} to fix.`}
        </Verdict>
      )}
      <ol className="flex flex-col gap-2">
        {data.rows.map((cells, r) => (
          <li
            key={r}
            className={`rounded-xl border bg-white p-3 ${r === row && !result ? 'border-2 border-neutral-900' : 'border-neutral-200'}`}
          >
            <p lang="de">
              <span className="font-bold">{cells[0]}</span>{' '}
              {result
                ? result.cells[r].slice(1).map((c, i) => (
                    <span key={i} className={`mr-2 inline-block ${c.ok ? 'text-ok' : 'font-semibold text-fix underline'}`}>
                      <span aria-label={c.ok ? 'right' : 'wrong'}>{c.ok ? '✓' : '✗'}</span>{' '}
                      {c.ok ? c.expected : `${c.expected} (missed)`}
                    </span>
                  ))
                : cells.slice(1).map((c, i) => <span key={i}>{c ?? '____'} </span>)}
            </p>
            {said[r] !== undefined && (
              <p className="text-sm text-neutral-600" lang="de">
                Heard: {said[r]}
              </p>
            )}
          </li>
        ))}
      </ol>
      {!result && row < data.rows.length && (
        <>
          <p className="text-sm text-neutral-600">Say row {row + 1} of {data.rows.length}.</p>
          <TalkInput key={row} busy={busy} sendLabel="Next row" onSend={next} />
        </>
      )}
      {!result && err && said.length === data.rows.length && (
        <div>
          <Button kind="primary" onClick={() => submit(said)} disabled={busy}>
            Check again
          </Button>
        </div>
      )}
      {result &&
        (result.passed ? (
          <>
            <NextStep next={{ to: '/recitation?mode=speak', label: 'Back to Pahara' }} />
            <div>
              <Button kind="quiet" onClick={again}>
                Practise again
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Button kind="primary" onClick={again}>
              Try again
            </Button>
            <Button kind="quiet" to="/recitation?mode=speak">
              Back to Pahara
            </Button>
          </div>
        ))}
      {err && <p className="text-sm">Error: {err}</p>}
    </Column>
  )
}
