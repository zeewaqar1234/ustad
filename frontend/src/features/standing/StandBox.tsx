import { Link } from 'react-router'
import { formatDate, type ModuleStand, paceLine, rangeText, type Standing } from '../../lib/standing'

/** Track 0 to max with the pass tick (accent) and the estimate as a range bar with a centre dot. */
export function Track({ m, max }: { m: ModuleStand; max: number }) {
  const pct = (v: number) => `${(v / max) * 100}%`
  if (m.low === null || m.high === null) {
    return <div className="h-3 rounded-sm border border-dashed border-neutral-500" aria-hidden="true" />
  }
  return (
    <div className="relative h-3 rounded-sm border border-neutral-400 bg-white" aria-hidden="true">
      <div
        className="absolute top-0 h-full bg-neutral-700"
        style={{ left: pct(m.low), width: m.official ? '2px' : `max(2px, calc(${pct(m.high)} - ${pct(m.low)}))` }}
      />
      {m.centre !== null && (
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-neutral-900 outline outline-1 outline-neutral-900"
          style={{ left: pct(m.centre) }}
        />
      )}
      <PassTick pass={m.pass} max={max} />
    </div>
  )
}

export function PassTick({ pass, max }: { pass: number; max: number }) {
  return (
    <div
      className="absolute -top-1 h-5 w-0.5 bg-accent"
      style={{ left: `${(pass / max) * 100}%` }}
      data-testid="pass-tick"
    />
  )
}

function ModuleRow({ m, max }: { m: ModuleStand; max: number }) {
  const measured = m.status !== 'none'
  return (
    <div className="grid grid-cols-[88px_1fr_150px_190px] items-center gap-4 py-1.5">
      <Link
        to={`/progress?module=${m.module}`}
        className="font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-neutral-900"
      >
        {m.label}
      </Link>
      <Track m={m} max={max} />
      <div className="text-sm">
        {measured ? (
          <>
            <span className="font-semibold">{rangeText(m)}</span>
            <span className="ml-2 text-neutral-600">
              {m.official ? 'official result' : `${m.n} ${m.n === 1 ? 'check' : 'checks'}`}
              {!m.verified && !m.official ? ', provisional' : ''}
            </span>
          </>
        ) : (
          <span className="text-neutral-600">Not measured yet</span>
        )}
      </div>
      <div className="text-sm">
        {measured ? (
          <span className="font-semibold">
            {m.status_word}
            {m.to_pass ? <span className="font-normal text-neutral-700">, about {m.to_pass} to pass</span> : null}
          </span>
        ) : (
          <Link
            to={`/settings?result=${m.module}#result`}
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-neutral-900"
          >
            Measure ({m.measure_minutes} min)
          </Link>
        )}
      </div>
    </div>
  )
}

export function StandBox({ data, compact }: { data: Standing; compact?: boolean }) {
  const forecasts = data.modules.filter((m) => m.status !== 'none' && !m.official)
  return (
    <section aria-label="Stand" className="mb-8 rounded-lg border border-neutral-300 bg-white px-5 py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6">
        <h2 className="text-lg font-bold">{data.exam}</h2>
        <p className="text-sm text-neutral-700">Pass = {data.pass_points} of {data.module_max_points} in each module</p>
        <p className="text-sm text-neutral-700">
          Target date: {data.goals.target_date ? formatDate(data.goals.target_date) : 'not set'}{' '}
          <Link to="/settings#goal" className="underline">
            edit
          </Link>
        </p>
      </div>
      <div className="divide-y divide-neutral-200">
        {data.modules.map((m) => (
          <ModuleRow key={m.module} m={m} max={data.module_max_points} />
        ))}
      </div>
      {!compact && <p className="mt-2 text-sm text-neutral-800">{paceLine(data)}</p>}
      {!compact && forecasts.length > 0 && (
        <p className="text-sm text-neutral-600">
          {forecasts.map((m) => `${m.label}: ${m.forecast.text}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
