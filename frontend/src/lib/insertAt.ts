/** Insert `ch` at the cursor of `el` and return the new value. */
export function insertAt(el: HTMLInputElement | null, value: string, ch: string): string {
  if (!el) return value + ch
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const next = value.slice(0, start) + ch + value.slice(end)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + ch.length, start + ch.length)
  })
  return next
}
