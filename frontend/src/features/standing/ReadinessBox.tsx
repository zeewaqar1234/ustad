import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { type InsightOut, milestoneLine, pct, type Readiness, rangeLabel, type SkillReadiness } from '../../lib/readiness'
import { formatDate } from '../../lib/standing'
import { Dial } from './Dial'

const MEASURE_TO: Record<string, string> = {
  vocab: '/placement',
  grammar: '/grammar',
  reading: '/read',
  listening: '/listen/diktat',
  writing: '/homework',
  speaking: '/voice',
}

function GoalPrompt() {
  const qc = useQueryClient()
  const [exam, setExam] = useState<'B1' | 'B2'>('B1')
  const [date, setDate] = useState('')
  const [err, setErr] = useState('')
  const save = useMutation({
    mutationFn: () => api('/api/goals', { target_exam: exam, target_date: date || null, weekly_hours: null }),
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
        Which exam do you want to pass?
        <select className="rounded-lg border border-neutral-400 bg-white px-3 py-1.5 font-normal" value={exam} onChange={(e) => setExam(e.target.value as 'B1' | 'B2')}>
          <option value="B1">Goethe-Zertifikat B1</option>
          <option value="B2">Goethe-Zertifikat B2</option>
        </select>
      </label>
      <label className="flex flex-col text-sm font-semibold">
        By when?
        <input type="date" className="rounded-lg border border-neutral-400 bg-white px-3 py-1.5 font-normal" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <button type="submit" className="rounded-lg border border-neutral-900 px-4 py-1.5 font-semibold">
        Set goal
      </button>
      {err && <span role="alert" className="text-sm">{err}</span>}
    </form>
  )
}

function SkillDial({ s, target }: { s: SkillReadiness; target: number }) {
  return (
    <li className="flex flex-col items-center text-center">
      <p className="font-semibold">{s.label}</p>
      <Dial mean={s.mean} lo={s.lo} hi={s.hi} target={s.census ? null : target} size={112} label={s.label} census={s.census} />
      {s.measured ? (
        <>
          <p className="text-sm">{rangeLabel(s)}</p>
          <p className="text-xs text-neutral-600">{s.status_word}</p>
          {s.census ? (
            <p className="text-xs text-neutral-600">a count, no pass line</p>
          ) : (
            <p className="text-xs text-neutral-600">confidence {s.confidence_pct}%</p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600">No evidence yet</p>
          <Link to={MEASURE_TO[s.skill]} className="text-xs underline">
            how to measure
          </Link>
        </>
      )}
    </li>
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
    <div className="mt-3 border-t border-neutral-200 pt-3">
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
          {data ? 'Analyse again' : 'Analyse these numbers'}
        </button>
        {run.isPending && <span role="status" className="text-sm">The local model is reading your numbers.</span>}
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
              ? 'Worded by the local model. It may only use numbers the app computed; anything else is dropped.'
              : 'Fixed sentences from the same numbers (the local model was offline or used a number it was not given).'}
          </p>
        </div>
      )}
    </div>
  )
}

export function ReadinessBox() {
  const { data, error } = useQuery({ queryKey: ['readiness'], queryFn: () => api<Readiness>('/api/readiness') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return null
  const o = data.overall
  const m = data.milestone
  return (
    <section aria-label="Your level" className="mb-8 rounded-lg border border-neutral-300 bg-white px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3">
          <Dial mean={o.mean} lo={o.lo} hi={o.hi} target={data.target.share} size={150} label="Overall readiness" />
          <div>
            <p className="text-sm font-semibold text-neutral-600">Overall readiness</p>
            <p className="text-lg font-bold">{o.mean === null ? 'No evidence yet' : rangeLabel(o)}</p>
            <p className="text-sm">{o.status_word}</p>
            <p className="text-sm text-neutral-700">
              confidence {o.confidence_pct}%, {o.measured} of {o.of} skills measured
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-semibold">Level now</dt>
          <dd>
            {data.level.label ? (
              <>
                {data.level.label} <span className="text-neutral-600">(placement test{data.level.taken ? `, ${formatDate(data.level.taken)}` : ''}; not an official CEFR result)</span>
              </>
            ) : (
              <>
                Not placed. <Link to="/placement" className="underline">Take the placement test</Link>
              </>
            )}
          </dd>
          <dt className="font-semibold">Goal</dt>
          <dd>
            {data.goals.target_date ? (
              <>
                {data.target.exam} by {formatDate(data.goals.target_date)}
                {m.days_left !== null && m.days_left >= 0 ? `, ${m.days_left} days left` : ', date passed'}{' '}
                <Link to="/settings#goal" className="underline">
                  edit
                </Link>
              </>
            ) : (
              <span className="text-neutral-600">Not set</span>
            )}
          </dd>
          <dt className="font-semibold">The line</dt>
          <dd>
            {pct(data.target.share)} readiness, the share of exam points that passes (
            <a href={data.target.source} className="underline" target="_blank" rel="noreferrer">
              Goethe rules
            </a>
            )
          </dd>
        </dl>
      </div>
      {!data.goals.target_date && <GoalPrompt />}
      <ul className="mt-3 grid grid-cols-6 gap-2" aria-label="Skills">
        {data.skills.map((s) => (
          <SkillDial key={s.skill} s={s} target={data.target.share} />
        ))}
      </ul>
      <p className="mt-3 text-sm text-neutral-800">{milestoneLine(data)}</p>
      {m.note && <p className="text-sm text-neutral-600">{m.note}</p>}
      {data.b2_note && <p className="text-sm text-neutral-600">{data.b2_note}</p>}
      <p className="text-sm text-neutral-600">
        {data.calibration.n > 0
          ? `Checked against ${data.calibration.n} of your practice tests: the estimate was off by ${data.calibration.mean_abs_error_pts!.toFixed(0)} points on average.`
          : data.calibration.note}{' '}
        <Link to="/progress" className="underline">
          Details
        </Link>
      </p>
      <InsightPanel />
    </section>
  )
}
