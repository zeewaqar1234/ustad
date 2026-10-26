import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiktatResult, DiktatToday } from '../../lib/reading'
import { Diktat } from './Diktat'
import { Podcast } from './Podcast'
import { embedUrl, youtubeId } from './youtube'

const SAY = 'Ich möchte einen Termin vereinbaren.'
const today: DiktatToday = {
  date: '2026-10-26',
  total: 5,
  done: 0,
  sentences: [{ ref: 'item:4', say: SAY, words: 5, done: false, result: null }],
}
const checked: DiktatResult = {
  ref: 'item:4',
  expected: SAY,
  accuracy: 60,
  diff: [
    ['equal', 'Ich m'],
    ['delete', 'o'],
    ['insert', 'ö'],
    ['equal', 'chte einen Termin '],
    ['delete', 'v'],
    ['insert', 'V'],
  ],
  words: [
    { given: 'Ich', expected: 'Ich', kind: 'ok' },
    { given: 'mochte', expected: 'möchte', kind: 'umlaut' },
    { given: 'einen', expected: 'einen', kind: 'ok' },
    { given: 'termin', expected: 'Termin', kind: 'capital' },
    { given: 'vereinbaren', expected: 'vereinbaren.', kind: 'ok' },
  ],
  counts: { ok: 3, umlaut: 1, capital: 1 },
}

describe('Diktat', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('never shows the sentence before Check, shows the diff after', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(new Response(JSON.stringify(url === '/api/dictation/check' ? checked : today), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Diktat />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByText(/Sentence 1 of 1/)
    expect(container.textContent).not.toContain('Termin')
    fireEvent.change(screen.getByLabelText('Write what you hear'), { target: { value: 'Ich mochte einen termin vereinbaren' } })
    fireEvent.keyDown(screen.getByLabelText('Write what you hear'), { key: 'Enter' })
    expect(await screen.findByText('60% of words right')).toBeInTheDocument()
    expect(screen.getByText(`Correct: ${SAY}`)).toBeInTheDocument()
    expect(screen.getByLabelText('Difference to the correct answer')).toBeInTheDocument()
    expect(screen.getByText('umlaut × 1')).toBeInTheDocument()
    expect(screen.getByText('capital letter × 1')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([u]) => u === '/api/dictation/check') as unknown as [string, RequestInit]
    expect(JSON.parse(post[1].body as string)).toMatchObject({ ref: 'item:4', typed: 'Ich mochte einen termin vereinbaren' })
  })

  it('keeps the result on screen when the refetch marks the sentence done', async () => {
    const two: DiktatToday = {
      ...today,
      sentences: [today.sentences[0], { ref: 'item:9', say: 'Wir fahren mit der Bahn.', words: 5, done: false, result: null }],
    }
    let checkedOnce = false
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/dictation/check') {
          checkedOnce = true
          return Promise.resolve(new Response(JSON.stringify(checked), { status: 200 }))
        }
        const body = checkedOnce
          ? { ...two, done: 1, sentences: [{ ...two.sentences[0], done: true, result: checked }, two.sentences[1]] }
          : two
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Diktat />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByText(/Sentence 1 of 2/)
    fireEvent.change(screen.getByLabelText('Write what you hear'), { target: { value: 'Ich mochte' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByText(/1 done today/)).toBeInTheDocument()
    expect(screen.getByText(/Sentence 1 of 2/)).toBeInTheDocument()
    expect(screen.getByText('60% of words right')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/Sentence 2 of 2/)).toBeInTheDocument()
    expect(screen.queryByText('Wir fahren mit der Bahn.')).toBeNull()
  })
})

describe('Podcast', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('offers a plain mp3 download and no offline save', async () => {
    const ep = { id: 1, date: '2026-10-26', url: '/api/podcast/audio/1', duration_s: 300, format: 'mp3', segments: 3, script: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ piper: true, english_voice: true, latest: ep }), { status: 200 }))),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Podcast />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const link = await screen.findByRole('link', { name: 'Download mp3' })
    expect(link).toHaveAttribute('download', 'ustad-podcast-2026-10-26.mp3')
    expect(link).toHaveAttribute('href', '/api/podcast/audio/1')
    expect(screen.queryByText(/offline/i)).toBeNull()
  })
})

describe('youtubeId', () => {
  it('parses the usual link shapes', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('rejects other sites and bad ids', () => {
    expect(youtubeId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(youtubeId('https://www.youtube.com/@EasyGerman')).toBeNull()
    expect(youtubeId('not a url')).toBeNull()
  })
  it('embeds with German captions on', () => {
    expect(embedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?cc_load_policy=1&cc_lang_pref=de',
    )
  })
})
