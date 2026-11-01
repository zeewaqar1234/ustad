import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Button, Column, NextStep, PageHeader } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
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

  const showingResult = result !== null
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Enter' || !showingResult) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return
      void next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  if (data.locked)
    return (
      <Column>
        <PageHeader title="Sabaq" subtitle={`${GLOSSARY.Sabaq}.`} />
        <NextStep message={<p>{data.locked}</p>} />
      </Column>
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
    <Column>
      <PageHeader
        title={data.title}
        subtitle={`Sabaq, ${GLOSSARY.Sabaq}. ${doneCount} of ${data.items.length} done. ${data.scenario}`}
      />

      {result ? (
        <>
          <Feedback grade={result.grade} given={answer} />
          <ItemCard item={result.item} />
          <div>
            <Button kind="primary" onClick={next}>
              {doneCount === data.items.length ? 'Finish' : 'Next'}
            </Button>
          </div>
          <p className="text-xs text-neutral-600">Enter continues.</p>
        </>
      ) : current ? (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm font-semibold text-neutral-600">Try first: say it in German</p>
            <p className="mt-1 text-xl">{current.prompt}</p>
            {current.hint && <p className="mt-1 text-sm text-neutral-600">{current.hint}</p>}
          </section>
          <form
            className="flex flex-col gap-2"
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
              <Button kind="primary" type="submit">
                Check
              </Button>
              <Button onClick={() => submit('')}>I don't know</Button>
            </div>
            <p className="text-xs text-neutral-600">Enter checks. The answer shows after your attempt.</p>
          </form>
        </>
      ) : (
        <NextStep
          message={
            <>
              <p className="font-semibold">Sabaq done. {data.items.length} new items.</p>
              <p className="text-sm text-neutral-700">They come back in Manzil and Sabqi.</p>
            </>
          }
        />
      )}
    </Column>
  )
}
