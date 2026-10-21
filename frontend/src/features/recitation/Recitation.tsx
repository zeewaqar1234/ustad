import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { UmlautKeys } from '../../components/UmlautKeys'
import { api } from '../../lib/api'
import { insertAt } from '../../lib/insertAt'
import { STAGE_NAME, type RecitationResult, type RecitationTable } from '../../lib/grammar'

function passLine(r: RecitationResult): string {
  if (r.next_from !== 'tomorrow') return 'Clean.'
  if (r.stage === 0) return 'Clean. Gaps tomorrow.'
  if (r.stage === 1) return 'Clean. Blank table tomorrow.'
  return 'Clean.'
}

export function Recitation() {
  const { code = '' } = useParams()
  const qc = useQueryClient()
  const { data, error, refetch } = useQuery({
    queryKey: ['recitation', code],
    queryFn: () => api<RecitationTable>(`/api/recitation/${code}`),
    refetchOnWindowFocus: false,
  })
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [result, setResult] = useState<RecitationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLInputElement | null>>({})
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = Date.now()
  }, [data?.code])

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>

  const key = (r: number, c: number) => `${r}:${c}`

  async function submit() {
    if (!data) return
    const rows = data.rows.map((row, r) => row.map((cell, c) => (c === 0 ? (cell ?? '') : (typed[key(r, c)] ?? '').trim())))
    setBusy(true)
    setErr(null)
    try {
      const res = await api<RecitationResult>(`/api/recitation/${code}`, {
        rows,
        elapsed_ms: Date.now() - shownAt.current,
      })
      setResult(res)
      qc.invalidateQueries({ queryKey: ['recitation'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function again() {
    setResult(null)
    setTyped({})
    shownAt.current = Date.now()
    await refetch()
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 p-4">
      <header>
        <p className="text-sm text-neutral-600">
          <Link to="/recitation" className="underline">
            Pahara
          </Link>{' '}
          · Stage {data.stage + 1}: {STAGE_NAME[data.stage] ?? data.stage_name}
        </p>
        <h1 className="text-xl font-bold">{data.title}</h1>
        {!result && (
          <p className="text-sm text-neutral-700">
            {data.stage === 0
              ? 'Read each row, then type it.'
              : data.stage === 1
                ? 'Some cells are hidden. Type every cell.'
                : 'Only the first column is shown. Type the rest.'}
          </p>
        )}
      </header>

      {result && (
        <p className="rounded-lg border-2 border-neutral-900 p-3 font-semibold" role="status">
          {result.passed ? passLine(result) : `Not yet. ${result.wrong} ${result.wrong === 1 ? 'cell' : 'cells'} to fix.`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {data.rows.map((row, r) => (
          <section key={r} className="rounded-lg border border-neutral-300 bg-white p-3">
            <p className="font-bold" lang="de">
              {row[0]}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {row.slice(1).map((cell, i) => {
                const c = i + 1
                const k = key(r, c)
                const res = result?.cells[r]?.[c]
                return (
                  <label key={c} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-xs text-neutral-600">
                      <span>{data.columns[c]}</span>
                      {!result && cell !== null && (
                        <span className="text-sm text-neutral-900" lang="de">
                          {cell}
                        </span>
                      )}
                    </span>
                    {res ? (
                      <span className="flex items-baseline gap-2" lang="de">
                        <span className="w-5 shrink-0 font-bold" aria-label={res.ok ? 'right' : 'wrong'}>
                          {res.ok ? '✓' : '✗'}
                        </span>
                        <span className={res.ok ? '' : 'line-through'}>{res.given || '(nothing)'}</span>
                        {!res.ok && <span className="font-semibold">→ {res.expected}</span>}
                      </span>
                    ) : (
                      <input
                        ref={(el) => {
                          refs.current[k] = el
                        }}
                        value={typed[k] ?? ''}
                        onChange={(e) => setTyped((t) => ({ ...t, [k]: e.target.value }))}
                        onFocus={() => setFocus(k)}
                        lang="de"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-label={`${row[0] ?? ''} ${data.columns[c]}`}
                        className="rounded border-2 border-neutral-900 p-2 text-lg"
                      />
                    )}
                  </label>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {err && <p className="text-sm">Error: {err}</p>}

      {result ? (
        <div className="mt-auto flex flex-col gap-2">
          <button onClick={again} className="rounded-lg bg-neutral-900 p-4 text-lg text-white">
            {result.passed ? 'Practise again' : 'Try again'}
          </button>
          <Link to="/recitation" className="rounded-lg border border-neutral-400 p-4 text-center">
            Back to Pahara
          </Link>
        </div>
      ) : (
        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-neutral-300 bg-neutral-50 py-2">
          <UmlautKeys
            onKey={(ch) => {
              if (!focus) return
              const v = insertAt(refs.current[focus] ?? null, typed[focus] ?? '', ch)
              setTyped((t) => ({ ...t, [focus]: v }))
            }}
          />
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-neutral-900 p-4 text-lg text-white disabled:opacity-60"
          >
            Check
          </button>
        </div>
      )}
    </div>
  )
}
