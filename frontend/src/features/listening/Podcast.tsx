import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { type Episode, minutes, type PodcastStatus, type ScriptLine } from '../../lib/reading'

const CACHE = 'ustad-podcast'

async function isSaved(url: string): Promise<boolean> {
  if (!('caches' in window)) return false
  try {
    return !!(await (await caches.open(CACHE)).match(url))
  } catch {
    return false
  }
}

function Script({ lines }: { lines: ScriptLine[] }) {
  return (
    <details className="rounded-lg border border-neutral-300 bg-white p-3">
      <summary className="font-semibold">Script ({lines.filter((l) => l.kind !== 'pause').length} lines)</summary>
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {lines.map((l, i) =>
          l.kind === 'pause' ? (
            <li key={i} className="text-neutral-500">
              (pause {l.text})
            </li>
          ) : (
            <li key={i} className={l.kind === 'title' ? 'font-semibold' : l.kind === 'answer' ? 'pl-3' : ''} lang={l.kind === 'prompt' ? undefined : 'de'}>
              {l.text}
            </li>
          ),
        )}
      </ol>
    </details>
  )
}

function Player({ ep }: { ep: Episode }) {
  const [saved, setSaved] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    isSaved(ep.url).then(setSaved)
  }, [ep.url])
  const save = async () => {
    setErr(null)
    try {
      await (await caches.open(CACHE)).add(ep.url)
      setSaved(true)
    } catch (e) {
      setErr(`Could not save: ${(e as Error).message}`)
    }
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
      <p className="font-semibold">
        Episode {ep.date} · {minutes(ep.duration_s)} · {ep.format}
      </p>
      <audio controls preload="none" src={ep.url} className="w-full" />
      {'caches' in window &&
        (saved ? (
          <p className="text-sm">Saved for offline.</p>
        ) : (
          <button onClick={save} className="rounded-lg border border-neutral-300 px-4 py-2">
            Save for offline
          </button>
        ))}
      {err && <p className="text-sm">{err}</p>}
    </section>
  )
}

export function Podcast() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['podcast'], queryFn: () => api<PodcastStatus>('/api/podcast/status') })
  const piper = status.data?.piper
  const script = useQuery({
    queryKey: ['podcast', 'script'],
    queryFn: () => api<{ items: ScriptLine[] }>('/api/podcast/script'),
    enabled: piper === false,
  })
  const build = useMutation({
    mutationFn: () => api<Episode>('/api/podcast/build', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['podcast'] }),
  })
  if (status.error) return <p className="p-4">Error: {(status.error as Error).message}</p>
  if (!status.data) return <p className="p-4">Loading…</p>
  const ep = build.data ?? status.data.latest

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link to="/listen" className="text-sm">
        ‹ Hören
      </Link>
      <h1 className="text-xl font-bold">Commute Podcast</h1>
      <p className="text-sm text-neutral-700">
        Today's sentences and yesterday's mistakes, read slowly. Answer in your head in each pause, then hear the
        answer.
      </p>
      {piper ? (
        <button
          onClick={() => build.mutate()}
          disabled={build.isPending}
          className="rounded-lg bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {build.isPending ? 'Building episode…' : "Build today's episode"}
        </button>
      ) : (
        <p className="rounded-lg border-2 border-neutral-900 p-3 text-sm">
          Server voice (Piper) is not set up, so there is no audio file. Here is today's script.
        </p>
      )}
      {build.isError && <p className="text-sm">{(build.error as Error).message}</p>}
      {piper && !status.data.english_voice && (
        <p className="text-sm text-neutral-600">No English voice set up: prompts are German sentences to repeat.</p>
      )}
      {ep && <Player ep={ep} />}
      {ep && <Script lines={ep.script} />}
      {!ep && script.data && <Script lines={script.data.items} />}
    </div>
  )
}
