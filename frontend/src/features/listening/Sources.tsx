import { useState } from 'react'
import { Page, PageHeader, SectionTitle } from '../../components/ui'
import { buttonClass } from '../../lib/ui'
import { embedUrl, youtubeId } from './youtube'

interface Source {
  name: string
  url: string
  use: string
  licence: string
}

// docs/content_sources.md §11. Site and section pages only; nothing is copied into the app here.
const GROUPS: { title: string; note: string; items: Source[] }[] = [
  {
    title: 'Free to store with credit',
    note: 'Storing allowed with credit. Do not change the text.',
    items: [
      {
        name: 'Deutsche Bundesbank',
        url: 'https://www.bundesbank.de/de',
        use: 'Press releases and speeches: finance reading',
        licence: 'Copy allowed with "Quelle: Deutsche Bundesbank", text unchanged',
      },
      {
        name: 'BaFin',
        url: 'https://www.bafin.de',
        use: 'Press and regulation news',
        licence: 'Copy allowed with source credit',
      },
      {
        name: 'tagesschau CC videos',
        url: 'https://www.tagesschau.de',
        use: 'Short news videos for listening',
        licence: 'CC BY-SA 4.0 videos only, credit "tagesschau"',
      },
    ],
  },
  {
    title: 'Personal use, links only',
    note: 'Fine for you to read and hear. Never republish.',
    items: [
      {
        name: 'tagesschau',
        url: 'https://www.tagesschau.de',
        use: 'Daily news, Wirtschaft, "100 Sekunden" podcast',
        licence: 'Private non-commercial use; no publication',
      },
      {
        name: 'tagesschau Wirtschaft',
        url: 'https://www.tagesschau.de/wirtschaft',
        use: 'Economy and markets news',
        licence: 'Private non-commercial use; no publication',
      },
      {
        name: 'nachrichtenleicht',
        url: 'https://www.nachrichtenleicht.de',
        use: 'News in easy German, weekly podcast',
        licence: 'No text licence found; personal reading only',
      },
      {
        name: 'DW Top-Thema mit Vokabeln (B1)',
        url: 'https://learngerman.dw.com',
        use: 'Audio here; transcript on DW in the "Manuskript" tab',
        licence: 'No reuse licence found; read the transcript on dw.com',
      },
      {
        name: 'DW Langsam gesprochene Nachrichten (B2)',
        url: 'https://learngerman.dw.com',
        use: 'Slow news audio',
        licence: 'No reuse licence found; listen on dw.com',
      },
    ],
  },
  {
    title: 'Link or embed only',
    note: 'Official player or link. No transcript copying.',
    items: [
      {
        name: 'Easy German (YouTube)',
        url: 'https://www.youtube.com/@EasyGerman',
        use: 'Street interviews with German subtitles',
        licence: 'Embed with the official player only',
      },
      {
        name: 'Deutsch für Euch (YouTube)',
        url: 'https://www.youtube.com/results?search_query=Deutsch+f%C3%BCr+Euch',
        use: 'Grammar explained in German',
        licence: 'Embed with the official player only',
      },
      {
        name: 'DW Learn German (YouTube)',
        url: 'https://www.youtube.com/results?search_query=DW+Learn+German',
        use: 'Courses and short videos',
        licence: 'Embed with the official player only',
      },
      {
        name: 'DW Nicos Weg',
        url: 'https://learngerman.dw.com',
        use: 'Video course A1 to B1',
        licence: 'Link to the course pages only',
      },
    ],
  },
]

function YouTubeBox() {
  const [url, setUrl] = useState('')
  const [id, setId] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="font-semibold">Watch a YouTube video here</h2>
      <p className="text-sm text-neutral-700">Paste a link. German captions are switched on in the player.</p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="YouTube link"
          placeholder="https://www.youtube.com/watch?v=…"
          className="min-w-0 flex-1 rounded-lg border-2 border-neutral-900 p-2"
        />
        <button
          onClick={() => {
            const v = youtubeId(url)
            setId(v)
            setBad(!v)
          }}
          className={buttonClass('secondary')}
        >
          Open
        </button>
      </div>
      {bad && <p className="text-sm">That is not a YouTube video link.</p>}
      {id && (
        <div className="aspect-video w-full">
          <iframe
            title="YouTube video"
            src={embedUrl(id)}
            className="h-full w-full rounded"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </section>
  )
}

export function Sources() {
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Sources"
          subtitle="Where to find German to read, hear and watch. This app is private: nothing here may be shared."
          back={{ to: '/listen', label: 'Back to Hören' }}
        />
        {GROUPS.map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <SectionTitle hint={g.note}>{g.title}</SectionTitle>
            {g.items.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-neutral-900"
              >
                <span className="font-semibold">
                  {s.name} <span className="font-normal text-neutral-600">(opens site)</span>
                </span>
                <span className="text-sm">{s.use}</span>
                <span className="text-xs text-neutral-600">{s.licence}</span>
              </a>
            ))}
          </section>
        ))}
        <YouTubeBox />
      </div>
    </Page>
  )
}
