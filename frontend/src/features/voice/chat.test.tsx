import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecognitionLike } from '../../lib/speech'
import type { VoiceSession } from '../../lib/voice'
import { Session } from './Session'
import { TalkInput } from './TalkInput'

const session: VoiceSession = {
  id: 7,
  mode: 'roleplay',
  scenario: { code: 'KANTINE', title: 'Kantine: small talk', goal_en: 'Say what you did.', chunks: [] },
  status: 'open',
  review: null,
  turns: [
    { idx: 0, input_mode: null, user: null, reply_de: 'Wie war dein Wochenende?', reply_en: 'How was your weekend?', prompt_correction: null, tutor_status: 'ok', needs_review: false, error_count: null },
    { idx: 1, input_mode: 'voice', user: 'Ich bin nach Hause gefahren.', reply_de: 'Schön. Und dann?', reply_en: 'Nice.', prompt_correction: null, tutor_status: 'ok', needs_review: false, error_count: 0 },
    { idx: 2, input_mode: 'text', user: 'Ich habe gegangen.', reply_de: 'Wohin?', reply_en: 'Where?', prompt_correction: 'Achtung: gehen mit haben oder sein?', tutor_status: 'ok', needs_review: false, error_count: 1 },
    { idx: 3, input_mode: 'voice', user: 'Ich war müde.', reply_de: null, reply_en: null, prompt_correction: null, tutor_status: 'offline', needs_review: false, error_count: null },
  ],
}

function renderSession() {
  const qc = new QueryClient()
  qc.setQueryData(['voice', 'session', '7'], session)
  qc.setQueryData(['voice', 'settings'], { show_fluency: false, talk_mode: 'tap' })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/voice/session/7']}>
        <Routes>
          <Route path="/voice/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('chat session', () => {
  afterEach(cleanup)

  it('shows bubbles, a star rating per graded turn, and no stars when the tutor was offline', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderSession()
    expect(screen.getByText('Wie war dein Wochenende?')).toBeInTheDocument()
    expect(screen.getByText('Ich bin nach Hause gefahren.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '3 of 3 stars' })).toBeInTheDocument()
    expect(screen.getByText('No errors found')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 of 3 stars' })).toBeInTheDocument()
    expect(screen.getByText('1 error · details in the review')).toBeInTheDocument()
    expect(screen.getByText('Achtung: gehen mit haben oder sein?')).toBeInTheDocument()
    expect(screen.getByText(/Tutor offline/)).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /of 3 stars/ })).toHaveLength(2) // offline turn: none
    expect(screen.queryByText(/fluency|pace|seconds/i)).toBeNull()
    vi.unstubAllGlobals()
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

describe('mic orb', () => {
  afterEach(() => {
    cleanup()
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
  })

  it('pulses while listening and ripples when words arrive; stops only on tap', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
    const { container } = render(<TalkInput mode="tap" onSend={() => {}} />)
    expect(container.querySelector('.motion-safe\\:animate-breathe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tap to talk' }))
    expect(container.querySelectorAll('.motion-safe\\:animate-breathe')).toHaveLength(2)
    expect(container.querySelectorAll('.motion-safe\\:animate-wave')).toHaveLength(5)
    expect(container.querySelector('.motion-safe\\:animate-ripple')).toBeNull()
    act(() => FakeRec.last.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'Hallo' }], { isFinal: false })] }))
    expect(container.querySelector('.motion-safe\\:animate-ripple')).not.toBeNull()
    act(() => FakeRec.last.onend?.())
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument() // browser end: still live
    expect(screen.getByText('Listening. Tap when you are done.')).toBeInTheDocument()
  })
})
