import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPaidThisMonth } from '../format'

// "Today" is the 20th: day 5 has passed, day 25 is still to come.
afterEach(() => { vi.useRealTimers() })
const on20th = () => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 20, 12)) }

describe('isPaidThisMonth', () => {
  it('a payment whose day has passed is unpaid until it is ticked', () => {
    on20th()
    expect(isPaidThisMonth('loan-1', 5, [])).toBe(false)
    expect(isPaidThisMonth('loan-1', 5, ['loan-1'])).toBe(true)
  })
  it('a payment still to come is unpaid until ticked, and paid once ticked', () => {
    on20th()
    expect(isPaidThisMonth('loan-2', 25, [])).toBe(false)
    expect(isPaidThisMonth('loan-2', 25, ['loan-2'])).toBe(true)
  })
  it('a tick made early stays paid after the day passes (it used to flip back to unpaid)', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 2, 12))
    expect(isPaidThisMonth('card-3', 10, ['card-3'])).toBe(true)
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    expect(isPaidThisMonth('card-3', 10, ['card-3'])).toBe(true)
  })
  it('no due day: only a tick counts', () => {
    expect(isPaidThisMonth('x', undefined, [])).toBe(false)
    expect(isPaidThisMonth('x', undefined, ['x'])).toBe(true)
  })
})
