import { useEffect, useRef, useState } from 'react'
import { FATAL_MESSAGE, Recognizer, recognitionCtor } from '../../lib/speech'
import { stopSpeaking } from '../../lib/tts'
import { Icon } from './ui'

export interface SendMeta {
  input_mode: 'voice' | 'text'
  stt_restarts: number
  elapsed_ms: number // active time for the day's minutes; never shown, never a limit
}

type Phase = 'idle' | 'listening' | 'finishing' | 'ready'

// One turn of speech or typing. Stammer rules: no timer, no auto-stop, nothing shown about pace.
// The turn ends only when Zee taps Stop (or lets go of Hold), checks the text, and taps Send.
export function TalkInput(props: {
  mode: 'hold' | 'tap'
  busy?: boolean
  sendLabel?: string
  placeholder?: string
  // Return false (or reject) when sending failed: the text stays so Zee does not have to say it again.
  onSend: (text: string, meta: SendMeta) => void | boolean | Promise<void | boolean>
}) {
  const ctor = recognitionCtor()
  const rec = useRef<Recognizer | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [fatal, setFatal] = useState<string | null>(null)
  const [typing, setTyping] = useState(!ctor)
  // bumps each time the recogniser delivers words: drives the ripple, so Zee sees the mic hears him
  const [activity, setActivity] = useState(0)
  const restarts = useRef(0)
  const spoke = useRef(false)
  const startedAt = useRef<number | null>(null)

  useEffect(() => () => rec.current?.stop(), [])

  function recognizer(): Recognizer | null {
    if (!ctor) return null
    rec.current ??= new Recognizer(ctor, {
      onText: (t, i) => {
        setActivity((n) => n + 1)
        setText(t)
        setInterim(i)
      },
      onFatal: (e) => {
        setFatal(e)
        setTyping(true)
      },
      onStopped: (t) => {
        restarts.current += rec.current?.restarts ?? 0
        setText(t)
        setInterim('')
        setPhase(t ? 'ready' : 'idle')
      },
    })
    return rec.current
  }

  function start(keep = '') {
    const r = recognizer()
    if (!r || r.active) return
    stopSpeaking() // do not record the tutor's voice
    spoke.current = true
    startedAt.current ??= Date.now()
    setFatal(null)
    setPhase('listening')
    r.start(keep)
  }

  function stop() {
    if (!rec.current?.active) return
    setPhase('finishing')
    rec.current.stop()
  }

  async function send() {
    const t = text.trim()
    if (!t) return
    const meta = {
      input_mode: spoke.current && !typing ? ('voice' as const) : ('text' as const),
      stt_restarts: restarts.current,
      elapsed_ms: startedAt.current === null ? 0 : Date.now() - startedAt.current,
    }
    let ok: void | boolean = false
    try {
      ok = await props.onSend(t, meta)
    } catch {
      ok = false
    }
    if (ok === false) return
    setText('')
    setPhase('idle')
    restarts.current = 0
    spoke.current = false
    startedAt.current = null
  }

  const listening = phase === 'listening'
  const finishing = phase === 'finishing'
  const sendLabel = props.sendLabel ?? 'Send'
  const sendBtn = (disabled: boolean) => (
    <button
      onClick={send}
      disabled={disabled}
      aria-label={sendLabel}
      className="flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 font-semibold text-white shadow-md shadow-emerald-600/30 transition active:scale-95 disabled:bg-neutral-300 disabled:shadow-none"
    >
      <Icon name="send" />
      {props.sendLabel && <span aria-hidden="true">{props.sendLabel}</span>}
    </button>
  )

  if (typing) {
    return (
      <div className="flex flex-col gap-2">
        {fatal && <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-900">{FATAL_MESSAGE[fatal] ?? fatal}</p>}
        {!ctor && (
          <p className="text-sm text-neutral-600">Speech recognition is not available in this browser. Type your answer.</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => {
              startedAt.current ??= Date.now()
              setText(e.target.value)
            }}
            lang="de"
            rows={2}
            aria-label="Your answer in German"
            placeholder={props.placeholder ?? 'Auf Deutsch…'}
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            className="min-h-12 flex-1 resize-none rounded-3xl border border-neutral-300 bg-white px-4 py-3 text-lg outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
          {sendBtn(!!props.busy || !text.trim())}
        </div>
        {ctor && (
          <button onClick={() => setTyping(false)} className="flex items-center gap-1 self-center text-sm text-emerald-700">
            <Icon name="mic" className="size-4" />
            Speak
          </button>
        )}
      </div>
    )
  }

  // Mic orb. Tap mode: tap to start, tap to stop. Hold mode: hold, let go to stop. Never stops by itself.
  const orbHandlers =
    props.mode === 'hold'
      ? {
          onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            start()
          },
          onPointerUp: stop,
          onPointerCancel: stop,
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        }
      : { onClick: () => (listening ? stop() : start()) }
  const orbLabel = finishing
    ? 'One moment…'
    : props.mode === 'hold'
      ? listening
        ? 'Listening. Let go when you are done.'
        : 'Hold to talk'
      : listening
        ? 'Stop'
        : 'Tap to talk'
  const caption = finishing
    ? 'One moment…'
    : listening
      ? props.mode === 'hold'
        ? 'Listening. Let go when you are done.'
        : 'Listening. Tap when you are done.'
      : props.mode === 'hold'
        ? 'Hold to talk'
        : 'Tap to talk'

  return (
    <div className="flex flex-col gap-3">
      {(listening || finishing) && (
        <div className="motion-safe:animate-rise self-end rounded-3xl rounded-br-md bg-emerald-50 px-4 py-3 text-lg ring-1 ring-emerald-200" lang="de" aria-live="polite">
          {text || interim ? (
            <>
              {text} <span className="text-emerald-700/60 italic">{interim}</span>
            </>
          ) : (
            <span className="text-emerald-800/60">Speak when you are ready.</span>
          )}
        </div>
      )}

      {phase === 'ready' && (
        <div className="motion-safe:animate-rise flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            lang="de"
            rows={3}
            aria-label="What was heard (you can fix it)"
            spellCheck={false}
            className="resize-none rounded-3xl border border-emerald-300 bg-white px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
          <p className="px-2 text-xs text-neutral-500">Check the text. Fix a word if the mic misheard.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setText('')
                setPhase('idle')
              }}
              aria-label="Clear"
              className="flex size-12 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 active:scale-95"
            >
              <Icon name="x" />
            </button>
            <button
              onClick={() => start(text)}
              aria-label="Add more"
              className="flex h-12 items-center gap-1 rounded-full border border-neutral-300 bg-white px-4 text-neutral-800 active:scale-95"
            >
              <Icon name="plus" className="size-4" />
              <Icon name="mic" className="size-4" />
            </button>
            <div className="flex-1" />
            {sendBtn(!!props.busy || !text.trim())}
          </div>
        </div>
      )}

      {phase !== 'ready' && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="relative flex size-24 items-center justify-center">
            {listening && (
              <>
                <span className="absolute inset-2 rounded-full bg-emerald-400 motion-safe:animate-breathe" />
                <span
                  className="absolute inset-2 rounded-full bg-emerald-400 motion-safe:animate-breathe"
                  style={{ animationDelay: '0.9s' }}
                />
                {activity > 0 && (
                  <span key={activity} className="absolute inset-2 rounded-full bg-emerald-300 motion-safe:animate-ripple" />
                )}
              </>
            )}
            <button
              {...orbHandlers}
              disabled={finishing || props.busy}
              aria-label={orbLabel}
              className={`relative flex size-20 select-none touch-none items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-60 ${
                listening ? 'bg-emerald-700 shadow-emerald-700/50 ring-4 ring-emerald-200' : 'bg-emerald-600 shadow-emerald-600/40'
              }`}
            >
              {finishing ? (
                <span className="size-7 rounded-full border-4 border-white/40 border-t-white motion-safe:animate-spin" />
              ) : listening && props.mode === 'tap' ? (
                <Icon name="stop" className="size-8" />
              ) : (
                <Icon name="mic" className="size-9" />
              )}
            </button>
          </div>
          <div className="flex h-5 items-center gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`w-1 origin-center rounded-full ${listening ? 'h-5 bg-emerald-500 motion-safe:animate-wave' : 'h-1.5 bg-neutral-300'}`}
                style={{ animationDelay: `${[0, 0.2, 0.4, 0.1, 0.3][i]}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-neutral-600">{caption}</p>
          {phase === 'idle' && (
            <button onClick={() => setTyping(true)} className="flex items-center gap-1 text-sm text-emerald-700">
              <Icon name="keyboard" className="size-4" />
              Type instead
            </button>
          )}
        </div>
      )}
    </div>
  )
}
