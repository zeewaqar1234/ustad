import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { Home } from './features/daily/Home'
import { ReviewSession } from './features/review/ReviewSession'
import { Sabaq } from './features/sabaq/Sabaq'
import { api, AuthError } from './lib/api'
import { CheckQueue } from './pages/CheckQueue'
import { Login } from './pages/Login'

function ReviewRoute() {
  const { block } = useParams()
  if (block !== 'manzil' && block !== 'sabqi') return <Navigate to="/" />
  return <ReviewSession key={block} block={block} />
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
