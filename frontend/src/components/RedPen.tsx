import { humanTag, type WritingGrade } from '../lib/grammar'
import { marked } from './marked'

/** Report-card view of a graded text. Grayscale: underline + number mark each error. */
export function RedPen({ grade }: { grade: WritingGrade }) {
  const ltOnly = grade.source === 'languagetool_only'
  const errors = [...grade.errors].sort((a, b) => a.start - b.start)
  const points = grade.teaching_points.slice(0, 3)
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-neutral-900 bg-white p-4" role="status">
      <p className="flex items-baseline justify-between gap-2">
        {ltOnly || grade.score_10 === null ? (
          <span className="text-sm font-semibold">No score: tutor offline, LanguageTool check only</span>
        ) : (
          <span className="text-3xl font-bold" aria-label={`Score ${grade.score_10} out of 10`}>
            {grade.score_10}/10
          </span>
        )}
        <span className="text-sm text-neutral-600">
          {errors.length === 0 ? 'No errors marked' : `${errors.length} marked`}
        </span>
      </p>

      <div>
        <p className="text-xs tracking-wide text-neutral-500 uppercase">Your text</p>
        <p className="mt-1 text-lg leading-loose break-words whitespace-pre-wrap" lang="de">
          {marked(grade.original, errors)}
        </p>
      </div>

      {errors.length > 0 && (
        <ol className="flex flex-col gap-2 border-t border-neutral-200 pt-3 text-sm">
          {errors.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 shrink-0 font-bold">{i + 1}.</span>
              <span className="min-w-0 break-words">
                <span lang="de" className="line-through">
                  {e.span}
                </span>{' '}
                →{' '}
                <span lang="de" className="font-semibold">
                  {e.fix || '(remove)'}
                </span>{' '}
                · <span className="uppercase">{humanTag(e.tag)}</span> · {e.reason_en}
              </span>
            </li>
          ))}
        </ol>
      )}

      {grade.corrected_text && (
        <div className="border-t border-neutral-200 pt-3">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">Corrected</p>
          <p className="mt-1 font-semibold break-words whitespace-pre-wrap" lang="de">
            {grade.corrected_text}
          </p>
        </div>
      )}

      {points.length > 0 && (
        <div className="border-t border-neutral-200 pt-3">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">To remember</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {grade.needs_review && !ltOnly && (
        <p className="text-xs text-neutral-600">Correction not confirmed by LanguageTool. Check it.</p>
      )}
    </div>
  )
}
