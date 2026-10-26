import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { Home } from './features/daily/Home'
import { Ghalti } from './features/ghalti/Ghalti'
import { Drills } from './features/grammar/Drills'
import { PatternCard } from './features/grammar/PatternCard'
import { PatternList } from './features/grammar/PatternList'
import { Placement } from './features/placement/Placement'
import { Recitation } from './features/recitation/Recitation'
import { RecitationList } from './features/recitation/RecitationList'
import { ReviewSession } from './features/review/ReviewSession'
import { Sabaq } from './features/sabaq/Sabaq'
import { Session } from './features/voice/Session'
import { Shadowing } from './features/voice/Shadowing'
import { VoiceHome } from './features/voice/VoiceHome'
import { VoiceRecitation, VoiceRecitationList } from './features/voice/VoiceRecitation'
import { Homework } from './features/writing/Homework'
import { api, AuthError } from './lib/api'
import { CheckQueue } from './pages/CheckQueue'
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

function VoiceRecitationRoute() {
  const { code } = useParams()
  return <VoiceRecitation key={code} />
}

function SessionRoute() {
  const { id } = useParams()
  return <Session key={id} />
}

function Shell({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-neutral-50">
      <nav className="flex h-14 items-center justify-between border-b border-neutral-300 px-4">
        <Link to="/" className="text-lg font-bold">
          Ustad
        </Link>
        <div className="flex gap-4 text-sm">
          <Link to="/ghalti">Ghalti</Link>
          <Link to="/check">Check queue</Link>
          <button
            onClick={async () => {
              await api('/auth/logout', {})
              qc.clear()
              location.assign('/login')
            }}
          >
            Log out
          </button>
        </div>
      </nav>
      {children}
    </div>
  )
}

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me'), retry: false })
  if (me.isPending) return <p className="p-4">Loading…</p>
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
                <Route path="/voice/recite" element={<VoiceRecitationList />} />
                <Route path="/voice/recite/:code" element={<VoiceRecitationRoute />} />
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
