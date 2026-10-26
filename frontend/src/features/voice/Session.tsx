import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { marked } from '../../components/marked'
import { api } from '../../lib/api'
import { humanTag } from '../../lib/grammar'
import { speak } from '../../lib/tts'
import { SCENARIO_ICON, type ReviewLine, type ShadowResult, type Turn, type VoiceSession } from '../../lib/voice'
import { ShadowScore } from './ShadowScore'
import { TalkInput, type SendMeta } from './TalkInput'
import { Icon, StarRow } from './ui'
import { useVoiceSettings } from './useVoiceSettings'

function Avatar({ code }: { code: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow-sm">
      <span aria-hidden="true">{SCENARIO_ICON[code] ?? '🎓'}</span>
    </span>
  )
}

function SystemPill({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto max-w-[85%] rounded-2xl bg-white/80 px-3 py-1.5 text-center text-xs text-neutral-600 shadow-sm ring-1 ring-neutral-200">
      {children}
    </p>
  )
}

function TutorBubble({ t }: { t: Turn }) {
  const [gloss, setGloss] = useState(false)
  if (t.tutor_status === 'offline') return <SystemPill>Tutor offline. Your turn is saved; the review still works.</SystemPill>
  if (!t.reply_de) return null
  return (
    <div className="motion-safe:animate-rise flex max-w-[85%] flex-col gap-1.5 self-start">
      <div className="rounded-3xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-200">
        <p className="text-lg leading-snug" lang="de">
          {t.reply_de}
        </p>
        {gloss && t.reply_en && <p className="mt-1 border-t border-neutral-100 pt-1 text-sm text-neutral-500">{t.reply_en}</p>}
        <div className="mt-2 flex items-center gap-3 text-sm text-emerald-700">
          <button onClick={() => speak(t.reply_de ?? '')} aria-label="Play" className="flex items-center gap-1 active:scale-95">
            <Icon name="speaker" className="size-4" />
            Listen
          </button>
          {t.reply_en && (
            <button onClick={() => setGloss((g) => !g)} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold">
              {gloss ? 'Hide English' : 'English'}
            </button>
          )}
        </div>
        {t.needs_review && <p className="mt-1 text-xs text-neutral-500">Not confirmed by LanguageTool.</p>}
      </div>
    </div>
  )
}

// No grading during the talk: Zee's bubble shows only what he said. Stars and corrections come in
// the end-of-session review, so the conversation keeps flowing.
function ZeeBubble({ t }: { t: Turn }) {
  return (
    <div className="motion-safe:animate-rise max-w-[85%] self-end rounded-3xl rounded-tr-md bg-emerald-600 px-4 py-3 text-white shadow-md shadow-emerald-600/20">
      <p className="text-lg leading-snug" lang="de">
        {t.user}
      </p>
      <p className="mt-1 flex justify-end text-emerald-100" aria-label={t.input_mode === 'text' ? 'typed' : 'spoken'}>
        <Icon name={t.input_mode === 'text' ? 'keyboard' : 'mic'} className="size-3.5" />
      </p>
    </div>
  )
}

function Grading() {
  return (
    <div className="motion-safe:animate-rise flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-neutral-200" role="status">
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full bg-emerald-500 motion-safe:animate-dot" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
      <p className="font-semibold">Ustad is checking your German.</p>
      <p className="text-sm text-neutral-500">All your lines are graded together now. On a local model this can take a minute or two.</p>
    </div>
  )
}

