import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { NextStep, Page, PageHeader, SectionTitle } from '../../components/ui'
import { buttonClass } from '../../lib/ui'
import { marked } from '../../components/marked'
import { api } from '../../lib/api'
import { humanTag } from '../../lib/grammar'
import { speak } from '../../lib/tts'
import type { ReviewLine, ShadowResult, Turn, VoiceSession } from '../../lib/voice'
import { ShadowScore } from './ShadowScore'
import { TalkInput, type SendMeta } from './TalkInput'
import { useVoiceSettings } from './useVoiceSettings'

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-neutral-400 px-3 py-1.5 text-center text-sm text-neutral-700">{children}</p>
}

const btn = `${buttonClass('secondary')} text-sm`

function TutorBubble({ t }: { t: Turn }) {
  const [gloss, setGloss] = useState(false)
  if (t.tutor_status === 'offline') return <Note>Tutor offline. Your turn is saved; the review still works.</Note>
  if (!t.reply_de) return null
  return (
    <div className="animate-fade flex max-w-[85%] flex-col gap-1.5 self-start">
      <div className="rounded-lg border border-neutral-300 bg-white px-4 py-3">
        <p className="text-lg leading-snug" lang="de">
          {t.reply_de}
        </p>
        {gloss && t.reply_en && <p className="mt-1 border-t border-neutral-200 pt-1 text-sm text-neutral-600">{t.reply_en}</p>}
        <div className="mt-2 flex items-center gap-3 text-sm">
          <button onClick={() => speak(t.reply_de ?? '')} className="underline">
            Play
          </button>
          {t.reply_en && (
            <button onClick={() => setGloss((g) => !g)} className="underline">
              {gloss ? 'Hide English' : 'English'}
            </button>
          )}
        </div>
        {t.needs_review && <p className="mt-1 text-sm text-neutral-600">Not confirmed by LanguageTool.</p>}
      </div>
    </div>
  )
}

// No grading during the talk: Zee's bubble shows only what he said. Corrections come in the
// end-of-session review, so the conversation keeps flowing.
function ZeeBubble({ t }: { t: Turn }) {
  return (
    <div className="animate-fade max-w-[85%] self-end rounded-lg border-2 border-neutral-900 bg-white px-4 py-3">
      <p className="text-lg leading-snug" lang="de">
        {t.user}
      </p>
      <p className="mt-1 text-right text-xs text-neutral-600">{t.input_mode === 'text' ? 'typed' : 'spoken'}</p>
    </div>
  )
}

function Grading() {
  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-4" role="status">
      <p className="font-semibold">Ustad is checking your German.</p>
      <p className="text-sm text-neutral-600">All your lines are graded together now. On a local model this can take a minute or two.</p>
    </div>
  )
}

function Typing() {
  return (
    <p className="self-start text-sm text-neutral-600" role="status">
      Ustad is replying
    </p>
  )
}

