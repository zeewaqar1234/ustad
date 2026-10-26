export interface VoiceSettings {
  show_fluency: boolean
  talk_mode: 'hold' | 'tap'
}

export interface Chunk {
  de: string
  en: string
}

export interface Scenario {
  code: string
  kind: 'roleplay' | 'free'
  title: string
  level: string
  setting_en: string
  goal_en: string
  address: 'du' | 'Sie'
  chunks: Chunk[]
}

export interface Turn {
  idx: number
  input_mode: 'voice' | 'text' | null
  user: string | null
  reply_de: string | null
  reply_en: string | null
  tutor_status: 'ok' | 'offline'
  needs_review: boolean
}

export interface ReviewError {
  span: string
  fix: string
  tag: string
  reason_en: string
  start: number
  end: number
}

// All grading of a session comes from the end-of-session review, including the stars.
export interface ReviewLine {
  turn: number
  said: string
  better: string
  graded: boolean // false: LanguageTool only, or the model left this line out
  errors: ReviewError[]
  stars: 1 | 2 | 3 | null
  needs_review: boolean
}

export interface ReviewSummary {
  lines: number
  graded: number
  clean: number
  errors: number
  stars: number
  max_stars: number
}

export interface VoiceSession {
  id: number
  mode: 'roleplay' | 'free'
  scenario: { code: string; title: string; goal_en: string; chunks: Chunk[] }
  status: 'open' | 'reviewed' | 'lt_only'
  turns: Turn[]
  review: { source: string | null; lines: ReviewLine[]; teaching_points: string[]; summary?: ReviewSummary } | null
}

export interface ShadowSentence {
  item_id: number
  de: string
  en: string
}

export interface ShadowResult {
  reference: string
  heard: string
  words: { word: string; ok: boolean }[]
  matched: number
  total: number
  pct: number
  fluency?: number
}

export const SCENARIO_ICON: Record<string, string> = {
  KANTINE: '🍽️',
  DESK_MEETING: '💻',
  INCIDENT: '🚨',
  MANAGER: '📈',
  ARZT_TELEFON: '🩺',
  BAHN_ANSCHLUSS: '🚆',
  GUPSHUP: '💬',
}
