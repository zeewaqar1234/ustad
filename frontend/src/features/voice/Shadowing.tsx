import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, NextStep, Page, PageHeader } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
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
  const subtitle = `${GLOSSARY.Takrar[0].toUpperCase()}${GLOSSARY.Takrar.slice(1)}.`
  const back = { to: '/voice', label: 'Back to Sprechen' }
  if (!data.sentences.length)
    return (
      <Page>
        <div className="flex flex-col gap-4">
          <PageHeader title="Takrar" subtitle={subtitle} back={back} />
          <p className="rounded-xl border border-neutral-200 bg-white p-4">
            No sentences yet. Do today's lesson (Sabaq) first; its sentences come here.
          </p>
        </div>
      </Page>
    )

  const n = data.sentences.length
  if (i >= n)
    return (
      <Page>
        <div className="flex flex-col gap-4">
          <PageHeader title="Takrar" subtitle={subtitle} back={back} />
          <NextStep message={<p className="font-semibold">All {n} {n === 1 ? 'sentence' : 'sentences'} done.</p>} />
          <div>
            <Button kind="quiet" onClick={() => setI(0)}>
              Go through them again
            </Button>
          </div>
        </div>
      </Page>
    )
  const s = data.sentences[i]
  const last = i === n - 1

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
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Takrar"
          subtitle={`${subtitle} ${data.source === 'sabaq' ? "Today's lesson" : 'Recent sentences'}, ${i + 1} of ${n}.`}
          back={back}
        />

        <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-5">
          <p className="text-2xl leading-snug font-semibold" lang="de">
            {s.de}
          </p>
          <p className="text-neutral-600">{s.en}</p>
          <div className="mt-2">
            <Button onClick={play}>Play</Button>
          </div>
          {noAudio && <p className="text-sm">No German voice on this device. Read it from the card.</p>}
        </section>

        {result ? (
          <>
            <ShadowScore r={result} showFluency={settings.show_fluency} />
            <div className="flex gap-2">
              <Button onClick={() => setResult(null)}>Again</Button>
              <Button
                kind="primary"
                onClick={() => {
                  setResult(null)
                  setI((k) => k + 1)
                }}
              >
                {last ? 'Finish' : 'Next'}
              </Button>
            </div>
          </>
        ) : (
          <TalkInput key={s.item_id} busy={busy} sendLabel="Check" onSend={check} />
        )}
        {err && <p className="text-sm font-semibold underline">Error: {err}</p>}
      </div>
    </Page>
  )
}
