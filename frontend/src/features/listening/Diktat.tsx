import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Diff } from '../../components/Diff'
import { GermanField } from '../../components/GermanField'
import { Button, NextStep, Page, PageHeader, Verdict } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
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

/** A sentence counts as fully right when every word is right. */
function fullyRight(r: DiktatResult): boolean {
  return r.words.every((w) => w.kind === 'ok')
}

export function DiktatResultView({ r }: { r: DiktatResult }) {
  const issues = (Object.entries(r.counts) as [DiktatKind, number][]).filter(([k, n]) => k !== 'ok' && n > 0)
  const toFix = r.words.filter((w) => w.kind !== 'ok').length
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
      {fullyRight(r) ? (
        <Verdict kind="right">Every word right.</Verdict>
      ) : (
        <Verdict kind="wrong">
          {toFix} {toFix === 1 ? 'word' : 'words'} to fix.
        </Verdict>
      )}
      <Diff parts={r.diff} />
      <p className="text-sm" lang="de">
        Correct: {r.expected}
      </p>
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
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-700 underline">Details</summary>
        <p className="mt-2">{Math.round(r.accuracy)}% of words right</p>
        {issues.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {issues.map(([k, n]) => (
              <li key={k} className="rounded-lg border border-neutral-300 px-2 py-0.5">
                {KIND_LABEL[k]} × {n}
              </li>
            ))}
          </ul>
        )}
      </details>
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
  const n = data.sentences.length
  const rightCount = data.sentences.filter((x) => {
    const r = check.data?.ref === x.ref ? check.data : x.result
    return r != null && fullyRight(r)
  }).length
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Diktat"
          subtitle={`${GLOSSARY.Diktat[0].toUpperCase()}${GLOSSARY.Diktat.slice(1)}. Sentence ${i + 1} of ${n} · ${data.done} done today`}
          back={{ to: '/listen', label: 'Back to Hören' }}
        />
        <div className="flex gap-2">
          <Button onClick={() => play(1)}>Play</Button>
          <Button onClick={() => play(0.75)}>Play slow</Button>
        </div>
        {noVoice && <p className="text-sm">No German voice on this device, and no server voice. Diktat needs audio.</p>}
        {result ? (
          <>
            <DiktatResultView r={result} />
            {hasNext && <EnterForNext onNext={next} />}
            {hasNext ? (
              <div>
                <Button kind="primary" onClick={next}>
                  Next
                </Button>
              </div>
            ) : (
              allDone && (
                <NextStep
                  message={
                    <p className="font-semibold">
                      All {n} done for today. {rightCount} of {n} {n === 1 ? 'sentence' : 'sentences'} fully right.
                    </p>
                  }
                />
              )
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
            <div>
              <Button kind="primary" onClick={submit} disabled={!typed.trim() || check.isPending}>
                Check
              </Button>
            </div>
            <p className="text-sm text-neutral-600">Enter checks. Enter again goes to the next sentence.</p>
            {check.isError && <p className="text-sm">{(check.error as Error).message}</p>}
          </>
        )}
      </div>
    </Page>
  )
}
