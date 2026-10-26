export function shadowLine(matched: number, total: number): string {
  if (!total) return 'Nothing to check.'
  if (matched === total) return 'Every word heard.'
  if (!matched) return 'No words heard. Try again, or type it.'
  return `${matched} of ${total} words heard`
}
