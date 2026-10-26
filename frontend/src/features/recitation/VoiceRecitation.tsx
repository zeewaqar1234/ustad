import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Column, PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import { STAGE_NAME, type RecitationResult, type RecitationTable } from '../../lib/grammar'
import { TalkInput, type SendMeta } from '../voice/TalkInput'
import { useVoiceSettings } from '../voice/useVoiceSettings'

// One row at a time: Zee says the row (the cue word may be said or not), checks the text, next row.
// No timer, no auto turn-end: only Send ends a row.
export function VoiceRecitation() {
  const { code = '' } = useParams()
  const qc = useQueryClient()
  const settings = useVoiceSettings()
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
        <p className="rounded-lg border-2 border-neutral-900 p-3 font-semibold" role="status">
          {result.passed ? 'Clean.' : `Not yet. ${result.wrong} ${result.wrong === 1 ? 'cell' : 'cells'} to fix.`}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {data.rows.map((cells, r) => (
          <li
            key={r}
            className={`rounded-lg border bg-white p-3 ${r === row && !result ? 'border-2 border-neutral-900' : 'border-neutral-300'}`}
          >
            <p lang="de">
              <span className="font-bold">{cells[0]}</span>{' '}
              {result
                ? result.cells[r].slice(1).map((c, i) => (
                    <span key={i} className={`mr-2 inline-block ${c.ok ? '' : 'font-semibold underline'}`}>
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
          <TalkInput key={row} mode={settings.talk_mode} busy={busy} sendLabel="Next row" onSend={next} />
        </>
      )}
      {!result && err && said.length === data.rows.length && (
        <button
          onClick={() => submit(said)}
          disabled={busy}
          className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white disabled:opacity-60"
        >
          Check again
        </button>
      )}
      {result && (
        <button
          onClick={async () => {
            setResult(null)
            setSaid([])
            setElapsed(0)
            await refetch()
          }}
          className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white"
        >
          Again
        </button>
      )}
      {err && <p className="text-sm">Error: {err}</p>}
    </Column>
  )
}
