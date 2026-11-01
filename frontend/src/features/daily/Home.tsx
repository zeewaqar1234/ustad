import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, PageHeader, SectionTitle, StatusChip, TutorNote } from '../../components/ui'
import { GLOSSARY, type Skill, SKILL_COLOR } from '../../lib/ui'
import { api, type Daily } from '../../lib/api'
import type { Homework } from '../../lib/grammar'
import { usePlan, type Plan, type PlanFocus } from '../../lib/plan'
import { dayText, type Readiness } from '../../lib/readiness'
import type { DiktatToday, TextList } from '../../lib/reading'

const SKILL_WORD: Record<string, string> = {
  writing: 'writing',
  speaking: 'speaking',
  grammar: 'drills',
  listening: 'dictation',
  reading: 'reading',
  vocab: 'cards',
}

/** "in writing (4) and speaking (3)" from the plan's per-skill error counts. */
function whereText(f: PlanFocus): string {
  const parts = Object.entries(f.by_skill)
    .filter(([, v]) => v.errors > 0)
    .sort((a, b) => b[1].errors - a[1].errors)
    .map(([k, v]) => `${SKILL_WORD[k] ?? k} (${v.errors})`)
  if (parts.length === 0) return ''
  if (parts.length === 1) return ` in ${parts[0]}`
  return ` in ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The tutor's note for the day. Every sentence is built from the plan's numbers; nothing here is invented. */
function UstadNote({ plan, readiness }: { plan: Plan | undefined; readiness: Readiness | undefined }) {
  const [open, setOpen] = useState(false)
  if (!plan) return <TutorNote><p>Reading your work…</p></TutorNote>
  const f = plan.focus[0]
  const drill = plan.sabqi_drills[0]
  const pulled = plan.new_unit.pattern?.pulled_forward ? plan.new_unit.pattern : null
  const sample = f?.samples[0]
  const second = plan.focus[1]
  return (
    <TutorNote>
      {f ? (
        <>
          <p className="text-lg leading-snug">
            Your most repeated mistake lately: <span className="font-bold">{f.label}</span>. In the last 30 days, {f.errors} of {f.opportunities} uses were wrong{whereText(f)}.
          </p>
          {second && (
            <p>
              Close behind: <span className="font-semibold">{second.label}</span>, {second.errors} of {second.opportunities} wrong.
            </p>
          )}
          <p>
            {drill
              ? `Today we fix it first: re-read the rule for “${drill.title}”, then ${drill.n} short drills.`
              : pulled
                ? `You have not had the lesson on it yet, so today’s new grammar is “${pulled.title}”. Learn it, then use it.`
                : 'Watch for it in today’s writing and speaking.'}{' '}
            {plan.new_unit.makeup ? 'No new lesson today: we catch up first.' : 'Then the new lesson, as usual.'}
          </p>
          {sample && (
            <div>
              <button type="button" className="text-sm font-semibold underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? 'Hide your sentence' : 'Show me where I went wrong'}
              </button>
              {open && (
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-white p-3 text-sm" lang="de">
                  <span className="text-neutral-600">You wrote</span>
                  <span className="text-fix line-through decoration-1">{sample.orig}</span>
                  <span className="text-neutral-600">Better</span>
                  <span className="font-semibold text-ok">{sample.fix}</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-lg leading-snug">
          No mistake repeats often enough to target yet. Today: revision first, then the new lesson. Every answer you give helps me see your patterns.
        </p>
      )}
      {readiness?.move_up.ready && (
        <p className="rounded-lg bg-white p-3 text-sm">
          {readiness.move_up.text} <Link to="/placement" className="font-semibold underline">Retake the placement test</Link>
        </p>
      )}
    </TutorNote>
  )
}

/** One small box: level in plain words, goal, and a link to the full picture. */
function StandSummary({ r }: { r: Readiness | undefined }) {
  if (!r) return <Card><p className="text-sm text-neutral-600">Loading your level…</p></Card>
  const lv = r.level
  const practised = r.skills.filter((s) => s.measured && !s.placement_only)
  const at = practised.filter((s) => s.status === 'at_or_above').length
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Your level</p>
        {lv.label ? (
          <>
            <p className="text-xl font-bold">{lv.plain ?? lv.label}</p>
            <p className="text-xs text-neutral-600">Placement test{lv.taken ? `, ${dayText(lv.taken)}` : ''}. Only a retake moves it.</p>
          </>
        ) : (
          <p>
            Not placed yet. <Link to="/placement" className="font-semibold underline">Take the placement test</Link>
          </p>
        )}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Goal</p>
        <p>
          {r.target.exam}
          {r.goals.target_date ? `, ${dayText(r.goals.target_date)}` : ''}
          {r.milestone.days_left !== null && r.milestone.days_left >= 0 ? ` (${r.milestone.days_left} days)` : ''}
        </p>
        {!r.goals.target_date && <p className="text-xs text-neutral-600">No date set yet.</p>}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Practice</p>
        <p className="text-sm">
          {practised.length === 0
            ? 'Not measured yet.'
            : `${at} of ${practised.length} practised skills at ${Math.round(r.line.share * 100)}% or more right.`}
        </p>
      </div>
      <Link to="/progress" className="text-sm font-semibold underline">See full progress</Link>
    </Card>
  )
}

type Step = {
  key: string
  title: string
  gloss?: string
  line: string
  to?: string
  done: boolean
  extra?: React.ReactNode
}

function SessionList({ steps, nextKey }: { steps: Step[]; nextKey: string | undefined }) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Today's session">
      {steps.map((s, i) => {
        const isNext = s.key === nextKey
        return (
          <li
            key={s.key}
            className={`flex items-start gap-4 rounded-xl border bg-white px-4 py-3 ${isNext ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]' : 'border-neutral-200'} ${!s.to && !s.done && !s.extra ? 'opacity-60' : ''}`}
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-ok-soft text-ok' : isNext ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-700'}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {s.title}
                {s.gloss && <span className="ml-2 text-sm font-normal text-neutral-600">{s.gloss}</span>}
              </p>
              <p className="text-sm text-neutral-700">{s.line}</p>
              {s.extra}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {s.done ? (
                <StatusChip tone="ok">Done</StatusChip>
              ) : isNext && s.to ? (
                <Button kind="primary" to={s.to}>Start</Button>
              ) : s.to ? (
                <Link to={s.to} className="text-sm font-semibold underline">Open</Link>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function SkillTile({ skill, title, what, line, to }: { skill: Skill; title: string; what: string; line: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-neutral-900"
      style={{ borderTop: `4px solid ${SKILL_COLOR[skill]}` }}
    >
      <span className="font-bold" style={{ color: SKILL_COLOR[skill] }}>{title}</span>
      <span className="text-xs text-neutral-600">{what}</span>
      <span className="mt-1 text-sm">{line}</span>
    </Link>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 11 ? 'Guten Morgen, Zee' : h < 18 ? 'Guten Tag, Zee' : 'Guten Abend, Zee'
}

export function Home() {
  const { data, error } = useQuery({ queryKey: ['daily'], queryFn: () => api<Daily>('/api/daily') })
  const texts = useQuery({ queryKey: ['texts'], queryFn: () => api<TextList>('/api/texts') })
  const dik = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const hw = useQuery({ queryKey: ['homework', 'today'], queryFn: () => api<Homework>('/api/homework/today') })
  const readiness = useQuery({ queryKey: ['readiness'], queryFn: () => api<Readiness>('/api/readiness') })
  const plan = usePlan().data
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  const { manzil, sabqi, sabaq, streak } = data

  const drill = plan?.sabqi_drills[0]
  const newPattern = plan?.new_unit.pattern
  const steps: Step[] = [
    {
      key: 'manzil',
      title: 'Revision',
      gloss: `Manzil, ${GLOSSARY.Manzil}`,
      done: manzil.done,
      line: manzil.done
        ? manzil.due > 0 ? `${manzil.due} more due, optional.` : 'Nothing due.'
        : `${Math.min(manzil.due, manzil.cap)} cards due.`,
      to: manzil.due > 0 ? '/review/manzil' : undefined,
    },
  ]
  if (drill) {
    steps.push({
      key: 'fix',
      title: `Fix: ${drill.title}`,
      gloss: 'your repeated mistake',
      done: false,
      line: `Re-read the rule, then ${drill.n} drills. Answers stay hidden until you try.`,
      to: `/grammar/${drill.pattern_code}/drills?limit=${drill.n}`,
      extra: (
        <Link to={`/grammar/${drill.pattern_code}`} className="text-sm underline">Re-read the rule first</Link>
      ),
    })
  }
  steps.push(
    {
      key: 'sabqi',
      title: 'This week’s cards',
      gloss: `Sabqi, ${GLOSSARY.Sabqi}`,
      done: sabqi.done,
      line: sabqi.done ? 'Done.' : sabqi.left > 0 ? `${sabqi.left} cards from the last 7 days.` : 'Nothing yet. This starts after your first new lesson.',
      to: sabqi.left > 0 ? '/review/sabqi' : undefined,
    },
    {
      key: 'sabaq',
      title: 'New lesson',
      gloss: `Sabaq, ${GLOSSARY.Sabaq}`,
      done: sabaq.done,
      line: sabaq.done
        ? 'Done for today.'
        : plan?.new_unit.makeup
          ? 'Makeup day: no new lesson until the revision backlog is smaller.'
          : sabaq.locked
            ? sabaq.locked
            : sabaq.unit
              ? `${sabaq.unit.title}, ${sabaq.unit.items} new words and phrases.`
              : 'No new units left.',
      to: !sabaq.locked && sabaq.unit && !plan?.new_unit.makeup ? '/sabaq' : undefined,
    },
  )
  if (newPattern) {
    steps.push({
      key: 'grammar',
      title: `New grammar: ${newPattern.title}`,
      gloss: newPattern.pulled_forward ? 'moved up because of your mistakes' : 'next in order',
      done: false,
      line: 'Read the rule and the examples, then do the drills.',
      to: `/grammar/${newPattern.code}`,
    })
  }
  if (plan?.use_task) {
    steps.push({
      key: 'use',
      title: 'Use it',
      gloss: 'one sentence of your own',
      done: false,
      line: plan.use_task.text,
      to: plan.use_task.pattern_code ? `/grammar/${plan.use_task.pattern_code}/drills?limit=5` : undefined,
    })
  }
  // the next step: the first one not done that can be opened, in order (revision before new material)
  const next = steps.find((s) => !s.done && s.to)

  const today = texts.data?.today
  const readLine = !today
    ? '…'
    : today.length === 0
      ? 'No text for today yet.'
      : `${today.filter((t) => t.read).length} of ${today.length} texts read today.`
  const hwLine = !hw.data ? '…' : hw.data.status === 'open' ? 'Today’s writing task is open.' : 'Written today.'

  return (
    <div className="mx-auto w-full max-w-[1040px]">
      <PageHeader
        title={greeting()}
        subtitle={`${new Date(`${data.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. ${
          data.study_day ? 'Study day counted.' : 'A study day needs revision plus one more block.'
        } Streak ${streak.current}.`}
      />

      <div className="mb-8 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <UstadNote plan={plan} readiness={readiness.data} />
        <StandSummary r={readiness.data} />
      </div>

      <section className="mb-8">
        <SectionTitle hint={next ? 'In order. Revision comes before new material.' : undefined}>
          Today’s session
        </SectionTitle>
        <SessionList steps={steps} nextKey={next?.key} />
        {!next && <p className="mt-3 font-semibold text-ok">Everything for today is done.</p>}
      </section>

      <section>
        <SectionTitle hint="Any time, in any order.">Practise the four skills</SectionTitle>
        <div className="grid grid-cols-4 gap-3">
          <SkillTile skill="read" title="Lesen" what="reading" line={plan?.blocks.reading ? `${readLine} Today: ${lower(plan.blocks.reading)}.` : readLine} to="/read" />
          <SkillTile
            skill="listen"
            title="Hören"
            what="listening"
            line={`${dik.data ? `Dictation ${dik.data.done} of ${dik.data.total}.` : '…'}${plan?.blocks.diktat ? ` Includes ${lower(plan.blocks.diktat)}.` : ''}`}
            to="/listen"
          />
          <SkillTile skill="write" title="Schreiben" what="writing" line={hwLine} to="/homework" />
          <SkillTile
            skill="speak"
            title="Sprechen"
            what="speaking, no clock"
            line={plan?.blocks.speaking ? `${plan.blocks.speaking}.` : 'Repeat after me, roleplays, free talk.'}
            to="/voice"
          />
        </div>
      </section>
    </div>
  )
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
