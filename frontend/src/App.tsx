import { useEffect, useState } from 'react'

type Health = 'checking' | 'ok' | 'down'

export default function App() {
  const [health, setHealth] = useState<Health>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d.status === 'ok' ? 'ok' : 'down'))
      .catch(() => setHealth('down'))
  }, [])

  return (
    <main className="mx-auto max-w-md p-4 font-sans text-neutral-900">
      <h1 className="text-2xl font-bold">Ustad</h1>
      <p className="mt-2 text-sm">Backend: {health}</p>
    </main>
  )
}
