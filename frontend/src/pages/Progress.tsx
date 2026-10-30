import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { LevelBox } from '../features/standing/LevelBox'
import { PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { pct, type Readiness, type SkillReadiness } from '../lib/readiness'
import { formatDate, KIND_LABEL, type Progress as ProgressData } from '../lib/standing'

const SKILL_ORDER = ['reading', 'listening', 'writing', 'speaking', 'vocab', 'grammar']
const SKILL_LABEL: Record<string, string> = {
  reading: 'Lesen (reading)', listening: 'Hören (listening)', writing: 'Schreiben (writing)',
  speaking: 'Sprechen (speaking)', vocab: 'Vocabulary', grammar: 'Grammar',
}
// Fills are patterns, not colours, so the chart reads printed in black and white.
const FILL: Record<string, string> = {
  reading: 'url(#p-dots)', listening: 'url(#p-diag)', writing: '#262626', speaking: 'url(#p-cross)',
  vocab: '#a3a3a3', grammar: 'url(#p-horiz)',
}

function Patterns() {
  return (
    <defs>
      <pattern id="p-dots" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#fff" /><circle cx="3" cy="3" r="1.3" fill="#262626" />
      </pattern>
      <pattern id="p-diag" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#fff" /><rect width="2.5" height="6" fill="#262626" />
      </pattern>
      <pattern id="p-cross" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#fff" /><path d="M0 3H6M3 0V6" stroke="#262626" strokeWidth="1" />
      </pattern>
      <pattern id="p-horiz" width="6" height="4" patternUnits="userSpaceOnUse">
        <rect width="6" height="4" fill="#fff" /><rect width="6" height="1.6" fill="#262626" />
      </pattern>
    </defs>
  )
}

function SkillKey({ skills }: { skills: string[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {skills.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <svg width="16" height="12" aria-hidden="true">
            <Patterns />
            <rect width="16" height="12" fill={FILL[s]} stroke="#262626" />
          </svg>
          {SKILL_LABEL[s]}
        </li>
      ))}
    </ul>
  )
}

function WeeklyHours({ data }: { data: ProgressData['weekly_hours'] }) {
  const totals = data.weeks.map((w) => Object.values(w.hours).reduce((a, b) => a + b, 0))
  const max = Math.max(...totals, 0)
  if (max === 0) return <p className="text-neutral-700">Not measured yet. Study time is recorded from now on.</p>
  const W = 640, H = 160, bw = W / data.weeks.length
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full max-w-[720px]" role="img" aria-label="Hours per skill per week, last 12 weeks">
        <Patterns />
        {data.weeks.map((w, i) => {
          let y = H
          return (
            <g key={w.week_start}>
              {SKILL_ORDER.map((s) => {
                const h = ((w.hours[s] ?? 0) / max) * (H - 14)
                y -= h
                return h > 0 ? <rect key={s} x={i * bw + 4} y={y} width={bw - 8} height={h} fill={FILL[s]} stroke="#262626" strokeWidth="0.8" /> : null
              })}
              <text x={i * bw + bw / 2} y={H + 13} fontSize="9" textAnchor="middle" fill="#525252">
                {w.week_start.slice(5)}
              </text>
              {totals[i] > 0 && (
                <text x={i * bw + bw / 2} y={y - 3} fontSize="9" textAnchor="middle" fill="#171717">
                  {totals[i].toFixed(1)}
                </text>
              )}
            </g>
          )
        })}
        <line x1="0" x2={W} y1={H} y2={H} stroke="#262626" />
      </svg>
      <SkillKey skills={SKILL_ORDER} />
      <p className="mt-1 text-sm text-neutral-600">Hours per week, weeks start on Monday. Labels are the week start (month-day).</p>
    </div>
  )
}

