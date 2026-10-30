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
  confidence_pct: number
  n: number
  status: 'none' | 'below' | 'near' | 'at_or_above' | 'indicator'
  status_word: string
  proxy: string | null
  measure: string
  census?: boolean
  pace_per_week: number
  hours_28: number
  history: { date: string; mean: number; lo: number; hi: number; n: number }[]
  forecast: Forecast | null
}

export interface Readiness {
  today: string
  goals: { target_exam: 'B1' | 'B2'; target_date: string | null; weekly_hours: number | null }
  level: { label: string | null; taken: string | null; note: string }
  target: { exam: string; level: string; share: number; source: string }
  overall: {
    measured: number
    of: number
    mean: number | null
    lo: number | null
    hi: number | null
    confidence_pct: number
    status: string
    status_word: string
  }
  skills: SkillReadiness[]
  pace: { measured: boolean; note?: string; hours_per_week?: number; days_with_activity: number }
  milestone: {
    target_date: string | null
    days_left: number | null
    forecast_date: string | null
    needed_per_week: number | null
    pace_per_week?: number | null
    hours_needed?: number
    state?: string
    text?: string
    note: string | null
  }
  calibration: { n: number; note?: string; mean_abs_error_pts?: number }
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

export function rangeLabel(s: { lo: number | null; hi: number | null; mean: number | null; census?: boolean }): string {
  if (s.mean === null || s.lo === null || s.hi === null) return ''
  return s.census ? pct(s.mean) : `${pct(s.lo)} to ${pct(s.hi)}`
}

export function milestoneLine(r: Readiness): string {
  const m = r.milestone
  const parts: string[] = []
  if (r.pace.measured && r.pace.hours_per_week !== undefined) {
    parts.push(`Pace: ${r.pace.hours_per_week.toFixed(1)} h/week (last 28 days)`)
  } else {
    parts.push(`Pace: ${(r.pace.note ?? 'No evidence yet').replace(/\.$/, '')}`)
  }
  if (m.state === 'date' && m.forecast_date) {
    parts.push(`at this pace every measured skill reaches the line about ${new Date(`${m.forecast_date}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`)
  } else if (m.state === 'far') {
    parts.push('more than a year at this pace')
  } else if (m.state === 'reached') {
    parts.push('every measured skill is at the line')
  } else if (m.state === 'need_data' && m.text) {
    parts.push(m.text.replace(/\.$/, ''))
  }
  if (m.needed_per_week !== null && m.needed_per_week !== undefined) {
    const extra =
      m.pace_per_week !== null && m.pace_per_week !== undefined && m.needed_per_week > m.pace_per_week
        ? `, ${(m.needed_per_week - m.pace_per_week).toFixed(1)} h/week more than now`
        : ''
    parts.push(`for your date you need ${m.needed_per_week.toFixed(1)} h/week${extra}`)
  }
  return parts.join(' · ')
}
