import { describe, expect, it, vi } from 'vitest'
import { Recognizer, type RecognitionEvent, type RecognitionLike } from './speech'

class FakeRec implements RecognitionLike {
  static last: FakeRec
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((e: RecognitionEvent) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  starts = 0
  stops = 0
  constructor() {
    FakeRec.last = this
  }
  start() {
    this.starts++
  }
  stop() {
    this.stops++
  }
  say(parts: [string, boolean][]) {
    const results = parts.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal }))
    this.onresult?.({ resultIndex: 0, results })
  }
  end() {
    this.onend?.()
  }
}

function make() {
  const ev = { onText: vi.fn(), onFatal: vi.fn(), onStopped: vi.fn() }
  return { r: new Recognizer(FakeRec, ev), ev }
}

describe('Recognizer (stammer rule: only Zee ends a turn)', () => {
  it('restarts on every end the browser fires and keeps the text', () => {
    const { r, ev } = make()
    r.start()
    const rec = FakeRec.last
    expect(rec.lang).toBe('de-DE')
    rec.say([['Am Wochenende', true]])
    for (let i = 0; i < 5; i++) rec.end() // long pause / block: the browser ends recognition again and again
    expect(rec.starts).toBe(6)
    expect(r.restarts).toBe(5)
    expect(r.active).toBe(true)
    expect(ev.onStopped).not.toHaveBeenCalled()
    rec.say([['bin ich gefahren', true]])
    expect(r.text).toBe('Am Wochenende bin ich gefahren')
  })

  it('keeps interim words that were not finalised before end (restart gap)', () => {
    const { r } = make()
    r.start()
    FakeRec.last.say([['ich habe', true], ['gestern gearbeitet', false]])
    FakeRec.last.end()
    expect(r.text).toBe('ich habe gestern gearbeitet')
  })

  it('ends the turn only after stop(), with all text', () => {
    const { r, ev } = make()
    r.start()
    FakeRec.last.say([['Hallo', true]])
    FakeRec.last.end()
    FakeRec.last.say([['wie geht es', false]])
    r.stop()
    expect(FakeRec.last.stops).toBe(1)
    FakeRec.last.say([['wie geht es dir', true]])
    FakeRec.last.end()
    expect(ev.onStopped).toHaveBeenCalledWith('Hallo wie geht es dir')
    expect(FakeRec.last.starts).toBe(2) // no restart after Zee's stop
  })

  it('does not double Android cumulative results', () => {
    const { r } = make()
    r.start()
    FakeRec.last.say([['ich bin', true], ['ich bin müde', true]])
    expect(r.text).toBe('ich bin müde')
  })

  it('stops restarting on a fatal error (mic blocked) and keeps the text', () => {
    const { r, ev } = make()
    r.start()
    FakeRec.last.say([['Guten Tag', true]])
    FakeRec.last.onerror?.({ error: 'not-allowed' })
    FakeRec.last.end()
    expect(ev.onFatal).toHaveBeenCalledWith('not-allowed')
    expect(FakeRec.last.starts).toBe(1)
    expect(ev.onStopped).toHaveBeenCalledWith('Guten Tag')
  })

  it('ignores no-speech: restart, turn stays open', () => {
    const { r, ev } = make()
    r.start()
    FakeRec.last.onerror?.({ error: 'no-speech' })
    FakeRec.last.end()
    expect(r.active).toBe(true)
    expect(ev.onFatal).not.toHaveBeenCalled()
  })
})
