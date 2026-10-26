import { describe, expect, it } from 'vitest'
import { shadowLine, shadowStars } from './stars'

describe('stars', () => {
  it('shadowing: by words heard', () => {
    expect(shadowStars(10, 10)).toBe(3)
    expect(shadowStars(9, 10)).toBe(3)
    expect(shadowStars(6, 10)).toBe(2)
    expect(shadowStars(3, 10)).toBe(1)
    expect(shadowStars(0, 10)).toBe(0)
    expect(shadowLine(4, 5)).toBe('4 of 5 words heard')
  })
})
