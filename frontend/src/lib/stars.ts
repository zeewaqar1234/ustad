// 1 to 3 stars, from German content only (words heard / errors found). Never from pace, pauses or
// fluency: the stammer rules apply to every score shown.

export type Stars = 0 | 1 | 2 | 3

// Shadowing: share of the reference words the recogniser heard.
export function shadowStars(matched: number, total: number): Stars {
  if (!total || !matched) return 0
  const pct = matched / total
  return pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1
}

// A spoken or typed turn: German errors the tutor found. null = not graded (tutor offline).
export function turnStars(errors: number | null): Stars | null {
  if (errors === null) return null
  return errors === 0 ? 3 : errors === 1 ? 2 : 1
}

export function shadowLine(matched: number, total: number): string {
  if (!total) return 'Nothing to check.'
  if (matched === total) return 'Every word heard.'
  if (!matched) return 'No words heard. Try again, or type it.'
  return `${matched} of ${total} words heard`
}

export function turnLine(errors: number): string {
  if (errors === 0) return 'No errors found'
  return `${errors} ${errors === 1 ? 'error' : 'errors'} · details in the review`
}
