import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface PlanFocus {
  tag: string
  label: string
  family: string
  rate: number
  errors: number
  correct: number
  opportunities: number
  by_skill: Record<string, { errors: number; correct: number }>
  samples: { skill: string; orig: string; fix: string }[]
  taught_pattern: string | null
  untaught_pattern: string | null
}

export interface SabqiDrill {
  pattern_code: string
  title: string
  n: number
  reteach: boolean
  reason: string
}

export interface Plan {
  date: string
  why: string
  focus: PlanFocus[]
  review_pattern: { pattern_code: string; title: string; accuracy: number; events: number } | null
  new_unit: {
    makeup: boolean
    sabaq: { unit_order: number; title: string; scenario: string } | null
    pattern: { code: string; title: string; pulled_forward: boolean; for_tag: string | null } | null
  }
  sabqi_drills: SabqiDrill[]
  mazmoon: { must_use: { kind: string; code: string; label: string }[]; note: string }
  reading: { topic: string; tag: string; label: string; min_uses: number; density: [number, number]; checkable: boolean } | null
  diktat: { picks: { ref: string; de: string; tag: string }[]; essay_correction: null }
  speaking_goal: { tag: string; text: string } | null
  use_task: { pattern_code: string | null; kind: string; text: string } | null
  blocks: {
    sabqi: string | null
    diktat: string | null
    speaking: string | null
    reading: string | null
    sabaq: string | null
  }
}

export interface PlanRecord extends Plan {
  data: {
    window_days: number
    makeup: boolean
    rule: string
    tags: { tag: string; errors: number; correct: number; opportunities: number; rate: number }[]
    shaky_patterns: { pattern_code: string; accuracy: number; events: number }[]
    weak_words: number
  }
}

export function usePlan() {
  return useQuery({ queryKey: ['plan'], queryFn: () => api<Plan>('/api/plan') })
}

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: () => api<{ plans: PlanRecord[] }>('/api/plans') })
}
