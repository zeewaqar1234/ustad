import { useRef } from 'react'
import { insertAt } from '../lib/insertAt'
import { UmlautKeys } from './UmlautKeys'

/** German text input or textarea with the umlaut row. No autocorrect, no spellcheck. */
export function GermanField(props: {
  value: string
  onChange: (v: string) => void
  label: string
  placeholder?: string
  multiline?: boolean
  rows?: number
  disabled?: boolean
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const common = {
    value: props.value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.onChange(e.target.value),
    lang: 'de',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    'aria-label': props.label,
    placeholder: props.placeholder,
    disabled: props.disabled,
    autoFocus: props.autoFocus,
    className: 'w-full rounded-lg border-2 border-neutral-900 p-3 text-lg disabled:opacity-60',
  }
  return (
    <div className="flex flex-col gap-2">
      {props.multiline ? <textarea ref={ref} rows={props.rows ?? 5} {...common} /> : <input ref={ref} {...common} />}
      <UmlautKeys onKey={(ch) => props.onChange(insertAt(ref.current, props.value, ch))} />
    </div>
  )
}
