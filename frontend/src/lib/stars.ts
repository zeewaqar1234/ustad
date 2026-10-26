// Shadowing stars, from words heard only. Never from pace, pauses or fluency (stammer rules).
// Conversation stars come from the server, in the end-of-session review only.

export type Stars = 0 | 1 | 2 | 3

// Shadowing: share of the reference words the recogniser heard.
export function shadowStars(matched: number, total: number): Stars {
  if (!total || !matched) return 0
  const pct = matched / total
  return pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1
}

export function shadowLine(matched: number, total: number): string {
  if (!total) return 'Nothing to check.'
  if (matched === total) return 'Every word heard.'
  if (!matched) return 'No words heard. Try again, or type it.'
  return `${matched} of ${total} words heard`
}
