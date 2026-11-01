import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Button, NextStep, Page, PageHeader, SectionTitle, Verdict } from '../../components/ui'
import { buttonClass } from '../../lib/ui'
import { api } from '../../lib/api'
import { type AnswerResult, ARTICLE, type Gloss, type Question, type TextDetail, tokens } from '../../lib/reading'
import { speak, stopSpeaking } from '../../lib/tts'
import { DensityMeter } from './ReaderList'

function Toggle(props: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={() => props.onChange(!props.on)}
      className={`rounded-lg border px-3 py-1.5 text-sm ${props.on ? 'border-neutral-900 bg-neutral-100 font-semibold underline underline-offset-2' : 'border-neutral-300 bg-white'}`}
    >
      {props.label}
    </button>
  )
}

function GlossPanel(props: { textId: number; word: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [meaning, setMeaning] = useState('')
  const g = useQuery({
    queryKey: ['gloss', props.textId, props.word],
    queryFn: () => api<Gloss>(`/api/texts/gloss?word=${encodeURIComponent(props.word)}&text_id=${props.textId}`),
  })
  const add = useMutation({
    mutationFn: (gl: Gloss) =>
      api<{ item_id: number; added: boolean }>(`/api/texts/${props.textId}/add`, {
        word: props.word,
        lemma: gl.lemma,
        en: gl.en ?? meaning.trim(),
        gender: gl.gender,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gloss', props.textId, props.word] }),
  })
  const gl = g.data
  const { onClose } = props
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <aside
      role="dialog"
      aria-label={`Meaning of ${props.word}`}
      className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-3 self-start overflow-y-auto rounded-lg border-2 border-neutral-900 bg-white p-4"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {!gl && !g.isError && <p>Looking up {props.word}…</p>}
          {g.isError && <p>{(g.error as Error).message}</p>}
          {gl && (
            <>
              <p className="text-xl font-bold" lang="de">
                {gl.gender ? `${ARTICLE[gl.gender]} ` : ''}
                {gl.lemma}
              </p>
              {!gl.gender && gl.gender_guess && (
                <p className="text-sm text-neutral-700">
                  Probably <span lang="de">{ARTICLE[gl.gender_guess]}</span> (a guess from the sentence; check it)
                </p>
              )}
              {gl.plural && (
                <p className="text-sm text-neutral-700" lang="de">
                  Plural: {gl.plural}
                </p>
              )}
              <p className="mt-1">{gl.en ?? 'No meaning stored for this word.'}</p>
            </>
          )}
        </div>
        <Button onClick={props.onClose}>Close</Button>
      </div>
      {gl && (
        <div className="flex flex-col gap-2">
          {gl.in_srs || add.data ? (
            <p className="text-sm">{add.data && add.data.added ? 'Added to your cards.' : 'Already in your cards.'}</p>
          ) : (
            <>
              {gl.en == null && (
                <input
                  value={meaning}
                  onChange={(e) => setMeaning(e.target.value)}
                  aria-label="Meaning in English"
                  placeholder="Type the meaning in English"
                  className="w-full rounded-lg border-2 border-neutral-900 p-2"
                />
              )}
              <Button onClick={() => add.mutate(gl)} disabled={add.isPending || (gl.en == null && !meaning.trim())}>
                Add to my cards
              </Button>
              {add.isError && <p className="text-sm">{(add.error as Error).message}</p>}
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function QuestionView(props: {
  q: Question
  given: number[]
  onChange: (v: number[]) => void
  result?: AnswerResult['results'][number]
}) {
  const { q, given, result } = props
  const locked = !!result
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
      <p className="font-semibold" lang="de">
        {q.prompt}
      </p>
      {q.kind === 'match' ? (
        q.left.map((l, i) => (
          <label key={i} className="flex flex-col gap-1 text-sm" lang="de">
            {l}
            <select
              value={given[i] ?? ''}
              disabled={locked}
              aria-label={l}
              onChange={(e) => {
                const next = [...given]
                next[i] = Number(e.target.value)
                props.onChange(next)
              }}
              className="rounded border border-neutral-400 bg-white p-2 text-base"
            >
              <option value="" disabled>
                Choose
              </option>
              {q.options.map((o, j) => (
                <option key={j} value={j}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))
      ) : (
        <div className={`flex gap-2 ${q.kind === 'mc' ? 'flex-col' : ''}`}>
          {q.options.map((o, j) => (
            <button
              key={j}
              type="button"
              disabled={locked}
              aria-pressed={given[0] === j}
              onClick={() => props.onChange([j])}
              className={`flex-1 rounded-lg border px-3 py-2 text-left ${given[0] === j ? 'border-2 border-neutral-900 bg-neutral-100 font-semibold' : 'border-neutral-300 bg-white'}`}
              lang="de"
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {result && (
        <div className="text-sm" data-testid={`answer-${q.id}`}>
          {result.correct ? (
            <Verdict kind="right" />
          ) : (
            <Verdict kind="wrong">
              <span lang="de">
                Answer:{' '}
                {q.kind === 'match'
                  ? q.left.map((l, i) => `${l} → ${q.options[result.answer[i]]}`).join('; ')
                  : q.options[result.answer[0]]}
              </span>
            </Verdict>
          )}
        </div>
      )}
    </div>
  )
}

export function Reader() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['text', id], queryFn: () => api<TextDetail>(`/api/texts/${id}`) })
  const [interlinear, setInterlinear] = useState(false)
  const [showText, setShowText] = useState(true)
  const [rate, setRate] = useState(1)
  const [shownEn, setShownEn] = useState<Set<number>>(new Set())
  const [word, setWord] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [noVoice, setNoVoice] = useState(false)
  const [openedAt] = useState(() => Date.now())

  const closeGloss = useCallback(() => setWord(null), [])

  const check = useMutation({
    mutationFn: () =>
      api<AnswerResult>(`/api/texts/${id}/answers`, { answers, elapsed_ms: Date.now() - openedAt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['texts'] }),
  })
  const markRead = useMutation({
    mutationFn: () => api(`/api/texts/${id}/read`, { elapsed_ms: Date.now() - openedAt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['texts'] }),
  })

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>

  const result = check.data ?? data.result
  const rightCount = result ? result.results.filter((r) => r.correct).length : 0
  const allAnswered = data.questions.every((q) => {
    const a = answers[q.id] ?? []
    return q.kind === 'match' ? q.left.every((_, i) => a[i] != null) : a.length === 1
  })

  const say = async (text: string) => {
    const how = await speak(text, rate)
    setNoVoice(how === 'none')
  }
  const toggleEn = (i: number) =>
    setShownEn((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  return (
    <Page wide>
      <div className={`grid w-full justify-center gap-8 ${word ? 'grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-[minmax(0,720px)]'}`}>
        <div className="flex min-w-0 flex-col gap-4">
          <PageHeader
            title={data.title}
            subtitle={`${data.level} · ${data.density.words} words`}
            back={{ to: '/read', label: 'Back to Lesen' }}
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-700 underline">Details</summary>
            <div className="mt-2">
              <DensityMeter pct={data.density.known_pct} unknown={data.density.unknown.length} />
            </div>
          </details>

          {data.status === 'needs_review' && (
            <div className="rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm">
              <p className="font-semibold">Needs check: the grammar check flagged this text. Read with care.</p>
              <ul className="mt-1 list-disc pl-5">
                {data.review_notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="flex flex-wrap items-center gap-2" aria-label="Reading options">
            <Toggle label="Text" on={showText} onChange={setShowText} />
            <Toggle label="English under" on={interlinear} onChange={setInterlinear} />
            <div className="flex overflow-hidden rounded-lg border border-neutral-300" role="group" aria-label="Speed">
              {[0.75, 1].map((r) => (
                <button
                  key={r}
                  aria-pressed={rate === r}
                  onClick={() => setRate(r)}
                  className={`px-3 py-1.5 text-sm ${rate === r ? 'bg-neutral-100 font-semibold underline underline-offset-2' : 'bg-white'}`}
                >
                  {r}×
                </button>
              ))}
            </div>
            <Button onClick={() => say(data.sentences.map((s) => s.de).join(' '))}>Listen to all</Button>
            <Button onClick={stopSpeaking}>Stop</Button>
          </section>
          {noVoice && <p className="text-sm">No German voice on this device. Read the text instead.</p>}
          {!showText && <p className="text-sm text-neutral-700">Text hidden. Listen, then answer below.</p>}

          <article className="flex flex-col gap-3 text-lg leading-relaxed">
            {data.sentences.map((s, i) => (
              <div key={i} className="group flex items-start gap-3">
                <button
                  onClick={() => say(s.de)}
                  aria-label={`Play sentence ${i + 1}`}
                  className={`mt-1 shrink-0 text-sm ${buttonClass('quiet')}`}
                >
                  Play {i + 1}
                </button>
                {showText && (
                  <div className="min-w-0 flex-1">
                    <p lang="de">
                      {tokens(s.de).map((t, j) =>
                        t.word ? (
                          <button
                            key={j}
                            type="button"
                            onClick={() => setWord(t.text)}
                            className="rounded hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-neutral-900"
                          >
                            {t.text}
                          </button>
                        ) : (
                          <span key={j}>{t.text}</span>
                        ),
                      )}
                      <button
                        type="button"
                        onClick={() => toggleEn(i)}
                        aria-label={`Translate sentence ${i + 1}`}
                        aria-pressed={shownEn.has(i)}
                        className="ml-2 rounded border border-neutral-300 bg-white px-1.5 align-middle text-xs text-neutral-700 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                      >
                        EN
                      </button>
                    </p>
                    {(interlinear || shownEn.has(i)) && <p className="text-base text-neutral-600">{s.en}</p>}
                  </div>
                )}
              </div>
            ))}
          </article>

          <p className="text-xs text-neutral-600">
            {data.credit} · {data.licence}
            {data.source_url && (
              <>
                {' · '}
                <a href={data.source_url} target="_blank" rel="noreferrer" className="underline">
                  Source (opens site)
                </a>
              </>
            )}
          </p>

          {data.questions.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle>Questions</SectionTitle>
              {data.questions.map((q) => (
                <QuestionView
                  key={q.id}
                  q={q}
                  given={result?.results.find((r) => r.id === q.id)?.given ?? answers[q.id] ?? []}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                  result={result?.results.find((r) => r.id === q.id)}
                />
              ))}
              {result ? (
                <NextStep
                  message={
                    <p className="font-semibold">
                      {rightCount} of {result.results.length} {result.results.length === 1 ? 'question' : 'questions'} right.
                    </p>
                  }
                />
              ) : (
                <div>
                  <Button kind="primary" onClick={() => check.mutate()} disabled={!allAnswered || check.isPending}>
                    Check
                  </Button>
                </div>
              )}
              {check.isError && <p className="text-sm">{(check.error as Error).message}</p>}
            </section>
          )}
          {data.questions.length === 0 &&
            (markRead.isSuccess ? (
              <NextStep message={<p className="font-semibold">Marked as read.</p>} />
            ) : (
              <div>
                <Button kind="primary" onClick={() => markRead.mutate()} disabled={markRead.isPending}>
                  Mark as read
                </Button>
              </div>
            ))}
          {markRead.isError && <p className="text-sm">{(markRead.error as Error).message}</p>}
        </div>

        {word && <GlossPanel key={word} textId={data.id} word={word} onClose={closeGloss} />}
      </div>
    </Page>
  )
}
