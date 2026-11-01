import type { ItemReveal } from '../lib/api'

export function ItemCard({ item }: { item: ItemReveal }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xl font-semibold" lang="de">
        {item.symbol && <span className="mr-1.5" aria-hidden>{item.symbol}</span>}
        {item.de}
      </p>
      {item.plural && item.plural !== '-' && (
        <p className="text-sm text-neutral-600" lang="de">
          Plural: die {item.plural}
        </p>
      )}
      <p className="mt-1 text-neutral-700">{item.en}</p>
      {item.example_de && (
        <div className="mt-3 border-t border-neutral-200 pt-3 text-sm">
          <p lang="de">{item.example_de}</p>
          <p className="text-neutral-600">{item.example_en}</p>
        </div>
      )}
      {item.status === 'needs_review' && (
        <p className="mt-2 text-xs text-neutral-500">Flagged by LanguageTool. Not checked yet.</p>
      )}
    </div>
  )
}
