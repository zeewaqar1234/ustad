import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Diff } from '../../components/Diff'
import { GermanField } from '../../components/GermanField'
import { Column, PageHeader } from '../../components/ui'
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
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-4">
      <p className="font-semibold">{Math.round(r.accuracy)}% of words right</p>
      <Diff parts={r.diff} />
      <p className="text-sm" lang="de">
        Correct: {r.expected}
      </p>
      {issues.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-sm">
          {issues.map(([k, n]) => (
            <li key={k} className="rounded-lg border border-neutral-400 px-2 py-0.5">
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

/** Enter moves to the next sentence, unless a button, link or field already has focus. */
function EnterForNext({ onNext }: { onNext: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 'Enter' && !['BUTTON', 'A', 'INPUT', 'TEXTAREA'].includes(el.tagName)) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext])
  return null
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

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  if (data.sentences.length === 0) return <p>No sentences for Diktat yet.</p>

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

  const hasNext = i < data.sentences.length - 1
  const submit = () => {
    if (!typed.trim() || check.isPending) return
    setPos(i) // stay on this sentence: the refetch after Check moves "first open" ahead
    check.mutate(s.ref)
  }
  return (
    <Column>
      <PageHeader
        title="Diktat"
        subtitle={`Sentence ${i + 1} of ${data.sentences.length} · ${data.done} done today`}
        back={{ to: '/listen', label: 'Back to Hören' }}
      />
      <div className="flex gap-2">
        <button onClick={() => play(1)} className="rounded-lg border border-neutral-900 bg-white px-4 py-2 font-semibold">
          Play
        </button>
        <button onClick={() => play(0.75)} className="rounded-lg border border-neutral-300 bg-white px-4 py-2">
          Play slow
        </button>
      </div>
      {noVoice && <p className="text-sm">No German voice on this device, and no server voice. Diktat needs audio.</p>}
      {result ? (
        <>
          <DiktatResultView r={result} />
          {hasNext && <EnterForNext onNext={next} />}
          {hasNext ? (
            <button onClick={next} className="self-start rounded-lg bg-accent px-6 py-2 font-semibold text-white">
              Next
            </button>
          ) : (
            allDone && <p className="font-semibold">All {data.total} done for today.</p>
          )}
        </>
      ) : (
        <>
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          >
            <GermanField value={typed} onChange={setTyped} label="Write what you hear" placeholder="Write what you hear" autoFocus />
          </div>
          <button
            onClick={submit}
            disabled={!typed.trim() || check.isPending}
            className="self-start rounded-lg bg-accent px-6 py-2 font-semibold text-white disabled:opacity-50"
          >
            Check
          </button>
          <p className="text-sm text-neutral-600">Enter checks. Enter again goes to the next sentence.</p>
          {check.isError && <p className="text-sm">{(check.error as Error).message}</p>}
        </>
      )}
    </Column>
  )
}
