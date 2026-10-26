import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useState } from 'react'
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

  async function save(next: VoiceSettings) {
    qc.setQueryData(['voice', 'settings'], next)
    await api('/api/voice/settings', next)
  }

  async function begin(code: string) {
    setErr(null)
    try {
      const s = await api<VoiceSession>('/api/voice/session', { scenario_code: code })
      nav(`/voice/session/${s.id}`)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const roleplays = sc.data?.filter((s) => s.kind === 'roleplay') ?? []
  const free = sc.data?.find((s) => s.kind === 'free')

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Bolna</h1>
      {!recognitionCtor() && (
        <p className="rounded border border-neutral-900 p-2 text-sm">
          This browser has no speech recognition. Everything works by typing.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <Link to="/voice/shadow" className="rounded-lg border-2 border-neutral-900 bg-white p-3">
          <span className="block font-bold">Takrar (shadowing)</span>
          <span className="text-sm text-neutral-700">Hear a sentence from your Sabaq, say it after.</span>
        </Link>
        <Link to="/voice/recite" className="rounded-lg border-2 border-neutral-900 bg-white p-3">
          <span className="block font-bold">Pahara by voice</span>
          <span className="text-sm text-neutral-700">Say each row of a table.</span>
        </Link>
        {free && (
          <button onClick={() => begin(free.code)} className="rounded-lg border-2 border-neutral-900 bg-white p-3 text-left">
            <span className="block font-bold">Gupshup (free talk)</span>
            <span className="text-sm text-neutral-700">{free.goal_en}</span>
          </button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Roleplays</h2>
        {roleplays.map((s) => (
          <div key={s.code} className="rounded-lg border border-neutral-300 bg-white">
            <button
              className="flex w-full items-baseline justify-between gap-2 p-3 text-left"
              onClick={() => setOpen(open === s.code ? null : s.code)}
              aria-expanded={open === s.code}
            >
              <span className="font-bold">{s.title}</span>
              <span className="shrink-0 text-xs">{s.level}</span>
            </button>
            {open === s.code && (
              <div className="flex flex-col gap-2 border-t border-neutral-300 p-3">
                <p className="text-sm">{s.setting_en}</p>
                <p className="text-sm">
                  <span className="font-semibold">Goal:</span> {s.goal_en}
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {s.chunks.map((c) => (
                    <li key={c.de}>
                      <span lang="de" className="font-semibold">
                        {c.de}
                      </span>{' '}
                      <span className="text-neutral-600">{c.en}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => begin(s.code)} className="rounded-lg bg-neutral-900 p-3 font-semibold text-white">
                  Start
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      {err && <p className="text-sm">Error: {err}</p>}

      <section className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
        <h2 className="font-bold">Settings</h2>
        <label className="flex items-center justify-between gap-2">
          <span>Talk button</span>
          <select
            value={settings.talk_mode}
            onChange={(e) => save({ ...settings, talk_mode: e.target.value as 'hold' | 'tap' })}
            className="rounded border border-neutral-900 p-1"
          >
            <option value="tap">Tap to start, tap to stop</option>
            <option value="hold">Hold to talk</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>Show fluency score</span>
          <input
            type="checkbox"
            checked={settings.show_fluency}
            onChange={(e) => save({ ...settings, show_fluency: e.target.checked })}
          />
        </label>
        <p className="text-xs text-neutral-600">
          Off by default. Browser speech gives no fluency score today, so nothing changes yet. Spoken turns go to
          the browser's speech service (Google in Chrome, Apple in Safari).
        </p>
      </section>
    </div>
  )
}
