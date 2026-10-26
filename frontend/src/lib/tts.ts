// Read German aloud. First choice: the device's own speechSynthesis with a German voice (free, offline).
// Fallback: Piper on the server (/api/voice/tts) when the device has no German voice. If neither
// exists the text stays on screen; nothing depends on hearing it.

let audio: HTMLAudioElement | null = null
let run = 0 // bumps on every speak/stop so an old chain of server clips stops
const SERVER_MAX = 500 // the server takes at most 600 characters per request

/** Split at sentence ends into pieces the server accepts (a whole text is 900+ characters). */
export function chunks(text: string, max = SERVER_MAX): string[] {
  const out: string[] = []
  for (const s of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    const last = out.length - 1
    if (last >= 0 && (out[last] + s).length <= max) out[last] += s
    else for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max))
  }
  return out.map((c) => c.trim()).filter(Boolean)
}

async function clip(text: string): Promise<HTMLAudioElement | null> {
  const res = await fetch('/api/voice/tts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return res.ok ? new Audio(URL.createObjectURL(await res.blob())) : null
}

function germanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((v) => v.lang === 'de-DE') ?? voices.find((v) => v.lang.toLowerCase().startsWith('de')) ?? null
}

// Voices load late on some browsers. Wait for `voiceschanged` once, at most 1.5 s. This is a wait
// for the device's voice list, not a limit on Zee's speaking.
function voices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices())
    synth.addEventListener('voiceschanged', done, { once: true })
    window.setTimeout(done, 1500)
  })
}

export function stopSpeaking(): void {
  run++
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  audio?.pause()
}

export async function speak(text: string, rate = 0.9): Promise<'browser' | 'server' | 'none'> {
  stopSpeaking()
  if ('speechSynthesis' in window) {
    const synth = window.speechSynthesis
    const voice = germanVoice(await voices(synth))
    if (voice) {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'de-DE'
      u.voice = voice
      u.rate = rate
      synth.speak(u)
      return 'browser'
    }
  }
  const mine = run
  try {
    const parts = chunks(text)
    const first = await clip(parts[0])
    if (!first) return 'none'
    const play = async (a: HTMLAudioElement, i: number): Promise<void> => {
      if (mine !== run) return
      audio = a
      a.playbackRate = rate
      if (i + 1 < parts.length) {
        const next = clip(parts[i + 1]) // fetch the next piece while this one plays
        a.addEventListener('ended', () => next.then((n) => n && play(n, i + 1)), { once: true })
      }
      await a.play()
    }
    await play(first, 0)
    return 'server'
  } catch {
    return 'none'
  }
}
