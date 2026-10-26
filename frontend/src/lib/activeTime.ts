import { useRef } from 'react'

const IDLE_MS = 60_000

/** Active writing time: the gap between two edits counts when it is 60 s or less; a longer gap is idle
 *  and counts for nothing. Call `touch()` on every edit and `read()` when sending. No visible timer. */
export function useActiveTime() {
  const total = useRef(0)
  const last = useRef<number | null>(null)
  return {
    touch() {
      const now = Date.now()
      if (last.current !== null && now - last.current <= IDLE_MS) total.current += now - last.current
      last.current = now
    },
    read: () => Math.round(total.current),
  }
}
