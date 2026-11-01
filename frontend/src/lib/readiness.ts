export interface Forecast {
  state: string
  text: string
  date?: string
  hours_needed?: number
}

export interface SkillReadiness {
  skill: string
  label: string
  measured: boolean
  mean: number | null
  lo: number | null
  hi: number | null
  pm_pts: number | null
  n: number
  trend_pts: number | null
  status: 'none' | 'few' | 'below' | 'near' | 'at_or_above'
  status_word: string
  proxy: string | null
  measure: string
  pace_per_week: number
  hours_28: number
  history: { date: string; mean: number; lo: number; hi: number; n: number }[]
  placement_only: boolean
  forecast: Forecast | null
}

export interface Readiness {
  today: string
  goals: { target_exam: 'B1' | 'B2'; target_date: string | null; weekly_hours: number | null }
  level: {
    label: string | null
    /** plain words: "Working on A2" */
    plain?: string | null
    taken: string | null
    working_on: string | null
    bands: string[]
    passed: string[]
    goal_band: string
    goal_reached: boolean
    note: string
  }
  line: { share: number; source: string }
  target: { exam: string; level: 'B1' | 'B2' }
  practice: {
    measured: number
    of: number
    practised: number
    at_line: number
    n: number
    since_placement: boolean
    mean: number | null
    lo: number | null
    hi: number | null
    pm_pts: number | null
  }
  move_up: { ready: boolean; text: string }
  skills: SkillReadiness[]
  pace: { measured: boolean; note?: string; hours_per_week?: number; days_with_activity: number }
  hours_since_placement: number | null
  milestone: {
    target_date: string | null
    days_left: number | null
    forecast_date: string | null
    needed_per_week: number | null
    pace_per_week: number | null
    hours_needed: number | null
    slowest?: string
    unclear: string[]
    state?: string
    text: string | null
    note: string | null
  }
  calibration: { n: number; note?: string; mean_abs_error_pts?: number; skipped?: number }
  b2_note: string | null
}

export interface InsightOut {
  source: 'model' | 'template'
  summary: string
  strengths: string[]
  weaknesses: string[]
  next_steps: string[]
  cached?: boolean
}

export const pct = (x: number | null): string => (x === null ? '' : `${Math.round(x * 100)}%`)

export const hours = (h: number): string => (h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h)} h`)

export function trendText(t: number | null): string {
  if (t === null) return 'not enough history'
  if (t === 0) return 'no change'
  return `${t > 0 ? '+' : '−'}${Math.abs(t)} points`
}

export function dayText(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
