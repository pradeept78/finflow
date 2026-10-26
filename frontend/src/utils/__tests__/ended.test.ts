import { describe, it, expect } from 'vitest'
import { hasEnded, isLive } from '../ended'
import { calcOutflow } from '../calcOutflow'
const day = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }
describe('ended bills stop counting', () => {
  it('hasEnded / isLive', () => {
    expect(hasEnded({ endDate: day(-1) })).toBe(true)
    expect(hasEnded({ endDate: day(0) })).toBe(false)
    expect(hasEnded({})).toBe(false)
    expect(isLive({ active: false })).toBe(false)
    expect(isLive({ endDate: day(-5) })).toBe(false)
  })
  it('an expired monthly bill is out of outflow, a running one is in', () => {
    const o = calcOutflow([], [], [], [], [], [{ amount: 1000, frequency: 'Monthly', endDate: day(-10) }, { amount: 700, frequency: 'Monthly', endDate: day(30) }], [])
    expect(o.expenses).toBe(700)
  })
})
