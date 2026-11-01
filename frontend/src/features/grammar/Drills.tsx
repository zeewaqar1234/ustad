import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Diff } from '../../components/Diff'
import { Button, Column, NextStep, PageHeader, Verdict } from '../../components/ui'
import { buttonClass } from '../../lib/ui'
import { GermanField } from '../../components/GermanField'
import { RedPen } from '../../components/RedPen'
import { UmlautKeys } from '../../components/UmlautKeys'
import { api } from '../../lib/api'
import { insertAt } from '../../lib/insertAt'
import {
  tokenAnswer,
  type Drill,
  type DrillResult,
  type DrillRound,
  type RoundResult,
} from '../../lib/grammar'
import { TokenBuilder } from './TokenBuilder'

const TYPE_LABEL: Record<string, string> = {
  surgery: 'Sentence surgery',
  transform: 'Transform',
  tense_shift: 'Tense shift',
  error_spot: 'Error spot',
  fill: 'Fill the gaps',
  free: 'Your own sentence',
}

/** Fill drill: prompt split on ___ with one small input per gap. Umlaut keys go to the last gap used. */
function Blanks(props: { prompt: string; values: string[]; onChange: (v: string[]) => void }) {
  const parts = props.prompt.split('___')
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const [focus, setFocus] = useState(0)
  function set(i: number, v: string) {
    const next = [...props.values]
    next[i] = v
    props.onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-neutral-200 bg-white p-4 text-xl leading-loose" lang="de">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && (
              <input
                ref={(el) => {
                  refs.current[i] = el
                }}
                value={props.values[i] ?? ''}
                onChange={(e) => set(i, e.target.value)}
                onFocus={() => setFocus(i)}
                lang="de"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={`Gap ${i + 1}`}
                className="mx-1 w-16 rounded border-b-2 border-neutral-900 bg-neutral-100 px-1 text-center"
              />
            )}
          </span>
        ))}
      </p>
      <UmlautKeys onKey={(ch) => set(focus, insertAt(refs.current[focus] ?? null, props.values[focus] ?? '', ch))} />
    </div>
  )
}

