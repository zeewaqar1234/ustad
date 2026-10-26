import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Column, PageHeader } from '../../components/ui'
import { Feedback } from '../../components/Feedback'
import { ItemCard } from '../../components/ItemCard'
import { UmlautKeys } from '../../components/UmlautKeys'
import { insertAt } from '../../lib/insertAt'
import { api, RATING_LABEL, type AnswerResult, type CardPrompt, type ItemReveal } from '../../lib/api'

type Block = 'manzil' | 'sabqi'

const TITLE: Record<Block, string> = { manzil: 'Manzil', sabqi: 'Sabqi' }
const SUB: Record<Block, string> = { manzil: 'Old revision', sabqi: 'Recent revision' }

export function ReviewSession({ block }: { block: Block }) {
  const qc = useQueryClient()
  const [card, setCard] = useState<CardPrompt | null | undefined>(undefined)
  const [left, setLeft] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [revealed, setRevealed] = useState<ItemReveal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState({ done: 0, right: 0 })
  const shownAt = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  const loadNext = useCallback(async () => {
    setResult(null)
    setRevealed(null)
    setAnswer('')
    try {
      const r = await api<{ card: CardPrompt | null; left: number }>(`/api/review/next?block=${block}`)
      setCard(r.card)
      setLeft(r.left)
      shownAt.current = Date.now()
      if (!r.card) qc.invalidateQueries({ queryKey: ['daily'] })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [block, qc])

  useEffect(() => {
    loadNext()
  }, [loadNext])

  useEffect(() => {
    if (card?.mode === 'type' && !result) input.current?.focus()
  }, [card, result])

  async function submit(payload: { answer?: string; self_rating?: number }) {
    if (!card) return
    try {
      const r = await api<AnswerResult>('/api/review/answer', {
        card_id: card.card_id,
        block,
        elapsed_ms: Date.now() - shownAt.current,
        ...payload,
      })
      setCount((c) => ({ done: c.done + 1, right: c.right + (r.rating >= 3 ? 1 : 0) }))
      if (card.mode === 'reveal') return loadNext()
      setResult(r)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function reveal() {
    if (!card) return
    const r = await api<{ item: ItemReveal }>('/api/review/reveal', { card_id: card.card_id })
    setRevealed(r.item)
  }

  // Keyboard: Enter continues or shows the answer, 1 to 4 rate (or pick a choice).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card || e.metaKey || e.ctrlKey || e.altKey) return
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === 'Enter' && !inField && !(e.target instanceof HTMLButtonElement)) {
        if (result) loadNext()
        else if (card.mode === 'reveal' && !revealed) void reveal()
      } else if (!inField && /^[1-4]$/.test(e.key)) {
        const n = Number(e.key)
        if (card.mode === 'reveal' && revealed) void submit({ self_rating: n })
        else if (card.mode === 'choice' && !result && card.choices?.[n - 1]) {
          setAnswer(card.choices[n - 1])
          void submit({ answer: card.choices[n - 1] })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <p>Error: {error}</p>
  if (card === undefined) return <p>Loading…</p>
  if (card === null)
    return (
      <Column>
        <PageHeader title={`${TITLE[block]} done.`} subtitle={`${count.done} cards, ${count.right} right first time.`} />
        <Link to="/" className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white">
          Back to Today
        </Link>
      </Column>
    )

  return (
    <Column>
      <PageHeader title={TITLE[block]} subtitle={`${SUB[block]}. ${left} left.`} />

      <section className="rounded-lg border border-neutral-300 bg-white p-4">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">{promptLabel(card)}</p>
        <p className="mt-1 text-xl" lang={card.mode === 'type' && card.card_type === 'produce' ? 'en' : 'de'}>
          {card.symbol && card.card_type !== 'gender' && <span className="mr-1.5">{card.symbol}</span>}
          {card.prompt}
        </p>
        {card.hint && <p className="mt-1 text-sm text-neutral-600">{card.hint}</p>}
      </section>

      {result ? (
        <>
          {result.grade && <Feedback grade={result.grade} given={answer} />}
          <ItemCard item={result.item} />
          <button onClick={loadNext} className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white">
            Next
          </button>
          <p className="text-xs text-neutral-600">Enter continues.</p>
        </>
      ) : card.mode === 'type' ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit({ answer })
          }}
        >
          <input
            ref={input}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            lang="de"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Your answer in German"
            placeholder="Type in German"
            className="rounded-lg border-2 border-neutral-900 p-3 text-lg"
          />
          <UmlautKeys onKey={(ch) => setAnswer((v) => insertAt(input.current, v, ch))} />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-neutral-900 px-5 py-3 text-white">
              Check
            </button>
            <button
              type="button"
              onClick={() => submit({ answer: '' })}
              className="rounded-lg border border-neutral-400 px-5 py-3"
            >
              I don't know
            </button>
          </div>
          <p className="text-xs text-neutral-600">Enter checks. After the answer, Enter continues.</p>
        </form>
      ) : card.mode === 'choice' ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {card.choices?.map((c, i) => (
              <button
                key={c}
                onClick={() => {
                  setAnswer(c)
                  submit({ answer: c })
                }}
                className="rounded-lg border-2 border-neutral-900 p-4 text-xl"
              >
                {c} <span className="text-xs text-neutral-600">({i + 1})</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-600">Press 1, 2 or 3 to choose.</p>
        </>
      ) : revealed ? (
        <>
          <ItemCard item={revealed} />
          <p className="text-sm text-neutral-600">How well did you know it?</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((r) => (
              <button
                key={r}
                onClick={() => submit({ self_rating: r })}
                className="rounded-lg border-2 border-neutral-900 px-1 py-3"
              >
                {RATING_LABEL[r]} <span className="text-xs text-neutral-600">({r})</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-600">Press 1 to 4 to rate.</p>
        </>
      ) : (
        <>
          <button onClick={reveal} className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-white">
            Show answer
          </button>
          <p className="text-xs text-neutral-600">Enter shows the answer.</p>
        </>
      )}
    </Column>
  )
}

function promptLabel(card: CardPrompt): string {
  switch (card.card_type) {
    case 'produce':
      return 'Say it in German'
    case 'recog':
      return 'What does it mean?'
    case 'gender':
      return 'der, die or das?'
    case 'cloze':
      return 'Fill the gap'
    case 'fix_sentence':
      return 'Fix this sentence'
    default:
      return card.card_type
  }
}
