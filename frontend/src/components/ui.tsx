import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonClass, type ButtonKind, SKILL_COLOR, type Skill } from '../lib/ui'

/** Page title, one plain subtitle, optional back link. */
export function PageHeader(props: {
  title: string
  subtitle?: string
  back?: { to: string; label: string }
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {props.back && (
          <Link to={props.back.to} className="mb-1 inline-block text-sm text-neutral-600 underline">
            {props.back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{props.title}</h1>
        {props.subtitle && <p className="text-neutral-600">{props.subtitle}</p>}
      </div>
      {props.actions}
    </header>
  )
}

/** One heading style for sections inside a page. */
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold tracking-tight">{children}</h2>
      {hint && <p className="text-sm text-neutral-600">{hint}</p>}
    </div>
  )
}

/** White box with a soft edge. `skill` adds a coloured strip on the left. */
export function Card({ children, skill, className = '' }: { children: ReactNode; skill?: Skill; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
      style={skill ? { borderLeft: `4px solid ${SKILL_COLOR[skill]}` } : undefined}
    >
      {children}
    </div>
  )
}

/** A button or, with `to`, a link that looks like one. Exactly one primary per screen: the next action. */
export function Button(props: {
  kind?: ButtonKind
  to?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  children: ReactNode
  title?: string
}) {
  const cls = buttonClass(props.kind)
  if (props.to) {
    return (
      <Link to={props.to} className={cls} title={props.title}>
        {props.children}
      </Link>
    )
  }
  return (
    <button type={props.type ?? 'button'} className={cls} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.children}
    </button>
  )
}

/** "Ustad says": the tutor's voice. Used for the daily note, teaching points and empty states. */
export function TutorNote({ children, title = 'Ustad' }: { children: ReactNode; title?: string }) {
  return (
    <aside className="rounded-xl border border-neutral-200 bg-note p-5" style={{ borderLeft: '4px solid #171717' }}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-neutral-700">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </aside>
  )
}

/** The end of an exercise: one line of feedback and where to go next. */
export function NextStep({ message, next, back = { to: '/', label: 'Back to Today' } }: {
  message?: ReactNode
  next?: { to: string; label: string }
  back?: { to: string; label: string } | null
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5">
      {message && <div>{message}</div>}
      <div className="flex flex-wrap items-center gap-3">
        {next && <Button kind="primary" to={next.to}>{next.label}</Button>}
        {back && <Button kind={next ? 'quiet' : 'primary'} to={back.to}>{back.label}</Button>}
      </div>
    </div>
  )
}

type Tone = 'neutral' | 'ok' | 'fix' | 'warn' | 'accent'
const CHIP: Record<Tone, string> = {
  neutral: 'border-neutral-300 bg-white text-neutral-700',
  ok: 'border-ok/30 bg-ok-soft text-ok font-semibold',
  fix: 'border-fix/30 bg-fix-soft text-fix font-semibold',
  warn: 'border-warn/30 bg-warn-soft text-warn font-semibold',
  accent: 'border-accent/30 bg-accent-soft text-accent font-semibold',
}

/** Short status word. The word carries the meaning; the colour only helps. */
export function StatusChip({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${CHIP[tone]}`}>{children}</span>
}

/** Older name kept for existing screens. */
export function StatusPill({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <StatusChip tone={strong ? 'ok' : 'neutral'}>{children}</StatusChip>
}

/** One verdict style for every exercise: Right / Almost / Not yet. */
export function Verdict({ kind, children }: { kind: 'right' | 'almost' | 'wrong'; children?: ReactNode }) {
  const map = {
    right: { word: 'Right.', cls: 'bg-ok-soft text-ok border-ok/30' },
    almost: { word: 'Almost.', cls: 'bg-warn-soft text-warn border-warn/30' },
    wrong: { word: 'Not yet.', cls: 'bg-fix-soft text-fix border-fix/30' },
  }[kind]
  return (
    <div className={`rounded-lg border px-4 py-3 ${map.cls}`} role="status">
      <span className="font-bold">{map.word}</span>
      {children && <span className="ml-2 text-neutral-900">{children}</span>}
    </div>
  )
}

/** One row of a list: title, status line, optional right-hand text. The whole row is a link when `to` is set. */
export function ListRow(props: {
  title: string
  sub?: string
  status?: string
  to?: string
  right?: ReactNode
  muted?: boolean
  skill?: Skill
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {props.title}
          {props.sub && <span className="ml-2 text-sm font-normal text-neutral-600">{props.sub}</span>}
        </p>
        {props.status && <p className="truncate text-sm text-neutral-700">{props.status}</p>}
      </div>
      {props.right}
    </>
  )
  const cls = `flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${props.muted ? 'opacity-60' : ''}`
  const style = props.skill ? { borderLeft: `4px solid ${SKILL_COLOR[props.skill]}` } : undefined
  return props.to ? (
    <Link to={props.to} style={style} className={`${cls} hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-neutral-900`}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>{body}</div>
  )
}

/** Centered 720 px column for exercise screens. */
export function Column({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">{children}</div>
}

/** Page width wrapper: `narrow` 720 px for exercises and lists, `wide` 1040 px for overviews. Always centred. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? 'max-w-[1040px]' : 'max-w-[720px]'}`}>{children}</div>
}
