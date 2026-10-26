import { renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useActiveTime } from './activeTime'

afterEach(() => vi.useRealTimers())

test('gaps of 60 s or less count, longer gaps are idle', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useActiveTime())
  result.current.touch() // first edit: nothing yet
  vi.advanceTimersByTime(20_000)
  result.current.touch() // +20 s
  vi.advanceTimersByTime(61_000)
  result.current.touch() // idle: +0
  vi.advanceTimersByTime(60_000)
  result.current.touch() // +60 s
  expect(result.current.read()).toBe(80_000)
})
