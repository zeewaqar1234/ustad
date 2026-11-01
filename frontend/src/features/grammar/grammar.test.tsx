import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { RedPen } from '../../components/RedPen'
import { tokenAnswer, type WritingGrade } from '../../lib/grammar'
import { Drills } from './Drills'
import { TokenBuilder } from './TokenBuilder'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

const text = 'Ich habe gestern nach Hause gegangen.'
const grade: WritingGrade = {
  source: 'ollama',
  model: 'qwen',
  score_10: 7,
  original: text,
  corrected_text: 'Ich bin gestern nach Hause gegangen.',
  errors: [
    {
      span: 'habe',
      fix: 'bin',
      tag: 'AUX_HABEN_SEIN',
      reason_en: 'gehen takes sein',
      severity: 2,
      start: 4,
      end: 8,
    },
  ],
  teaching_points: ['Movement verbs take sein in the Perfekt.'],
  needs_review: false,
  review_notes: [],
  fallback_reason: null,
}

test('RedPen underlines error spans with numbers and shows the score', () => {
  render(<RedPen grade={grade} />)
  expect(screen.getByText('7/10')).toBeInTheDocument()
  const spans = screen.getAllByTestId('error-span')
  expect(spans).toHaveLength(1)
  const u = spans[0].querySelector('u')
  expect(u).toHaveTextContent('habe')
  expect(spans[0].querySelector('sup')).toHaveTextContent('1')
  expect(screen.getByText('haben or sein')).toBeInTheDocument()
  expect(screen.getByText('Ich bin gestern nach Hause gegangen.')).toBeInTheDocument()
  expect(screen.queryByText(/No score/)).not.toBeInTheDocument()
})

test('RedPen shows the LanguageTool-only banner instead of a score', () => {
  render(<RedPen grade={{ ...grade, source: 'languagetool_only', model: null, score_10: null, needs_review: true }} />)
  expect(screen.getByText('No score: tutor offline, LanguageTool check only')).toBeInTheDocument()
  expect(screen.queryByText('7/10')).not.toBeInTheDocument()
})

function Builder({ tokens }: { tokens: string[] }) {
  const [placed, setPlaced] = useState<number[]>([])
  return (
    <>
      <TokenBuilder tokens={tokens} placed={placed} onChange={setPlaced} />
      <output data-testid="answer">{tokenAnswer(tokens, placed)}</output>
    </>
  )
}

test('surgery: tapping chips builds the answer, tapping a placed chip removes it', () => {
  render(<Builder tokens={['gestern', 'Ich', 'gearbeitet', 'habe']} />)
  const answer = screen.getByTestId('answer')
  for (const w of ['Ich', 'habe', 'gestern', 'gearbeitet']) fireEvent.click(screen.getByRole('button', { name: w }))
  expect(answer).toHaveTextContent('Ich habe gestern gearbeitet')
  fireEvent.click(screen.getByRole('button', { name: 'Remove habe' }))
  expect(answer.textContent).toBe('Ich gestern gearbeitet')
  fireEvent.click(screen.getByRole('button', { name: 'habe' }))
  expect(answer.textContent).toBe('Ich gestern gearbeitet habe')
})

test('drill sends the built sentence and shows the answer only after Check', async () => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/drills/V2') {
      return respond(200, {
        code: 'V2', title: 'Verb second', started: '2026-10-21T08:00:00',
        drills: [{ id: 'V2:surgery:0', type: 'surgery', instruction: 'Build the sentence.',
          prompt: 'I worked yesterday.', mode: 'tokens', tokens: ['gestern', 'Ich', 'habe', 'gearbeitet'],
          blanks: 0, hint: null }],
      })
    }
    const body = JSON.parse(String(init?.body))
    expect(body.answer).toBe('Ich habe gestern gearbeitet')
    return respond(200, { correct: false, expected: 'Gestern habe ich gearbeitet.', verdict: 'wrong',
      notes: [], diff: [], explain: '' })
  })
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/grammar/V2/drills']}>
        <Routes>
          <Route path="/grammar/:code/drills" element={<Drills />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('I worked yesterday.')).toBeInTheDocument()
  expect(screen.queryByText('Gestern habe ich gearbeitet.')).not.toBeInTheDocument()
  for (const w of ['Ich', 'habe', 'gestern', 'gearbeitet']) fireEvent.click(screen.getByRole('button', { name: w }))
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
  const status = await screen.findByRole('status')
  expect(within(status).getByText('Not yet.')).toBeInTheDocument()
  expect(screen.getByText('Correct')).toBeInTheDocument()
  expect(screen.getByText('Gestern habe ich gearbeitet.')).toBeInTheDocument()
})
