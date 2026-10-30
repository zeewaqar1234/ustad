import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { Dial } from '../features/standing/Dial'
import { InsightPanel } from '../features/standing/ReadinessBox'
import { StandBox, Track } from '../features/standing/StandBox'
import { PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { milestoneLine, pct, type Readiness, rangeLabel, type SkillReadiness } from '../lib/readiness'
import {
  formatDate,
  hoursText,
  KIND_LABEL,
  type ModuleKey,
  type ModuleStand,
  MODULE_SKILLS,
  type Progress as ProgressData,
  rangeText,
} from '../lib/standing'

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

function History({ m, max }: { m: ModuleStand; max: number }) {
  const rows = [...m.evidence].reverse()
  if (rows.length === 0) return null
  const W = 360, H = 90
  const x = (i: number) => (rows.length === 1 ? W / 2 : 20 + (i / (rows.length - 1)) * (W - 40))
  const y = (p: number, pm: number) => H - 10 - ((p / pm) * (H - 20))
  const norm = (r: (typeof rows)[number]) => r.points // plotted as entered, never scaled up
  const pts = rows.map((r, i) => `${x(i)},${y(norm(r), max)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[360px]" role="img" aria-label={`${m.label} history`}>
      <line x1="0" x2={W} y1={y(m.pass, max)} y2={y(m.pass, max)} className="stroke-accent" strokeWidth="1.5" />
      <text x={W - 2} y={y(m.pass, max) - 3} fontSize="9" textAnchor="end" className="fill-accent">pass {m.pass}</text>
      {rows.length > 1 && <polyline points={pts} fill="none" stroke="#262626" strokeWidth="1.5" />}
      {rows.map((r, i) => (
        <g key={r.id}>
          <circle cx={x(i)} cy={y(norm(r), max)} r="3.5" fill="#262626" />
          <text x={x(i)} y={y(norm(r), max) - 6} fontSize="9" textAnchor="middle" fill="#171717">{Math.round(norm(r))}</text>
        </g>
      ))}
    </svg>
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

function SkillCard({ s, target }: { s: SkillReadiness; target: number }) {
  return (
    <article className="flex gap-4 rounded-lg border border-neutral-300 bg-white p-4">
      <Dial mean={s.mean} lo={s.lo} hi={s.hi} target={s.census ? null : target} size={130} label={s.label} census={s.census} />
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold">{s.label}</h3>
        {s.measured ? (
          <>
            <p className="font-semibold">{rangeLabel(s)} <span className="font-normal">· {s.status_word}</span></p>
            <p className="text-sm text-neutral-700">
              {s.census
                ? `a count over your cards, not compared with the pass line`
                : `confidence ${s.confidence_pct}%, from ${s.n} recorded answers`}
              ; {s.pace_per_week.toFixed(1)} h/week practice (28 days)
            </p>
            <SkillHistory s={s} target={target} />
            {s.forecast && <p className="text-sm text-neutral-700">Forecast: {s.forecast.text}</p>}
          </>
        ) : (
          <p className="text-sm">No evidence yet. {s.measure}</p>
        )}
        {s.proxy && <p className="mt-1 text-xs text-neutral-600">{s.proxy}</p>}
      </div>
    </article>
  )
}

function ModuleCard({ m, p, open }: { m: ModuleStand; p: ProgressData; open: boolean }) {
  const skills = MODULE_SKILLS[m.module]
  const h28 = skills.reduce((a, s) => a + (p.hours.last_28[s] ?? 0), 0)
  const h7 = skills.reduce((a, s) => a + (p.hours.last_7[s] ?? 0), 0)
  return (
    <article id={m.module} className={`rounded-lg border bg-white p-4 ${open ? 'border-2 border-neutral-900' : 'border-neutral-300'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">
          <Link to={`/progress?module=${m.module}`} className="hover:underline">{m.label}</Link>
        </h3>
        <p className="text-sm font-semibold">
          {m.status === 'none' ? 'Not measured yet' : `${rangeText(m)} · ${m.status_word}`}
        </p>
      </div>
      <div className="my-3 max-w-[560px]"><Track m={m} max={p.module_max_points} /></div>
      {m.status === 'none' ? (
        <p className="text-sm">
          <Link to={`/settings?result=${m.module}#result`} className="underline">Measure {m.label} ({m.measure_minutes} min)</Link>
          {' '}with an official practice test, then enter your score.
        </p>
      ) : (
        <>
          <History m={m} max={p.module_max_points} />
          <p className="mt-1 text-sm text-neutral-700">
            Forecast: {m.forecast.text}
            {m.forecast.assumption && <span className="block text-neutral-500">{m.forecast.assumption}</span>}
          </p>
          {!m.verified && <p className="text-sm text-neutral-700">Provisional: {m.verify_note} Aussprache is not measured; the range allows for it.</p>}
        </>
      )}
      {open && (
        <div className="mt-4 grid gap-6 border-t border-neutral-200 pt-4 md:grid-cols-2">
          <div>
            <h4 className="mb-1 font-bold">Evidence</h4>
            {m.evidence.length === 0 ? (
              <p className="text-sm text-neutral-700">No results entered.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-neutral-400"><th className="py-1 pr-2">Date</th><th className="pr-2">Type</th><th className="pr-2">Points</th><th>Weight</th></tr></thead>
                <tbody>
                  {m.evidence.map((e) => (
                    <tr key={e.id} className="border-b border-neutral-200">
                      <td className="py-1 pr-2">{formatDate(e.date)}</td>
                      <td className="pr-2">{KIND_LABEL[e.kind] ?? e.kind}{e.teil ? `, Teil ${e.teil}` : ''}</td>
                      <td className="pr-2">{Math.round(e.points)} of {e.points_max}</td>
                      <td>{e.weight} (today {e.weight_today})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h4 className="mb-1 mt-4 font-bold">Official tasks</h4>
            <ul className="text-sm">
              {p.official_task_lists[m.module].map((t) => (
                <li key={t.n}>Teil {t.n}{t.label ? `: ${t.label}` : ''}: {t.items ? `${t.items} items` : `${t.max} points`}</li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-neutral-600">
              <a href={Object.values(p.sources)[0]} className="underline" target="_blank" rel="noreferrer">Goethe-Institut exam rules</a>
            </p>
          </div>
          <div>
            <h4 className="mb-1 font-bold">Indicators</h4>
            <p className="mb-2 text-sm text-neutral-600">App measures, not exam points.</p>
            <ul className="flex flex-col gap-1 text-sm">
              <li>Practice time ({skills.join(' and ')}): {hoursText(h7)} in 7 days, {hoursText(h28)} in 28 days.</li>
              {m.module === 'schreiben' && (
                <li>
                  Verb position error rate: {p.error_rate.measured ? `${Math.round(p.error_rate.rate_pct ?? 0)}% in ${p.error_rate.window_days} days (target below ${p.error_rate.target_pct}%)` : p.error_rate.note}
                </li>
              )}
              {m.module === 'lesen' && (
                <li>
                  Goethe B1 word list{p.level === 'B2' ? ' (no official B2 list)' : ''}: {p.wordlist.measured ? `${p.wordlist.mature} of ${p.wordlist.list_lemmas} list words mature` : p.wordlist.note}
                </li>
              )}
              {(m.module === 'schreiben' || m.module === 'sprechen') && (
                <li>Grammar patterns solid or ok: {p.grammar.filter((g) => g.state === 'solid' || g.state === 'ok').length} of {p.grammar.length}</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </article>
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
  const [sp] = useSearchParams()
  const sel = sp.get('module') as ModuleKey | null
  const { data, error } = useQuery({ queryKey: ['progress'], queryFn: () => api<ProgressData>('/api/progress') })
  const ready = useQuery({ queryKey: ['readiness'], queryFn: () => api<Readiness>('/api/readiness') })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data || !ready.data) return <p>Loading…</p>
  const rd = ready.data
  const counts = { solid: 0, ok: 0, shaky: 0, new: 0 }
  data.grammar.forEach((g) => { counts[g.state] += 1 })
  return (
    <div>
      <PageHeader title="Fortschritt" subtitle={`Where you stand for ${rd.target.exam}, from your own work in the app`} />
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-bold">Your skills</h2>
        <p className="mb-3 max-w-[860px] text-sm text-neutral-700">
          Each dial is the share of your recorded answers that were right, with older answers counting less. The grey arc is the
          95% range: with few answers it is wide, and it narrows as you practise. Confidence is 100 minus the width of that range. The blue tick is
          the {pct(rd.target.share)} line, the share of exam points that passes. This is the app&rsquo;s estimate from your practice,
          not an exam result. Level {data.level}: {data.cefr}{' '}
          <a href={data.cefr_source} className="underline" target="_blank" rel="noreferrer">CEFR global scale</a>.
        </p>
        <ul className="grid gap-4 xl:grid-cols-2">
          {rd.skills.map((s) => (
            <li key={s.skill}><SkillCard s={s} target={rd.target.share} /></li>
          ))}
        </ul>
        <p className="mt-3 text-sm">{milestoneLine(rd)}</p>
        <p className="text-sm text-neutral-700">
          {rd.calibration.n > 0
            ? `Checked against ${rd.calibration.n} of your Lesen and Hören practice tests, using only answers recorded before each test: off by ${rd.calibration.mean_abs_error_pts!.toFixed(0)} points on average. This is the measured accuracy of the estimate.`
            : rd.calibration.note}
        </p>
        <InsightPanel />
      </section>

      <section className="mb-8 max-w-[860px]">
        <h2 className="mb-2 text-lg font-bold">Practice tests and official results</h2>
        <p className="mb-3 text-sm text-neutral-700">
          Optional. Points come only from official practice tests and real exam results you enter in Settings. They also check the estimate above.
          Pass = {data.pass_points} of {data.module_max_points} per module.
        </p>
      </section>
      <StandBox data={data} compact />
      <div className="mb-10 grid gap-4 xl:grid-cols-2">
        {data.modules.map((m) => <ModuleCard key={m.module} m={m} p={data} open={sel === m.module} />)}
      </div>

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
