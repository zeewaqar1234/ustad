// Phase 4 types: reading (§5.3), Diktat and Commute Podcast (§5.5).
import type { DiffPart } from './api'

export interface TextSummary {
  id: number
  title: string
  topic: string
  level: string
  kind: 'graded' | 'generated' | 'external'
  series_episode: number | null
  words: number
  known_pct: number
  for_date: string | null
  read: boolean
  score: number | null
  status: 'ok' | 'needs_review'
}

export interface TextList {
  today: TextSummary[]
  library: TextSummary[]
}

export interface Question {
  id: string
  kind: 'rf' | 'mc' | 'match'
  prompt: string
  left: string[]
  options: string[]
}

export interface AnswerResult {
  score: number
  results: { id: string; correct: boolean; given: number[]; answer: number[] }[]
}

export interface GlossEntry {
  word: string
  lemma: string
  en: string
  gender: 'm' | 'f' | 'n' | null
  plural: string | null
}

export interface TextDetail {
  id: number
  title: string
  topic: string
  level: string
  kind: TextSummary['kind']
  status: 'ok' | 'needs_review'
  review_notes: string[]
  credit: string
  licence: string
  source_url: string | null
  sentences: { de: string; en: string }[]
  density: { known_pct: number; words: number; unknown: string[] }
  glossary: GlossEntry[]
  questions: Question[]
  result: AnswerResult | null
}

export interface Gloss {
  word: string
  lemma: string
  en: string | null
  gender: 'm' | 'f' | 'n' | null
  plural: string | null
  item_id: number | null
  in_srs: boolean
  known: boolean
}

export type DiktatKind = 'ok' | 'umlaut' | 'capital' | 'ending' | 'spelling' | 'missing' | 'extra'

export interface DiktatResult {
  ref: string
  expected: string
  accuracy: number
  diff: DiffPart[]
  words: { given: string | null; expected: string | null; kind: DiktatKind }[]
  counts: Partial<Record<DiktatKind, number>>
}

export interface DiktatSentence {
  ref: string
  say: string // German for TTS only: never rendered before an attempt
  words: number
  done: boolean
  result: DiktatResult | null
}

export interface DiktatToday {
  date: string
  total: number
  done: number
  sentences: DiktatSentence[]
}

export interface ScriptLine {
  kind: 'prompt' | 'answer' | 'pause' | 'title'
  text: string
}

export interface Episode {
  id: number
  date: string
  url: string
  duration_s: number
  format: 'mp3' | 'wav'
  segments: number
  script: ScriptLine[]
}

export interface PodcastStatus {
  piper: boolean
  english_voice: boolean
  encoder: 'mp3' | 'wav'
  latest: Episode | null
}

export const ARTICLE = { m: 'der', f: 'die', n: 'das' } as const

/** Split a sentence into word and non-word parts; words are tappable. */
export function tokens(sentence: string): { text: string; word: boolean }[] {
  return (sentence.match(/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu) ?? []).map((t) => ({
    text: t,
    word: /\p{L}/u.test(t),
  }))
}

export function minutes(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}
