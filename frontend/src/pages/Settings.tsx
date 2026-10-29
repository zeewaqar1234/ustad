import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ListRow, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { formatDate, KIND_LABEL, type ModuleKey, type Standing } from '../lib/standing'

interface Teil { n: number; label?: string; items?: number; max: number }
type Format = Record<'B1' | 'B2', { exam: string; pass_points: number; modules: Record<ModuleKey, { label: string; teile: Teil[]; scoring: string; verified: boolean; verify_note?: string }> }>
interface ResultRow { id: number; taken: string; level: string; module: string; kind: string; teil: number | null; raw: number | null; raw_max: number | null; points: number; points_max: number; voided: boolean }

const field = 'rounded-lg border border-neutral-400 bg-white px-3 py-1.5'
const label = 'flex flex-col gap-1 text-sm font-semibold'

function Goals() {
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api<Standing['goals']>('/api/goals') })
  return goals.data ? <GoalsForm initial={goals.data} /> : <p>Loading…</p>
}

function GoalsForm({ initial }: { initial: Standing['goals'] }) {
  const qc = useQueryClient()
  const [exam, setExam] = useState<'B1' | 'B2'>(initial.target_exam)
  const [date, setDate] = useState(initial.target_date ?? '')
  const [hours, setHours] = useState(initial.weekly_hours ? String(initial.weekly_hours) : '')
  const [msg, setMsg] = useState('')
  const save = useMutation({
    mutationFn: () => api('/api/goals', { target_exam: exam, target_date: date || null, weekly_hours: hours ? Number(hours) : null }),
    onSuccess: () => { setMsg('Saved.'); qc.invalidateQueries() },
    onError: (e: Error) => setMsg(e.message),
  })
  return (
    <form
      id="goal"
      onSubmit={(e: FormEvent) => { e.preventDefault(); setMsg(''); save.mutate() }}
      className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-4"
    >
      <h2 className="text-lg font-bold">Goal</h2>
      <div className="grid grid-cols-3 gap-4">
        <label className={label}>Target exam
          <select className={field} value={exam} onChange={(e) => setExam(e.target.value as 'B1' | 'B2')}>
            <option value="B1">Goethe-Zertifikat B1</option>
            <option value="B2">Goethe-Zertifikat B2</option>
          </select>
        </label>
        <label className={label}>Target date (optional)
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={label}>Weekly hours (your own target)
          <input type="number" min="0.5" max="100" step="0.5" className={field} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button className="rounded-lg border border-neutral-900 px-4 py-2 font-semibold" type="submit">Save goal</button>
        <span role="status" className="text-sm">{msg}</span>
      </div>
    </form>
  )
}

