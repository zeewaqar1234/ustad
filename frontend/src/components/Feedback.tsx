import { RATING_LABEL, type Grade } from '../lib/api'
import { Diff } from './Diff'

export function Feedback({ grade, given }: { grade: Grade; given: string }) {
  const head =
    grade.verdict === 'exact' ? 'Correct.' : grade.verdict === 'close' ? 'Almost.' : 'Not yet.'
  return (
    <div className="rounded-lg border-2 border-neutral-900 bg-white p-4" role="status">
      <p className="flex justify-between font-semibold">
        <span>{head}</span>
        <span className="text-sm font-normal">Rated {RATING_LABEL[grade.rating]}</span>
      </p>
      {grade.verdict !== 'exact' && (
        <>
          <p className="mt-2 text-sm text-neutral-600">You wrote</p>
          <p className="font-mono" lang="de">
            {given || '(nothing)'}
          </p>
          <p className="mt-2 text-sm text-neutral-600">Correct</p>
          <p className="font-mono font-semibold" lang="de">
            {grade.expected}
          </p>
          {given && grade.diff.length > 0 && (
            <div className="mt-2">
              <Diff parts={grade.diff} />
            </div>
          )}
        </>
      )}
      {grade.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {grade.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
