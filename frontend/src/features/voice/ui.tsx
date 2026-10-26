import type { Stars } from '../../lib/stars'

// Small inline icons (no icon library: no new dependency).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function Icon({ name, className = 'size-5' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    mic: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
    send: <path d="M4 12 20 4l-5 16-3-7-8-1Z" />,
    keyboard: (
      <>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
      </>
    ),
    speaker: <path d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />,
    back: <path d="M15 18 9 12l6-6" />,
    bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12 5 5L20 7" />,
    chevron: <path d="m9 6 6 6-6 6" />,
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...P}>
      {paths[name]}
    </svg>
  )
}

// Stars pop in one after another. The label carries the meaning (not colour alone).
export function StarRow({ stars, size = 'size-6', label }: { stars: Stars; size?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${stars} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`${size} motion-safe:animate-pop ${i <= stars ? 'fill-amber-400 text-amber-500' : 'fill-neutral-200 text-neutral-300'}`}
          style={{ animationDelay: `${(i - 1) * 120}ms` }}
          stroke="currentColor"
          strokeWidth={1}
        >
          <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z" />
        </svg>
      ))}
    </span>
  )
}
