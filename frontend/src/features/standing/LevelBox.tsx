import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { dayText, hours, type InsightOut, pct, type Readiness, type SkillReadiness, trendText } from '../../lib/readiness'

const MEASURE_TO: Record<string, string> = {
  vocab: '/placement',
  grammar: '/grammar',
  reading: '/read',
  listening: '/listen/diktat',
  writing: '/homework',
  speaking: '/voice',
}

function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#fff" />
      <rect width="1.5" height="6" fill="#737373" />
    </pattern>
  )
}

/** The placement bands left to right: passed ones filled, the one being worked on hatched, the goal as an accent line. */
export function Ladder({ level, exam }: { level: Readiness['level']; exam: string }) {
  const W = 600, seg = W / level.bands.length, top = 26, h = 34
  const goalX = (level.bands.indexOf(level.goal_band) + 1) * seg
  return (
    <svg viewBox={`0 0 ${W + 2} 92`} className="w-full max-w-[602px]" role="img" aria-label={`Level ladder: ${level.passed.length ? `passed ${level.passed.join(', ')}` : 'no band passed'}${level.working_on ? `, working on ${level.working_on}` : ''}, goal ${exam}`}>
      <defs><Hatch id="lv-hatch" /></defs>
      {level.bands.map((b, i) => {
        const passed = level.passed.includes(b)
        const here = b === level.working_on
        return (
          <g key={b} data-testid={`band-${b}`} data-state={passed ? 'passed' : here ? 'here' : 'ahead'}>
            <rect x={i * seg + 1} y={top} width={seg - 4} height={h} rx="4"
              fill={passed ? '#262626' : here ? 'url(#lv-hatch)' : '#fff'}
              stroke={passed || here ? '#171717' : '#a3a3a3'} strokeWidth={here ? 2.5 : 1} />
            <text x={i * seg + seg / 2 - 1} y={top + h / 2 + 5} textAnchor="middle" fontSize="15"
              fontWeight={here ? 700 : 600} fill={passed ? '#fff' : here ? '#171717' : '#737373'}
              stroke={here ? '#fff' : 'none'} strokeWidth={here ? 4 : 0} paintOrder="stroke">{b}</text>
            {here && <text x={i * seg + seg / 2 - 1} y={top + h + 20} textAnchor="middle" fontSize="13" fontWeight="600" fill="#171717">you are here</text>}
          </g>
        )
      })}
      <line x1={goalX - 1} x2={goalX - 1} y1={top - 8} y2={top + h + 6} className="stroke-accent" strokeWidth="3" data-testid="goal-line" />
      <text x={Math.min(goalX - 1, W)} y={top - 12} textAnchor={goalX >= W ? 'end' : 'middle'} fontSize="13" fontWeight="600" className="fill-accent">
        goal: {exam}
      </text>
    </svg>
  )
}

/** One horizontal bar: a dark part and a hatched part, each labelled. */
function SplitBar({ label, done, left, doneText, leftText }: { label: string; done: number; left: number | null; doneText: string; leftText: string }) {
  const W = 600, total = left === null ? done : done + left
  const dw = total > 0 ? Math.max(2, (done / total) * W) : 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span><span className="font-semibold">{label}</span> {doneText}</span>
        <span>{leftText}</span>
      </div>
      <svg viewBox={`0 0 ${W} 18`} className="mt-1 w-full max-w-[600px]" role="img" aria-label={`${label}: ${doneText}, ${leftText}`}>
        <defs><Hatch id={`bar-${label}`} /></defs>
        <rect x="0.5" y="0.5" width={W - 1} height="17" rx="3" fill={left === null ? '#fff' : `url(#bar-${label})`} stroke="#525252" strokeDasharray={left === null ? '4 3' : undefined} />
        {dw > 0 && <rect x="0.5" y="0.5" width={Math.min(dw, W - 1)} height="17" rx="3" fill="#262626" />}
      </svg>
    </div>
  )
}

function GoalPrompt({ goals }: { goals: Readiness['goals'] }) {
  const qc = useQueryClient()
  const [exam, setExam] = useState<'B1' | 'B2'>(goals.target_exam)
  const [date, setDate] = useState('')
  const [err, setErr] = useState('')
  const save = useMutation({
    mutationFn: () => api('/api/goals', { target_exam: exam, target_date: date || null, weekly_hours: goals.weekly_hours }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => setErr(e.message),
  })
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        setErr('')
        save.mutate()
      }}
    >
      <label className="flex flex-col text-sm font-semibold">
        Which exam?
        <select className="rounded-lg border border-neutral-400 bg-white px-3 py-1.5 font-normal" value={exam} onChange={(e) => setExam(e.target.value as 'B1' | 'B2')}>
          <option value="B1">Goethe-Zertifikat B1</option>
          <option value="B2">Goethe-Zertifikat B2</option>
        </select>
      </label>
      <label className="flex flex-col text-sm font-semibold">
        By when?
        <input type="date" className="rounded-lg border border-neutral-400 bg-white px-3 py-1.5 font-normal" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <button type="submit" className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-white">
        Set goal
      </button>
      {err && <span role="alert" className="text-sm">{err}</span>}
    </form>
  )
}

