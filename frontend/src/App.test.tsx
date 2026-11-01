import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { ReviewSession } from './features/review/ReviewSession'

afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

test('shows the login form when not logged in', async () => {
  vi.stubGlobal('fetch', vi.fn(() => respond(401, { detail: 'Not logged in' })))
  wrap(<App />)
  expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
})

test('review hides the answer until an attempt, then shows the diff', async () => {
  const card = {
    card_id: 7, card_type: 'produce', deck: 'life', mode: 'type',
    prompt: 'the street (with article)', hint: 'with article',
  }
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/review/next')) return respond(200, { card, left: 3 })
    return respond(200, {
      rating: 2,
      grade: {
        rating: 2, verdict: 'close', expected: 'die Straße',
        notes: ['Spelling: Straße is written with ß'],
        diff: [['equal', 'die Stra'], ['delete', 'ss'], ['insert', 'ß'], ['equal', 'e']],
      },
      item: {
        item_id: 1, de: 'die Straße', en: 'the street', gender: 'f', symbol: '●', plural: 'Straßen',
        example_de: 'Die Straße ist gesperrt.', example_en: 'The street is closed.', status: 'ok',
      },
      next_due: null,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  wrap(<ReviewSession block="manzil" />)
  expect(await screen.findByText('the street (with article)')).toBeInTheDocument()
  expect(screen.queryByText('die Straße')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Your answer in German'), { target: { value: 'die Strasse' } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
  expect(await screen.findByText('Almost.')).toBeInTheDocument()
  expect(screen.getByText('Small slip.')).toBeInTheDocument()
  expect(screen.queryByText(/Rated/)).not.toBeInTheDocument()
  expect(screen.getByTitle('add')).toHaveTextContent('ß')
  expect(screen.getByText('Enter continues.')).toBeInTheDocument()
})

test('review: hint line documents the umlaut shortcut', async () => {
  const card = { card_id: 7, card_type: 'produce', deck: 'life', mode: 'type', prompt: 'the street', hint: null }
  vi.stubGlobal('fetch', vi.fn(() => respond(200, { card, left: 1 })))
  wrap(<ReviewSession block="manzil" />)
  expect(await screen.findByText(/hold a letter for ä ö ü, or Option\+u/)).toBeInTheDocument()
})
