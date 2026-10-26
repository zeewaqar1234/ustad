import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnswerResult, Gloss, TextDetail } from '../../lib/reading'
import { tokens } from '../../lib/reading'
import { Reader } from './Reader'

const text: TextDetail = {
  id: 3,
  title: 'Bilal in Frankfurt',
  topic: 'serial',
  level: 'B1.1',
  kind: 'graded',
  status: 'ok',
  review_notes: [],
  credit: 'Ustad (own text)',
  licence: 'own',
  source_url: null,
  sentences: [
    { de: 'Bilal fährt zur Arbeit.', en: 'Bilal goes to work.' },
    { de: 'Die Bahn ist spät.', en: 'The train is late.' },
  ],
  density: { known_pct: 96, words: 8, unknown: ['Bahn'] },
  glossary: [],
  questions: [
    { id: 'q1', kind: 'rf', prompt: 'Die Bahn ist pünktlich.', left: [], options: ['richtig', 'falsch'] },
    { id: 'q2', kind: 'mc', prompt: 'Wohin fährt Bilal?', left: [], options: ['nach Hause', 'zur Arbeit', 'zum Arzt'] },
    {
      id: 'q3',
      kind: 'match',
      prompt: 'Was passt?',
      left: ['Bilal', 'Die Bahn'],
      options: ['ist spät', 'fährt zur Arbeit'],
    },
  ],
  result: null,
}

const result: AnswerResult = {
  score: 67,
  results: [
    { id: 'q1', correct: false, given: [0], answer: [1] },
    { id: 'q2', correct: true, given: [1], answer: [1] },
    { id: 'q3', correct: true, given: [1, 0], answer: [1, 0] },
  ],
}

const gloss: Gloss = {
  word: 'Bahn',
  lemma: 'Bahn',
  en: 'train, railway',
  gender: 'f',
  plural: 'Bahnen',
  item_id: null,
  in_srs: false,
  known: false,
}

function mockFetch() {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    let body: unknown = text
    if (url.startsWith('/api/texts/gloss')) body = gloss
    else if (url.endsWith('/answers')) body = result
    else if (url.endsWith('/add')) body = { item_id: 9, added: true }
    void init
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/3']}>
        <Routes>
          <Route path="/read/:id" element={<Reader />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Reader', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('splits sentences into tappable words', () => {
    expect(tokens('Die Bahn, spät.').filter((t) => t.word).map((t) => t.text)).toEqual(['Die', 'Bahn', 'spät'])
  })

  it('interlinear English is off by default and toggles on', async () => {
    mockFetch()
    renderReader()
    await screen.findByText('Bilal in Frankfurt')
    expect(screen.queryByText('Bilal goes to work.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'English under' }))
    expect(screen.getByText('Bilal goes to work.')).toBeInTheDocument()
    expect(screen.getByText('The train is late.')).toBeInTheDocument()
  })

  it('click a word opens the gloss panel, Escape and Close shut it', async () => {
    const fetchMock = mockFetch()
    renderReader()
    await screen.findByText('Bilal in Frankfurt')
    fireEvent.click(screen.getByRole('button', { name: 'Bahn' }))
    const panel = await screen.findByRole('dialog', { name: 'Meaning of Bahn' })
    expect(panel.tagName).toBe('ASIDE')
    expect(panel.className).not.toMatch(/fixed|bottom-0/)
    expect(await screen.findByText('die Bahn')).toBeInTheDocument()
    expect(screen.getByText('train, railway')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to SRS' }))
    expect(await screen.findByText('Added to your cards.')).toBeInTheDocument()
    const add = fetchMock.mock.calls.find(([u]) => u === '/api/texts/3/add')
    expect(JSON.parse(add![1]!.body as string)).toMatchObject({ word: 'Bahn', en: 'train, railway' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bahn' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('EN button per sentence shows the translation', async () => {
    mockFetch()
    renderReader()
    await screen.findByText('Bilal in Frankfurt')
    expect(screen.queryByText('The train is late.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Translate sentence 2' }))
    expect(screen.getByText('The train is late.')).toBeInTheDocument()
    expect(screen.queryByText('Bilal goes to work.')).not.toBeInTheDocument()
  })

  it('hides answers until Check, then shows them', async () => {
    const fetchMock = mockFetch()
    renderReader()
    await screen.findByText('Bilal in Frankfurt')
    expect(screen.queryByText(/Answer:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Correct\./)).not.toBeInTheDocument()
    const check = screen.getByRole('button', { name: 'Check' })
    expect(check).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'richtig' }))
    fireEvent.click(screen.getByRole('button', { name: 'zur Arbeit' }))
    fireEvent.change(screen.getByLabelText('Bilal'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Die Bahn'), { target: { value: '0' } })
    expect(check).toBeEnabled()
    fireEvent.click(check)
    await waitFor(() => expect(screen.getByTestId('answer-q1')).toHaveTextContent('Answer: falsch'))
    expect(screen.getByTestId('answer-q2')).toHaveTextContent('Correct.')
    expect(screen.getByText('Score: 67%')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([u]) => u === '/api/texts/3/answers')
    expect(JSON.parse(post![1]!.body as string).answers).toEqual({ q1: [0], q2: [1], q3: [1, 0] })
  })

  it('transcript toggle hides the text but keeps sentence replay', async () => {
    mockFetch()
    renderReader()
    await screen.findByText('Bilal in Frankfurt')
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    expect(screen.queryByRole('button', { name: 'Bahn' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play sentence 2' })).toBeInTheDocument()
  })
})
