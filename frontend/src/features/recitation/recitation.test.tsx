import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { RecitationList } from './RecitationList'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('Type / Speak switch changes the links and is stored in the query string', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ code: 'SEIN', title: 'sein', stage: 0, passed_today: false, passes: 0 }]),
      }),
    ),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/recitation']}>
        <RecitationList />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const row = await screen.findByRole('link', { name: /sein/ })
  expect(row).toHaveAttribute('href', '/recitation/SEIN')
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }))
  expect(screen.getByRole('link', { name: /sein/ })).toHaveAttribute('href', '/recitation/SEIN?mode=speak')
  expect(screen.getByRole('button', { name: 'Speak' })).toHaveAttribute('aria-pressed', 'true')
})
