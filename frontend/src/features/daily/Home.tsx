import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ListRow, PageHeader } from '../../components/ui'
import { api, type Daily } from '../../lib/api'
import { LevelBox } from '../standing/LevelBox'
import { usePlan, type Plan } from '../../lib/plan'
import type { Homework } from '../../lib/grammar'
import type { DiktatToday, TextList } from '../../lib/reading'

function PlanBox({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const focus = plan.focus.slice(0, 3)
  const sample = plan.focus[0]?.samples[0]
  return (
    <section className="mb-8 max-w-[720px]" aria-label="Plan">
      <h2 className="mb-2 text-lg font-bold">Plan</h2>
      <p>{plan.why}</p>
      {focus.length > 0 && (
        <ul className="mt-2 text-sm text-neutral-700">
          {focus.map((f) => (
            <li key={f.tag}>
              <span className="font-semibold">{f.label}</span>:{' '}
              {Object.entries(f.by_skill)
                .map(([k, v]) => `${k} ${v.errors} errors`)
                .join(', ') || `${f.errors} errors`}
            </li>
          ))}
        </ul>
      )}
      {sample && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded-lg border border-neutral-400 px-3 py-1 text-sm"
          >
            {open ? 'Hide examples' : 'Show examples'}
          </button>
          {open && (
            <p className="mt-2 text-sm" lang="de">
              You wrote: {sample.orig}
              <br />
              Correct: <span className="font-semibold">{sample.fix}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

type Step = { n: number; name: string; sub: string; status: string; to?: string; done: boolean; extra?: string }

export function Home() {
  const { data, error } = useQuery({ queryKey: ['daily'], queryFn: () => api<Daily>('/api/daily') })
  const texts = useQuery({ queryKey: ['texts'], queryFn: () => api<TextList>('/api/texts') })
  const dik = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const planQ = usePlan()
  const plan = planQ.data
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
      status:
        (sabqi.done
          ? 'Done.'
          : sabqi.left > 0
            ? `${sabqi.left} cards from the last 7 days`
            : 'Nothing yet. Starts after your first Sabaq.') + (plan?.blocks.sabqi ? ` ${plan.blocks.sabqi}` : ''),
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
      extra: plan?.blocks.sabaq ?? undefined,
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
      {plan && <PlanBox plan={plan} />}
      <LevelBox />
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
            status={s.extra ? `${s.status} ${s.extra}` : s.status}
            to={s.to}
            muted={!s.to && !s.done}
            right={s.done ? <span className="text-sm font-semibold underline">Done</span> : undefined}
          />
        ))}
      </section>

      {plan && plan.new_unit.makeup && <p className="mb-8 text-sm">Makeup day: no new unit today.</p>}

      {plan && plan.sabqi_drills.length > 0 && (
        <section className="mb-8 flex flex-col gap-2" aria-label="Targeted practice">
          <h2 className="text-lg font-bold">Targeted practice</h2>
          {plan.sabqi_drills.map((d) => (
            <div key={d.pattern_code} className="rounded-lg border border-neutral-300 bg-white px-4 py-3">
              <p className="font-semibold">{d.title}</p>
              <p className="text-sm text-neutral-700">{d.reason}</p>
              <p className="mt-1 flex gap-4 text-sm">
                <Link to={`/grammar/${d.pattern_code}`} className="underline">Re-read the rule</Link>
                <Link to={`/grammar/${d.pattern_code}/drills?limit=5`} className="underline">Start 5 drills</Link>
              </p>
            </div>
          ))}
          {plan.use_task && (
            <p className="text-sm">
              {plan.use_task.text}{' '}
              {plan.use_task.pattern_code && (
                <Link to={`/grammar/${plan.use_task.pattern_code}/drills?limit=5`} className="underline">Write it</Link>
              )}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Practice</h2>
        <ListRow title="Lesen" sub="reading" status={plan?.blocks.reading ? `${readStatus}. ${plan.blocks.reading}` : readStatus} to="/read" />
        <ListRow
          title="Hören"
          sub="listening"
          status={`${dik.data ? `Diktat ${dik.data.done} of ${dik.data.total}` : '…'}${plan?.blocks.diktat ? `. ${plan.blocks.diktat}` : ''}`}
          to="/listen"
        />
        <ListRow title="Schreiben" sub="writing" status={hwStatus} to="/homework" />
        <ListRow title="Sprechen" sub="speaking, untimed" status={plan?.blocks.speaking ?? 'Shadowing, roleplays, free talk'} to="/voice" />
      </section>
      </div>
    </div>
  )
}
