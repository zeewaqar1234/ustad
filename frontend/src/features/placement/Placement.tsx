import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { GermanField } from '../../components/GermanField'
import { RedPen } from '../../components/RedPen'
import { Column, PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import type { PlacementResult, PlacementTest } from '../../lib/grammar'

function ResultView({ r }: { r: PlacementResult }) {
  return (
    <Column>
      <PageHeader
        title={r.level_band ? `Curriculum start: ${r.level_band} stage` : 'Not placed'}
        subtitle="This is the app's own placement, not an official CEFR result."
      />
      <ul className="grid grid-cols-3 gap-2">
        {Object.entries(r.by_band)
          .filter(([, v]) => v.total > 0)
          .map(([band, v]) => (
            <li key={band} className="rounded-lg border border-neutral-300 bg-white p-2 text-center">
              <span className="font-semibold">{band}:</span> {v.correct}/{v.total}
            </li>
          ))}
      </ul>
      <p>
        {r.items_marked} {r.items_marked === 1 ? 'item' : 'items'} marked as known. They skip teaching and come
        back for a check later.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Writing sample</h2>
        <RedPen grade={r.writing} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xs tracking-wide text-neutral-500 uppercase">Answers</h2>
        <ol className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-300 bg-white text-sm">
          {r.results.map((x, i) => (
            <li key={x.id} className="flex gap-2 p-2" lang="de">
              <span className="w-6 shrink-0 text-neutral-600">{i + 1}.</span>
              <span className="w-5 shrink-0 font-bold" aria-label={x.ok ? 'right' : 'wrong'}>
                {x.ok ? '✓' : '✗'}
              </span>
              <span className="min-w-0 break-words">
                <span className={x.ok ? 'font-semibold' : 'line-through'}>{x.given || '(nothing)'}</span>
                {!x.ok && <span className="font-semibold"> → {x.expected}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <Link to="/" className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white">
        Back to Today
      </Link>
    </Column>
  )
}

export function Placement() {
  const qc = useQueryClient()
  const { data, error } = useQuery({
    queryKey: ['placement'],
    queryFn: () => api<PlacementTest>('/api/placement'),
    refetchOnWindowFocus: false,
  })
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [writing, setWriting] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<PlacementResult | null>(null)

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  if (result) return <ResultView r={result} />

  const total = data.items.length + 1
  if (!started)
    return (
      <Column>
        <PageHeader
          back={{ to: '/settings', label: 'Back to Settings' }}
          title="Placement test"
          subtitle={`${data.items.length} short questions and one writing sample. No timer and no feedback until the end. Skip what you do not know.`}
        />
        {data.last_result && (
          <p className="text-sm text-neutral-700">
            Last result: {data.last_result.level_band ? `${data.last_result.level_band} stage` : 'Not placed'}. Taking it again
            replaces your stage.
          </p>
        )}
        <button onClick={() => setStarted(true)} className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white">
          Start
        </button>
      </Column>
    )

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<PlacementResult>('/api/placement', { answers, writing })
      setResult(r)
      qc.invalidateQueries({ queryKey: ['placement'] })
      qc.invalidateQueries({ queryKey: ['patterns'] })
      qc.invalidateQueries({ queryKey: ['daily'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const item = data.items[step]
  const header = <PageHeader title="Placement test" subtitle={`Question ${step + 1} of ${total}. No timer.`} />

  if (!item)
    return (
      <Column>
        {header}
        <section className="rounded-lg border border-neutral-300 bg-white p-4">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">Writing sample</p>
          <p className="mt-1">{data.writing.prompt_en}</p>
          <p className="mt-1 text-sm text-neutral-600">At least {data.writing.min_sentences} sentences.</p>
        </section>
        <div className="flex flex-col gap-2">
          <GermanField value={writing} onChange={setWriting} label="Writing sample in German" multiline rows={6} disabled={busy} />
          {busy && <p className="text-sm text-neutral-700">Sending to the tutor… This can take a minute.</p>}
          {err && <p className="text-sm">Error: {err}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy || !writing.trim()}
              className="rounded-lg bg-neutral-900 px-5 py-3 text-white disabled:opacity-60"
            >
              Finish test
            </button>
            <button
              onClick={() => setStep(step - 1)}
              disabled={busy || step === 0}
              className="rounded-lg border border-neutral-400 px-5 py-3"
            >
              Previous question
            </button>
          </div>
        </div>
      </Column>
    )

  const value = answers[item.id] ?? ''
  const set = (v: string) => setAnswers((a) => ({ ...a, [item.id]: v }))
  return (
    <Column>
      {header}
      <section className="rounded-lg border border-neutral-300 bg-white p-4">
        <p className="text-xl" lang="de">
          {item.prompt}
        </p>
        {item.hint && <p className="mt-1 text-sm text-neutral-600">{item.hint}</p>}
      </section>
      <div className="flex flex-col gap-2">
        {item.mode === 'choice' ? (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Choices">
            {item.choices.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={value === c}
                onClick={() => set(c)}
                lang="de"
                className={`rounded-lg border-2 border-neutral-900 p-3 text-left text-lg ${value === c ? 'bg-neutral-900 text-white' : 'bg-white hover:bg-neutral-100'}`}
              >
                {value === c && <span className="sr-only">Selected: </span>}
                {c}
              </button>
            ))}
          </div>
        ) : (
          <GermanField key={item.id} value={value} onChange={set} label="Your answer in German" placeholder="Type in German" />
        )}
        <div className="flex gap-2">
          <button onClick={() => setStep(step + 1)} className="rounded-lg bg-neutral-900 px-5 py-3 text-white">
            {value.trim() ? 'Next' : 'Skip'}
          </button>
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="rounded-lg border border-neutral-400 px-5 py-3 disabled:opacity-40"
          >
            Previous question
          </button>
        </div>
      </div>
    </Column>
  )
}
