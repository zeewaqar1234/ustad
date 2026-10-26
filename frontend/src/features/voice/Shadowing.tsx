import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { shadowStars, type Stars } from '../../lib/stars'
import { speak } from '../../lib/tts'
import type { ShadowResult, ShadowSentence } from '../../lib/voice'
import { ShadowScore } from './ShadowScore'
import { TalkInput, type SendMeta } from './TalkInput'
import { Icon, StarRow } from './ui'
import { useVoiceSettings } from './useVoiceSettings'

const SEG: Record<Stars, string> = { 0: 'bg-rose-300', 1: 'bg-amber-200', 2: 'bg-amber-300', 3: 'bg-amber-400' }

export function Shadowing() {
  const settings = useVoiceSettings()
  const { data, error } = useQuery({
    queryKey: ['voice', 'shadow'],
    queryFn: () => api<{ source: 'sabaq' | 'recent'; sentences: ShadowSentence[] }>('/api/voice/shadow'),
    refetchOnWindowFocus: false,
  })
  const [i, setI] = useState(0)
  const [result, setResult] = useState<ShadowResult | null>(null)
  const [best, setBest] = useState<Record<number, Stars>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [noAudio, setNoAudio] = useState(false)

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  if (!data.sentences.length)
    return (
      <div className="flex flex-col gap-3 p-4">
        <h1 className="text-2xl font-bold">Takrar</h1>
        <p className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          No sentences yet. Do today's Sabaq first; its sentences come here.
        </p>
        <Link to="/" className="text-emerald-700 underline">
          Back to Today
        </Link>
      </div>
    )

  const n = data.sentences.length
  const idx = i % n
  const s = data.sentences[idx]
  const total = Object.values(best).reduce<number>((a, b) => a + b, 0)

  async function play() {
    setNoAudio((await speak(s.de)) === 'none')
  }

  async function check(text: string, meta: SendMeta) {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<ShadowResult>('/api/voice/shadow', { item_id: s.item_id, transcript: text, ...meta })
      setResult(r)
      const st = shadowStars(r.matched, r.total)
      setBest((b) => ({ ...b, [idx]: Math.max(b[idx] ?? 0, st) as Stars }))
      return true
    } catch (e) {
      setErr(`${(e as Error).message}. Your text is kept; tap Check again.`)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Link to="/voice" className="flex items-center gap-1 text-sm text-neutral-600">
            <Icon name="back" className="size-4" />
            Bolna
          </Link>
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-700" aria-label={`${total} stars this round`}>
            <svg viewBox="0 0 24 24" className="size-4 fill-amber-400" aria-hidden="true">
              <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z" />
            </svg>
            {total}
          </span>
        </div>
        <h1 className="text-2xl font-bold">Takrar</h1>
        <p className="text-sm text-neutral-600">
          {data.source === 'sabaq' ? "Today's Sabaq" : 'Recent sentences'} · {idx + 1} of {n}. Listen, then say it.
        </p>
        <div className="flex gap-1" aria-hidden="true">
          {data.sentences.map((_, k) => (
            <span
              key={k}
              className={`h-1.5 flex-1 rounded-full transition-colors ${k in best ? SEG[best[k]] : k === idx ? 'bg-emerald-500' : 'bg-neutral-200'}`}
            />
          ))}
        </div>
      </header>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/20">
        <p className="text-2xl leading-snug font-semibold" lang="de">
          {s.de}
        </p>
        <p className="mt-1 text-sm text-emerald-50/80">{s.en}</p>
        <button
          onClick={play}
          aria-label="Play"
          className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-semibold ring-1 ring-white/30 backdrop-blur active:scale-95"
        >
          <Icon name="speaker" />
          Listen
        </button>
        {best[idx] !== undefined && (
          <span className="absolute top-4 right-4">
            <StarRow stars={best[idx]} size="size-4" label={`Best so far: ${best[idx]} of 3 stars`} />
          </span>
        )}
        {noAudio && <p className="mt-2 text-sm">No German voice on this device. Read it from the card.</p>}
      </section>

      {result ? (
        <>
          <ShadowScore r={result} showFluency={settings.show_fluency} />
          <div className="flex gap-2">
            <button
              onClick={() => setResult(null)}
              className="flex-1 rounded-full border border-neutral-300 bg-white p-3 font-semibold active:scale-95"
            >
              Again
            </button>
            <button
              onClick={() => {
                setResult(null)
                setI((k) => k + 1)
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-full bg-emerald-600 p-3 font-semibold text-white shadow-md shadow-emerald-600/30 active:scale-95"
            >
              Next
              <Icon name="chevron" className="size-4" />
            </button>
          </div>
        </>
      ) : (
        <TalkInput key={s.item_id} mode={settings.talk_mode} busy={busy} sendLabel="Check" onSend={check} />
      )}
      {err && <p className="text-sm text-rose-700">Error: {err}</p>}
    </div>
  )
}
