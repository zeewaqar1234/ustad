import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test } from 'vitest'
import type { ModuleStand, Standing } from '../../lib/standing'
import { paceLine } from '../../lib/standing'
import { StandBox } from './StandBox'

afterEach(cleanup)

function mod(over: Partial<ModuleStand> & { module: ModuleStand['module']; label: string }): ModuleStand {
  return {
    pass: 60, state: 'none', status: 'none', status_word: 'Not measured yet', low: null, high: null,
    centre: null, to_pass: null, official: false, action: 'Measure', n: 0, evidence: [],
    forecast: { state: 'need_more', text: 'Forecast needs 2 more checks at least a week apart.' },
    verified: true, verify_note: null, measure_minutes: 40, ...over,
  }
}

function standing(modules: ModuleStand[], over: Partial<Standing> = {}): Standing {
  return {
    today: '2026-10-29', exam: 'Goethe-Zertifikat B1', level: 'B1', pass_points: 60, module_max_points: 100,
    goals: { target_exam: 'B1', target_date: null, weekly_hours: null }, modules,
    pace: { measured: false, days_with_activity: 2, note: 'Not measured yet. Pace needs 7 days with study time; so far 2.' },
    needed_pace: null, hours: { last_7: {}, last_28: {} }, cefr: '', cefr_source: '', sources: {}, ...over,
  }
}

function show(s: Standing) {
  return render(<MemoryRouter><StandBox data={s} /></MemoryRouter>)
}

test('empty: every module says Not measured yet, no digits are shown for modules, only the pass rule', () => {
  const s = standing([
    mod({ module: 'lesen', label: 'Lesen' }), mod({ module: 'hoeren', label: 'Hören' }),
    mod({ module: 'schreiben', label: 'Schreiben', measure_minutes: 60 }),
    mod({ module: 'sprechen', label: 'Sprechen', measure_minutes: 15 }),
  ])
  show(s)
  expect(screen.getAllByText('Not measured yet').length).toBeGreaterThanOrEqual(4)
  expect(screen.getByText('Measure (60 min)')).toBeInTheDocument()
  expect(screen.getByText('Measure (15 min)')).toBeInTheDocument()
  // dotted empty tracks have no range bar and no pass tick
  expect(screen.queryAllByTestId('pass-tick')).toHaveLength(0)
  expect(screen.queryByText(/to pass/)).toBeNull()
  expect(screen.queryByText(/ to \d+/)).toBeNull()
})

test('the four states render with fixed words, the range and the pass tick', () => {
  const s = standing([
    mod({ module: 'lesen', label: 'Lesen', state: 'estimate', status: 'near', status_word: 'Near the pass line', low: 52, high: 72, centre: 62, to_pass: 0, n: 1 }),
    mod({ module: 'hoeren', label: 'Hören', state: 'estimate', status: 'at_or_above', status_word: 'At or above the pass line', low: 66, high: 78, centre: 72, to_pass: 0, n: 3 }),
    mod({ module: 'schreiben', label: 'Schreiben', state: 'estimate', status: 'below', status_word: 'Below the pass line', low: 46, high: 56, centre: 51, to_pass: 9, n: 3 }),
    mod({ module: 'sprechen', label: 'Sprechen', state: 'official', status: 'at_or_above', status_word: 'At or above the pass line', low: 64, high: 64, centre: 64, official: true, n: 1 }),
  ])
  show(s)
  expect(screen.getByText('52 to 72')).toBeInTheDocument()
  expect(screen.getByText('Near the pass line')).toBeInTheDocument()
  expect(screen.getByText('Below the pass line')).toBeInTheDocument()
  expect(screen.getByText(/, about 9 to pass/)).toBeInTheDocument()
  expect(screen.getByText('64')).toBeInTheDocument()
  expect(screen.getByText(/official result/)).toBeInTheDocument()
  expect(screen.getAllByTestId('pass-tick')).toHaveLength(4)
  expect(screen.getByText(/Pass = 60 of 100 in each module/)).toBeInTheDocument()
})

test('a mixed box shows a number only for measured modules', () => {
  const s = standing([
    mod({ module: 'lesen', label: 'Lesen', state: 'estimate', status: 'below', status_word: 'Below the pass line', low: 30, high: 50, centre: 40, to_pass: 20, n: 1 }),
    mod({ module: 'hoeren', label: 'Hören' }),
    mod({ module: 'schreiben', label: 'Schreiben' }),
    mod({ module: 'sprechen', label: 'Sprechen' }),
  ])
  show(s)
  expect(screen.getAllByTestId('pass-tick')).toHaveLength(1)
  expect(screen.getAllByText('Not measured yet')).toHaveLength(3) // the three unmeasured modules
})

test('pace line: needed pace and weekly target', () => {
  const s = standing([], {
    pace: { measured: true, days_with_activity: 12, hours_per_week: 3.1 },
    goals: { target_exam: 'B1', target_date: '2027-03-15', weekly_hours: 5 },
    needed_pace: { measured: true, hours_per_week: 4, missing: ['Hören'] },
  })
  expect(paceLine(s)).toBe(
    'Pace: 3.1 h/week (last 28 days) · your weekly target: 5 h · needed for your date: 4.0 h/week (without Hören: no trend yet)',
  )
  const n = standing([], { needed_pace: { measured: false, note: 'The target date has passed.' } })
  expect(paceLine(n)).toContain('needed for your date: The target date has passed')
})
