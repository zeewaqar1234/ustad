import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ListRow, PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import { recognitionCtor } from '../../lib/speech'
import type { Scenario, VoiceSession, VoiceSettings } from '../../lib/voice'
import { useVoiceSettings } from './useVoiceSettings'

export function VoiceHome() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const settings = useVoiceSettings()
  const sc = useQuery({ queryKey: ['voice', 'scenarios'], queryFn: () => api<Scenario[]>('/api/voice/scenarios') })
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  async function save(next: VoiceSettings) {
    qc.setQueryData(['voice', 'settings'], next)
    await api('/api/voice/settings', next)
  }

  async function begin(code: string) {
    setErr(null)
    setStarting(code)
    try {
      const s = await api<VoiceSession>('/api/voice/session', { scenario_code: code })
      nav(`/voice/session/${s.id}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setStarting(null)
    }
  }

  const roleplays = sc.data?.filter((s) => s.kind === 'roleplay') ?? []
  const free = sc.data?.find((s) => s.kind === 'free')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sprechen" subtitle="Speak German with Ustad. Nothing is timed." />

      {!recognitionCtor() && (
        <p className="rounded-lg border border-neutral-400 p-3 text-sm">This browser has no speech recognition. Everything works by typing.</p>
      )}
      {err && <p className="text-sm font-semibold underline">Error: {err}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Start</h2>
        {free && (
          <div className="flex items-center gap-4 rounded-lg border border-neutral-300 bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Gupshup: free talk</p>
              <p className="text-sm text-neutral-700">{free.goal_en}</p>
            </div>
            <button
              onClick={() => begin(free.code)}
              disabled={starting !== null}
              className="h-11 shrink-0 rounded-lg bg-accent px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60"
            >
              {starting === free.code ? 'Starting…' : 'Start'}
            </button>
          </div>
        )}
        <ListRow title="Takrar" sub="repeat" status="Hear a Sabaq sentence, say it after." to="/voice/shadow" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Roleplays</h2>
        {roleplays.map((s) => {
          const isOpen = open === s.code
          return (
            <div key={s.code} className={`rounded-lg border bg-white ${isOpen ? 'border-neutral-900' : 'border-neutral-300'}`}>
              <button
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900"
                onClick={() => setOpen(isOpen ? null : s.code)}
                aria-expanded={isOpen}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-neutral-700">{s.goal_en}</span>
                </span>
                <span className="shrink-0 text-sm text-neutral-600">Level {s.level}</span>
                <span className="shrink-0 text-sm underline">{isOpen ? 'Hide' : 'Show'}</span>
              </button>
              {isOpen && (
                <div className="animate-fade flex flex-col gap-3 border-t border-neutral-200 p-4">
                  <p className="text-sm text-neutral-700">{s.setting_en}</p>
                  <ul className="flex flex-col gap-1.5">
                    {s.chunks.map((c) => (
                      <li key={c.de} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <span lang="de" className="block font-semibold">
                          {c.de}
                        </span>
                        <span className="text-neutral-600">{c.en}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => begin(s.code)}
                    disabled={starting !== null}
                    className="h-11 self-start rounded-lg bg-accent px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60"
                  >
                    {starting === s.code ? 'Starting…' : 'Start'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-4">
        <h2 className="font-bold">Settings</h2>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.show_fluency}
            onChange={(e) => save({ ...settings, show_fluency: e.target.checked })}
            className="size-4 accent-neutral-900"
          />
          <span className="text-sm">Show fluency score</span>
        </label>
        <p className="text-sm text-neutral-600">
          Off by default. Browser speech gives no fluency score today, so nothing changes yet. Results count German only, never
          pace or pauses. Spoken turns go to the browser's speech service (Google in Chrome, Apple in Safari).
        </p>
      </section>
    </div>
  )
}
