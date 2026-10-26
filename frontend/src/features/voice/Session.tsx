import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { marked } from '../../components/marked'
import { api } from '../../lib/api'
import { humanTag } from '../../lib/grammar'
import { speak } from '../../lib/tts'
import type { ReviewLine, ShadowResult, Turn, VoiceSession } from '../../lib/voice'
import { ShadowScore } from './ShadowScore'
import { TalkInput, type SendMeta } from './TalkInput'
import { useVoiceSettings } from './useVoiceSettings'

function TutorLine({ t }: { t: Turn }) {
  const [gloss, setGloss] = useState(false)
  if (t.tutor_status === 'offline')
    return <p className="rounded-lg border border-neutral-900 p-2 text-sm">Tutor offline. Your turn is saved; the review still works.</p>
  if (!t.reply_de) return null
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-neutral-300 bg-white p-3">
      <p className="text-lg" lang="de">
        {t.reply_de}
      </p>
      {t.needs_review && <p className="text-xs text-neutral-600">Not confirmed by LanguageTool.</p>}
      {gloss && t.reply_en && <p className="text-sm text-neutral-600">{t.reply_en}</p>}
      <div className="flex gap-3 text-sm">
        <button onClick={() => speak(t.reply_de ?? '')} className="underline">
          Play
        </button>
        {t.reply_en && (
          <button onClick={() => setGloss((g) => !g)} className="underline">
            {gloss ? 'Hide English' : 'English'}
          </button>
        )}
      </div>
      {t.prompt_correction && (
        <p className="mt-1 border-l-4 border-neutral-900 pl-2 text-sm font-semibold" lang="de">
          {t.prompt_correction}
        </p>
      )}
    </div>
  )
}

function BetterLine(props: { sid: number; line: ReviewLine; ltOnly: boolean; showFluency: boolean; mode: 'hold' | 'tap' }) {
  const { sid, line, ltOnly, showFluency, mode } = props
  const [shadow, setShadow] = useState(false)
  const [res, setRes] = useState<ShadowResult | null>(null)
  const same = line.better === line.said
  async function check(text: string, meta: SendMeta) {
    setRes(await api<ShadowResult>('/api/voice/shadow', { session_id: sid, turn: line.turn, transcript: text, stt_restarts: meta.stt_restarts }))
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
      <div>
        <p className="text-xs text-neutral-600">You said</p>
        <p lang="de">{marked(line.said, [...line.errors].sort((a, b) => a.start - b.start))}</p>
      </div>
      <div>
        <p className="text-xs text-neutral-600">
          {/* LanguageTool misses many errors, so an LT-only result never says "correct" */}
          {ltOnly ? (same ? 'No LanguageTool flags. The tutor may still find errors.' : 'LanguageTool suggestion') : same ? 'Correct as said' : 'Better'}
        </p>
        <p className="font-semibold" lang="de">
          {line.better}
        </p>
        {line.needs_review && !ltOnly && <p className="text-xs text-neutral-600">Not confirmed by LanguageTool.</p>}
      </div>
      {line.errors.length > 0 && (
        <ol className="list-decimal pl-5 text-sm">
          {line.errors.map((e, i) => (
            <li key={i}>
              <span lang="de">
                {e.span} → {e.fix}
              </span>
              : {e.reason_en} <span className="text-xs text-neutral-600">({humanTag(e.tag)})</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-3 text-sm">
        <button onClick={() => speak(line.better)} className="underline">
          Play
        </button>
        <button onClick={() => setShadow((s) => !s)} className="underline">
          {shadow ? 'Close' : 'Shadow it'}
        </button>
      </div>
      {shadow && (res ? <ShadowScore r={res} showFluency={showFluency} /> : <TalkInput mode={mode} sendLabel="Check" onSend={check} />)}
    </li>
  )
}

export function Session() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const settings = useVoiceSettings()
  const key = ['voice', 'session', id]
  const { data, error } = useQuery({ queryKey: key, queryFn: () => api<VoiceSession>(`/api/voice/session/${id}`) })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [chunks, setChunks] = useState(false)

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>

  async function send(text: string, meta: SendMeta) {
    setBusy(true)
    setErr(null)
    try {
      const t = await api<Turn>('/api/voice/turn', { session_id: Number(id), text, ...meta })
      qc.setQueryData<VoiceSession>(key, (s) => (s ? { ...s, turns: [...s.turns, t] } : s))
      if (t.reply_de) void speak(t.reply_de)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    setErr(null)
    try {
      qc.setQueryData(key, await api<VoiceSession>(`/api/voice/session/${id}/review`, {}))
      qc.invalidateQueries({ queryKey: ['mistakes'] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const open = data.status === 'open'
  const said = data.turns.some((t) => t.user)

  return (
    <div className="flex flex-col gap-3 p-4">
      <header>
        <p className="text-sm text-neutral-600">
          <Link to="/voice" className="underline">
            Bolna
          </Link>
        </p>
        <h1 className="text-xl font-bold">{data.scenario.title}</h1>
        <p className="text-sm">{data.scenario.goal_en}</p>
        <button onClick={() => setChunks((c) => !c)} className="text-sm underline">
          {chunks ? 'Hide chunks' : 'Useful chunks'}
        </button>
        {chunks && (
          <ul className="mt-1 text-sm" lang="de">
            {data.scenario.chunks.map((c) => (
              <li key={c.de}>{c.de}</li>
            ))}
          </ul>
        )}
      </header>

      <ol className="flex flex-col gap-2">
        {data.turns.map((t) => (
          <li key={t.idx} className="flex flex-col gap-2">
            {t.user && (
              <p className="self-end rounded-lg bg-neutral-900 p-3 text-white" lang="de">
                {t.user}
              </p>
            )}
            <TutorLine t={t} />
          </li>
        ))}
      </ol>

      {open ? (
        <>
          <TalkInput mode={settings.talk_mode} busy={busy} onSend={send} />
          <button
            onClick={finish}
            disabled={busy}
            className="mt-2 rounded-lg border-2 border-neutral-900 p-3 font-semibold disabled:opacity-40"
          >
            {said ? 'End and review' : 'End'}
          </button>
        </>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Say it better</h2>
          {data.status === 'lt_only' && (
            <div className="flex flex-col gap-2 rounded border border-neutral-900 p-2 text-sm">
              <p>Tutor offline: LanguageTool check only. Not added to the Ghalti Register yet.</p>
              <button onClick={finish} disabled={busy} className="self-start underline">
                Review again
              </button>
            </div>
          )}
          {data.review?.teaching_points.length ? (
            <ul className="list-disc pl-5 text-sm">
              {data.review.teaching_points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {data.review?.lines.length ? (
            <ol className="flex flex-col gap-2">
              {data.review.lines.map((l) => (
                <BetterLine key={l.turn} sid={data.id} line={l} ltOnly={data.status === 'lt_only'} showFluency={settings.show_fluency} mode={settings.talk_mode} />
              ))}
            </ol>
          ) : (
            <p>Nothing said in this session.</p>
          )}
          <Link to="/voice" className="rounded-lg bg-neutral-900 p-3 text-center font-semibold text-white">
            Done
          </Link>
        </section>
      )}
      {err && <p className="text-sm">Error: {err}</p>}
    </div>
  )
}
