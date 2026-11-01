import { useQuery } from '@tanstack/react-query'
import { ListRow, Page, PageHeader, StatusChip } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
import { api } from '../../lib/api'
import { STAGE_NAME, type RecitationRow } from '../../lib/grammar'
import { useRecitationMode } from './useRecitationMode'

export function RecitationList() {
  const [mode, setMode] = useRecitationMode()
  const { data, error } = useQuery({
    queryKey: ['recitation'],
    queryFn: () => api<RecitationRow[]>('/api/recitation'),
  })
  if (error) return <p>Error: {(error as Error).message}</p>
  if (!data) return <p>Loading…</p>
  return (
    <Page>
      <PageHeader
        back={{ to: '/grammar', label: 'Back to Grammatik' }}
        title="Pahara"
        subtitle={`Pahara: ${GLOSSARY.Pahara}. Stage 1 shows the full table, stage 2 has gaps, stage 3 is blank. A clean recital opens the next stage the next day.`}
      />
      <div className="mb-4 flex gap-2" role="group" aria-label="How to recite">
        {(['type', 'speak'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg border px-4 py-2 ${mode === m ? 'border-neutral-900 bg-neutral-900 font-semibold text-white' : 'border-neutral-400'}`}
          >
            {m === 'type' ? 'Type' : 'Speak'}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {data.map((t) => (
          <ListRow
            key={t.code}
            to={`/recitation/${t.code}${mode === 'speak' ? '?mode=speak' : ''}`}
            title={t.title}
            status={`Stage ${t.stage + 1}: ${STAGE_NAME[t.stage] ?? t.stage}${t.passes > 0 ? `, ${t.passes} clean` : ''}`}
            skill="grammar"
            right={t.passed_today ? <StatusChip tone="ok">Clean today</StatusChip> : undefined}
          />
        ))}
      </div>
    </Page>
  )
}
