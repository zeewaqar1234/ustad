import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { type Readiness, type SkillReadiness, trendText } from '../../lib/readiness'
import { LevelBox } from './LevelBox'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SKILLS = ['vocab', 'grammar', 'reading', 'listening', 'writing', 'speaking']
const BANDS = ['A2', 'B1.1', 'B1.2', 'B2']
function skill(name: string, over: Partial<SkillReadiness> = {}): SkillReadiness {
  return {
    skill: name, label: name, measured: false, mean: null, lo: null, hi: null, pm_pts: null, n: 0, trend_pts: null,
    status: 'none', status_word: 'Not measured yet', proxy: null, measure: 'Do it.', pace_per_week: 0,
    hours_28: 0, history: [], placement_only: false, forecast: null, ...over,
  }
}
function data(over: Partial<Readiness> = {}): Readiness {
  return {
    today: '2026-10-30', goals: { target_exam: 'B1', target_date: null, weekly_hours: null },
    level: { label: null, taken: null, working_on: null, bands: BANDS, passed: [], goal_band: 'B1.2', goal_reached: false, note: '' },
    line: { share: 0.7, source: 'placement rule' }, target: { exam: 'Goethe-Zertifikat B1', level: 'B1' },
    practice: { measured: 0, of: 6, practised: 0, at_line: 0, n: 0, since_placement: false, mean: null, lo: null, hi: null, pm_pts: null },
    move_up: { ready: false, text: 'Take the placement test to get a starting level.' },
    skills: SKILLS.map((s) => skill(s)), pace: { measured: false, days_with_activity: 0, note: 'Not measured yet. Pace needs 7 days.' },
    hours_since_placement: null,
    milestone: { target_date: null, days_left: null, forecast_date: null, needed_per_week: null, pace_per_week: null, hours_needed: null, text: null, note: null, state: 'none', unclear: [] },
    calibration: { n: 0, note: 'No practice test entered yet.' }, b2_note: null, ...over,
  }
}

const placed = (over: Partial<Readiness> = {}) =>
  data({
    goals: { target_exam: 'B1', target_date: '2027-01-28', weekly_hours: null },
    level: { label: 'B1.1', taken: '2026-08-31', working_on: 'B1.1', bands: BANDS, passed: ['A2'], goal_band: 'B1.2', goal_reached: false, note: '' },
    practice: { measured: 1, of: 6, practised: 1, at_line: 1, n: 120, since_placement: true, mean: 0.78, lo: 0.7, hi: 0.85, pm_pts: 7 },
    move_up: { ready: false, text: '1 of 6 skills at 70% or more on B1 work. When all are, retake the placement test.' },
    skills: SKILLS.map((s) =>
      s === 'reading'
        ? skill(s, { label: 'Lesen', measured: true, mean: 0.78, lo: 0.7, hi: 0.85, pm_pts: 7, n: 120, trend_pts: 6, status: 'at_or_above', status_word: '70% or more' })
        : skill(s),
    ),
    pace: { measured: true, days_with_activity: 20, hours_per_week: 3.1 },
    hours_since_placement: 46,
    milestone: { target_date: '2027-01-28', days_left: 90, forecast_date: '2026-12-15', needed_per_week: 4, pace_per_week: 3.1, hours_needed: 32, slowest: 'Hören', state: 'date', text: null, note: null, unclear: ['Lesen'] },
    ...over,
  })

function mount(d: Readiness, extra?: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; method: string; body: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      const body = extra?.(url, init) ?? d
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LevelBox />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return calls
}