function TimeToGoal({ d }: { d: Readiness }) {
  const m = d.milestone
  const done = d.hours_since_placement
  const pace = d.pace.measured ? d.pace.hours_per_week ?? 0 : null
  const elapsed = d.level.taken ? Math.max(0, Math.round((Date.parse(`${d.today}T12:00:00`) - Date.parse(`${d.level.taken}T12:00:00`)) / 86400000)) : null
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold">Time to goal</h3>
      {d.goals.target_date ? (
        <p className="text-sm">
          {d.target.exam} by {dayText(d.goals.target_date)}
          {m.days_left !== null && m.days_left >= 0 ? `, ${m.days_left} days left` : ', the date has passed'}.{' '}
          <Link to="/settings#goal" className="underline">Change</Link>
        </p>
      ) : (
        <GoalPrompt goals={d.goals} />
      )}
      {done !== null && m.hours_needed === null ? (
        <p className="text-sm">
          <span className="font-semibold">Hours</span> {hours(done)} practised since placement.{' '}
          {m.state === 'reached' ? 'Every practised skill is at the line.' : 'Hours still needed: not known yet.'}
        </p>
      ) : done !== null ? (
        <SplitBar
          label="Hours"
          done={done}
          left={m.hours_needed}
          doneText={`${hours(done)} practised since placement`}
          leftText={`about ${hours(m.hours_needed!)} more`}
        />
      ) : (
        <p className="text-sm">Hours: counted from your placement test. <Link to="/placement" className="underline">Take it</Link>.</p>
      )}
      {elapsed !== null && m.days_left !== null && m.days_left >= 0 && (
        <SplitBar label="Days" done={elapsed} left={m.days_left} doneText={`${elapsed} since placement`} leftText={`${m.days_left} to your date`} />
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        <dt className="font-semibold">Your pace</dt>
        <dd>{pace !== null ? `${pace.toFixed(1)} h/week, last 4 weeks` : d.pace.note}</dd>
        {m.needed_per_week !== null && (
          <>
            <dt className="font-semibold">Needed</dt>
            <dd>
              {m.needed_per_week.toFixed(1)} h/week to make your date
              {pace !== null && (m.needed_per_week > pace ? `, ${(m.needed_per_week - pace).toFixed(1)} h/week more than now` : ', you are on track')}
            </dd>
          </>
        )}
        <dt className="font-semibold">At your pace</dt>
        <dd>
          {m.state === 'reached'
            ? 'Every practised skill is at the line now.'
            : m.state === 'date' && m.forecast_date
              ? `practised skills at the line about ${dayText(m.forecast_date)}${m.slowest ? ` (${m.slowest} is slowest)` : ''}${m.unclear.length ? `. ${m.unclear.join(', ')}: more answers decide` : ''}`
              : m.state === 'none'
                ? 'Not measured yet.'
                : (m.text ?? 'Not measured yet.')}
        </dd>
      </dl>
    </div>
  )
}

function RangeBar({ s, line }: { s: SkillReadiness; line: number }) {
  const W = 200, x = (v: number) => 1 + v * (W - 2)
  if (s.mean === null || s.lo === null || s.hi === null) return null
  return (
    <svg viewBox={`0 0 ${W} 16`} className="w-[200px]" aria-hidden="true">
      <rect x="1" y="6" width={W - 2} height="4" fill="#e5e5e5" />
      <rect x={x(s.lo)} y="3" width={Math.max(2, x(s.hi) - x(s.lo))} height="10" fill="#a3a3a3" data-testid="range" />
      <line x1={x(line)} x2={x(line)} y1="0" y2="16" className="stroke-accent" strokeWidth="2" />
      <circle cx={x(s.mean)} cy="8" r="4" fill="#171717" />
    </svg>
  )
}

export function SkillTable({ d }: { d: Readiness }) {
  const notes = d.skills.filter((s) => s.proxy)
  return (
    <div>
      <table className="w-full text-left text-sm" aria-label="Skills">
        <thead>
          <tr className="border-b border-neutral-400">
            <th className="py-1.5 pr-3">Skill</th>
            <th className="pr-3">Right on B1 work</th>
            <th className="pr-3">Range (tick: {pct(d.line.share)})</th>
            <th className="pr-3">Answers</th>
            <th className="pr-3">Last 4 weeks</th>
            <th>Against {pct(d.line.share)}</th>
          </tr>
        </thead>
        <tbody>
          {d.skills.map((s) => (
            <tr key={s.skill} className="border-b border-neutral-200" data-testid={`skill-${s.skill}`}>
              <td className="py-1.5 pr-3 font-semibold">
                {s.label}
                {s.proxy && <sup>*</sup>}
              </td>
              {s.measured ? (
                <>
                  <td className="pr-3">
                    <span className="font-bold">{pct(s.mean)}</span> <span className="text-neutral-700">± {s.pm_pts}</span>
                  </td>
                  <td className="pr-3"><RangeBar s={s} line={d.line.share} /></td>
                  <td className="pr-3">{s.n}</td>
                  <td className="pr-3">{s.placement_only ? 'placement test only' : trendText(s.trend_pts)}</td>
                  <td className={s.status === 'at_or_above' ? 'font-bold' : s.status === 'below' ? 'underline' : ''}>{s.status_word}</td>
                </>
              ) : (
                <td colSpan={5} className="text-neutral-600">
                  Not measured yet. <Link to={MEASURE_TO[s.skill]} className="underline">{s.measure}</Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {d.practice.measured > 0 && (
        <p className="mt-2 text-xs text-neutral-600">
          ± is the 95% range in points: few answers give a wide range, more practice narrows it. Older answers count less.
          Last 4 weeks: share right in the last 4 weeks minus the 4 weeks before, once each has 10 answers.
        </p>
      )}
      {notes.map((s) => (
        <p key={s.skill} className="text-xs text-neutral-600">* {s.label}: {s.proxy}</p>
      ))}
    </div>
  )
}

export function InsightPanel() {
  const [data, setData] = useState<InsightOut | null>(null)
  const [err, setErr] = useState('')
  const run = useMutation({
    mutationFn: (refresh: boolean) => api<InsightOut>(`/api/readiness/insight${refresh ? '?refresh=true' : ''}`, {}),
    onSuccess: setData,
    onError: (e: Error) => setErr(e.message),
  })
  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="rounded-lg border border-neutral-900 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          disabled={run.isPending}
          onClick={() => {
            setErr('')
            run.mutate(!!data)
          }}
        >
          {data ? 'Explain again' : 'Explain in words'}
        </button>
        <span className="text-sm text-neutral-600">
          {run.isPending ? 'The local model is reading your numbers.' : 'The local model words the numbers above. It cannot change them.'}
        </span>
        {err && <span role="alert" className="text-sm">{err}</span>}
      </div>
      {data && (
        <div className="mt-2 max-w-[860px] text-sm" data-testid="insight">
          <p>{data.summary}</p>
          {(['strengths', 'weaknesses', 'next_steps'] as const).map(
            (k) =>
              data[k].length > 0 && (
                <div key={k} className="mt-1">
                  <p className="font-semibold">{{ strengths: 'Holding up', weaknesses: 'Weak', next_steps: 'Next' }[k]}</p>
                  <ul className="ml-5 list-disc">
                    {data[k].map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          <p className="mt-1 text-xs text-neutral-600">
            {data.source === 'model'
              ? 'Worded by the local model, checked: any number it was not given is rejected.'
              : 'Fixed sentences from the same numbers (the local model was offline or used a number it was not given).'}
          </p>
        </div>
      )}
    </div>
  )
}

/** Today and the top of Progress: level, time to goal, skills. Every number comes from GET /api/readiness. */
export function LevelBox() {
  const { data, error } = useQuery({ queryKey: ['readiness'], queryFn: () => api<Readiness>('/api/readiness') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return null
  const lv = data.level
  const pr = data.practice
  return (
    <section aria-label="Your level" className="mb-8 flex flex-col gap-5 rounded-lg border border-neutral-300 bg-white px-6 py-5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10">
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Your level</h3>
          {lv.label ? (
            <p>
              <span className="text-2xl font-bold">{lv.label}</span>{' '}
              <span className="text-sm text-neutral-700">placement test{lv.taken ? `, ${dayText(lv.taken)}` : ''}. The app&rsquo;s own test, not an official CEFR result.</span>
            </p>
          ) : (
            <p>
              Not placed yet. <Link to="/placement" className="font-semibold underline">Take the placement test</Link> (about 20 minutes).
            </p>
          )}
          <Ladder level={lv} exam={data.target.exam.replace('Goethe-Zertifikat ', '') + ' exam'} />
          <p className="text-sm">
            {pr.mean !== null ? (
              <>
                {pr.since_placement ? 'Since then' : 'Practice so far'}: <span className="font-bold">{pct(pr.mean)}</span> right on B1 work, ± {pr.pm_pts} points, from {pr.n} practice answers.{' '}
              </>
            ) : (
              `No practice answers${pr.since_placement ? ' since then' : ''} yet. `
            )}
            {data.move_up.text}
          </p>
          <p className="text-xs text-neutral-600">
            A band counts as passed at {pct(data.line.share)} right, the placement test&rsquo;s rule. Only the placement test moves your level.
          </p>
          {data.b2_note && <p className="text-xs text-neutral-600">{data.b2_note}</p>}
        </div>
        <TimeToGoal d={data} />
      </div>
      <SkillTable d={data} />
      {data.milestone.note && <p className="-mt-3 text-xs text-neutral-600">{data.milestone.note}</p>}
      <InsightPanel />
    </section>
  )
}
