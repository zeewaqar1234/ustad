import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Flagged {
  id: number
  deck: string
  de: string
  en: string
  example_de: string | null
  notes: { text: string; message: string; suggestions: string[] }[]
}

/** Items LanguageTool flagged. They stay out of Sabaq until you approve them. */
export function CheckQueue() {
  const { data, refetch } = useQuery({
    queryKey: ['needs-review'],
    queryFn: () => api<Flagged[]>('/api/items/needs-review'),
  })
  if (!data) return <p className="p-4">Loading…</p>
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Check queue ({data.length})</h1>
      <p className="text-sm text-neutral-700">
        LanguageTool flagged these. Approve only if the German is right. Fix wrong ones in the seed
        source and rebuild.
      </p>
      {data.map((it) => (
        <div key={it.id} className="rounded-lg border border-neutral-300 bg-white p-3 text-sm">
          <p className="font-semibold" lang="de">
            {it.de}
          </p>
          <p>{it.en}</p>
          <p className="mt-1" lang="de">
            {it.example_de}
          </p>
          {it.notes.map((n, i) => (
            <p key={i} className="mt-1 text-neutral-600">
              {n.message} {n.suggestions.length > 0 && `(${n.suggestions.join(', ')})`}
            </p>
          ))}
          <button
            onClick={async () => {
              await api(`/api/items/${it.id}/approve`, {})
              refetch()
            }}
            className="mt-2 rounded border border-neutral-900 px-3 py-2"
          >
            Approve
          </button>
        </div>
      ))}
    </div>
  )
}
