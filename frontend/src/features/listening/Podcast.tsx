import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Column, PageHeader } from '../../components/ui'
import { api } from '../../lib/api'
import { type Episode, minutes, type PodcastStatus, type ScriptLine } from '../../lib/reading'

function Script({ lines }: { lines: ScriptLine[] }) {
  return (
    <details className="rounded-lg border border-neutral-300 bg-white p-4">
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
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-4">
      <p className="font-semibold">
        Episode {ep.date} · {minutes(ep.duration_s)} · {ep.format}
      </p>
      <audio controls preload="none" src={ep.url} className="w-full" />
      <a
        href={ep.url}
        download={`ustad-podcast-${ep.date}.${ep.format}`}
        className="self-start rounded-lg border border-neutral-300 px-4 py-2"
      >
        Download {ep.format}
      </a>
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
  if (status.error) return <p>Error: {(status.error as Error).message}</p>
  if (!status.data) return <p>Loading…</p>
  const ep = build.data ?? status.data.latest

  return (
    <Column>
      <PageHeader
        title="Commute Podcast"
        subtitle="Today's sentences and yesterday's mistakes, read slowly. Answer in your head in each pause, then hear the answer."
        back={{ to: '/listen', label: 'Back to Hören' }}
      />
      {piper ? (
        <button
          onClick={() => build.mutate()}
          disabled={build.isPending}
          className="self-start rounded-lg bg-accent px-6 py-2 font-semibold text-white disabled:opacity-50"
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
    </Column>
  )
}
