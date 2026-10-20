export class AuthError extends Error {}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && !path.startsWith('/auth/login')) throw new AuthError('Not logged in')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Error ${res.status}`)
  return data as T
}

export type DiffPart = ['equal' | 'insert' | 'delete', string]

export interface Grade {
  rating: number
  verdict: 'exact' | 'close' | 'wrong'
  expected: string
  notes: string[]
  diff: DiffPart[]
}

export interface ItemReveal {
  item_id: number
  de: string
  en: string
  gender: string | null
  symbol: string | null
  plural: string | null
  example_de: string | null
  example_en: string | null
  status: string
}

export interface CardPrompt {
  card_id: number
  card_type: string
  deck: string
  mode: 'type' | 'reveal' | 'choice'
  prompt: string
  hint?: string | null
  symbol?: string | null
  choices?: string[]
}

export interface AnswerResult {
  rating: number
  grade: Grade | null
  item: ItemReveal
  next_due: string | null
}

export interface Daily {
  date: string
  makeup: boolean
  manzil: { done: boolean; due: number; cap: number }
  sabqi: { done: boolean; left: number }
  sabaq: {
    done: boolean
    locked: string | null
    unit: { title: string; scenario: string; deck: string; items: number } | null
  }
  study_day: boolean
  minutes: number
  streak: {
    current: number
    freezes_left: number
    attendance_week: number
    studied_week: number
    days_in_week_so_far: number
  }
  cards_introduced: number
}

export const RATING_LABEL: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
