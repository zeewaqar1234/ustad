import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { GermanField } from '../../components/GermanField'
import { RedPen } from '../../components/RedPen'
import { api } from '../../lib/api'
import { shortDate, type Homework as Hw, type WritingGrade } from '../../lib/grammar'

function scoreText(g: WritingGrade | null): string {
  if (!g) return 'Not submitted'
  return g.score_10 === null ? 'No score' : `${g.score_10}/10`
}

function Busy() {
  return <p className="text-sm text-neutral-700">Sending to the tutor… This can take a minute.</p>
}

function Today() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['homework', 'today'], queryFn: () => api<Hw>('/api/homework/today') })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>

  async function send(path: string, body: unknown) {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<Hw>(path, body)
      qc.setQueryData(['homework', 'today'], r)
      qc.invalidateQueries({ queryKey: ['homework', 'history'] })
      qc.invalidateQueries({ queryKey: ['mistakes'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const open = !data.grade
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Homework</h1>
      <p className="rounded-lg border border-neutral-300 bg-white p-4">{data.prompt}</p>
      {open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() && !busy) send(`/api/homework/${data.id}/submit`, { text })
          }}
        >
          <GermanField value={text} onChange={setText} label="Your homework in German" placeholder="Schreib hier." multiline disabled={busy} />
          {busy && <Busy />}
          {err && <p className="text-sm">Error: {err}</p>}
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="rounded-lg bg-neutral-900 p-4 text-lg text-white disabled:opacity-60"
          >
            Submit
          </button>
        </form>
      ) : (
        <>
          <RedPen grade={data.grade!} />
          {data.status === 'lt_only' && (
            <>
              {busy && <Busy />}
              {err && <p className="text-sm">Error: {err}</p>}
              <button
                onClick={() => send(`/api/homework/${data.id}/regrade`, {})}
                disabled={busy}
                className="rounded-lg border-2 border-neutral-900 p-4 disabled:opacity-60"
              >
                Grade again with the tutor
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}

function Tagebuch() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<Hw | null>(null)

  async function send() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<Hw>('/api/homework/tagebuch', { text })
      setResult(r)
      qc.invalidateQueries({ queryKey: ['homework', 'history'] })
      qc.invalidateQueries({ queryKey: ['mistakes'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-neutral-300 pt-4">
      <h2 className="text-xl font-bold">Tagebuch</h2>
      <p className="text-sm text-neutral-700">Write about anything. The tutor corrects it.</p>
      {result?.grade ? (
        <>
          <RedPen grade={result.grade} />
          <button
            onClick={() => {
              setResult(null)
              setText('')
            }}
            className="rounded-lg border border-neutral-400 p-4"
          >
            New entry
          </button>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() && !busy) send()
          }}
        >
          <GermanField value={text} onChange={setText} label="Tagebuch entry in German" placeholder="Heute habe ich…" multiline disabled={busy} />
          {busy && <Busy />}
          {err && <p className="text-sm">Error: {err}</p>}
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="rounded-lg bg-neutral-900 p-4 text-lg text-white disabled:opacity-60"
          >
            Correct my entry
          </button>
        </form>
      )}
    </section>
  )
}

function History() {
  const { data } = useQuery({ queryKey: ['homework', 'history'], queryFn: () => api<Hw[]>('/api/homework') })
  const [open, setOpen] = useState<number | null>(null)
  const rows = (data ?? []).filter((h) => h.grade)
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2 border-t border-neutral-300 pt-4">
      <h2 className="text-xl font-bold">History</h2>
      {rows.map((h) => (
        <div key={h.id} className="rounded-lg border border-neutral-300 bg-white">
          <button
            onClick={() => setOpen(open === h.id ? null : h.id)}
            aria-expanded={open === h.id}
            className="flex w-full items-center justify-between gap-2 p-3 text-left"
          >
            <span>
              {shortDate(h.assigned)} · {h.kind === 'tagebuch' ? 'Tagebuch' : 'Homework'}
            </span>
            <span className="font-semibold">
              {scoreText(h.grade)} <span aria-hidden>{open === h.id ? '▴' : '▾'}</span>
            </span>
          </button>
          {open === h.id && h.grade && (
            <div className="p-2 pt-0">
              <RedPen grade={h.grade} />
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

export function Homework() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Today />
      <Tagebuch />
      <History />
    </div>
  )
}
