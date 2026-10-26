import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import type { DiktatToday } from '../../lib/reading'

export function Row({ name, status, to }: { name: string; status: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-3 active:bg-neutral-100"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{name}</p>
        <p className="truncate text-sm text-neutral-700">{status}</p>
      </div>
      <span aria-hidden>›</span>
    </Link>
  )
}

export function ListenHome() {
  const d = useQuery({ queryKey: ['dictation'], queryFn: () => api<DiktatToday>('/api/dictation/today') })
  const diktat = d.data ? `${d.data.done} of ${d.data.total} today` : '…'
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-xl font-bold">Hören</h1>
      <p className="text-sm text-neutral-700">Read first if you want, then listen, then answer.</p>
      <Row name="Diktat" status={diktat} to="/listen/diktat" />
      <Row name="Lesen with audio" status="Every text can be read aloud" to="/read" />
      <Row name="Commute Podcast" status="Today's sentences and yesterday's mistakes" to="/listen/podcast" />
      <Row name="Sources" status="News, podcasts and videos you may use" to="/listen/sources" />
    </div>
  )
}