test('empty: no level, no number for any skill, asks for placement and the goal', async () => {
  mount(data())
  expect(await screen.findByText(/Not placed yet/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Take the placement test' })).toBeInTheDocument()
  expect(screen.getByText('Which exam?')).toBeInTheDocument()
  expect(screen.getAllByText(/^Not measured yet/).length).toBeGreaterThanOrEqual(6)
  expect(screen.queryByText(/±/)).toBeNull()
  expect(screen.queryByText(/right on B1 work/)).toBeNull()
})

test('placed: ladder shows passed, current band and goal; numbers come from the API', async () => {
  mount(placed())
  expect(await screen.findByText('B1.1', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByTestId('band-A2').getAttribute('data-state')).toBe('passed')
  expect(screen.getByTestId('band-B1.1').getAttribute('data-state')).toBe('here')
  expect(screen.getByTestId('band-B1.2').getAttribute('data-state')).toBe('ahead')
  expect(screen.getByTestId('goal-line')).toBeInTheDocument()
  expect(screen.getByText(/Since then: .*right on B1 work, ± 7 points, from 120 practice answers/)).toBeInTheDocument()
  expect(screen.getByText(/not an official CEFR result/)).toBeInTheDocument()
  const row = screen.getByTestId('skill-reading')
  expect(row.textContent).toContain('78%')
  expect(row.textContent).toContain('± 7')
  expect(row.textContent).toContain('+6 points')
  expect(row.textContent).toContain('70% or more')
})

test('time to goal: hours bar, days bar, pace, needed and date', async () => {
  mount(placed())
  expect(await screen.findByRole('img', { name: /Hours: 46 h practised since placement, about 32 h more/ })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /Days: 60 since placement, 90 to your date/ })).toBeInTheDocument()
  expect(screen.getByText('3.1 h/week, last 4 weeks')).toBeInTheDocument()
  expect(screen.getByText(/4\.0 h\/week to make your date, 0\.9 h\/week more than now/)).toBeInTheDocument()
  expect(screen.getByText(/about 15 Dec 2026 \(Hören is slowest\)\. Lesen: more answers decide/)).toBeInTheDocument()
})

test('time to goal: unknown hours say so instead of a number', async () => {
  mount(placed({ milestone: { target_date: '2027-01-28', days_left: 90, forecast_date: null, needed_per_week: null, pace_per_week: 3.1, hours_needed: null, state: 'need_data', text: 'Lesen: needs 3 weeks with answers; so far 1.', note: null, unclear: [] } }))
  expect(await screen.findByText(/72 h practised since placement|46 h practised since placement/)).toBeInTheDocument()
  expect(screen.getByText(/Hours still needed: not known yet/)).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /^Hours:/ })).toBeNull()
  expect(screen.getByText('Lesen: needs 3 weeks with answers; so far 1.')).toBeInTheDocument()
})

test('trend text', () => {
  expect(trendText(null)).toBe('not enough history')
  expect(trendText(0)).toBe('no change')
  expect(trendText(-4)).toBe('−4 points')
})

test('explain: shown only after the click, with the source line', async () => {
  const insight = { source: 'template', summary: 'Fixed sentence.', strengths: [], weaknesses: ['Schreiben: 40%.'], next_steps: ['Write the task.'] }
  const calls = mount(data(), (url) => (url.startsWith('/api/readiness/insight') ? insight : data()))
  expect(screen.queryByTestId('insight')).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Explain in words' }))
  await waitFor(() => expect(screen.getByTestId('insight')).toBeInTheDocument())
  expect(screen.getByText('Fixed sentence.')).toBeInTheDocument()
  expect(screen.getByText(/Fixed sentences from the same numbers/)).toBeInTheDocument()
  expect(calls.some((c) => c.method === 'POST' && c.url === '/api/readiness/insight')).toBe(true)
})

test('goal question keeps the saved exam and weekly hours', async () => {
  const calls = mount(data({ goals: { target_exam: 'B2', target_date: null, weekly_hours: 5 } }))
  fireEvent.change(await screen.findByLabelText('By when?'), { target: { value: '2027-03-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Set goal' }))
  await waitFor(() => expect(calls.some((c) => c.url === '/api/goals')).toBe(true))
  expect(JSON.parse(calls.find((c) => c.url === '/api/goals')!.body)).toEqual({ target_exam: 'B2', target_date: '2027-03-01', weekly_hours: 5 })
})

test('a level without a placement date shows no date instead of Invalid Date', async () => {
  const d = placed()
  mount({ ...d, level: { ...d.level, taken: null } })
  expect(await screen.findByText(/^placement test\. The app/)).toBeInTheDocument()
  expect(screen.queryByText(/Invalid Date/)).toBeNull()
})
