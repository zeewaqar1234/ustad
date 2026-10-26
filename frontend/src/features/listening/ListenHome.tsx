import { useQuery } from '@tanstack/react-query'
import { ListRow, PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import type { DiktatToday } from '../../lib/reading'

export function ListenHome() {
  const d = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const diktat = d.data ? `${d.data.done} of ${d.data.total} today` : '…'
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2">
      <PageHeader title="Hören" subtitle="listening" />
      <p className="mb-2 text-sm text-neutral-700">Read first if you want, then listen, then answer.</p>
      <ListRow title="Diktat" status={diktat} to="/listen/diktat" />
      <ListRow title="Lesen with audio" status="Every text can be read aloud" to="/read" />
      <ListRow title="Commute Podcast" status="Today's sentences and yesterday's mistakes" to="/listen/podcast" />
      <ListRow title="Sources" status="News, podcasts and videos you may use" to="/listen/sources" />
    </div>
  )
}
