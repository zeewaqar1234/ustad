/** Shared UI constants (kept out of components/ui.tsx so fast refresh works). */

/** Plain-English meaning of the app's own words. Shown next to them so no term stands alone. */
export const GLOSSARY: Record<string, string> = {
  Manzil: 'revision of older cards',
  Sabqi: 'revision of this week',
  Sabaq: 'the new lesson',
  Pahara: 'grammar tables learned by heart',
  Ghalti: 'your mistakes',
  Diktat: 'hear a sentence, type it',
  Takrar: 'listen and repeat',
  Gupshup: 'free conversation',
  Tagebuch: 'diary, free writing',
  Mazmoon: 'the daily essay',
}

export type Skill = 'read' | 'listen' | 'write' | 'speak' | 'grammar' | 'vocab'

export const SKILL_COLOR: Record<Skill, string> = {
  read: 'var(--color-skill-read)',
  listen: 'var(--color-skill-listen)',
  write: 'var(--color-skill-write)',
  speak: 'var(--color-skill-speak)',
  grammar: 'var(--color-skill-grammar)',
  vocab: 'var(--color-skill-vocab)',
}

const BTN = {
  primary:
    'bg-accent text-white hover:brightness-110 font-semibold px-5 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900',
  secondary:
    'border border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-100 font-semibold px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900',
  quiet: 'text-neutral-800 underline underline-offset-2 hover:text-neutral-950 px-1',
} as const
export type ButtonKind = keyof typeof BTN

export function buttonClass(kind: ButtonKind = 'secondary'): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg disabled:opacity-50 ${BTN[kind]}`
}

