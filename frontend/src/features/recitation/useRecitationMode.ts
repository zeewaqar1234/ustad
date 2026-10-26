import { useSearchParams } from 'react-router'

/** Type / Speak switch, stored in the query string as ?mode=speak. */
export function useRecitationMode(): ['type' | 'speak', (m: 'type' | 'speak') => void] {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'speak' ? 'speak' : 'type'
  return [mode, (m) => setParams(m === 'speak' ? { mode: 'speak' } : {}, { replace: true })]
}
