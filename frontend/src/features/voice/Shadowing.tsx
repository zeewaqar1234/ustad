import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Column, PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import { speak } from '../../lib/tts'
import type { ShadowResult, ShadowSentence } from '../../lib/voice'
import { ShadowScore } from './ShadowScore'
import { TalkInput, type SendMeta } from './TalkInput'
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

  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  if (!data.sentences.length)
    return (
      <Column>
        <PageHeader title="Takrar" subtitle="Repeat sentences after Ustad." back={{ to: '/voice', label: 'Back to Sprechen' }} />
        <p className="rounded-lg border border-neutral-300 bg-white p-4">No sentences yet. Do today's Sabaq first; its sentences come here.</p>
      </Column>
    )

  const n = data.sentences.length
  const idx = i % n
  const s = data.sentences[idx]

  async function play() {
    setNoAudio((await speak(s.de)) === 'none')
  }

  async function check(text: string, meta: SendMeta) {
    setBusy(true)
    setErr(null)
    try {
      setResult(await api<ShadowResult>('/api/voice/shadow', { item_id: s.item_id, transcript: text, ...meta }))
      return true
    } catch (e) {
      setErr(`${(e as Error).message}. Your text is kept; click Check again.`)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Column>
      <PageHeader
        title="Takrar"
        subtitle={`${data.source === 'sabaq' ? "Today's Sabaq" : 'Recent sentences'}, ${idx + 1} of ${n}. Listen, then say it.`}
        back={{ to: '/voice', label: 'Back to Sprechen' }}
      />

      <section className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-5">
        <p className="text-2xl leading-snug font-semibold" lang="de">
          {s.de}
        </p>
        <p className="text-neutral-600">{s.en}</p>
        <button
          onClick={play}
          className="mt-2 h-11 self-start rounded-lg border border-neutral-400 px-4 font-semibold hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900"
        >
          Play
        </button>
        {noAudio && <p className="text-sm">No German voice on this device. Read it from the card.</p>}
      </section>

      {result ? (
        <>
          <ShadowScore r={result} showFluency={settings.show_fluency} />
          <div className="flex gap-2">
            <button
              onClick={() => setResult(null)}
              className="h-11 rounded-lg border border-neutral-400 bg-white px-5 font-semibold hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900"
            >
              Again
            </button>
            <button
              onClick={() => {
                setResult(null)
                setI((k) => k + 1)
              }}
              className="h-11 rounded-lg bg-accent px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <TalkInput key={s.item_id} busy={busy} sendLabel="Check" onSend={check} />
      )}
      {err && <p className="text-sm font-semibold underline">Error: {err}</p>}
    </Column>
  )
}
