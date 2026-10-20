import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, type Daily } from '../../lib/api'

function Block(props: {
  n: number
  name: string
  sub: string
  status: string
  to?: string
  done: boolean
}) {
  const body = (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-neutral-900 font-semibold ${props.done ? 'bg-neutral-900 text-white' : ''}`}
        aria-hidden
      >
        {props.done ? '✓' : props.n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {props.name} <span className="text-sm font-normal text-neutral-600">{props.sub}</span>
        </p>
        <p className="truncate text-sm text-neutral-700">{props.status}</p>
      </div>
      {props.to && <span aria-hidden>›</span>}
    </div>
  )
  const cls = 'block rounded-lg border border-neutral-300 bg-white p-4'
  return props.to ? (
    <Link to={props.to} className={`${cls} active:bg-neutral-100`}>
      {body}
    </Link>
  ) : (
    <div className={`${cls} opacity-60`}>{body}</div>
  )
}

export function Home() {
  const { data, error } = useQuery({ queryKey: ['daily'], queryFn: () => api<Daily>('/api/daily') })
  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  const { manzil, sabqi, sabaq, streak } = data

  const manzilStatus = manzil.done
    ? manzil.due > 0
      ? `Done. ${manzil.due} more due, optional.`
      : 'Done.'
    : `${Math.min(manzil.due, manzil.cap)} cards due`
  const sabqiStatus = sabqi.done
    ? 'Done.'
    : sabqi.left > 0
      ? `${sabqi.left} cards from the last 7 days`
      : 'Nothing yet. Starts after your first Sabaq.'
  const sabaqStatus = sabaq.done
    ? 'Done for today.'
    : sabaq.locked
      ? sabaq.locked
      : sabaq.unit
        ? `${sabaq.unit.title} · ${sabaq.unit.items} items`
        : 'No new units left.'

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat value={`${streak.current}`} label="day streak" />
        <Stat value={`${streak.freezes_left}`} label="freezes left" />
        <Stat value={`${streak.attendance_week}%`} label="this week" />
      </section>

      {data.makeup && (
        <p className="rounded-lg border-2 border-neutral-900 p-3 text-sm">
          Makeup day. Manzil cap is {manzil.cap}. New Sabaq opens when the backlog is under 30.
        </p>
      )}

      <h1 className="text-xl font-bold">Today</h1>
      <Block
        n={1}
        name="Manzil"
        sub="old revision"
        status={manzilStatus}
        done={manzil.done}
        to={manzil.due > 0 ? '/review/manzil' : undefined}
      />
      <Block
        n={2}
        name="Sabqi"
        sub="recent revision"
        status={sabqiStatus}
        done={sabqi.done}
        to={sabqi.left > 0 ? '/review/sabqi' : undefined}
      />
      <Block
        n={3}
        name="Sabaq"
        sub="new lesson"
        status={sabaqStatus}
        done={sabaq.done}
        to={!sabaq.locked && sabaq.unit ? '/sabaq' : undefined}
      />

      <p className="text-sm text-neutral-600">
        {data.study_day
          ? `Study day counted. ${data.minutes} active minutes today.`
          : `A study day needs Manzil plus one more block. ${data.minutes} active minutes so far.`}
      </p>
      {streak.current === 0 && streak.studied_week > 0 && (
        <p className="text-sm text-neutral-600">Missing a day does not undo the habit. Start again today.</p>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-neutral-300 bg-white p-2">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-neutral-600">{label}</p>
    </div>
  )
}
