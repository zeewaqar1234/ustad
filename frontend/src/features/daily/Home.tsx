import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ListRow, PageHeader } from '../../components/ui'
import { api, type Daily } from '../../lib/api'
import type { Standing } from '../../lib/standing'
import { StandBox } from '../standing/StandBox'
import type { Homework } from '../../lib/grammar'
import type { DiktatToday, TextList } from '../../lib/reading'

type Step = { n: number; name: string; sub: string; status: string; to?: string; done: boolean }

export function Home() {
  const { data, error } = useQuery({ queryKey: ['daily'], queryFn: () => api<Daily>('/api/daily') })
  const texts = useQuery({ queryKey: ['texts'], queryFn: () => api<TextList>('/api/texts') })
  const dik = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const stand = useQuery({ queryKey: ['standing'], queryFn: () => api<Standing>('/api/standing') })
  const hw = useQuery({ queryKey: ['homework', 'today'], queryFn: () => api<Homework>('/api/homework/today') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const { manzil, sabqi, sabaq, streak } = data

  const steps: Step[] = [
    {
      n: 1,
      name: 'Manzil',
      sub: 'old revision',
      done: manzil.done,
      status: manzil.done
        ? manzil.due > 0
          ? `Done. ${manzil.due} more due, optional.`
          : 'Done.'
        : `${Math.min(manzil.due, manzil.cap)} cards due`,
      to: manzil.due > 0 ? '/review/manzil' : undefined,
    },
    {
      n: 2,
      name: 'Sabqi',
      sub: 'recent revision',
      done: sabqi.done,
      status: sabqi.done
        ? 'Done.'
        : sabqi.left > 0
          ? `${sabqi.left} cards from the last 7 days`
          : 'Nothing yet. Starts after your first Sabaq.',
      to: sabqi.left > 0 ? '/review/sabqi' : undefined,
    },
    {
      n: 3,
      name: 'Sabaq',
      sub: 'new lesson',
      done: sabaq.done,
      status: sabaq.done
        ? 'Done for today.'
        : sabaq.locked
          ? sabaq.locked
          : sabaq.unit
            ? `${sabaq.unit.title} · ${sabaq.unit.items} items`
            : 'No new units left.',
      to: !sabaq.locked && sabaq.unit ? '/sabaq' : undefined,
    },
  ]
  const next = steps.find((s) => !s.done && s.to)

  const today = texts.data?.today
  const readStatus = !today
    ? '…'
    : today.length === 0
      ? 'No text for today yet'
      : `${today.filter((t) => t.read).length} of ${today.length} texts read today`
  const hwStatus = !hw.data ? '…' : hw.data.status === 'open' ? 'Today’s writing task is open' : 'Written today'

  return (
    <div>
      <PageHeader title="Today" subtitle="Your daily loop, in order" />
      {stand.data && <StandBox data={stand.data} />}
      <div className="max-w-[720px]">

      {data.makeup && (
        <p className="mb-4 rounded-lg border-2 border-neutral-900 p-3 text-sm">
          Makeup day. Manzil cap is {manzil.cap}. New Sabaq opens when the backlog is under 30.
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-bold">Next</h2>
        {next ? (
          <Link
            to={next.to!}
            className="inline-block rounded-lg bg-accent px-5 py-3 text-lg font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            Start {next.name}
          </Link>
        ) : (
          <p>All blocks for today are done.</p>
        )}
        <p className="mt-2 text-sm text-neutral-600">
          {data.study_day
            ? `Study day counted. ${data.minutes} active minutes today.`
            : `A study day needs Manzil plus one more block. ${data.minutes} active minutes so far.`}{' '}
          Streak {streak.current}, {streak.freezes_left} freezes left, {streak.attendance_week}% this week.
        </p>
        {streak.current === 0 && streak.studied_week > 0 && (
          <p className="text-sm text-neutral-600">Missing a day does not undo the habit. Start again today.</p>
        )}
      </section>

      <section className="mb-8 flex flex-col gap-2">
        <h2 className="text-lg font-bold">Today&rsquo;s loop</h2>
        {steps.map((s) => (
          <ListRow
            key={s.name}
            title={`${s.n}. ${s.name}`}
            sub={s.sub}
            status={s.status}
            to={s.to}
            muted={!s.to && !s.done}
            right={s.done ? <span className="text-sm font-semibold underline">Done</span> : undefined}
          />
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Practice</h2>
        <ListRow title="Lesen" sub="reading" status={readStatus} to="/read" />
        <ListRow title="Hören" sub="listening" status={dik.data ? `Diktat ${dik.data.done} of ${dik.data.total}` : '…'} to="/listen" />
        <ListRow title="Schreiben" sub="writing" status={hwStatus} to="/homework" />
        <ListRow title="Sprechen" sub="speaking, untimed" status="Shadowing, roleplays, free talk" to="/voice" />
      </section>
      </div>
    </div>
  )
}
