import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { GermanField } from '../../components/GermanField'
import { RedPen } from '../../components/RedPen'
import { Button, Column, NextStep, PageHeader, SectionTitle } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
import { api } from '../../lib/api'
import { useActiveTime } from '../../lib/activeTime'
import { countWords } from '../../lib/words'
import { shortDate, type Homework as Hw, type WritingGrade } from '../../lib/grammar'

function scoreText(g: WritingGrade | null): string {
  if (!g) return 'Not submitted'
  return g.score_10 === null ? 'No score' : `${g.score_10}/10`
}

/** Cmd+Enter or Ctrl+Enter submits from inside a multi-line field. */
function onSubmitKey(submit: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }
}

function WordCount({ text }: { text: string }) {
  const n = countWords(text)
  return (
    <p className="text-sm text-neutral-600">
      {n} {n === 1 ? 'word' : 'words'}. Cmd+Enter submits.
    </p>
  )
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
  const active = useActiveTime()

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>

  /** `id` is null until Zee starts: create today's row first (POST is idempotent), then send. */
  async function send(suffix: 'submit' | 'regrade', body: unknown) {
    setBusy(true)
    setErr(null)
    try {
      let id = data!.id
      if (id === null) id = (await api<Hw>('/api/homework/today', {})).id
      const r = await api<Hw>(`/api/homework/${id}/${suffix}`, body)
      qc.setQueryData(['homework', 'today'], r)
      qc.invalidateQueries({ queryKey: ['homework'] })
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
      <SectionTitle>Homework</SectionTitle>
      <p className="rounded-xl border border-neutral-200 bg-white p-4" style={{ borderLeft: '4px solid var(--color-skill-write)' }}>
        {data.prompt}
      </p>
      {open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() && !busy) void send('submit', { text, elapsed_ms: active.read() })
          }}
          onKeyDown={onSubmitKey(() => {
            if (text.trim() && !busy) void send('submit', { text, elapsed_ms: active.read() })
          })}
        >
          <GermanField value={text} onChange={(v) => {
              active.touch()
              setText(v)
            }} label="Your homework in German" placeholder="Schreib hier." multiline disabled={busy} />
          <WordCount text={text} />
          {busy && <Busy />}
          {err && <p className="text-sm">Error: {err}</p>}
          <div>
            <Button kind="primary" type="submit" disabled={!text.trim() || busy}>
              Submit
            </Button>
          </div>
        </form>
      ) : (
        <>
          <RedPen grade={data.grade!} />
          {data.status === 'lt_only' && (
            <>
              {busy && <Busy />}
              {err && <p className="text-sm">Error: {err}</p>}
              <div>
                <Button onClick={() => send('regrade', {})} disabled={busy}>
                  Grade again with the tutor
                </Button>
              </div>
            </>
          )}
          <NextStep message={<p>Homework done. Your mistakes go to Ghalti and come back as cards.</p>} />
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
  const active = useActiveTime()

  async function send() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<Hw>('/api/homework/tagebuch', { text, elapsed_ms: active.read() })
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
    <section className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
      <SectionTitle hint={`Tagebuch: ${GLOSSARY.Tagebuch}. Write about anything. The tutor corrects it.`}>Tagebuch</SectionTitle>
      {result?.grade ? (
        <>
          <RedPen grade={result.grade} />
          <NextStep message={<p>Entry corrected.</p>} />
          <div>
            <Button
              kind="quiet"
              onClick={() => {
                setResult(null)
                setText('')
              }}
            >
              New entry
            </Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() && !busy) send()
          }}
          onKeyDown={onSubmitKey(() => {
            if (text.trim() && !busy) void send()
          })}
        >
          <GermanField value={text} onChange={(v) => {
            active.touch()
            setText(v)
          }} label="Tagebuch entry in German" placeholder="Heute habe ich…" multiline disabled={busy} />
          <WordCount text={text} />
          {busy && <Busy />}
          {err && <p className="text-sm">Error: {err}</p>}
          <div>
            <Button type="submit" disabled={!text.trim() || busy}>
              Correct my entry
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

function History() {
  const { data } = useQuery({ queryKey: ['homework', 'history'], queryFn: () => api<Hw[]>('/api/homework') })
  const [open, setOpen] = useState<number | null>(null)
  const rows = (data ?? []).filter((h) => h.grade && h.id !== null)
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
      <SectionTitle>History</SectionTitle>
      {rows.map((h) => (
        <div key={h.id} className="rounded-xl border border-neutral-200 bg-white">
          <button
            onClick={() => setOpen(open === h.id ? null : h.id)}
            aria-expanded={open === h.id}
            className="flex w-full items-center justify-between gap-2 p-3 text-left"
          >
            <span>
              {shortDate(h.assigned)} · {h.kind === 'tagebuch' ? 'Tagebuch (diary)' : 'Homework'}
            </span>
            <span className="font-semibold">
              {scoreText(h.grade)}, {open === h.id ? 'Hide' : 'Show'}
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
    <Column>
      <PageHeader title="Schreiben" subtitle="Writing. Homework, diary and past corrections." />
      <Today />
      <Tagebuch />
      <History />
    </Column>
  )
}
