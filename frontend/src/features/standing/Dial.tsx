import { pct } from '../../lib/readiness'

const START = 135 // degrees, clockwise from 12 o'clock; the dial spans 270 degrees like a stopwatch
const SWEEP = 270

function pos(cx: number, cy: number, r: number, frac: number): [number, number] {
  const a = ((START + SWEEP * frac - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arc(cx: number, cy: number, r: number, f0: number, f1: number): string {
  const [x0, y0] = pos(cx, cy, r, f0)
  const [x1, y1] = pos(cx, cy, r, f1)
  const large = (f1 - f0) * SWEEP > 180 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/**
 * Stopwatch-style dial, 0 to 100 %. Thick grey arc = the 95 % range, needle and big number = the estimate,
 * accent tick = the pass line. Without a value it is an empty dotted dial. Readable in black and white.
 */
export function Dial(props: {
  mean: number | null
  lo: number | null
  hi: number | null
  target: number | null
  size?: number
  label?: string
  census?: boolean
}) {
  const size = props.size ?? 120
  const c = size / 2
  const r = size * 0.38
  const has = props.mean !== null && props.lo !== null && props.hi !== null
  const ticks = Array.from({ length: 11 }, (_, i) => i)
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={has ? `${props.label ?? 'Readiness'} ${pct(props.mean)}` : `${props.label ?? 'Readiness'}: no evidence yet`}
    >
      <path d={arc(c, c, r, 0, 1)} fill="none" stroke="#a3a3a3" strokeWidth="2" strokeDasharray={has ? undefined : '2 4'} strokeLinecap="round" />
      {ticks.map((t) => {
        const [x0, y0] = pos(c, c, r + 3, t / 10)
        const [x1, y1] = pos(c, c, r + (t % 5 === 0 ? 8 : 6), t / 10)
        return <line key={t} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#737373" strokeWidth="1" />
      })}
      {has && !props.census && (
        <path d={arc(c, c, r, props.lo!, Math.max(props.hi!, props.lo! + 0.01))} fill="none" stroke="#525252" strokeWidth="7" strokeLinecap="butt" data-testid="dial-range" />
      )}
      {has && props.census && (
        <path d={arc(c, c, r, 0, props.mean!)} fill="none" stroke="#525252" strokeWidth="7" data-testid="dial-range" />
      )}
      {props.target !== null && (() => {
        const [x0, y0] = pos(c, c, r - 8, props.target)
        const [x1, y1] = pos(c, c, r + 10, props.target)
        return <line x1={x0} y1={y0} x2={x1} y2={y1} className="stroke-accent" strokeWidth="2.5" data-testid="pass-tick" />
      })()}
      {has &&
        (() => {
          const [x, y] = pos(c, c, r - 14, props.mean!)
          return <line x1={c} y1={c} x2={x} y2={y} stroke="#171717" strokeWidth="2" strokeLinecap="round" />
        })()}
      <circle cx={c} cy={c} r="3" fill="#171717" />
      <text x={c} y={c + size * 0.3} textAnchor="middle" fontSize={size * 0.16} fontWeight="700" fill="#171717">
        {has ? pct(props.mean) : 'No data'}
      </text>
    </svg>
  )
}
