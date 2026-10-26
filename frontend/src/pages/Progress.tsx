import { PageHeader } from '../components/ui'

export function Progress() {
  return (
    <div>
      <PageHeader title="Fortschritt" subtitle="Progress against the official Goethe scale" />
      <p className="max-w-[720px]">
        Not built yet. The Stand box and this page arrive in phase V2. Every number there will come from the
        official Goethe files or from your own study records. Until then nothing is shown rather than a guess.
      </p>
    </div>
  )
}
