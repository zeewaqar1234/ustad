// Browser speech recognition (Web Speech API) for the voice tutor (docs/architecture.md §8).
//
// Stammer rule: only Zee's tap ends a turn. The browser ends recognition by itself (silence, a
// network hiccup, Chrome Android ignores `continuous`), so on every `end` this class starts it again
// and keeps the text. Text the browser showed as interim but never finalised before `end` is kept too,
// so words in the restart gap are not dropped. No timers and no silence detection here.

export interface RecognitionAlternative {
  transcript: string
}
export interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: RecognitionAlternative
}
export interface RecognitionEvent {
  resultIndex: number
  results: { readonly length: number; [index: number]: RecognitionResult }
}
export interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
export type RecognitionCtor = new () => RecognitionLike

export function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Errors that will not go away by restarting: stop restarting and show the text fallback.
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'])

export const FATAL_MESSAGE: Record<string, string> = {
  'not-allowed': 'Microphone blocked. Allow it in the browser settings, or type.',
  'service-not-allowed': 'Speech recognition is off in this browser. Type instead.',
  'audio-capture': 'No microphone found. Type instead.',
  'language-not-supported': 'German speech recognition is not available here. Type instead.',
}

function join(a: string, b: string): string {
  const t = b.trim()
  if (!t) return a
  return a ? `${a} ${t}` : t
}

export interface RecognizerEvents {
  onText: (text: string, interim: string) => void
  onFatal: (error: string) => void
  onStopped: (text: string) => void
}

export class Recognizer {
  restarts = 0
  private ctor: RecognitionCtor
  private ev: RecognizerEvents
  private rec: RecognitionLike | null = null
  private listening = false // true from Zee's Start until Zee's Stop
  private kept = '' // text from earlier recognition sessions in this turn
  private sessionFinal = ''
  private interim = ''
  private fatal: string | null = null

  constructor(ctor: RecognitionCtor, ev: RecognizerEvents) {
    this.ctor = ctor
    this.ev = ev
  }

  get text(): string {
    return join(this.kept, this.sessionFinal)
  }

  get active(): boolean {
    return this.listening
  }

  // `keep` continues the same turn (Add more): earlier text stays.
  start(keep = ''): void {
    this.kept = keep.trim()
    this.sessionFinal = ''
    this.interim = ''
    this.fatal = null
    this.restarts = 0
    this.listening = true
    const r = new this.ctor()
    r.lang = 'de-DE'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e) => this.onResult(e)
    r.onerror = (e) => {
      if (FATAL.has(e.error)) {
        this.fatal = e.error
        this.listening = false
        this.ev.onFatal(e.error)
      }
      // no-speech, aborted, network: `end` follows and recognition is started again
    }
    r.onend = () => this.onEnd()
    this.rec = r
    this.open()
  }

  // Only Zee calls this (Stop tap or releasing the hold button). The turn's text arrives in onStopped
  // after the browser delivers its last result.
  stop(): void {
    this.listening = false
    if (!this.rec) return
    this.rec.stop()
  }

  private open(): void {
    try {
      this.rec?.start()
    } catch {
      // InvalidStateError: already started. Nothing to do.
    }
  }

  private onResult(e: RecognitionEvent): void {
    // Rebuild this session's text from all results. Some Android builds repeat earlier text inside a
    // later result; a result that starts with the previous one replaces it instead of doubling it.
    let fin = ''
    let interim = ''
    let prev = ''
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i]
      const t = (res[0]?.transcript ?? '').trim()
      if (!t) continue
      if (res.isFinal) {
        if (prev && t.toLowerCase().startsWith(prev.toLowerCase())) fin = fin.slice(0, fin.length - prev.length).trim()
        fin = join(fin, t)
        prev = t
      } else {
        interim = join(interim, t)
      }
    }
    this.sessionFinal = fin
    this.interim = interim
    this.ev.onText(this.text, this.interim)
  }

  private onEnd(): void {
    // Restart gap: keep what was heard, including interim text the browser never finalised.
    this.kept = join(join(this.kept, this.sessionFinal), this.interim)
    this.sessionFinal = ''
    this.interim = ''
    if (this.listening && !this.fatal) {
      this.restarts += 1
      this.ev.onText(this.text, '')
      this.open()
      return
    }
    this.rec = null
    this.ev.onStopped(this.text)
  }
}
