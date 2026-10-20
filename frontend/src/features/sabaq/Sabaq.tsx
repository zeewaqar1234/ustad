import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Feedback } from '../../components/Feedback'
import { ItemCard } from '../../components/ItemCard'
import { UmlautKeys } from '../../components/UmlautKeys'
import { insertAt } from '../../lib/insertAt'
import { api, type Grade, type ItemReveal } from '../../lib/api'

interface SabaqItem {
  item_id: number
  prompt: string
  hint: string | null
  done: boolean
  reveal: ItemReveal | null
}
interface SabaqView {
  locked?: string
  lesson_id: number
  title: string
  scenario: string
  status: string
  items: SabaqItem[]
}

export function Sabaq() {
  const qc = useQueryClient()
  const { data, error, refetch } = useQuery({
    queryKey: ['sabaq'],
    queryFn: () => api<SabaqView>('/api/sabaq'),
  })
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ grade: Grade; item: ItemReveal } | null>(null)
  const shownAt = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const current = data?.items?.find((i) => !i.done)

  useEffect(() => {
    shownAt.current = Date.now()
    input.current?.focus()
  }, [current?.item_id])

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  if (data.locked)
    return (
      <div className="flex flex-col gap-4 p-4">
        <p>{data.locked}</p>
        <Link to="/" className="rounded-lg bg-neutral-900 p-4 text-center text-white">
          Back to today
        </Link>
      </div>
    )

  const doneCount = data.items.filter((i) => i.done).length

  async function submit(text: string) {
    if (!current) return
    const r = await api<{ grade: Grade; item: ItemReveal; lesson_done: boolean }>('/api/sabaq/attempt', {
      item_id: current.item_id,
      answer: text,
      elapsed_ms: Date.now() - shownAt.current,
    })
    setResult(r)
    if (r.lesson_done) qc.invalidateQueries({ queryKey: ['daily'] })
  }

  async function next() {
    setResult(null)
    setAnswer('')
    await refetch()
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-4 p-4">
      <header>
        <p className="text-sm text-neutral-600">
          Sabaq · {doneCount}/{data.items.length}
        </p>
        <h1 className="text-xl font-bold">{data.title}</h1>
        <p className="text-sm text-neutral-700">{data.scenario}</p>
      </header>

      {result ? (
        <>
          <Feedback grade={result.grade} given={answer} />
          <ItemCard item={result.item} />
          <div className="mt-auto" />
          <button onClick={next} className="rounded-lg bg-neutral-900 p-4 text-lg text-white">
            {doneCount === data.items.length ? 'Finish' : 'Next'}
          </button>
        </>
      ) : current ? (
        <>
          <section className="rounded-lg border border-neutral-300 bg-white p-4">
            <p className="text-xs tracking-wide text-neutral-500 uppercase">Try first: say it in German</p>
            <p className="mt-1 text-xl">{current.prompt}</p>
            {current.hint && <p className="mt-1 text-sm text-neutral-600">{current.hint}</p>}
          </section>
          <form
            className="mt-auto flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              submit(answer)
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
              placeholder="Your best guess"
              className="rounded-lg border-2 border-neutral-900 p-3 text-lg"
            />
            <UmlautKeys onKey={(ch) => setAnswer((v) => insertAt(input.current, v, ch))} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submit('')}
                className="flex-1 rounded-lg border border-neutral-400 p-4"
              >
                No idea
              </button>
              <button type="submit" className="flex-[2] rounded-lg bg-neutral-900 p-4 text-lg text-white">
                Check
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="font-semibold">Sabaq done. {data.items.length} new items.</p>
          <p className="text-sm text-neutral-700">They come back in Manzil and Sabqi.</p>
          <Link to="/" className="rounded-lg bg-neutral-900 p-4 text-center text-lg text-white">
            Back to today
          </Link>
        </div>
      )}
    </div>
  )
}
