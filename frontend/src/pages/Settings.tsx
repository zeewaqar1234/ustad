import { useQueryClient } from '@tanstack/react-query'
import { ListRow, PageHeader } from '../components/ui'
import { api } from '../lib/api'

export function Settings() {
  const qc = useQueryClient()
  return (
    <div className="max-w-[720px]">
      <PageHeader title="Settings" subtitle="Tools you use now and then" />
      <div className="flex flex-col gap-2">
        <ListRow title="Placement test" sub="your starting stage" status="The app's own test. Not an official CEFR result." to="/placement" />
        <ListRow title="Check queue" sub="German waiting for your approval" to="/check" />
        <ListRow title="Sources" sub="free listening and reading material" to="/listen/sources" />
        <button
          onClick={async () => {
            await api('/auth/logout', {})
            qc.clear()
            location.assign('/login')
          }}
          className="mt-4 self-start rounded-lg border border-neutral-900 px-4 py-2 font-semibold"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
