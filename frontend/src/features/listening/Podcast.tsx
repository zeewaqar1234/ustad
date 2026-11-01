import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Page, PageHeader } from '../../components/ui'
import { buttonClass } from '../../lib/ui'
import { api } from '../../lib/api'
import { type Episode, minutes, type PodcastStatus, type ScriptLine } from '../../lib/reading'

function Script({ lines }: { lines: ScriptLine[] }) {
  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-4">
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
    <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="font-semibold">
        Episode of {ep.date} · {minutes(ep.duration_s)}
      </p>
      <audio controls preload="none" src={ep.url} className="w-full" />
      <a
        href={ep.url}
        download={`ustad-podcast-${ep.date}.${ep.format}`}
        className={`self-start ${buttonClass('secondary')}`}
      >
        Download audio
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
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Commute Podcast"
          subtitle="Today's sentences and yesterday's mistakes, read slowly. Answer in your head in each pause, then hear the answer."
          back={{ to: '/listen', label: 'Back to Hören' }}
        />
        {piper ? (
          <div>
            <Button kind="primary" onClick={() => build.mutate()} disabled={build.isPending}>
              {build.isPending ? 'Building episode…' : "Build today's episode"}
            </Button>
          </div>
        ) : (
          <p className="rounded-xl border border-neutral-300 bg-white p-3 text-sm">
            Audio is not set up, so there is no file to play. Here is today's script.
          </p>
        )}
        {build.isError && <p className="text-sm">{(build.error as Error).message}</p>}
        {piper && !status.data.english_voice && (
          <p className="text-sm text-neutral-600">Prompts are German sentences to repeat (no English voice set up).</p>
        )}
        {ep && <Player ep={ep} />}
        {ep && <Script lines={ep.script} />}
        {!ep && script.data && <Script lines={script.data.items} />}
      </div>
    </Page>
  )
}
