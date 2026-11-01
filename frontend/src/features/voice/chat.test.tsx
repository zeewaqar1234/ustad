import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecognitionLike } from '../../lib/speech'
import type { VoiceSession } from '../../lib/voice'
import { Session } from './Session'
import { Shadowing } from './Shadowing'
import { TalkInput } from './TalkInput'

const turns: VoiceSession['turns'] = [
  { idx: 0, input_mode: null, user: null, reply_de: 'Wie war dein Wochenende?', reply_en: 'How was your weekend?', tutor_status: 'ok', needs_review: false },
  { idx: 1, input_mode: 'voice', user: 'Ich bin nach Hause gefahren.', reply_de: 'Schön. Und dann?', reply_en: 'Nice.', tutor_status: 'ok', needs_review: false },
  { idx: 2, input_mode: 'text', user: 'Ich habe gegangen.', reply_de: 'Wohin?', reply_en: 'Where?', tutor_status: 'ok', needs_review: false },
  { idx: 3, input_mode: 'voice', user: 'Ich war müde.', reply_de: null, reply_en: null, tutor_status: 'offline', needs_review: false },
]
const scenario = { code: 'KANTINE', title: 'Kantine: small talk', goal_en: 'Say what you did.', chunks: [] }
const open: VoiceSession = { id: 7, mode: 'roleplay', scenario, status: 'open', review: null, turns }
const reviewed: VoiceSession = {
  ...open,
  status: 'reviewed',
  review: {
    source: 'ollama',
    teaching_points: ['gehen takes sein in the Perfekt.'],
    summary: { lines: 3, graded: 2, clean: 1, errors: 1, stars: 5, max_stars: 6 },
    lines: [
      { turn: 1, said: 'Ich bin nach Hause gefahren.', better: 'Ich bin nach Hause gefahren.', graded: true, errors: [], stars: 3, needs_review: false },
      { turn: 2, said: 'Ich habe gegangen.', better: 'Ich bin gegangen.', graded: true, stars: 2, needs_review: false,
        errors: [{ span: 'habe', fix: 'bin', tag: 'AUX_HABEN_SEIN', reason_en: 'gehen takes sein', start: 4, end: 8 }] },
      { turn: 3, said: 'Ich war müde.', better: 'Ich war müde.', graded: false, errors: [], stars: null, needs_review: false },
    ],
  },
}

function renderSession(session: VoiceSession) {
  const qc = new QueryClient()
  qc.setQueryData(['voice', 'session', '7'], session)
  qc.setQueryData(['voice', 'settings'], { show_fluency: false })
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
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('during the talk: bubbles only, no stars, no corrections, no grading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderSession(open)
    expect(screen.getByText('Wie war dein Wochenende?')).toBeInTheDocument()
    expect(screen.getByText('Ich habe gegangen.')).toBeInTheDocument()
    expect(screen.queryAllByRole('img', { name: /stars/ })).toHaveLength(0)
    expect(screen.queryByText(/error/i)).toBeNull()
    expect(screen.queryByText(/Achtung/)).toBeNull()
    expect(screen.getByText(/Tutor offline/)).toBeInTheDocument()
    expect(screen.queryByText(/fluency|pace|seconds/i)).toBeNull()
  })

  it('in the review: plain-text summary, no stars, skipped line not graded', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderSession(reviewed)
    expect(screen.getByRole('heading', { name: 'Say it better' })).toBeInTheDocument()
    expect(screen.getByText(/1 of 2 lines without errors/)).toBeInTheDocument()
    expect(screen.queryAllByRole('img', { name: /stars/ })).toHaveLength(0)
    expect(screen.queryByText(/stars?\b/i)).toBeNull()
    expect(screen.getByText(/Not graded/)).toBeInTheDocument()
    expect(screen.getByText('Ich bin gegangen.')).toBeInTheDocument()
    // the session ends with a way back to Today, not to the Sprechen list
    expect(screen.getByText('Session done.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '/')
  })

  it('End shows a patient grading card while the review runs', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // review never returns in this test
    renderSession(open)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'End and review' })))
    expect(screen.getByText('Ustad is checking your German.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })
})

describe('Takrar (shadowing)', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('ends after the last sentence instead of starting over', async () => {
    const shadow = { reference: 'Ich bin da.', heard: 'Ich bin da', words: [{ word: 'Ich', ok: true }, { word: 'bin', ok: true }, { word: 'da', ok: true }], matched: 3, total: 3, pct: 100 }
    const list = { source: 'sabaq', sentences: [{ item_id: 1, de: 'Ich bin da.', en: 'I am here.' }] }
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify(init?.body ? shadow : list), { status: 200 })),
      ),
    )
    const qc = new QueryClient()
    qc.setQueryData(['voice', 'shadow'], list)
    qc.setQueryData(['voice', 'settings'], { show_fluency: false })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/voice/shadow']}>
          <Shadowing />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText(/Listen and repeat\./)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Your answer in German'), { target: { value: 'Ich bin da' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check' })))
    expect(await screen.findByText('Every word heard.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByText('All 1 sentence done.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('Ich bin da.')).toBeNull()
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

describe('listening state', () => {
  afterEach(() => {
    cleanup()
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
  })

  it('shows plain text and the live transcript; no animation; stops only on click', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
    const { container } = render(<TalkInput onSend={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByText('Listening. Click Stop when you are done.')).toBeInTheDocument()
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    act(() => FakeRec.last.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'Hallo' }], { isFinal: false })] }))
    expect(screen.getByText(/Hallo/)).toBeInTheDocument()
    act(() => FakeRec.last.onend?.())
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument() // browser end: still live
  })
})
