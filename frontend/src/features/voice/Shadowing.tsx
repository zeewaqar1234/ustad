import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { speak } from '../../lib/tts'
import type { ShadowResult, ShadowSentence } from '../../lib/voice'
import { ShadowScore } from './ShadowScore'
import { TalkInput } from './TalkInput'
import { useVoiceSettings } from './useVoiceSettings'

export function Shadowing() {
  const settings = useVoiceSettings()
  const { data, error } = useQuery({
    queryKey: ['voice', 'shadow'],
    queryFn: () => api<{ source: 'sabaq' | 'recent'; sentences: ShadowSentence[] }>('/api/voice/shadow'),
    refetchOnWindowFocus: false,
  })
  const [i, setI] = useState(0)
  const [result, setResult] = useState<ShadowResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [noAudio, setNoAudio] = useState(false)

  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  if (!data.sentences.length)
    return (
      <div className="flex flex-col gap-2 p-4">
        <h1 className="text-xl font-bold">Takrar</h1>
        <p>No sentences yet. Do today's Sabaq first; its sentences come here.</p>
        <Link to="/" className="underline">
          Back to Today
        </Link>
      </div>
    )

  const s = data.sentences[i % data.sentences.length]

  async function play() {
    setNoAudio((await speak(s.de)) === 'none')
  }

  async function check(text: string, meta: { stt_restarts: number }) {
    setBusy(true)
    setErr(null)
    try {
      setResult(await api<ShadowResult>('/api/voice/shadow', { item_id: s.item_id, transcript: text, ...meta }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-sm text-neutral-600">
          <Link to="/voice" className="underline">
            Bolna
          </Link>{' '}
          · {data.source === 'sabaq' ? "Today's Sabaq" : 'Recent sentences'} · {(i % data.sentences.length) + 1} of{' '}
          {data.sentences.length}
        </p>
        <h1 className="text-xl font-bold">Takrar</h1>
        <p className="text-sm text-neutral-700">Listen, then say it. Take your time.</p>
      </header>
      <section className="rounded-lg border border-neutral-300 bg-white p-3">
        <p className="text-xl font-semibold" lang="de">
          {s.de}
        </p>
        <p className="text-sm text-neutral-600">{s.en}</p>
        <button onClick={play} className="mt-2 rounded-lg border-2 border-neutral-900 px-4 py-2">
          Play
        </button>
        {noAudio && <p className="mt-1 text-sm">No German voice on this device. Read it from the screen.</p>}
      </section>
      {result ? (
        <>
          <ShadowScore r={result} showFluency={settings.show_fluency} />
          <div className="flex gap-2">
            <button onClick={() => setResult(null)} className="flex-1 rounded-lg border-2 border-neutral-900 p-3">
              Again
            </button>
            <button
              onClick={() => {
                setResult(null)
                setI((n) => n + 1)
              }}
              className="flex-1 rounded-lg bg-neutral-900 p-3 font-semibold text-white"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <TalkInput key={s.item_id} mode={settings.talk_mode} busy={busy} sendLabel="Check" onSend={check} />
      )}
      {err && <p className="text-sm">Error: {err}</p>}
    </div>
  )
}