function Typing() {
  return (
    <div
      className="flex items-center gap-1 self-start rounded-3xl rounded-tl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-neutral-200"
      role="status"
      aria-label="Ustad is replying"
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2 rounded-full bg-neutral-400 motion-safe:animate-dot" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

function BetterLine(props: { sid: number; line: ReviewLine; ltOnly: boolean; showFluency: boolean; mode: 'hold' | 'tap' }) {
  const { sid, line, ltOnly, showFluency, mode } = props
  const [shadow, setShadow] = useState(false)
  const [res, setRes] = useState<ShadowResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const same = line.better === line.said
  const stars = line.stars // from the server review; null = not graded (LanguageTool only, or skipped)
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
    <li className="motion-safe:animate-rise flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">You said</p>
          <p className="text-lg" lang="de">
            {marked(line.said, [...line.errors].sort((a, b) => a.start - b.start))}
          </p>
        </div>
        {stars !== null && <StarRow stars={stars} size="size-4" />}
      </div>
      <div className={`rounded-2xl p-3 ${ltOnly ? 'bg-neutral-50' : 'bg-emerald-50'}`}>
        <p className={`text-xs font-semibold ${ltOnly ? 'text-neutral-500' : 'tracking-wide text-emerald-700 uppercase'}`}>
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
        {line.needs_review && !ltOnly && <p className="text-xs text-neutral-500">Not confirmed by LanguageTool.</p>}
      </div>
      {line.errors.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm">
          {line.errors.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-800">
                {i + 1}
              </span>
              <span>
                <span lang="de" className="font-semibold">
                  {e.span} → {e.fix}
                </span>
                : {e.reason_en} <span className="text-xs text-neutral-500">({humanTag(e.tag)})</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2 text-sm">
        <button
          onClick={() => speak(line.better)}
          aria-label="Play"
          className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 font-semibold active:scale-95"
        >
          <Icon name="speaker" className="size-4" />
          Listen
        </button>
        <button
          onClick={() => setShadow((s) => !s)}
          className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 font-semibold text-white active:scale-95"
        >
          <Icon name={shadow ? 'x' : 'mic'} className="size-4" />
          {shadow ? 'Close' : 'Shadow it'}
        </button>
      </div>
      {shadow && (res ? <ShadowScore r={res} showFluency={showFluency} /> : <TalkInput mode={mode} sendLabel="Check" onSend={check} />)}
      {err && <p className="text-sm text-rose-700">Error: {err}. Your text is kept; try again.</p>}
    </li>
  )
}

function Review(props: { data: VoiceSession; mode: 'hold' | 'tap'; showFluency: boolean; busy: boolean; retry: () => void }) {
  const { data, mode, showFluency, busy, retry } = props
  const lines = data.review?.lines ?? []
  const ltOnly = data.status === 'lt_only'
  const sum = data.review?.summary
  return (
    <section className="flex flex-col gap-3 p-4">
      <h2 className="text-xl font-bold">Say it better</h2>
      {sum && sum.graded > 0 && !ltOnly && (
        <div className="motion-safe:animate-pop grid grid-cols-3 gap-2">
          <div className="rounded-3xl bg-white p-3 text-center shadow-sm ring-1 ring-neutral-200">
            <p className="text-3xl font-bold">{sum.lines}</p>
            <p className="text-xs text-neutral-500">{sum.lines === 1 ? 'line' : 'lines'} spoken</p>
          </div>
          <div className="rounded-3xl bg-white p-3 text-center shadow-sm ring-1 ring-neutral-200">
            <p className="text-3xl font-bold text-emerald-700">{sum.clean}</p>
            <p className="text-xs text-neutral-500">without errors</p>
          </div>
          <div className="rounded-3xl bg-amber-50 p-3 text-center shadow-sm ring-1 ring-amber-200" aria-label={`${sum.stars} of ${sum.max_stars} stars`}>
            <p className="text-3xl font-bold text-amber-700">
              {sum.stars}
              <span className="text-base text-amber-700/60">/{sum.max_stars}</span>
            </p>
            <p className="text-xs text-amber-800/70">stars</p>
          </div>
        </div>
      )}
      {ltOnly && (
        <div className="flex flex-col gap-2 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p>Tutor offline: LanguageTool check only. Not added to the Ghalti Register yet.</p>
          <button onClick={retry} disabled={busy} className="self-start font-semibold underline">
            Review again
          </button>
        </div>
      )}
      {data.review?.teaching_points.length ? (
        <ul className="flex flex-col gap-1 rounded-3xl bg-white p-4 text-sm shadow-sm ring-1 ring-neutral-200">
          {data.review.teaching_points.map((p) => (
            <li key={p} className="flex gap-2">
              <Icon name="bulb" className="size-4 shrink-0 text-amber-600" />
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      {lines.length ? (
        <ol className="flex flex-col gap-3">
          {lines.map((l) => (
            <BetterLine key={l.turn} sid={data.id} line={l} ltOnly={ltOnly} showFluency={showFluency} mode={mode} />
          ))}
        </ol>
      ) : (
        <p>Nothing said in this session.</p>
      )}
      <Link to="/voice" className="rounded-full bg-emerald-600 p-3 text-center font-semibold text-white shadow-md shadow-emerald-600/30">
        Done
      </Link>
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
  const end = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const reviewTop = useRef<HTMLDivElement>(null)
  const count = data?.turns.length ?? 0
  const status = data?.status

  // keep the newest message in view, like a messenger; when the review arrives, start at its top
  useEffect(() => {
    if (status && status !== 'open' && !grading) reviewTop.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    else end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [count, busy, status, grading])

  // the composer grows while Zee speaks (live transcript): keep the newest message above it
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (el.dataset.open === 'true') end.current?.scrollIntoView?.({ block: 'end' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [data?.id])

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>

  async function send(text: string, meta: SendMeta) {
    setBusy(true)
    setErr(null)
    try {
      const t = await api<Turn>('/api/voice/turn', { session_id: Number(id), text, ...meta })
      qc.setQueryData<VoiceSession>(key, (s) => (s ? { ...s, turns: [...s.turns, t] } : s))
      if (t.reply_de) void speak(t.reply_de)
      return true
    } catch (e) {
      setErr(`${(e as Error).message}. Your text is kept; tap Send again.`)
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

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-neutral-100">
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-white/90 px-3 py-2 backdrop-blur">
        <Link to="/voice" aria-label="Back to Bolna" className="flex size-9 items-center justify-center rounded-full active:bg-neutral-100">
          <Icon name="back" />
        </Link>
        <Avatar code={data.scenario.code} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold">{data.scenario.title}</h1>
          <p className="truncate text-xs text-neutral-500">
            {grading ? 'checking your German…' : busy && open ? 'replying…' : 'Take your time'}
          </p>
        </div>
        <button
          onClick={() => setChunks((c) => !c)}
          aria-label={chunks ? 'Hide chunks' : 'Useful chunks'}
          aria-expanded={chunks}
          className={`flex size-9 items-center justify-center rounded-full ${chunks ? 'bg-amber-100 text-amber-800' : 'text-neutral-600 active:bg-neutral-100'}`}
        >
          <Icon name="bulb" />
        </button>
        {open && (
          <button
            onClick={finish}
            disabled={busy}
            aria-label={said ? 'End and review' : 'End'}
            className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-semibold active:scale-95 disabled:opacity-40"
          >
            End
          </button>
        )}
      </header>
      {chunks && (
        <ul className="motion-safe:animate-rise flex flex-col gap-1 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm" lang="de">
          {data.scenario.chunks.map((c) => (
            <li key={c.de}>
              <button onClick={() => speak(c.de)} className="text-left">
                <span className="font-semibold">{c.de}</span> <span className="text-amber-800/70">{c.en}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={scroller} data-open={String(open && !grading)} className="flex-1 overflow-y-auto bg-[radial-gradient(circle,rgb(0_0_0/0.05)_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="flex flex-col gap-3 p-4">
          <SystemPill>Goal: {data.scenario.goal_en}</SystemPill>
          {data.turns.map((t) => (
            <div key={t.idx} className="flex flex-col gap-3">
              {t.user && <ZeeBubble t={t} />}
              <TutorBubble t={t} />
            </div>
          ))}
          {busy && open && !grading && <Typing />}
          {grading && <Grading />}
          {err && <SystemPill>{err}</SystemPill>}
        </div>
        <div ref={reviewTop} className="scroll-mt-2" />
        {!open && !grading && <Review data={data} mode={settings.talk_mode} showFluency={settings.show_fluency} busy={busy} retry={finish} />}
        <div ref={end} />
      </div>

      {open && !grading && (
        <div className="border-t border-neutral-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <TalkInput mode={settings.talk_mode} busy={busy} onSend={send} />
        </div>
      )}
    </div>
  )
}
