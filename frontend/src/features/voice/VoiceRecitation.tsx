import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../lib/api'
import { STAGE_NAME, type RecitationResult, type RecitationRow, type RecitationTable } from '../../lib/grammar'
import { TalkInput, type SendMeta } from './TalkInput'
import { Icon } from './ui'
import { useVoiceSettings } from './useVoiceSettings'

export function VoiceRecitationList() {
  const { data } = useQuery({ queryKey: ['recitation'], queryFn: () => api<RecitationRow[]>('/api/recitation') })
  return (
    <div className="flex flex-col gap-2 p-4">
      <Link to="/voice" className="flex items-center gap-1 text-sm text-neutral-600">
        <Icon name="back" className="size-4" />
        Bolna
      </Link>
      <h1 className="text-2xl font-bold">Pahara by voice</h1>
      {data?.map((t) => (
        <Link key={t.code} to={`/voice/recite/${t.code}`} className="flex items-center justify-between gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200 active:scale-[0.98]">
          <span className="font-semibold">{t.title}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${t.passed_today ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {t.passed_today ? '✓ Clean today' : STAGE_NAME[t.stage]}
          </span>
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
  const [elapsed, setElapsed] = useState(0)

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
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
    <div className="flex flex-col gap-3 p-4">
      <header>
        <Link to="/voice/recite" className="flex items-center gap-1 text-sm text-neutral-600">
          <Icon name="back" className="size-4" />
          Pahara by voice · Stage {data.stage + 1}: {STAGE_NAME[data.stage] ?? data.stage_name}
        </Link>
        <h1 className="text-2xl font-bold">{data.title}</h1>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {data.rows.map((_, k) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full ${k < row ? 'bg-emerald-500' : k === row && !result ? 'bg-emerald-200' : 'bg-neutral-200'}`} />
          ))}
        </div>
      </header>
      {result && (
        <p
          className={`motion-safe:animate-pop rounded-3xl p-4 text-center text-lg font-bold ${result.passed ? 'bg-emerald-600 text-white' : 'bg-rose-50 text-rose-900 ring-1 ring-rose-200'}`}
          role="status"
        >
          {result.passed ? 'Clean.' : `Not yet. ${result.wrong} ${result.wrong === 1 ? 'cell' : 'cells'} to fix.`}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {data.rows.map((cells, r) => (
          <li
            key={r}
            className={`rounded-3xl bg-white p-3 shadow-sm ring-1 transition ${r === row && !result ? 'ring-2 ring-emerald-500' : 'ring-neutral-200'}`}
          >
            <p lang="de">
              <span className="font-bold">{cells[0]}</span>{' '}
              {result
                ? result.cells[r].slice(1).map((c, i) => (
                    <span
                      key={i}
                      className={`mr-1 inline-block rounded-full px-2 py-0.5 ${c.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 font-semibold text-rose-900'}`}
                    >
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
          <p className="text-center text-sm text-neutral-600">Say row {row + 1} of {data.rows.length}.</p>
          <TalkInput key={row} mode={settings.talk_mode} busy={busy} sendLabel="Next row" onSend={next} />
        </>
      )}
      {!result && err && said.length === data.rows.length && (
        <button onClick={() => submit(said)} disabled={busy} className="rounded-full bg-emerald-600 p-3 font-semibold text-white shadow-md shadow-emerald-600/30 active:scale-95">
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
          className="rounded-full bg-emerald-600 p-3 font-semibold text-white shadow-md shadow-emerald-600/30 active:scale-95"
        >
          Again
        </button>
      )}
      {err && <p className="text-sm">Error: {err}</p>}
    </div>
  )
}
