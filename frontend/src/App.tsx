import { useQuery } from '@tanstack/react-query'
import { Navigate, NavLink, Route, Routes, useParams } from 'react-router'
import { Home } from './features/daily/Home'
import { Ghalti } from './features/ghalti/Ghalti'
import { Drills } from './features/grammar/Drills'
import { PatternCard } from './features/grammar/PatternCard'
import { PatternList } from './features/grammar/PatternList'
import { Diktat } from './features/listening/Diktat'
import { ListenHome } from './features/listening/ListenHome'
import { Podcast } from './features/listening/Podcast'
import { Sources } from './features/listening/Sources'
import { Progress } from './pages/Progress'
import { Settings } from './pages/Settings'
import { Placement } from './features/placement/Placement'
import { Reader } from './features/reader/Reader'
import { ReaderList } from './features/reader/ReaderList'
import { Recitation } from './features/recitation/Recitation'
import { RecitationList } from './features/recitation/RecitationList'
import { ReviewSession } from './features/review/ReviewSession'
import { Sabaq } from './features/sabaq/Sabaq'
import { Session } from './features/voice/Session'
import { Shadowing } from './features/voice/Shadowing'
import { VoiceHome } from './features/voice/VoiceHome'
import { Homework } from './features/writing/Homework'
import { api, AuthError } from './lib/api'
import { CheckQueue } from './pages/CheckQueue'
import { SKILL_COLOR, type Skill } from './lib/ui'
import { Login } from './pages/Login'

function ReviewRoute() {
  const { block } = useParams()
  if (block !== 'manzil' && block !== 'sabqi') return <Navigate to="/" />
  return <ReviewSession key={block} block={block} />
}

// keyed by code so moving between patterns or tables starts fresh state
function DrillsRoute() {
  const { code } = useParams()
  return <Drills key={code} />
}

function RecitationRoute() {
  const { code } = useParams()
  return <Recitation key={code} />
}

function SessionRoute() {
  const { id } = useParams()
  return <Session key={id} />
}

function ReaderRoute() {
  const { id } = useParams()
  return <Reader key={id} />
}

type NavItem = { to: string; label: string; sub: string; end?: boolean; skill?: Skill }

const NAV: { heading?: string; items: NavItem[] }[] = [
  { items: [{ to: '/', label: 'Today', sub: 'your plan for today', end: true }] },
  {
    heading: 'Practice',
    items: [
      { to: '/read', label: 'Lesen', sub: 'reading', skill: 'read' },
      { to: '/listen', label: 'Hören', sub: 'listening', skill: 'listen' },
      { to: '/homework', label: 'Schreiben', sub: 'writing', skill: 'write' },
      { to: '/voice', label: 'Sprechen', sub: 'speaking', skill: 'speak' },
    ],
  },
  {
    items: [
      { to: '/grammar', label: 'Grammatik', sub: 'patterns and tables' },
      { to: '/ghalti', label: 'Ghalti', sub: 'your mistakes' },
      { to: '/progress', label: 'Fortschritt', sub: 'progress' },
    ],
  },
]

function Shell({ children }: { children: React.ReactNode }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 ${isActive ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-200'}`
  return (
    <div className="flex min-h-screen min-w-[1024px] bg-page">
      <aside className="fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-neutral-200 bg-neutral-100 p-3">
        <NavLink to="/" className="mb-4 px-3 py-2 text-xl font-bold">
          Ustad
        </NavLink>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Main">
          {NAV.map((g, i) => (
            <div key={i} className="flex flex-col gap-1">
              {g.heading && <p className="px-3 text-xs font-semibold text-neutral-600">{g.heading}</p>}
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={link}>
                  <span className="flex items-center gap-2 font-semibold leading-tight">
                    {it.skill && (
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ background: SKILL_COLOR[it.skill] }}
                      />
                    )}
                    {it.label}
                  </span>
                  <span className={`block text-xs opacity-70 ${it.skill ? 'pl-4' : ''}`}>{it.sub}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <NavLink to="/settings" className={link}>
          <span className="block font-semibold leading-tight">Settings</span>
          <span className="block text-xs opacity-70">goal, results, tools</span>
        </NavLink>
      </aside>
      <main className="ml-[220px] flex-1 px-8 py-8">
        <div className="mx-auto w-full max-w-[1120px]">{children}</div>
      </main>
    </div>
  )
}

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me'), retry: false })
  if (me.isPending) return <p className="p-8">Loading…</p>
  const loggedIn = !(me.error instanceof AuthError) && !me.isError
  return (
    <Routes>
      <Route path="/login" element={loggedIn ? <Navigate to="/" /> : <Login />} />
      <Route
        path="*"
        element={
          loggedIn ? (
            <Shell>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/review/:block" element={<ReviewRoute />} />
                <Route path="/sabaq" element={<Sabaq />} />
                <Route path="/grammar" element={<PatternList />} />
                <Route path="/grammar/:code" element={<PatternCard />} />
                <Route path="/grammar/:code/drills" element={<DrillsRoute />} />
                <Route path="/homework" element={<Homework />} />
                <Route path="/ghalti" element={<Ghalti />} />
                <Route path="/recitation" element={<RecitationList />} />
                <Route path="/recitation/:code" element={<RecitationRoute />} />
                <Route path="/placement" element={<Placement />} />
                <Route path="/voice" element={<VoiceHome />} />
                <Route path="/voice/shadow" element={<Shadowing />} />
                <Route path="/voice/session/:id" element={<SessionRoute />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/read" element={<ReaderList />} />
                <Route path="/read/:id" element={<ReaderRoute />} />
                <Route path="/listen" element={<ListenHome />} />
                <Route path="/listen/diktat" element={<Diktat />} />
                <Route path="/listen/podcast" element={<Podcast />} />
                <Route path="/listen/sources" element={<Sources />} />
                <Route path="/check" element={<CheckQueue />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Shell>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  )
}
