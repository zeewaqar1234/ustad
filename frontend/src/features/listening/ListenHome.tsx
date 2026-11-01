import { useQuery } from '@tanstack/react-query'
import { ListRow, Page, PageHeader } from '../../components/ui'
import { GLOSSARY } from '../../lib/ui'
import { api } from '../../lib/api'
import type { DiktatToday } from '../../lib/reading'

export function ListenHome() {
  const d = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const diktat = d.data ? `${d.data.done} of ${d.data.total} today` : '…'
  return (
    <Page>
      <div className="flex flex-col gap-2">
        <PageHeader title="Hören" subtitle="Train your ear: dictation, read-aloud texts, a daily podcast." />
        <p className="mb-2 text-sm text-neutral-700">Read first if you want, then listen, then answer.</p>
        <ListRow skill="listen" title="Diktat" sub={GLOSSARY.Diktat} status={diktat} to="/listen/diktat" />
        <ListRow skill="listen" title="Lesen with audio" sub="read and listen" status="Every text can be read aloud" to="/read" />
        <ListRow skill="listen" title="Commute Podcast" status="Today's sentences and yesterday's mistakes" to="/listen/podcast" />
        <ListRow skill="listen" title="Sources" status="News, podcasts and videos you may use" to="/listen/sources" />
      </div>
    </Page>
  )
}
