// Read German aloud. First choice: the device's own speechSynthesis with a German voice (free, offline).
// Fallback: Piper on the server (/api/voice/tts) when the device has no German voice. If neither
// exists the text stays on screen; nothing depends on hearing it.

let audio: HTMLAudioElement | null = null

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
  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return 'none'
    audio = new Audio(URL.createObjectURL(await res.blob()))
    audio.playbackRate = rate
    await audio.play()
    return 'server'
  } catch {
    return 'none'
  }
}