function AddResult({ preset }: { preset: ModuleKey | null }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLFormElement>(null)
  const fmt = useQuery({ queryKey: ['exam-format'], queryFn: () => api<Format>('/api/exam-format'), staleTime: Infinity })
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api<Standing['goals']>('/api/goals') })
  const list = useQuery({ queryKey: ['exam-results'], queryFn: () => api<{ results: ResultRow[] }>('/api/exam-results') })
  const [level, setLevel] = useState<'B1' | 'B2' | null>(null)
  const [module, setModule] = useState<ModuleKey>(preset ?? 'lesen')
  const [kind, setKind] = useState<'practice_full' | 'practice_teil' | 'real_exam'>('practice_full')
  const [taken, setTaken] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [teil, setTeil] = useState(1)
  const [raw, setRaw] = useState('')
  const [points, setPoints] = useState('')
  const [teile, setTeile] = useState<Record<number, string>>({})
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { if (preset) ref.current?.scrollIntoView?.() }, [preset])
  const resetEntry = () => { setTeil(1); setRaw(''); setPoints(''); setTeile({}) }
  const lv = level ?? goals.data?.target_exam ?? 'B1'
  const mod = fmt.data?.[lv].modules[module]
  const counts = module === 'lesen' || module === 'hoeren'
  const unit = (t: Teil) => (counts ? t.items! : t.max)
  const add = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { level: lv, module, kind, taken, note }
      if (kind === 'real_exam') body.points = Number(points)
      else if (kind === 'practice_teil') { body.teil = teil; body.raw = Number(raw) }
      else body.teile = Object.fromEntries(mod!.teile.map((t) => [t.n, Number(teile[t.n] ?? '')]))
      return api('/api/exam-results', body)
    },
    onSuccess: () => {
      setMsg('Saved. The Stand box on Today has changed.')
      setRaw(''); setPoints(''); setTeile({}); setNote('')
      qc.invalidateQueries()
    },
    onError: (e: Error) => setMsg(e.message),
  })
  const toggle = useMutation({
    mutationFn: (r: ResultRow) => api(`/api/exam-results/${r.id}/void`, { voided: !r.voided }),
    onSuccess: () => qc.invalidateQueries(),
  })
  const complete = kind === 'real_exam' ? points !== '' : kind === 'practice_teil' ? raw !== '' : !!mod && mod.teile.every((t) => teile[t.n] !== undefined && teile[t.n] !== '')
  return (
    <form
      id="result"
      ref={ref}
      onSubmit={(e: FormEvent) => { e.preventDefault(); setMsg(''); add.mutate() }}
      className="flex flex-col gap-3 rounded-lg border border-neutral-300 bg-white p-4"
    >
      <h2 className="text-lg font-bold">Add a result</h2>
      <p className="text-sm text-neutral-700">
        Only official material counts: a real certificate, or an official Goethe practice test (Übungssatz or Modellsatz) scored
        by the answer key. Practice results are estimates and can be wrong; a real result replaces them.
      </p>
      <div className="grid grid-cols-4 gap-4">
        <label className={label}>Exam
          <select className={field} value={lv} onChange={(e) => { setLevel(e.target.value as 'B1' | 'B2'); resetEntry() }}>
            <option>B1</option><option>B2</option>
          </select>
        </label>
        <label className={label}>Module
          <select className={field} value={module} onChange={(e) => { setModule(e.target.value as ModuleKey); resetEntry() }}>
            <option value="lesen">Lesen</option><option value="hoeren">Hören</option>
            <option value="schreiben">Schreiben</option><option value="sprechen">Sprechen</option>
          </select>
        </label>
        <label className={label}>What you did
          <select className={field} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); resetEntry() }}>
            <option value="practice_full">{KIND_LABEL.practice_full}</option>
            <option value="practice_teil">{KIND_LABEL.practice_teil}</option>
            <option value="real_exam">{KIND_LABEL.real_exam}</option>
          </select>
        </label>
        <label className={label}>Date taken
          <input type="date" className={field} value={taken} onChange={(e) => setTaken(e.target.value)} required />
        </label>
      </div>
      {mod && <p className="text-sm text-neutral-700">{mod.scoring}{!mod.verified && ' Provisional: not fully checked against the examiner sheets.'}</p>}
      {kind === 'real_exam' && (
        <label className={`${label} max-w-xs`}>Module points on the certificate (0 to 100)
          <input type="number" min="0" max="100" step="1" className={field} value={points} onChange={(e) => setPoints(e.target.value)} required />
        </label>
      )}
      {kind === 'practice_teil' && mod && (
        <div className="grid grid-cols-2 gap-4">
          <label className={label}>Teil
            <select className={field} value={teil} onChange={(e) => setTeil(Number(e.target.value))}>
              {mod.teile.map((t) => <option key={t.n} value={t.n}>Teil {t.n}</option>)}
            </select>
          </label>
          <label className={label}>{counts ? 'Correct items' : 'Points'} (0 to {unit(mod.teile.find((t) => t.n === teil) ?? mod.teile[0])})
            <input type="number" min="0" step={counts ? 1 : 0.5} className={field} value={raw} onChange={(e) => setRaw(e.target.value)} required />
          </label>
        </div>
      )}
      {kind === 'practice_full' && mod && (
        <div className="flex flex-wrap gap-4">
          {mod.teile.map((t) => (
            <label key={t.n} className={`${label} w-36`}>Teil {t.n}: {counts ? 'correct' : 'points'} (0 to {unit(t)})
              <input type="number" min="0" max={unit(t)} step={counts ? 1 : 0.5} className={field} value={teile[t.n] ?? ''} onChange={(e) => setTeile({ ...teile, [t.n]: e.target.value })} required />
            </label>
          ))}
        </div>
      )}
      <label className={label}>Note (optional)
        <input className={field} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Which test, for example Übungssatz Erwachsene" />
      </label>
      <div className="flex items-center gap-4">
        <button className="rounded-lg border border-neutral-900 px-4 py-2 font-semibold disabled:opacity-40" type="submit" disabled={!complete || add.isPending}>Save result</button>
        <span role="status" className="text-sm">{msg}</span>
      </div>
      {list.data && list.data.results.length > 0 && (
        <div>
          <h3 className="mb-1 font-bold">Entered results</h3>
          <p className="mb-1 text-sm text-neutral-600">Void a typo or a duplicate: it stays here but counts for nothing. Restore undoes it.</p>
          <table className="w-full text-left text-sm">
            <tbody>
              {list.data.results.map((r) => (
                <tr key={r.id} className={`border-b border-neutral-200 ${r.voided ? 'text-neutral-500 line-through' : ''}`}>
                  <td className="py-1 pr-3">{formatDate(r.taken)}</td>
                  <td className="pr-3">{r.level} {r.module}</td>
                  <td className="pr-3">{KIND_LABEL[r.kind]}{r.teil ? `, Teil ${r.teil}` : ''}</td>
                  <td>{Math.round(r.points)} of {r.points_max}{r.raw !== null ? ` (raw ${r.raw} of ${r.raw_max})` : ''}</td>
                  <td className="pl-3 text-right no-underline">
                    {r.voided && <span className="mr-2 font-semibold no-underline">Voided</span>}
                    <button type="button" className="underline" onClick={() => toggle.mutate(r)}>
                      {r.voided ? 'Restore' : 'Void'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  )
}

export function Settings() {
  const qc = useQueryClient()
  const [sp] = useSearchParams()
  const preset = sp.get('result') as ModuleKey | null
  return (
    <div className="max-w-[960px]">
      <PageHeader title="Settings" subtitle="Goal, results, and tools you use now and then" />
      <div className="flex flex-col gap-4">
        <Goals />
        <AddResult preset={preset} />
        <h2 className="mt-4 text-lg font-bold">Tools</h2>
        <ListRow title="Placement test" sub="your starting stage" status="The app's own test. Not an official CEFR result." to="/placement" />
        <ListRow title="Check queue" sub="German waiting for your approval" to="/check" />
        <ListRow title="Sources" sub="free listening and reading material" to="/listen/sources" />
        <button
          onClick={async () => {
            await api('/auth/logout', {})
            qc.clear()
            location.assign('/login')
          }}
          className="mt-4 self-start rounded-lg border border-neutral-900 px-4 py-2 font-semibold"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
