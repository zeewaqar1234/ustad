export type ModuleKey = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen'

export interface EvidenceRow {
  id: number
  date: string
  kind: string
  teil: number | null
  points: number
  points_max: number
  raw: number | null
  raw_max: number | null
  weight: number
  weight_today: number
  note: string
}

export interface Forecast {
  state: string
  text: string
  assumption?: string
  date?: string
}

export interface ModuleStand {
  module: ModuleKey
  label: string
  pass: number
  state: 'none' | 'estimate' | 'official'
  status: 'none' | 'below' | 'near' | 'at_or_above'
  status_word: string
  low: number | null
  high: number | null
  centre: number | null
  to_pass: number | null
  official: boolean
  action: string | null
  n: number
  evidence: EvidenceRow[]
  forecast: Forecast
  verified: boolean
  verify_note: string | null
  measure_minutes: number
  pronunciation_unknown?: number | null
}

export interface Pace {
  measured: boolean
  days_with_activity: number
  note?: string
  hours_per_week?: number
  per_skill?: Record<string, number>
}

export interface Standing {
  today: string
  exam: string
  level: 'B1' | 'B2'
  pass_points: number
  module_max_points: number
  goals: { target_exam: 'B1' | 'B2'; target_date: string | null; weekly_hours: number | null }
  modules: ModuleStand[]
  pace: Pace
  needed_pace: { measured: boolean; hours_per_week?: number; note?: string; missing?: string[] } | null
  hours: { last_7: Record<string, number>; last_28: Record<string, number> }
  cefr: string
  cefr_source: string
  sources: Record<string, string>
}

export interface GrammarState {
  code: string
  title: string
  state: 'new' | 'shaky' | 'ok' | 'solid'
  accuracy: number | null
  events: number
}

export interface Progress extends Standing {
  weekly_hours: { weeks: { week_start: string; hours: Record<string, number> }[] }
  grammar: GrammarState[]
  error_rate: {
    measured: boolean
    note?: string
    rate_pct?: number
    errors?: number
    opportunities: number
    window_days: number
    target_pct: number
    tags: string[]
  }
  tag_weeks: {
    min_uses: number
    tags: { tag: string; errors: number; weeks: { week_start: string; uses: number; rate_pct: number | null }[] }[]
  }
  wordlist: {
    measured: boolean
    note?: string
    mature?: number
    list_lemmas?: number
    list_size_official: number
    list: string
    source_url: string
  }
  official_task_lists: Record<ModuleKey, { n: number; label?: string; items?: number; max: number }[]>
}

export const MODULE_SKILLS: Record<ModuleKey, string[]> = {
  lesen: ['reading', 'vocab'],
  hoeren: ['listening'],
  schreiben: ['writing', 'grammar'],
  sprechen: ['speaking'],
}

export const KIND_LABEL: Record<string, string> = {
  real_exam: 'Official result',
  practice_full: 'Whole practice test',
  practice_teil: 'One Teil of a practice test',
  app_check: 'App check',
}

/** "52 to 72", or "60" for an official result. Never called for an unmeasured module. */
export function rangeText(m: ModuleStand): string {
  if (m.low === null || m.high === null) return 'Not measured yet'
  return m.official ? `${Math.round(m.low)}` : `${Math.round(m.low)} to ${Math.round(m.high)}`
}

export function hoursText(h: number): string {
  return `${h.toFixed(1)} h`
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function paceLine(s: Standing): string {
  const parts: string[] = []
  if (s.pace.measured && s.pace.hours_per_week !== undefined) {
    parts.push(`Pace: ${hoursText(s.pace.hours_per_week)}/week (last 28 days)`)
  } else {
    parts.push(`Pace: ${(s.pace.note ?? 'Not measured yet').replace(/\.$/, '')}`)
  }
  if (s.goals.weekly_hours) parts.push(`your weekly target: ${s.goals.weekly_hours} h`)
  const np = s.needed_pace
  if (np) {
    parts.push(
      np.measured && np.hours_per_week !== undefined
        ? `needed for your date: ${hoursText(np.hours_per_week)}/week${np.missing?.length ? ` (without ${np.missing.join(', ')}: no trend yet)` : ''}`
        : `needed for your date: ${(np.note ?? 'Not measured yet').replace(/\.$/, '')}`,
    )
  }
  return parts.join(' · ')
}

