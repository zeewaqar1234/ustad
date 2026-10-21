import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { STAGE_NAME, type RecitationRow } from '../../lib/grammar'

export function RecitationList() {
  const { data, error } = useQuery({
    queryKey: ['recitation'],
    queryFn: () => api<RecitationRow[]>('/api/recitation'),
  })
  if (error) return <p className="p-4">Error: {(error as Error).message}</p>
  if (!data) return <p className="p-4">Loading…</p>
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Pahara</h1>
      <p className="text-sm text-neutral-700">
        Type each table row by row. Stage 1 shows the full table, stage 2 has gaps, stage 3 is blank. A
        clean recital opens the next stage the next day.
      </p>
      {data.map((t) => (
        <Link
          key={t.code}
          to={`/recitation/${t.code}`}
          className="flex items-center gap-3 rounded-lg border border-neutral-300 bg-white p-3 active:bg-neutral-100"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-neutral-900 text-sm font-semibold ${t.passed_today ? 'bg-neutral-900 text-white' : ''}`}
            aria-hidden
          >
            {t.passed_today ? '✓' : t.stage + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.title}</p>
            <p className="text-sm text-neutral-700">
              Stage {t.stage + 1}: {STAGE_NAME[t.stage] ?? t.stage}
              {t.passed_today && ' · Clean today'}
              {t.passes > 0 && ` · ${t.passes} clean`}
            </p>
          </div>
          <span aria-hidden>›</span>
        </Link>
      ))}
    </div>
  )
}
