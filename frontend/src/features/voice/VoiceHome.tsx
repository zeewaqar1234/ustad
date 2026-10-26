import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../lib/api'
import { recognitionCtor } from '../../lib/speech'
import { SCENARIO_ICON, type Scenario, type VoiceSession, type VoiceSettings } from '../../lib/voice'
import { Icon } from './ui'
import { useVoiceSettings } from './useVoiceSettings'

const LEVEL_TONE: Record<string, string> = {
  A2: 'bg-sky-100 text-sky-800',
  'A2/B1': 'bg-violet-100 text-violet-800',
  B1: 'bg-fuchsia-100 text-fuchsia-800',
}

function Tile(props: { to?: string; onClick?: () => void; emoji: string; title: string; sub: string; tone: string }) {
  const body = (
    <>
      <span className={`flex size-11 items-center justify-center rounded-2xl text-2xl ${props.tone}`} aria-hidden="true">
        {props.emoji}
      </span>
      <span className="block font-bold">{props.title}</span>
      <span className="block text-xs leading-snug text-neutral-600">{props.sub}</span>
    </>
  )
  const cls =
    'flex flex-col items-start gap-2 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-neutral-200 transition active:scale-[0.98]'
  return props.to ? (
    <Link to={props.to} className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={props.onClick} className={cls}>
      {body}
    </button>
  )
}

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
    <div className="flex flex-col gap-5 p-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/20">
        <span className="absolute -top-6 -right-6 size-32 rounded-full bg-white/10" aria-hidden="true" />
        <span className="absolute -right-2 -bottom-10 size-24 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
            <Icon name="mic" className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Bolna</h1>
            <p className="text-sm text-emerald-50/90">Speak at your pace. No timers. You end every turn.</p>
          </div>
        </div>
        {free && (
          <button
            onClick={() => begin(free.code)}
            disabled={starting !== null}
            className="relative mt-4 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left text-emerald-900 shadow-md active:scale-[0.98] disabled:opacity-70"
          >
            <span>
              <span className="block font-bold">💬 Gupshup: free talk</span>
              <span className="block text-xs text-emerald-800/80">{free.goal_en}</span>
            </span>
            <Icon name="chevron" />
          </button>
        )}
      </section>

      {!recognitionCtor() && (
        <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This browser has no speech recognition. Everything works by typing.
        </p>
      )}
      {err && <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">Error: {err}</p>}

      <section className="grid grid-cols-2 gap-3">
        <Tile to="/voice/shadow" emoji="🔁" title="Takrar" sub="Hear a Sabaq sentence, say it after." tone="bg-amber-100" />
        <Tile to="/voice/recite" emoji="📜" title="Pahara" sub="Say each row of a table." tone="bg-sky-100" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-lg font-bold">Roleplays</h2>
        {roleplays.map((s) => {
          const isOpen = open === s.code
          return (
            <div key={s.code} className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 transition ${isOpen ? 'ring-emerald-400' : 'ring-neutral-200'}`}>
              <button
                className="flex w-full items-center gap-3 p-3 text-left"
                onClick={() => setOpen(isOpen ? null : s.code)}
                aria-expanded={isOpen}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-2xl" aria-hidden="true">
                  {SCENARIO_ICON[s.code] ?? '🎭'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.title}</span>
                  <span className="block truncate text-xs text-neutral-500">{s.setting_en}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[s.level] ?? 'bg-neutral-100'}`}>{s.level}</span>
              </button>
              {isOpen && (
                <div className="motion-safe:animate-rise flex flex-col gap-3 border-t border-neutral-100 p-4">
                  <p className="text-sm">
                    <span className="font-semibold">Goal:</span> {s.goal_en}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {s.chunks.map((c) => (
                      <li key={c.de} className="rounded-2xl bg-neutral-50 px-3 py-2 text-sm">
                        <span lang="de" className="block font-semibold">
                          {c.de}
                        </span>
                        <span className="text-neutral-500">{c.en}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => begin(s.code)}
                    disabled={starting !== null}
                    className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 p-3 font-semibold text-white shadow-md shadow-emerald-600/30 active:scale-95 disabled:opacity-70"
                  >
                    <Icon name="mic" />
                    {starting === s.code ? 'Starting…' : 'Start'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
        <h2 className="font-bold">Settings</h2>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm">Talk button</span>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1" role="radiogroup" aria-label="Talk button">
            {(['tap', 'hold'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={settings.talk_mode === m}
                onClick={() => save({ ...settings, talk_mode: m })}
                className={`rounded-full py-2 text-sm font-semibold transition ${settings.talk_mode === m ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
              >
                {m === 'tap' ? 'Tap to start / stop' : 'Hold to talk'}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">Show fluency score</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.show_fluency}
            onChange={(e) => save({ ...settings, show_fluency: e.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-7 w-12 rounded-full bg-neutral-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600/40 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
          />
        </label>
        <p className="text-xs text-neutral-500">
          Off by default. Browser speech gives no fluency score today, so nothing changes yet. Stars count German only, never
          pace or pauses. Spoken turns go to the browser's speech service (Google in Chrome, Apple in Safari).
        </p>
      </section>
    </div>
  )
}
