import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../lib/api'
import { STAGE_NAME, type RecitationResult, type RecitationRow, type RecitationTable } from '../../lib/grammar'
import { TalkInput } from './TalkInput'
import { useVoiceSettings } from './useVoiceSettings'

export function VoiceRecitationList() {
  const { data } = useQuery({ queryKey: ['recitation'], queryFn: () => api<RecitationRow[]>('/api/recitation') })
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-sm text-neutral-600">
        <Link to="/voice" className="underline">
          Bolna
        </Link>
      </p>
      <h1 className="text-xl font-bold">Pahara by voice</h1>
      {data?.map((t) => (
        <Link key={t.code} to={`/voice/recite/${t.code}`} className="flex justify-between gap-2 rounded-lg border border-neutral-300 bg-white p-3">
          <span className="font-semibold">{t.title}</span>
          <span className="shrink-0 text-sm">{t.passed_today ? 'Clean today' : STAGE_NAME[t.stage]}</span>
        </Link>
      ))}
    </div>
  )
}

// One row at a time: Zee says the row (the cue word may be said or not), checks the text, next row.
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

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  const row = said.length

  async function submit(rows: string[]) {
    setBusy(true)
    setErr(null)
    try {
      setResult(await api(`/api/recitation/${code}/voice`, { rows }))
      qc.invalidateQueries({ queryKey: ['recitation'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function next(text: string) {
    const rows = [...said, text]
    setSaid(rows)
    if (rows.length === data!.rows.length) void submit(rows)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <header>
        <p className="text-sm text-neutral-600">
          <Link to="/voice/recite" className="underline">
            Pahara by voice
          </Link>{' '}
          · Stage {data.stage + 1}: {STAGE_NAME[data.stage] ?? data.stage_name}
        </p>
        <h1 className="text-xl font-bold">{data.title}</h1>
      </header>
      {result && (
        <p className="rounded-lg border-2 border-neutral-900 p-3 font-semibold" role="status">
          {result.passed ? 'Clean.' : `Not yet. ${result.wrong} ${result.wrong === 1 ? 'cell' : 'cells'} to fix.`}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {data.rows.map((cells, r) => (
          <li key={r} className={`rounded-lg border bg-white p-3 ${r === row && !result ? 'border-2 border-neutral-900' : 'border-neutral-300'}`}>
            <p lang="de">
              <span className="font-bold">{cells[0]}</span>{' '}
              {result
                ? result.cells[r].slice(1).map((c, i) => (
                    <span key={i} className={c.ok ? '' : 'font-semibold underline'}>
                      {c.ok ? c.expected : `${c.expected} (missed)`}{' '}
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
          <p className="text-sm">Say row {row + 1}.</p>
          <TalkInput key={row} mode={settings.talk_mode} busy={busy} sendLabel="Next row" onSend={next} />
        </>
      )}
      {result && (
        <button
          onClick={async () => {
            setResult(null)
            setSaid([])
            await refetch()
          }}
          className="rounded-lg bg-neutral-900 p-3 font-semibold text-white"
        >
          Again
        </button>
      )}
      {err && <p className="text-sm">Error: {err}</p>}
    </div>
  )
}
