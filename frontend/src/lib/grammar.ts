import type { DiffPart } from './api'

/** Shared types for the Phase 2 endpoints: patterns, drills, homework, Ghalti, Pahara, placement. */

export interface ReviewNote {
  text?: string
  rule?: string
  message: string
  suggestions?: string[]
}

export interface GradeError {
  span: string
  fix: string
  tag: string
  reason_en: string
  severity: number
  start: number
  end: number
}

/** Red-pen result from the writing grader (backend services/grading.py). */
export interface WritingGrade {
  source: string
  model: string | null
  score_10: number | null
  original: string
  corrected_text: string
  errors: GradeError[]
  teaching_points: string[]
  needs_review: boolean
  review_notes: ReviewNote[]
  fallback_reason: string | null
}

export interface PatternRow {
  code: string
  order: number
  group: string
  title: string
  status: string
  done: boolean
  known: boolean
  best_pct: number
  rounds: number
  /** learner model state: new / shaky / ok / solid */
  state?: string
}

export interface PatternList {
  current: string | null
  patterns: PatternRow[]
}

export interface PatternExample {
  context: 'work' | 'life' | 'finance_history'
  de: string
  en: string
}

export interface PatternCard {
  code: string
  order: number
  group: string
  title: string
  rule_en: string
  slot_diagram: { labels: string[]; rows: string[][] }
  examples: PatternExample[]
  common_error: { wrong: string; right: string; tag: string; note_en: string }
  tags: string[]
  homework: string
  status: string
  review_notes: ReviewNote[]
  done: boolean
  best_pct: number
  drill_types: string[]
}

export interface Drill {
  id: string
  type: string
  instruction: string
  prompt: string
  mode: 'tokens' | 'type' | 'blanks'
  tokens: string[]
  blanks: number
  hint: string | null
}

export interface DrillRound {
  code: string
  title: string
  started: string
  limited?: boolean
  drills: Drill[]
}

export interface BlankResult {
  given: string
  expected: string
  ok: boolean
}

export interface DrillResult {
  correct: boolean
  expected?: string
  verdict?: 'exact' | 'close' | 'wrong'
  notes?: string[]
  diff?: DiffPart[]
  blanks?: BlankResult[]
  explain?: string
  tag?: string
  /** free drills only */
  missing?: string[]
  grade?: WritingGrade
}

export interface RoundResult {
  pct: number
  answered: number
  total: number
  done: boolean
  newly_done: boolean
}

export interface Homework {
  /** null for today's preview before Zee starts (GET /api/homework/today is read only). */
  id: number | null
  kind: 'homework' | 'tagebuch'
  assigned: string
  prompt: string
  submission: string | null
  grade: WritingGrade | null
  status: string
  pattern_id: number | null
}

export interface Mistake {
  id: number
  ts: string
  last_ts: string
  source: string
  orig: string
  fix: string
  tag: string
  note: string
  count: number
  card_id: number | null
  recurring: boolean
}

export interface Register {
  total: number
  by_tag: {
    tag: string
    count: number
    errors_30d: number
    correct_30d: number
    /** errors / (errors + correct uses), last 30 days; null with fewer than 5 events */
    rate: number | null
    recurring: boolean
  }[]
  top_tags: { tag: string; errors: number; correct: number; rate: number | null; recurring: boolean; pattern?: string | null }[]
  top10: Mistake[]
  rows: Mistake[]
}

export interface RecitationRow {
  code: string
  title: string
  group: string
  stage: number
  passes: number
  passed_today: boolean
}

export interface RecitationTable {
  code: string
  title: string
  group: string
  columns: string[]
  stage: number
  stage_name: string
  rows: (string | null)[][]
}

export interface RecitationCell {
  given?: string
  expected: string
  ok: boolean
  cue?: boolean
}

export interface RecitationResult {
  passed: boolean
  wrong: number
  cells: RecitationCell[][]
  stage: number
  next_stage: number
  next_from: 'tomorrow' | 'now'
}

export interface PlacementItem {
  id: string
  band: string
  mode: 'choice' | 'type'
  prompt: string
  choices: string[]
  hint: string | null
}

export interface PlacementTest {
  items: PlacementItem[]
  writing: { prompt_en: string; min_sentences: number }
  last_result: { ts: string; level_band: string | null } | null
}

export interface PlacementResult {
  level_band: string | null
  by_band: Record<string, { correct: number; total: number }>
  items_marked: number
  writing: WritingGrade
  results: { id: string; given: string; expected: string; ok: boolean }[]
}

export interface GrammarReview {
  patterns: { code: string; title: string; notes: ReviewNote[] }[]
  placement: { id: string; prompt: string; answer: string; notes: ReviewNote[] }[]
}

/** Plain names for the grader's error tags (same wording as data/official/planner_method.json). */
export const TAG_LABEL: Record<string, string> = {
  V2_POSITION: 'verb in second place',
  VERB_FINAL: 'verb at the end',
  SEP_PREFIX: 'separable verb',
  AUX_HABEN_SEIN: 'haben or sein',
  PARTIZIP: 'Partizip form',
  TENSE_CHOICE: 'choice of tense',
  CASE_AKK: 'Akkusativ',
  CASE_DAT: 'Dativ',
  PREP_CASE: 'case after a preposition',
  GENDER: 'noun gender',
  ADJ_ENDING: 'adjective ending',
  PLURAL: 'plural form',
  CONNECTOR_CHOICE: 'choice of connector',
  MIDDLE_FIELD_ORDER: 'word order in the middle',
  WORD_CHOICE: 'word choice',
  FALSE_FRIEND: 'false friend',
  REGISTER_DU_SIE: 'du or Sie',
  SPELLING: 'spelling',
  UMLAUT: 'umlaut',
  CAPITALISATION: 'capital letter',
  PRONUNCIATION: 'pronunciation',
  OTHER: 'other',
}

/** VERB_FINAL -> "verb at the end". Unknown tags fall back to lower case words. */
export function humanTag(tag: string): string {
  return TAG_LABEL[tag] ?? tag.replaceAll('_', ' ').toLowerCase()
}

export const STAGE_NAME: Record<number, string> = { 0: 'Full table', 1: 'Gaps', 2: 'Blank' }

export const CONTEXT_LABEL: Record<string, string> = {
  work: 'Work',
  life: 'Life',
  finance_history: 'Finance and history',
}

/** "2026-10-21T08:00:00" -> "21 Oct". */
export function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Surgery answer: the placed chips in order, joined by spaces. */
export function tokenAnswer(tokens: string[], placed: number[]): string {
  return placed.map((i) => tokens[i]).join(' ')
}
