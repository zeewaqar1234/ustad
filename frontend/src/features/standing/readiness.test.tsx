import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { milestoneLine, type Readiness, type SkillReadiness } from '../../lib/readiness'
import { Dial } from './Dial'
import { ReadinessBox } from './ReadinessBox'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SKILLS = ['vocab', 'grammar', 'reading', 'listening', 'writing', 'speaking']
function skill(name: string, over: Partial<SkillReadiness> = {}): SkillReadiness {
  return {
    skill: name, label: name, measured: false, mean: null, lo: null, hi: null, confidence_pct: 0, n: 0,
    status: 'none', status_word: 'No evidence yet', proxy: null, measure: 'Do it.', pace_per_week: 0,
    hours_28: 0, history: [], forecast: null, ...over,
  }
}
function data(over: Partial<Readiness> = {}): Readiness {
  return {
    today: '2026-10-29', goals: { target_exam: 'B1', target_date: null, weekly_hours: null },
    level: { label: null, taken: null, note: '' }, target: { exam: 'Goethe-Zertifikat B1', level: 'B1', share: 0.6, source: 'https://x' },
    overall: { measured: 0, of: 6, mean: null, lo: null, hi: null, confidence_pct: 0, status: 'none', status_word: 'No evidence yet' },
    skills: SKILLS.map((s) => skill(s)), pace: { measured: false, days_with_activity: 0, note: 'No evidence yet. Pace needs 7 days.' },
    milestone: { target_date: null, days_left: null, forecast_date: null, needed_per_week: null, note: null },
    calibration: { n: 0, note: 'No practice test entered yet.' }, b2_note: null, ...over,
  }
}

function mount(d: Readiness, extra?: (url: string, init?: RequestInit) => unknown) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      const body = extra?.(url, init) ?? d
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReadinessBox />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return calls
}

test('dial: no value is an empty dial with no number and no range arc', () => {
  render(<Dial mean={null} lo={null} hi={null} target={0.6} label="Lesen" />)
  expect(screen.getByRole('img', { name: 'Lesen: no evidence yet' })).toBeInTheDocument()
  expect(screen.queryByTestId('dial-range')).toBeNull()
  expect(screen.getByText('No data')).toBeInTheDocument()
  expect(screen.getByTestId('pass-tick')).toBeInTheDocument()
})

test('dial: a value shows the number, the range arc and the pass tick', () => {
  render(<Dial mean={0.72} lo={0.6} hi={0.84} target={0.6} label="Lesen" />)
  expect(screen.getByText('72%')).toBeInTheDocument()
  expect(screen.getByTestId('dial-range')).toBeInTheDocument()
})

test('empty: no level, no number for any skill, asks for the goal and the placement test', async () => {
  mount(data())
  expect(await screen.findByText('Not placed.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Take the placement test' })).toBeInTheDocument()
  expect(screen.getByText('Which exam do you want to pass?')).toBeInTheDocument()
  expect(screen.getAllByText('No evidence yet').length).toBeGreaterThanOrEqual(7)
  expect(screen.queryByText(/\d+%\s+to\s+\d+%/)).toBeNull()
  expect(screen.getByText(/0 of 6|confidence 0%, 0 of 6/)).toBeInTheDocument()
})

test('filled: level label, goal, ranges and confidence', async () => {
  const d = data({
    goals: { target_exam: 'B1', target_date: '2026-12-30', weekly_hours: null },
    level: { label: 'B1.1', taken: '2026-10-25', note: '' },
    overall: { measured: 1, of: 6, mean: 0.7, lo: 0.58, hi: 0.82, confidence_pct: 12, status: 'near', status_word: 'Near the 60% line' },
    skills: SKILLS.map((s) => (s === 'reading' ? skill(s, { measured: true, mean: 0.7, lo: 0.58, hi: 0.82, confidence_pct: 76, n: 30, status: 'near', status_word: 'Near the 60% line' }) : skill(s))),
    milestone: { target_date: '2026-12-30', days_left: 62, forecast_date: null, needed_per_week: null, note: null },
  })
  mount(d)
  expect(await screen.findByText(/B1\.1/)).toBeInTheDocument()
  expect(screen.getByText(/by 30 Dec 2026, 62 days left/)).toBeInTheDocument()
  expect(screen.getAllByText('58% to 82%')).toHaveLength(2) // overall and Lesen
  expect(screen.getByText('confidence 76%')).toBeInTheDocument()
  expect(screen.queryByText('Which exam do you want to pass?')).toBeNull()
})

test('milestone line: pace, date and the extra effort needed', () => {
  const d = data({
    pace: { measured: true, days_with_activity: 12, hours_per_week: 3.1 },
    milestone: { target_date: '2027-03-15', days_left: 60, forecast_date: '2027-02-10', needed_per_week: 4.0, pace_per_week: 3.1, state: 'date', note: null },
  })
  const line = milestoneLine(d)
  expect(line).toContain('Pace: 3.1 h/week (last 28 days)')
  expect(line).toContain('about Feb 2027')
  expect(line).toContain('you need 4.0 h/week, 0.9 h/week more than now')
})

test('analysis: shown only after the click, with the source line', async () => {
  const insight = { source: 'template', summary: 'Fixed sentence.', strengths: [], weaknesses: ['Schreiben: 40%.'], next_steps: ['Write the task.'] }
  const calls = mount(data(), (url) => (url.startsWith('/api/readiness/insight') ? insight : data()))
  expect(screen.queryByTestId('insight')).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Analyse these numbers' }))
  await waitFor(() => expect(screen.getByTestId('insight')).toBeInTheDocument())
  expect(screen.getByText('Fixed sentence.')).toBeInTheDocument()
  expect(screen.getByText(/Fixed sentences from the same numbers/)).toBeInTheDocument()
  expect(calls).toContain('POST /api/readiness/insight')
})

test('goal question keeps the saved exam and weekly hours', async () => {
  const d = data({ goals: { target_exam: 'B2', target_date: null, weekly_hours: 5 } })
  const calls: { url: string; body: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? '') })
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) })
    }),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReadinessBox />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const date = await screen.findByLabelText('By when?')
  fireEvent.change(date, { target: { value: '2027-03-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Set goal' }))
  await waitFor(() => expect(calls.some((c) => c.url === '/api/goals')).toBe(true))
  expect(JSON.parse(calls.find((c) => c.url === '/api/goals')!.body)).toEqual({ target_exam: 'B2', target_date: '2027-03-01', weekly_hours: 5 })
})
