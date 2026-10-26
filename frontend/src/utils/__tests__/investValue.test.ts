import { describe, it, expect } from 'vitest'
import { investTotals, investValue } from '../investValue'

describe('investTotals', () => {
  it('falls back to maturity value, then invested; skips inactive', () => {
    const t = investTotals([
      { totalInvested: 10000, currentValue: 12000 },
      { totalInvested: 20000 },                          // no value recorded → counts as 20,000
      { totalInvested: 5000, maturityValue: 6000 },      // → 6,000
      { totalInvested: 9000, currentValue: 9500, active: false },
    ])
    expect(t.count).toBe(3)
    expect(t.invested).toBe(35000)
    expect(t.value).toBe(38000)
    expect(t.pnl).toBe(3000)
  })
  it('an entry with no numbers is worth 0', () => { expect(investValue({})).toBe(0) })
})

import { investInvested, sipInvestedSoFar } from '../investValue'
describe('SIP auto-growth', () => {
  const monthsAgo = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); d.setDate(1); return d.toISOString().slice(0, 10) }
  it('invested is at least monthly × instalments so far, and value follows at cost', () => {
    const v = { monthly: 10000, startDate: monthsAgo(3), totalInvested: 30000, currentValue: 30000 }   // 4 instalments by now
    expect(sipInvestedSoFar(v)).toBe(40000)
    expect(investInvested(v)).toBe(40000)
    expect(investTotals([v]).value).toBe(40000)
  })
  it('a typed market value is left alone, a larger lump sum is kept', () => {
    expect(investTotals([{ monthly: 10000, startDate: monthsAgo(3), totalInvested: 30000, currentValue: 33000 }]).value).toBe(33000)
    expect(investInvested({ monthly: 10000, startDate: monthsAgo(3), totalInvested: 90000 })).toBe(90000)
  })
  it('no monthly amount → nothing changes', () => {
    expect(investInvested({ totalInvested: 5000, startDate: monthsAgo(6) })).toBe(5000)
  })
})
