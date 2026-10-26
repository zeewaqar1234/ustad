import { describe, expect, it } from 'vitest'
import { chunks } from './tts'

describe('server TTS chunks', () => {
  it('splits a long text at sentence ends under the limit and keeps every word', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Das ist der Satz Nummer ${i}.`).join(' ')
    const parts = chunks(text)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.length <= 500 && /[.]$/.test(p))).toBe(true)
    expect(parts.join(' ')).toBe(text)
  })
  it('keeps a short text whole', () => {
    expect(chunks('Guten Tag.')).toEqual(['Guten Tag.'])
  })
})
