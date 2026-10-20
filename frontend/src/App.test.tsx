import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

test('shows backend status from /api/health', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: 'ok' }) }),
  )
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Ustad' })).toBeInTheDocument()
  expect(await screen.findByText('Backend: ok')).toBeInTheDocument()
})
