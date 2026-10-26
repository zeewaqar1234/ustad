import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { countWords } from '../../lib/words'
import { Homework } from './Homework'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

const base = {
  kind: 'homework', assigned: '2026-10-26', prompt: 'Write 4 sentences about your day.',
  submission: null, grade: null, status: 'open', pattern_id: null,
}
const grade = {
  source: 'languagetool_only', model: null, score_10: null, original: 'Ich bin müde.',
  corrected_text: 'Ich bin müde.', errors: [], teaching_points: [], needs_review: true,
  review_notes: [], fallback_reason: null,
}

test('countWords ignores extra whitespace', () => {
  expect(countWords('')).toBe(0)
  expect(countWords('  Ich  bin\nmüde. ')).toBe(3)
})

test('preview with id null: shows live word count, creates the row, then submits', async () => {
  const calls: string[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url === '/api/homework/today' && init?.method !== 'POST') return respond(200, { ...base, id: null })
    if (url === '/api/homework/today') return respond(200, { ...base, id: 5 })
    if (url === '/api/homework/5/submit') return respond(200, { ...base, id: 5, grade, status: 'lt_only' })
    return respond(200, [])
  })
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Homework />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const field = await screen.findByLabelText('Your homework in German')
  expect(screen.getAllByText(/^0 words/)).toHaveLength(2)
  fireEvent.change(field, { target: { value: 'Ich bin müde.' } })
  expect(screen.getAllByText(/^3 words/)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(calls).toContain('POST /api/homework/5/submit'))
  expect(calls.indexOf('POST /api/homework/today')).toBeGreaterThan(-1)
  expect(calls.indexOf('POST /api/homework/today')).toBeLessThan(calls.indexOf('POST /api/homework/5/submit'))
})
