import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
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

  if (error) return <p className="p-4">Error: {error}</p>
  if (card === undefined) return <p className="p-4">Loading…</p>
  if (card === null)
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">{TITLE[block]} done.</h1>
        <p>
          {count.done} cards, {count.right} right first time.
        </p>
        <Link to="/" className="rounded-lg bg-neutral-900 p-4 text-center text-lg text-white">
          Back to today
        </Link>
      </div>
    )

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">
          {TITLE[block]} <span className="text-sm font-normal text-neutral-600">{SUB[block]}</span>
        </h1>
        <span className="text-sm text-neutral-600">{left} left</span>
      </header>

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
          <div className="mt-auto" />
          <button onClick={loadNext} className="rounded-lg bg-neutral-900 p-4 text-lg text-white">
            Next
          </button>
        </>
      ) : card.mode === 'type' ? (
        <form
          className="mt-auto flex flex-col gap-2"
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
            <button
              type="button"
              onClick={() => submit({ answer: '' })}
              className="flex-1 rounded-lg border border-neutral-400 p-4"
            >
              I don't know
            </button>
            <button type="submit" className="flex-[2] rounded-lg bg-neutral-900 p-4 text-lg text-white">
              Check
            </button>
          </div>
        </form>
      ) : card.mode === 'choice' ? (
        <div className="mt-auto grid grid-cols-3 gap-2">
          {card.choices?.map((c) => (
            <button
              key={c}
              onClick={() => {
                setAnswer(c)
                submit({ answer: c })
              }}
              className="rounded-lg border-2 border-neutral-900 p-5 text-xl"
            >
              {c}
            </button>
          ))}
        </div>
      ) : revealed ? (
        <>
          <ItemCard item={revealed} />
          <p className="mt-auto text-sm text-neutral-600">How well did you know it?</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((r) => (
              <button
                key={r}
                onClick={() => submit({ self_rating: r })}
                className="rounded-lg border-2 border-neutral-900 px-1 py-4"
              >
                {RATING_LABEL[r]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button onClick={reveal} className="mt-auto rounded-lg bg-neutral-900 p-4 text-lg text-white">
          Show answer
        </button>
      )}
    </div>
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
