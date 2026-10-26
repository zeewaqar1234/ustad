import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Diff } from '../../components/Diff'
import { GermanField } from '../../components/GermanField'
import { api } from '../../lib/api'
import type { DiktatKind, DiktatResult, DiktatToday } from '../../lib/reading'
import { speak } from '../../lib/tts'

const KIND_LABEL: Record<DiktatKind, string> = {
  ok: 'right',
  umlaut: 'umlaut',
  capital: 'capital letter',
  ending: 'ending',
  spelling: 'spelling',
  missing: 'missing',
  extra: 'extra',
}

export function DiktatResultView({ r }: { r: DiktatResult }) {
  const issues = (Object.entries(r.counts) as [DiktatKind, number][]).filter(([k, n]) => k !== 'ok' && n > 0)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
      <p className="font-semibold">{Math.round(r.accuracy)}% of words right</p>
      <Diff parts={r.diff} />
      <p className="text-sm" lang="de">
        Correct: {r.expected}
      </p>
      {issues.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-sm">
          {issues.map(([k, n]) => (
            <li key={k} className="rounded-full border border-neutral-400 px-2 py-0.5">
              {KIND_LABEL[k]} × {n}
            </li>
          ))}
        </ul>
      )}
      <ul className="flex flex-col gap-1 text-sm" aria-label="Word by word">
        {r.words
          .filter((w) => w.kind !== 'ok')
          .map((w, i) => (
            <li key={i} lang="de">
              <span className="text-neutral-600">{KIND_LABEL[w.kind]}:</span>{' '}
              {w.given ? <del>{w.given}</del> : null}
              {w.given && w.expected ? ' → ' : null}
              {w.expected ? <strong>{w.expected}</strong> : null}
            </li>
          ))}
      </ul>
    </div>
  )
}

export function Diktat() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const [pos, setPos] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [noVoice, setNoVoice] = useState(false)
  const replays = useRef(0)
  const startedAt = useRef<number | null>(null)

  const check = useMutation({
    mutationFn: (ref: string) =>
      api<DiktatResult>('/api/dictation/check', {
        ref,
        typed,
        replays: replays.current,
        elapsed_ms: startedAt.current == null ? 0 : Date.now() - startedAt.current,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dictation'] }),
  })

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  if (data.sentences.length === 0) return <p className="p-4">No sentences for Diktat yet.</p>

  const firstOpen = data.sentences.findIndex((s) => !s.done)
  const i = pos ?? (firstOpen === -1 ? data.sentences.length - 1 : firstOpen)
  const s = data.sentences[i]
  const result = check.data?.ref === s.ref ? check.data : s.result
  const allDone = data.sentences.every((x) => x.done)

  const play = async (rate: number) => {
    if (startedAt.current == null) startedAt.current = Date.now()
    replays.current += 1
    setNoVoice((await speak(s.say, rate)) === 'none')
  }
  const next = () => {
    setPos(Math.min(i + 1, data.sentences.length - 1))
    setTyped('')
    replays.current = 0
    startedAt.current = null
    check.reset()
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link to="/listen" className="text-sm">
        ‹ Hören
      </Link>
      <h1 className="text-xl font-bold">Diktat</h1>
      <p className="text-sm text-neutral-700">
        Sentence {i + 1} of {data.sentences.length} · {data.done} done today
      </p>
      <div className="flex gap-2">
        <button onClick={() => play(1)} className="flex-1 rounded-lg bg-neutral-900 px-4 py-3 font-semibold text-white">
          ▶ Play
        </button>
        <button onClick={() => play(0.75)} className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-3">
          ▶ Slow
        </button>
      </div>
      {noVoice && <p className="text-sm">No German voice on this device, and no server voice. Diktat needs audio.</p>}
      {result ? (
        <>
          <DiktatResultView r={result} />
          {i < data.sentences.length - 1 ? (
            <button onClick={next} className="rounded-lg bg-neutral-900 px-4 py-3 font-semibold text-white">
              Next
            </button>
          ) : (
            allDone && <p className="font-semibold">All {data.total} done for today.</p>
          )}
        </>
      ) : (
        <>
          <GermanField value={typed} onChange={setTyped} label="Write what you hear" placeholder="Write what you hear" />
          <button
            onClick={() => {
              setPos(i) // stay on this sentence: the refetch after Check moves "first open" ahead
              check.mutate(s.ref)
            }}
            disabled={!typed.trim() || check.isPending}
            className="rounded-lg bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            Check
          </button>
          {check.isError && <p className="text-sm">{(check.error as Error).message}</p>}
        </>
      )}
    </div>
  )
}