function BetterLine(props: { sid: number; line: ReviewLine; ltOnly: boolean; showFluency: boolean }) {
  const { sid, line, ltOnly, showFluency } = props
  const [shadow, setShadow] = useState(false)
  const [res, setRes] = useState<ShadowResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const same = line.better === line.said
  async function check(text: string, meta: SendMeta) {
    setErr(null)
    try {
      setRes(await api<ShadowResult>('/api/voice/shadow', { session_id: sid, turn: line.turn, transcript: text, ...meta }))
      return true
    } catch (e) {
      setErr((e as Error).message)
      return false
    }
  }
  return (
    <li className="animate-fade flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">You said</p>
        <p className="text-lg" lang="de">
          {marked(line.said, [...line.errors].sort((a, b) => a.start - b.start))}
        </p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-sm font-semibold text-neutral-700">
          {/* LanguageTool misses many errors, so an LT-only result never says "correct" */}
          {ltOnly
            ? same
              ? 'No LanguageTool flags. The tutor may still find errors.'
              : 'LanguageTool suggestion'
            : !line.graded
              ? 'Not graded: the tutor skipped this line. Review again to retry.'
              : same
                ? 'Correct as said'
                : 'Better'}
        </p>
        <p className="text-lg font-semibold" lang="de">
          {line.better}
        </p>
        {line.needs_review && !ltOnly && <p className="text-sm text-neutral-600">Not confirmed by LanguageTool.</p>}
      </div>
      {line.errors.length > 0 && (
        <ol className="flex list-inside list-decimal flex-col gap-1 text-sm">
          {line.errors.map((e, i) => (
            <li key={i}>
              <span lang="de" className="font-semibold">
                <span className="line-through">{e.span}</span> → {e.fix}
              </span>
              : {e.reason_en} <span className="text-xs text-neutral-600">({humanTag(e.tag)})</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <button onClick={() => speak(line.better)} className={btn}>
          Play
        </button>
        <button onClick={() => setShadow((s) => !s)} className={btn}>
          {shadow ? 'Close' : 'Shadow it'}
        </button>
      </div>
      {shadow && (res ? <ShadowScore r={res} showFluency={showFluency} /> : <TalkInput sendLabel="Check" onSend={check} />)}
      {err && <p className="text-sm font-semibold underline">Error: {err}. Your text is kept; try again.</p>}
    </li>
  )
}

function Review(props: { data: VoiceSession; showFluency: boolean; busy: boolean; retry: () => void }) {
  const { data, showFluency, busy, retry } = props
  const lines = data.review?.lines ?? []
  const ltOnly = data.status === 'lt_only'
  const sum = data.review?.summary
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Say it better</SectionTitle>
      {sum && sum.graded > 0 && !ltOnly && (
        <p className="rounded-lg border border-neutral-300 bg-white p-3 font-semibold">
          {sum.clean} of {sum.graded} {sum.graded === 1 ? 'line' : 'lines'} without errors
          {sum.lines > sum.graded && <span className="font-normal text-neutral-600"> ({sum.lines} spoken)</span>}
        </p>
      )}
      {ltOnly && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-400 p-4 text-sm">
          <p>Tutor offline: LanguageTool check only. Not added to the Ghalti Register yet.</p>
          <button onClick={retry} disabled={busy} className={`self-start ${buttonClass('quiet')}`}>
            Review again
          </button>
        </div>
      )}
      {data.review?.teaching_points.length ? (
        <ul className="flex list-inside list-disc flex-col gap-1 rounded-lg border border-neutral-300 bg-white p-4 text-sm">
          {data.review.teaching_points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {lines.length ? (
        <ol className="flex flex-col gap-3">
          {lines.map((l) => (
            <BetterLine key={l.turn} sid={data.id} line={l} ltOnly={ltOnly} showFluency={showFluency} />
          ))}
        </ol>
      ) : (
        <p>Nothing said in this session.</p>
      )}
      <NextStep message={<p className="font-semibold">Session done.</p>} />
    </section>
  )
}

export function Session() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const settings = useVoiceSettings()
  const key = ['voice', 'session', id]
  const { data, error } = useQuery({ queryKey: key, queryFn: () => api<VoiceSession>(`/api/voice/session/${id}`) })
  const [busy, setBusy] = useState(false)
  const [grading, setGrading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [chunks, setChunks] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const reviewTop = useRef<HTMLDivElement>(null)
  const count = data?.turns.length ?? 0
  const status = data?.status

  // keep the newest message in view inside the messages box; when the review arrives, start at its top
  useEffect(() => {
    if (status && status !== 'open' && !grading) reviewTop.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    else if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [count, busy, status, grading])

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>

  async function send(text: string, meta: SendMeta) {
    setBusy(true)
    setErr(null)
    try {
      const t = await api<Turn>('/api/voice/turn', { session_id: Number(id), text, ...meta })
      qc.setQueryData<VoiceSession>(key, (s) => (s ? { ...s, turns: [...s.turns, t] } : s))
      if (t.reply_de) void speak(t.reply_de)
      return true
    } catch (e) {
      setErr(`${(e as Error).message}. Your text is kept; click Send again.`)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    setGrading(true)
    setErr(null)
    try {
      qc.setQueryData(key, await api<VoiceSession>(`/api/voice/session/${id}/review`, {}))
      qc.invalidateQueries({ queryKey: ['mistakes'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
      setGrading(false)
    }
  }

  const open = data.status === 'open'
  const said = data.turns.some((t) => t.user)

  const subtitle = grading ? 'Checking your German.' : busy && open ? 'Ustad is replying.' : 'Take your time.'
  const messages = (
    <div className="flex flex-col gap-3">
      <Note>Goal: {data.scenario.goal_en}</Note>
      {data.turns.map((t) => (
        <div key={t.idx} className="flex flex-col gap-3">
          {t.user && <ZeeBubble t={t} />}
          <TutorBubble t={t} />
        </div>
      ))}
      {busy && open && !grading && <Typing />}
      {grading && <Grading />}
      {err && <Note>{err}</Note>}
    </div>
  )

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={data.scenario.title}
          subtitle={subtitle}
          back={{ to: '/voice', label: 'Back to Sprechen' }}
          actions={
            <div className="flex shrink-0 gap-2">
              <button onClick={() => setChunks((c) => !c)} aria-expanded={chunks} className={btn}>
                {chunks ? 'Hide useful phrases' : 'Show useful phrases'}
              </button>
              {open && (
                <button onClick={finish} disabled={busy} aria-label={said ? 'End and review' : 'End'} className={btn}>
                  End
                </button>
              )}
            </div>
          }
        />
        {chunks && (
          <ul className="animate-fade flex flex-col gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm" lang="de">
            {data.scenario.chunks.map((c) => (
              <li key={c.de}>
                <button onClick={() => speak(c.de)} className="text-left">
                  <span className="font-semibold">{c.de}</span> <span className="text-neutral-600">{c.en}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && !grading ? (
          <>
            <div ref={scroller} className="max-h-[50vh] min-h-48 overflow-y-auto rounded-lg border border-neutral-300 bg-neutral-50 p-4">
              {messages}
            </div>
            <TalkInput busy={busy} onSend={send} />
          </>
        ) : (
          <>
            {messages}
            <div ref={reviewTop} className="scroll-mt-2" />
            {!open && !grading && <Review data={data} showFluency={settings.show_fluency} busy={busy} retry={finish} />}
          </>
        )}
      </div>
    </Page>
  )
}
