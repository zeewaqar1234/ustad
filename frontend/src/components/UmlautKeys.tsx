const KEYS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü']

/** Phone keyboards hide umlauts behind long-press; these insert at the cursor. */
export function UmlautKeys({ onKey }: { onKey: (ch: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey(k)}
          className="h-10 min-w-10 flex-1 rounded border border-neutral-300 bg-white text-lg active:bg-neutral-200"
        >
          {k}
        </button>
      ))}
    </div>
  )
}
