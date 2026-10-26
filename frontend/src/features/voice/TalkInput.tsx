import { useEffect, useRef, useState } from 'react'
import { FATAL_MESSAGE, Recognizer, recognitionCtor } from '../../lib/speech'
import { stopSpeaking } from '../../lib/tts'

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
  const restarts = useRef(0)
  const spoke = useRef(false)
  const startedAt = useRef<number | null>(null)

  useEffect(() => () => rec.current?.stop(), [])

  function recognizer(): Recognizer | null {
    if (!ctor) return null
    rec.current ??= new Recognizer(ctor, {
      onText: (t, i) => {
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
  const big = 'w-full rounded-xl border-2 border-neutral-900 p-5 text-lg font-bold select-none touch-none'

  if (typing) {
    return (
      <div className="flex flex-col gap-2">
        {fatal && <p className="text-sm">{FATAL_MESSAGE[fatal] ?? fatal}</p>}
        {!ctor && <p className="text-sm">Speech recognition is not available in this browser. Type your answer.</p>}
        <textarea
          value={text}
          onChange={(e) => {
            startedAt.current ??= Date.now()
            setText(e.target.value)
          }}
          lang="de"
          rows={3}
          aria-label="Your answer in German"
          placeholder={props.placeholder}
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          className="rounded border-2 border-neutral-900 p-2 text-lg"
        />
        <div className="flex gap-2">
          <button
            disabled={props.busy || !text.trim()}
            onClick={send}
            className="flex-1 rounded-lg bg-neutral-900 p-3 font-semibold text-white disabled:opacity-40"
          >
            {props.sendLabel ?? 'Send'}
          </button>
          {ctor && (
            <button onClick={() => setTyping(false)} className="rounded-lg border-2 border-neutral-900 p-3">
              Speak
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {(phase === 'listening' || phase === 'finishing') && (
        <p className="min-h-12 rounded border border-neutral-300 bg-white p-2 text-lg" lang="de" aria-live="polite">
          {text} <span className="text-neutral-500">{interim}</span>
        </p>
      )}
      {phase === 'ready' && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          lang="de"
          rows={3}
          aria-label="What was heard (you can fix it)"
          spellCheck={false}
          className="rounded border-2 border-neutral-900 p-2 text-lg"
        />
      )}

      {phase !== 'ready' &&
        (props.mode === 'hold' ? (
          <button
            className={`${big} ${listening ? 'bg-neutral-900 text-white' : 'bg-white'}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              start()
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            disabled={phase === 'finishing' || props.busy}
          >
            {listening ? 'Listening. Let go when you are done.' : phase === 'finishing' ? 'One moment…' : 'Hold to talk'}
          </button>
        ) : (
          <button
            className={`${big} ${listening ? 'bg-neutral-900 text-white' : 'bg-white'}`}
            onClick={() => (listening ? stop() : start())}
            disabled={phase === 'finishing' || props.busy}
          >
            {listening ? 'Stop' : phase === 'finishing' ? 'One moment…' : 'Tap to talk'}
          </button>
        ))}

      {phase === 'ready' && (
        <div className="flex gap-2">
          <button
            disabled={props.busy || !text.trim()}
            onClick={send}
            className="flex-1 rounded-lg bg-neutral-900 p-3 font-semibold text-white disabled:opacity-40"
          >
            {props.sendLabel ?? 'Send'}
          </button>
          <button onClick={() => start(text)} className="rounded-lg border-2 border-neutral-900 p-3">
            Add more
          </button>
          <button
            onClick={() => {
              setText('')
              setPhase('idle')
            }}
            className="rounded-lg border-2 border-neutral-900 p-3"
          >
            Clear
          </button>
        </div>
      )}
      {phase === 'idle' && (
        <button onClick={() => setTyping(true)} className="self-start text-sm underline">
          Type instead
        </button>
      )}
    </div>
  )
}
