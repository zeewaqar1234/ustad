const KEYS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü']

/** Compact inline row that inserts at the cursor, plus the Mac shortcut hint. */
export function UmlautKeys({ onKey }: { onKey: (ch: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex gap-1">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onKey(k)}
            className="h-8 w-8 rounded border border-neutral-300 bg-white hover:bg-neutral-100"
          >
            {k}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-600">On a Mac: hold a letter for ä ö ü, or Option+u then the letter.</p>
    </div>
  )
}
