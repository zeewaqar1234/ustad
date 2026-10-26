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
// Click Start, click Stop (Space does the same when focus is not in a text field or on a button).
// Stop never sends: the turn ends only when Zee checks the text and clicks Send.
export function TalkInput(props: {
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

  // Space toggles listening, but never while typing or on a button (Space already clicks a button).
  const toggle = useRef<() => void>(() => {})
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' || e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target instanceof HTMLElement ? e.target : null
      if (el && (el.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])') || el.isContentEditable)) return
      e.preventDefault()
      toggle.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  const finishing = phase === 'finishing'
  const sendLabel = props.sendLabel ?? 'Send'
  useEffect(() => {
    toggle.current = () => {
      if (typing || props.busy || finishing || phase === 'ready') return
      if (listening) stop()
      else start()
    }
  })
  const sendBtn = (disabled: boolean) => (
    <button
      onClick={send}
      disabled={disabled}
      className="h-11 shrink-0 rounded-lg bg-accent px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:bg-neutral-300 disabled:text-neutral-600"
    >
      {sendLabel}
    </button>
  )
  const secondary =
    'h-11 rounded-lg border border-neutral-400 bg-white px-4 font-semibold text-neutral-900 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'

  if (typing) {
    return (
      <div className="flex flex-col gap-2">
        {fatal && <p className="rounded-lg border border-neutral-400 p-2 text-sm">{FATAL_MESSAGE[fatal] ?? fatal}</p>}
        {!ctor && <p className="text-sm text-neutral-600">Speech recognition is not available in this browser. Type your answer.</p>}
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
            className="min-h-12 flex-1 resize-none rounded-lg border border-neutral-400 bg-white px-3 py-2 text-lg outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
          />
          {sendBtn(!!props.busy || !text.trim())}
        </div>
        {ctor && (
          <button onClick={() => setTyping(false)} className="self-start text-sm underline">
            Speak instead
          </button>
        )}
      </div>
    )
  }

  const caption = finishing
    ? 'One moment…'
    : listening
      ? 'Listening. Click Stop when you are done.'
      : 'Click Start, then speak. Space also starts and stops.'

  return (
    <div className="flex flex-col gap-3">
      {(listening || finishing) && (
        <p className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-lg" lang="de" aria-live="polite">
          {text || interim ? (
            <>
              {text} <span className="text-neutral-500 italic">{interim}</span>
            </>
          ) : (
            <span className="text-neutral-500">Speak when you are ready.</span>
          )}
        </p>
      )}

      {phase === 'ready' && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            lang="de"
            rows={3}
            aria-label="What was heard (you can fix it)"
            spellCheck={false}
            className="resize-none rounded-lg border border-neutral-400 bg-white px-3 py-2 text-lg outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
          />
          <p className="text-sm text-neutral-600">Check the text. Fix a word if the mic misheard.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setText('')
                setPhase('idle')
              }}
              className={secondary}
            >
              Clear
            </button>
            <button onClick={() => start(text)} className={secondary}>
              Add more
            </button>
            <div className="flex-1" />
            {sendBtn(!!props.busy || !text.trim())}
          </div>
        </div>
      )}

      {phase !== 'ready' && (
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => (listening ? stop() : start())}
              disabled={finishing || props.busy}
              className={`h-11 min-w-28 rounded-lg px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60 ${
                listening ? 'border-2 border-neutral-900 bg-white text-neutral-900' : 'bg-accent text-white'
              }`}
            >
              {finishing ? 'One moment…' : listening ? 'Stop' : 'Start'}
            </button>
            {phase === 'idle' && (
              <button onClick={() => setTyping(true)} className="text-sm underline">
                Type instead
              </button>
            )}
          </div>
          <p className="text-sm text-neutral-600">{caption}</p>
        </div>
      )}
    </div>
  )
}
