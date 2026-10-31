import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import type { Plan, PlanRecord } from '../../lib/plan'
import { Progress } from '../../pages/Progress'
import { Home } from './Home'

vi.mock('../standing/LevelBox', () => ({ LevelBox: () => <div>level box</div> }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const daily = {
  date: '2026-10-31', makeup: false,
  manzil: { done: true, due: 0, cap: 50 }, sabqi: { done: false, left: 4 },
  sabaq: { done: false, locked: null, unit: { title: 'Unit 3', scenario: 's', deck: 'd', items: 10 } },
  study_day: false, minutes: 0,
  streak: { current: 0, freezes_left: 2, attendance_week: 0, studied_week: 0, days_in_week_so_far: 1 },
  cards_introduced: 0,
}
const emptyPlan: Plan = {
  date: '2026-10-31', why: 'Not enough graded writing yet.', focus: [],
  review_pattern: null, new_unit: { makeup: false, sabaq: null, pattern: null }, sabqi_drills: [],
  mazmoon: { must_use: [], note: '' }, reading: null, diktat: { picks: [], essay_correction: null },
  speaking_goal: null, use_task: null, blocks: { sabqi: null, diktat: null, speaking: null, reading: null, sabaq: null },
}
const fullPlan: Plan = {
  ...emptyPlan,
  why: 'Verb position was wrong 6 of 10 times this week.',
  focus: [{
    tag: 'verb_pos', label: 'Verb position', family: 'syntax', rate: 0.6, errors: 6, correct: 4, opportunities: 10,
    by_skill: { writing: { errors: 4, correct: 2 } }, samples: [{ skill: 'writing', orig: 'Ich morgen gehe', fix: 'Ich gehe morgen' }],
    taught_pattern: 'verb2', untaught_pattern: null,
  }],
  sabqi_drills: [{ pattern_code: 'verb2', title: 'Verb second', n: 5, reteach: false, reason: 'Wrong 6 of 10.' }],
  use_task: { pattern_code: 'verb2', kind: 'write', text: 'Write two sentences with a time word first.' },
}

function mount(ui: React.ReactElement, routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const key = Object.keys(routes).find((k) => url.startsWith(k))
      const body = key ? routes[key] : {}
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
const homeRoutes = (plan: Plan) => ({
  '/api/daily': daily, '/api/plan': plan, '/api/texts': { today: [] },
  '/api/dictation': { done: 0, total: 3 }, '/api/homework': { status: 'open' },
})

test('Today: why line, focus, hidden example, targeted practice links', async () => {
  mount(<Home />, homeRoutes(fullPlan))
  expect(await screen.findByText(fullPlan.why)).toBeInTheDocument()
  expect(screen.getByText(/Verb position/, { selector: 'span' })).toBeInTheDocument()
  expect(screen.queryByText(/You wrote/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show examples' }))
  expect(screen.getByText(/You wrote: Ich morgen gehe/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Targeted practice' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Start 5 drills' }).getAttribute('href')).toBe('/grammar/verb2/drills?limit=5')
  expect(screen.getByRole('link', { name: 'Re-read the rule' }).getAttribute('href')).toBe('/grammar/verb2')
  expect(screen.getByRole('link', { name: 'Write it' }).getAttribute('href')).toBe('/grammar/verb2/drills?limit=5')
})

test('Today: empty plan shows the why line only', async () => {
  mount(<Home />, homeRoutes(emptyPlan))
  expect(await screen.findByText(emptyPlan.why)).toBeInTheDocument()
  expect(screen.queryByText('Targeted practice')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Show examples' })).toBeNull()
  expect(screen.queryByText(/Makeup day: no new unit/)).toBeNull()
})

test('Progress: plan table row with details', async () => {
  const rec: PlanRecord = {
    ...fullPlan,
    data: {
      window_days: 14, makeup: false, rule: 'Top tag by errors with 8 or more uses.',
      tags: [{ tag: 'verb_pos', errors: 6, correct: 4, opportunities: 10, rate: 0.6 }], shaky_patterns: [], weak_words: 0,
    },
  }
  mount(<Progress />, {
    '/api/plans': { plans: [rec] },
    '/api/progress': {
      grammar: [], weekly_hours: { weeks: [] }, tag_weeks: { tags: [], min_uses: 5 }, modules: [],
      error_rate: { measured: false, note: 'n' }, wordlist: { measured: false, note: 'n' }, pass_points: 60, module_max_points: 100,
    },
    '/api/readiness': { line: { share: 0.7 }, skills: [], calibration: { n: 0, note: 'x' } },
  })
  expect(await screen.findByRole('heading', { name: 'Plan: what Ustad decided and why' })).toBeInTheDocument()
  expect(await screen.findByText(fullPlan.why)).toBeInTheDocument()
  expect(screen.getByText('Verb second')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect(screen.getByText('Top tag by errors with 8 or more uses.')).toBeInTheDocument()
  expect(screen.getByText('60%')).toBeInTheDocument()
})
