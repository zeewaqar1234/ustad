/** Sentence surgery: click word chips to build the sentence, click a placed chip to take it back. */
export function TokenBuilder(props: {
  tokens: string[]
  placed: number[]
  onChange: (placed: number[]) => void
  disabled?: boolean
}) {
  const { tokens, placed, onChange, disabled } = props
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex min-h-16 flex-wrap content-start gap-2 rounded-lg border-2 border-neutral-900 bg-white p-2"
        aria-label="Your sentence"
        lang="de"
      >
        {placed.length === 0 && <span className="p-2 text-neutral-500">Click the words in order.</span>}
        {placed.map((ti, pi) => (
          <button
            key={`${ti}-${pi}`}
            type="button"
            disabled={disabled}
            onClick={() => onChange(placed.filter((_, j) => j !== pi))}
            className="min-h-10 rounded border-2 border-neutral-900 bg-neutral-900 px-3 text-lg text-white"
            aria-label={`Remove ${tokens[ti]}`}
          >
            {tokens[ti]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" lang="de">
        {tokens.map((t, ti) =>
          placed.includes(ti) ? (
            <span
              key={ti}
              className="min-h-10 rounded border-2 border-dashed border-neutral-300 px-3 text-lg leading-9 text-transparent"
              aria-hidden
            >
              {t}
            </span>
          ) : (
            <button
              key={ti}
              type="button"
              disabled={disabled}
              data-token
              onClick={() => onChange([...placed, ti])}
              className="min-h-10 rounded border-2 border-neutral-900 bg-white px-3 text-lg hover:bg-neutral-200"
            >
              {t}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