function SkillHistory({ s, target }: { s: SkillReadiness; target: number }) {
  const h = s.history
  if (h.length === 0) return null
  const W = 300, H = 80
  const x = (i: number) => (h.length === 1 ? W / 2 : 14 + (i / (h.length - 1)) * (W - 28))
  const y = (v: number) => H - 8 - v * (H - 16)
  const band = [...h.map((p, i) => `${x(i)},${y(p.hi)}`), ...h.map((_, i) => `${x(h.length - 1 - i)},${y(h[h.length - 1 - i].lo)}`)].join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[300px]" role="img" aria-label={`${s.label} readiness over the last weeks`}>
      <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="stroke-accent" strokeWidth="1.5" />
      {h.length > 1 && <polygon points={band} fill="#d4d4d4" />}
      {h.length > 1 && <polyline points={h.map((p, i) => `${x(i)},${y(p.mean)}`).join(' ')} fill="none" stroke="#262626" strokeWidth="1.5" />}
      {h.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.mean)} r="3" fill="#262626" />
          {(i === 0 || i === h.length - 1) && (
            <text x={x(i)} y={y(p.mean) - 6} fontSize="9" textAnchor="middle" fill="#171717">{pct(p.mean)}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

function SkillHistoryCard({ s, line }: { s: SkillReadiness; line: number }) {
  return (
    <article className="rounded-lg border border-neutral-300 bg-white p-3">
      <h3 className="font-bold">{s.label}</h3>
      {s.history.length === 0 ? (
        <p className="text-sm text-neutral-600">
          {!s.measured ? 'Not measured yet.' : s.placement_only ? 'Only the placement test measures this so far.' : 'Not enough answers per week for a line yet.'}
        </p>
      ) : (
        <SkillHistory s={s} target={line} />
      )}
      {s.forecast && !['reached', 'placement_only'].includes(s.forecast.state) && <p className="text-xs text-neutral-700">{s.forecast.text}</p>}
    </article>
  )
}

function PracticeTests({ p, rd }: { p: ProgressData; rd: Readiness }) {
  const rows = p.modules.flatMap((m) => m.evidence.map((e) => ({ ...e, label: m.label })))
  rows.sort((a, b) => b.date.localeCompare(a.date))
  return (
    <section className="mb-10 max-w-[860px]">
      <h2 className="mb-1 text-lg font-bold">Practice tests you entered</h2>
      <p className="mb-3 text-sm text-neutral-700">
        Optional, outside the app: official Goethe practice tests or a real exam. Pass is {p.pass_points} of {p.module_max_points} points per module.{' '}
        <Link to="/settings#result" className="underline">Enter a result</Link>
      </p>
      {rows.length === 0 ? (
        <p className="text-sm">None yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-400"><th className="py-1 pr-3">Date</th><th className="pr-3">Module</th><th className="pr-3">Type</th><th className="pr-3">Points</th><th>Pass</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-neutral-200">
                <td className="py-1 pr-3">{formatDate(e.date)}</td>
                <td className="pr-3">{e.label}</td>
                <td className="pr-3">{KIND_LABEL[e.kind] ?? e.kind}{e.teil ? `, Teil ${e.teil}` : ''}</td>
                <td className={`pr-3 ${(e.points / e.points_max) * p.module_max_points >= p.pass_points ? 'font-bold' : 'underline'}`}>{Math.round(e.points)} of {e.points_max}</td>
                <td>{e.points_max === p.module_max_points ? (e.points >= p.pass_points ? 'yes' : 'no') : 'part test'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-sm text-neutral-700">
        {rd.calibration.n > 0
          ? `Check: in Lesen and Hören, your share right in the app before each test was off from the test points by ${rd.calibration.mean_abs_error_pts!.toFixed(0)} on average (${rd.calibration.n} tests).`
          : rd.calibration.note}
      </p>
    </section>
  )
}

function TagWeeks({ p }: { p: ProgressData['tag_weeks'] }) {
  if (p.tags.length === 0) return <p className="text-neutral-700">Not measured yet. Graded writing and speaking add error tags.</p>
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            <th className="py-1 pr-4">Tag</th>
            {p.tags[0].weeks.map((w) => <th key={w.week_start} className="px-1 font-normal text-neutral-600">{w.week_start.slice(5)}</th>)}
          </tr>
        </thead>
        <tbody>
          {p.tags.map((t) => (
            <tr key={t.tag} className="border-b border-neutral-200">
              <td className="py-1 pr-4 font-semibold">{t.tag}</td>
              {t.weeks.map((w) => (
                <td key={w.week_start} className="px-1 text-center" title={`${w.uses} uses`}>{w.rate_pct === null ? '.' : `${Math.round(w.rate_pct)}%`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-sm text-neutral-600">Wrong share per week. A dot means fewer than {p.min_uses} uses that week.</p>
    </div>
  )
}

const STATE_STYLE: Record<string, string> = {
  solid: 'border-2 border-neutral-900 font-bold',
  ok: 'border border-neutral-700',
  shaky: 'border border-dashed border-neutral-900 underline',
  new: 'border border-neutral-300 text-neutral-500',
}

export function Progress() {
  const { data, error } = useQuery({ queryKey: ['progress'], queryFn: () => api<ProgressData>('/api/progress') })
  const ready = useQuery({ queryKey: ['readiness'], queryFn: () => api<Readiness>('/api/readiness') })
  if (error || ready.error) return <p>Error: {((error ?? ready.error) as Error).message}</p>
  if (!data || !ready.data) return <p>Loading…</p>
  const rd = ready.data
  const counts = { solid: 0, ok: 0, shaky: 0, new: 0 }
  data.grammar.forEach((g) => { counts[g.state] += 1 })
  return (
    <div>
      <PageHeader title="Fortschritt" subtitle="Your level, your time to goal, and how each skill is moving" />
      <LevelBox />

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-bold">Each skill, week by week</h2>
        <p className="mb-3 text-sm text-neutral-700">
          Share right on B1 work as it stood at the end of each week. The grey band is the range, the straight line across is {pct(rd.line.share)}.
        </p>
        <ul className="grid grid-cols-3 gap-3">
          {rd.skills.map((s) => (
            <li key={s.skill}><SkillHistoryCard s={s} line={rd.line.share} /></li>
          ))}
        </ul>
      </section>

      <PracticeTests p={data} rd={rd} />

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-bold">Hours per skill</h2>
        <p className="mb-3 text-sm text-neutral-600">Indicators: app measures, not exam points.</p>
        <WeeklyHours data={data.weekly_hours} />
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-bold">Error rate per tag, by week</h2>
        <p className="mb-3 text-sm text-neutral-600">Indicators: app measures, not exam points. Top {data.tag_weeks.tags.length || 5} tags by errors in the last 12 weeks.</p>
        <TagWeeks p={data.tag_weeks} />
        <p className="mt-3 text-sm">
          {data.error_rate.measured
            ? `Verb position (${data.error_rate.tags.join(', ')}), last ${data.error_rate.window_days} days: ${Math.round(data.error_rate.rate_pct ?? 0)}% wrong of ${data.error_rate.opportunities} uses. Your target: below ${data.error_rate.target_pct}%.`
            : `Verb position error rate: ${data.error_rate.note}`}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-bold">Grammar patterns</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Indicators: app measures, not exam points. {counts.solid} solid, {counts.ok} ok, {counts.shaky} shaky, {counts.new} new.
        </p>
        <ul className="grid grid-cols-4 gap-2 xl:grid-cols-5" aria-label="Grammar pattern states">
          {data.grammar.map((g) => (
            <li key={g.code}>
              <Link to={`/grammar/${g.code}`} className={`block rounded-lg px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-neutral-900 ${STATE_STYLE[g.state]}`}>
                <span className="block truncate">{g.title}</span>
                <span className="block text-xs">{g.state}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 max-w-[720px]">
        <h2 className="mb-1 text-lg font-bold">Goethe word list</h2>
        <p className="text-sm text-neutral-600">Indicators: app measures, not exam points.</p>
        <p className="mt-2">
          {data.wordlist.measured
            ? `${data.wordlist.mature} of ${data.wordlist.list_lemmas} words on the ${data.wordlist.list} are mature in your cards (stability 21 days or more) or known from placement. The official list holds about ${data.wordlist.list_size_official}.`
            : `Not measured yet. ${data.wordlist.note} On your Mac: put Goethe-Zertifikat_B1_Wortliste.pdf into data/private/, install poppler (brew install poppler), then run make wortliste and reload.`}
          {data.level === 'B2' && ' No official B2 word list exists; B1 list coverage is shown.'}
        </p>
      </section>

      <section className="mb-10 max-w-[720px]">
        <h2 className="mb-1 text-lg font-bold">Then and now</h2>
        <p>Not measured yet. Your first and latest graded essay will appear here side by side.</p>
      </section>
    </div>
  )
}