function Result({ drill, r, given }: { drill: Drill; r: DrillResult; given: string }) {
  if (drill.type === 'free') {
    return (
      <div className="flex flex-col gap-3">
        <Verdict kind={r.correct ? 'right' : 'wrong'} />
        {r.missing && r.missing.length > 0 && (
          <p className="text-sm">
            Missing: <span lang="de" className="font-semibold">{r.missing.join(', ')}</span>
          </p>
        )}
        {r.grade && <RedPen grade={r.grade} />}
      </div>
    )
  }
  const kind = r.correct ? (r.verdict === 'close' ? 'almost' : 'right') : 'wrong'
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <Verdict kind={kind}>{kind === 'almost' ? 'Small slip below.' : undefined}</Verdict>
      {r.blanks ? (
        <ol className="flex flex-col gap-1 text-sm">
          {r.blanks.map((b, i) => (
            <li key={i} lang="de">
              {i + 1}. <span aria-label={b.ok ? 'right' : 'wrong'}>{b.ok ? '✓' : '✗'}</span>{' '}
              <span className={b.ok ? 'font-semibold text-ok' : 'text-fix line-through'}>{b.given || '(nothing)'}</span>
              {!b.ok && (
                <>
                  {' '}
                  → <span className="font-bold text-ok">{b.expected}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        r.verdict !== 'exact' && (
          <div>
            <p className="text-sm text-neutral-600">Your answer</p>
            <p className="font-mono" lang="de">
              {given || '(nothing)'}
            </p>
          </div>
        )
      )}
      {(r.verdict !== 'exact' || r.blanks) && r.expected && (
        <div>
          <p className="text-sm text-neutral-600">Correct</p>
          <p className="font-mono font-semibold text-ok" lang="de">
            {r.expected}
          </p>
        </div>
      )}
      {given && r.diff && r.diff.length > 0 && r.verdict !== 'exact' && <Diff parts={r.diff} />}
      {r.notes && r.notes.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {r.explain && <p className="text-sm text-neutral-700">{r.explain}</p>}
    </div>
  )
}

export function Drills() {
  const { code = '' } = useParams()
  const qc = useQueryClient()
  const limit = useSearchParams()[0].get('limit')
  const { data, error } = useQuery({
    queryKey: ['drills', code, limit],
    queryFn: () => api<DrillRound>(`/api/drills/${code}${limit ? `?limit=${encodeURIComponent(limit)}` : ''}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const [placed, setPlaced] = useState<number[]>([])
  const [blanks, setBlanks] = useState<string[]>([])
  const [result, setResult] = useState<DrillResult | null>(null)
  const [given, setGiven] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [round, setRound] = useState<RoundResult | null>(null)
  const [limitedDone, setLimitedDone] = useState(false)
  const shownAt = useRef(0)

  const drill = data?.drills[idx]
  useEffect(() => {
    shownAt.current = Date.now()
  }, [drill?.id])

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>

  async function submit(empty = false) {
    if (!drill) return
    const answer = empty ? '' : drill.mode === 'tokens' ? tokenAnswer(drill.tokens, placed) : text
    const answers = empty ? [] : drill.mode === 'blanks' ? blanks.map((b) => b.trim()) : []
    setBusy(true)
    setErr(null)
    try {
      const r = await api<DrillResult>('/api/drills/answer', {
        drill_id: drill.id,
        answer,
        answers,
        elapsed_ms: Date.now() - shownAt.current,
      })
      setGiven(drill.mode === 'blanks' ? answers.join(' / ') : answer)
      setResult(r)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function next() {
    setResult(null)
    setText('')
    setPlaced([])
    setBlanks([])
    setErr(null)
    if (idx + 1 < data!.drills.length) {
      setIdx(idx + 1)
      return
    }
    if (data!.limited) {
      setLimitedDone(true)
      qc.removeQueries({ queryKey: ['drills', code] })
      return
    }
    setBusy(true)
    try {
      const r = await api<RoundResult>(`/api/drills/${code}/finish`, { started: data!.started })
      setRound(r)
      qc.invalidateQueries({ queryKey: ['patterns'] })
      qc.invalidateQueries({ queryKey: ['pattern', code] })
      qc.removeQueries({ queryKey: ['drills', code] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (limitedDone)
    return (
      <Column>
        <PageHeader back={{ to: `/grammar/${code}`, label: 'Back to pattern' }} title={data.title} subtitle="Drills" />
        <NextStep message={<p className="font-semibold">Done. {data.drills.length} answered.</p>} />
      </Column>
    )

  if (round)
    return (
      <Column>
        <PageHeader back={{ to: `/grammar/${code}`, label: 'Back to pattern' }} title={data.title} subtitle="Drills" />
        <NextStep
          message={
            <div className="flex flex-col gap-2">
              <p className="font-semibold">
                {Math.round(round.pct * round.total)} of {round.total} right first time.
              </p>
              {round.newly_done ? (
                <p>Pattern done. Next pattern unlocked.</p>
              ) : (
                !round.done && (
                  <>
                    <p className="text-sm text-neutral-700">Not done yet. Try another round later.</p>
                    <details className="text-sm text-neutral-700">
                      <summary className="cursor-pointer">How a pattern counts as done</summary>
                      <p className="mt-1">80% right first time in one round marks the pattern done.</p>
                    </details>
                  </>
                )
              )}
            </div>
          }
          next={round.newly_done ? { to: '/grammar', label: 'Next pattern' } : { to: '/grammar', label: 'Back to Grammatik' }}
        />
      </Column>
    )

  if (!drill) return <p>No drills for this pattern.</p>
  const isFree = drill.type === 'free'
  const canCheck =
    drill.mode === 'tokens' ? placed.length > 0 : drill.mode === 'blanks' ? blanks.some((b) => b.trim()) : text.trim() !== ''

  return (
    <Column>
      <PageHeader
        back={{ to: `/grammar/${code}`, label: 'Back to pattern' }}
        title={data.title}
        subtitle={`Drills. Question ${idx + 1} of ${data.drills.length}.`}
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-sm font-semibold text-neutral-600">{TYPE_LABEL[drill.type] ?? drill.type}</p>
        <p className="mt-1">{drill.instruction}</p>
        {drill.mode === 'tokens' && <p className="mt-1 text-xl">{drill.prompt}</p>}
        {drill.mode === 'type' && drill.prompt && (
          <p className="mt-1 text-xl" lang="de">
            {drill.prompt}
          </p>
        )}
        {drill.hint && <p className="mt-1 text-sm text-neutral-600">{drill.hint}</p>}
      </section>

      {result ? (
        <>
          <Result drill={drill} r={result} given={given} />
          {err && <p className="text-sm">Error: {err}</p>}
          <button onClick={next} disabled={busy} autoFocus className={`${buttonClass('primary')} self-start`}>
            {idx + 1 < data.drills.length ? 'Next' : busy ? 'Saving…' : 'Finish'}
          </button>
          <p className="text-xs text-neutral-600">Enter continues.</p>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (canCheck && !busy) submit()
          }}
        >
          {drill.mode === 'tokens' && (
            <TokenBuilder tokens={drill.tokens} placed={placed} onChange={setPlaced} disabled={busy} />
          )}
          {drill.mode === 'blanks' && <Blanks prompt={drill.prompt} values={blanks} onChange={setBlanks} />}
          {drill.mode === 'type' && (
            <GermanField
              value={text}
              onChange={setText}
              label="Your answer in German"
              placeholder={isFree ? 'One sentence in German' : 'Type in German'}
              multiline={isFree}
              rows={3}
              disabled={busy}
            />
          )}
          {busy && isFree && <p className="text-sm text-neutral-700">Sending to the tutor…</p>}
          {err && <p className="text-sm">Error: {err}</p>}
          <div className="flex gap-2">
            <Button kind="primary" type="submit" disabled={!canCheck || busy}>
              Check
            </Button>
            {isFree ? (
              <Button disabled={busy} onClick={() => next()}>
                I don't know
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => submit(true)}>
                I don't know
              </Button>
            )}
          </div>
          <p className="text-xs text-neutral-600">
            {drill.mode === 'type' && isFree ? 'Click Check to send your sentence.' : 'Enter checks.'}
          </p>
        </form>
      )}
    </Column>
  )
}
