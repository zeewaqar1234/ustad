import type { Grade } from '../lib/api'
import { Diff } from './Diff'
import { Verdict } from './ui'

/** Card feedback after an attempt. Plain words only: no scheduler internals. */
export function Feedback({ grade, given }: { grade: Grade; given: string }) {
  const kind = grade.verdict === 'exact' ? 'right' : grade.verdict === 'close' ? 'almost' : 'wrong'
  const line = kind === 'almost' ? 'Small slip.' : kind === 'wrong' ? 'This card comes back soon.' : undefined
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <Verdict kind={kind}>{line}</Verdict>
      {grade.verdict !== 'exact' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-neutral-600">Your answer</p>
          <p className="font-mono" lang="de">
            {given || '(nothing)'}
          </p>
          <p className="mt-1 text-sm text-neutral-600">Correct</p>
          <p className="font-mono font-semibold text-ok" lang="de">
            {grade.expected}
          </p>
          {given && grade.diff.length > 0 && (
            <div className="mt-1">
              <Diff parts={grade.diff} />
            </div>
          )}
        </div>
      )}
      {grade.notes.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {grade.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
