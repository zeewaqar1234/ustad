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
  prompt_correction: string | null
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

export interface ReviewLine {
  turn: number
  said: string
  better: string
  errors: ReviewError[]
  needs_review: boolean
}

export interface VoiceSession {
  id: number
  mode: 'roleplay' | 'free'
  scenario: { code: string; title: string; goal_en: string; chunks: Chunk[] }
  status: 'open' | 'reviewed' | 'lt_only'
  turns: Turn[]
  review: { source: string | null; lines: ReviewLine[]; teaching_points: string[] } | null
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
