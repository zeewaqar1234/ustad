import type { ReactNode } from 'react'
import { Link } from 'react-router'

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
        <h1 className="text-2xl font-bold">{props.title}</h1>
        {props.subtitle && <p className="text-neutral-600">{props.subtitle}</p>}
      </div>
      {props.actions}
    </header>
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
  const cls = `flex items-center gap-4 rounded-lg border border-neutral-300 bg-white px-4 py-3 ${props.muted ? 'opacity-60' : ''}`
  return props.to ? (
    <Link to={props.to} className={`${cls} hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Text only status label. */
export function StatusPill({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-block rounded-lg border px-2 py-0.5 text-sm ${strong ? 'border-neutral-900 font-semibold' : 'border-neutral-300 text-neutral-700'}`}
    >
      {children}
    </span>
  )
}

/** Centered 720 px column for exercise screens. */
export function Column({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">{children}</div>
}
