import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Diff } from '../../components/Diff'
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
      <p className="rounded-lg border border-neutral-300 bg-white p-4 text-xl leading-loose" lang="de">
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
        <p className="font-semibold" role="status">
          {r.correct ? 'Correct.' : 'Not yet.'}
        </p>
        {r.missing && r.missing.length > 0 && (
          <p className="text-sm">
            Missing: <span lang="de" className="font-semibold">{r.missing.join(', ')}</span>
          </p>
        )}
        {r.grade && <RedPen grade={r.grade} />}
      </div>
    )
  }
  const head = r.correct ? (r.verdict === 'close' ? 'Correct. Small slip below.' : 'Correct.') : 'Not yet.'
  return (
    <div className="rounded-lg border-2 border-neutral-900 bg-white p-4" role="status">
      <p className="font-semibold">{head}</p>
      {r.blanks ? (
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {r.blanks.map((b, i) => (
            <li key={i} lang="de">
              {i + 1}. <span aria-label={b.ok ? 'right' : 'wrong'}>{b.ok ? '✓' : '✗'}</span>{' '}
              <span className={b.ok ? 'font-semibold' : 'line-through'}>{b.given || '(nothing)'}</span>
              {!b.ok && (
                <>
                  {' '}
                  → <span className="font-semibold">{b.expected}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        r.verdict !== 'exact' && (
          <>
            <p className="mt-2 text-sm text-neutral-600">You wrote</p>
            <p className="font-mono" lang="de">
              {given || '(nothing)'}
            </p>
          </>
        )
      )}
      {(r.verdict !== 'exact' || r.blanks) && r.expected && (
        <>
          <p className="mt-2 text-sm text-neutral-600">Correct</p>
          <p className="font-mono font-semibold" lang="de">
            {r.expected}
          </p>
        </>
      )}
      {given && r.diff && r.diff.length > 0 && r.verdict !== 'exact' && (
        <div className="mt-2">
          <Diff parts={r.diff} />
        </div>
      )}
      {r.notes && r.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {r.explain && <p className="mt-2 text-sm text-neutral-700">{r.explain}</p>}
    </div>
  )
}

export function Drills() {
  const { code = '' } = useParams()
  const qc = useQueryClient()
  const { data, error } = useQuery({
    queryKey: ['drills', code],
    queryFn: () => api<DrillRound>(`/api/drills/${code}`),
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
  const shownAt = useRef(0)

  const drill = data?.drills[idx]
  useEffect(() => {
    shownAt.current = Date.now()
  }, [drill?.id])

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>

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

  if (round)
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">{data.title}</h1>
        <p className="text-lg">
          {Math.round(round.pct * round.total)} of {round.total} right first time.
        </p>
        {round.newly_done ? (
          <p className="rounded-lg border-2 border-neutral-900 p-3 font-semibold">Pattern done. Next pattern unlocked.</p>
        ) : (
          !round.done && <p className="text-sm text-neutral-700">80% right first time marks the pattern done. Try another round later.</p>
        )}
        <Link to="/grammar" className="rounded-lg bg-neutral-900 p-4 text-center text-lg text-white">
          Back to grammar
        </Link>
        <Link to="/" className="rounded-lg border border-neutral-400 p-4 text-center">
          Back to today
        </Link>
      </div>
    )

  if (!drill) return <p className="p-4">No drills for this pattern.</p>
  const isFree = drill.type === 'free'
  const canCheck =
    drill.mode === 'tokens' ? placed.length > 0 : drill.mode === 'blanks' ? blanks.some((b) => b.trim()) : text.trim() !== ''

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="min-w-0 truncate text-lg font-bold">{data.title}</h1>
        <span className="shrink-0 text-sm text-neutral-600">
          {idx + 1} / {data.drills.length}
        </span>
      </header>

      <section className="rounded-lg border border-neutral-300 bg-white p-4">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">{TYPE_LABEL[drill.type] ?? drill.type}</p>
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
          <div className="mt-auto" />
          <button onClick={next} disabled={busy} className="rounded-lg bg-neutral-900 p-4 text-lg text-white disabled:opacity-60">
            {idx + 1 < data.drills.length ? 'Next' : busy ? 'Saving…' : 'Finish round'}
          </button>
        </>
      ) : (
        <form
          className="mt-auto flex flex-col gap-2"
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
            {isFree ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => next()}
                className="flex-1 rounded-lg border border-neutral-400 p-4"
              >
                Skip
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => submit(true)}
                className="flex-1 rounded-lg border border-neutral-400 p-4"
              >
                I don't know
              </button>
            )}
            <button
              type="submit"
              disabled={!canCheck || busy}
              className="flex-[2] rounded-lg bg-neutral-900 p-4 text-lg text-white disabled:opacity-60"
            >
              Check
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
