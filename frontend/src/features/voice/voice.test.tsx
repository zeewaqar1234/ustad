import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecognitionLike } from '../../lib/speech'
import { ShadowScore } from './ShadowScore'
import { TalkInput } from './TalkInput'

const result = {
  reference: 'Mein Zug hatte Verspätung.',
  heard: 'Mein Zug Verspätung',
  words: [
    { word: 'Mein', ok: true },
    { word: 'Zug', ok: true },
    { word: 'hatte', ok: false },
    { word: 'Verspätung', ok: true },
  ],
  matched: 3,
  total: 4,
  pct: 75,
  fluency: 41,
}

describe('fluency score (stammer rule)', () => {
  afterEach(cleanup)
  it('is not displayed when the setting is off, even if a score exists', () => {
    render(<ShadowScore r={result} showFluency={false} />)
    expect(screen.getByText('3 of 4 words heard')).toBeInTheDocument()
    expect(screen.queryByText(/fluency/i)).toBeNull()
    expect(screen.queryByText(/41/)).toBeNull()
  })

  it('is displayed only when the setting is on', () => {
    render(<ShadowScore r={result} showFluency />)
    expect(screen.getByText('Fluency: 41')).toBeInTheDocument()
  })
})

class FakeRec implements RecognitionLike {
  static last: FakeRec
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: RecognitionLike['onresult'] = null
  onerror: RecognitionLike['onerror'] = null
  onend: RecognitionLike['onend'] = null
  constructor() {
    FakeRec.last = this
  }
  start() {}
  stop() {}
}

describe('TalkInput', () => {
  afterEach(() => {
    cleanup()
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
  })

  it('never ends or sends a turn by itself; only Stop then Send do', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
    const onSend = vi.fn()
    render(<TalkInput onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    const rec = FakeRec.last
    act(() => rec.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'ich ich bin' }], { isFinal: true })] }))
    for (let i = 0; i < 10; i++) act(() => rec.onend?.()) // the browser keeps ending recognition
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    act(() => rec.onend?.())
    expect(onSend).not.toHaveBeenCalled() // Zee can still check or fix the text
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('ich ich bin', expect.objectContaining({ input_mode: 'voice', stt_restarts: 10 }))
  })

  it('Space starts and stops listening outside text fields; Stop never sends', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
    const onSend = vi.fn()
    render(<TalkInput onSend={onSend} />)
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    act(() => FakeRec.last.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'Hallo' }], { isFinal: true })] }))
    fireEvent.keyDown(document.body, { key: ' ' })
    act(() => FakeRec.last.onend?.())
    expect(screen.getByLabelText('What was heard (you can fix it)')).toHaveValue('Hallo')
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Hallo', expect.objectContaining({ input_mode: 'voice', stt_restarts: 0 }))
  })

  it('Space does nothing inside the text box or on a button', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
    render(<TalkInput onSend={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Type instead' }))
    const box = screen.getByLabelText('Your answer in German')
    fireEvent.keyDown(box, { key: ' ' })
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Speak instead' }))
    const startBtn = screen.getByRole('button', { name: 'Start' })
    fireEvent.keyDown(startBtn, { key: ' ' })
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('keeps the text when sending fails', async () => {
    const onSend = vi.fn().mockResolvedValue(false)
    render(<TalkInput onSend={onSend} />)
    fireEvent.change(screen.getByLabelText('Your answer in German'), { target: { value: 'Ich bin da.' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })))
    expect(onSend).toHaveBeenCalled()
    expect(screen.getByLabelText('Your answer in German')).toHaveValue('Ich bin da.')
  })

  it('falls back to typing when SpeechRecognition is missing', () => {
    const onSend = vi.fn()
    render(<TalkInput onSend={onSend} />)
    expect(screen.getByText(/not available in this browser/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Your answer in German'), { target: { value: 'Ich bin müde.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Ich bin müde.', expect.objectContaining({ input_mode: 'text', stt_restarts: 0 }))
  })
})

// Static guard: no timer, silence or speech-end logic in the code that runs a speaking turn.
const sources = import.meta.glob(['./*.tsx', '../../lib/speech.ts'], { query: '?raw', import: 'default', eager: true })

describe('no code path ends a user turn automatically', () => {
  it('voice turn code has no timers or speech-end handlers', () => {
    const files = Object.entries(sources).filter(([f]) => !f.endsWith('.test.tsx'))
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const [file, src] of files) {
      for (const banned of ['setTimeout', 'setInterval', 'onspeechend', 'onsoundend', 'onaudioend', 'onnomatch']) {
        expect(`${file}: ${(src as string).includes(banned)}`).toBe(`${file}: false`)
      }
    }
  })
})
