import { describe, it, expect } from 'vitest'
import { cardLimitUse } from '../cardLimit'

describe('cardLimitUse', () => {
  const card = {
    cardLimit: 100000, outstanding: 20000,
    spends: [{ amount: 5000 }, { amount: 3000, owedBy: 'Raj' }],
    emis: [
      { emi: 1000, tenure: 10, paidMonths: 4 },              // 6 left → 6000
      { emi: 500, tenure: 6, paidMonths: 6 },                // finished → 0
      { emi: 2000, tenure: 5, paidMonths: 0, owedBy: 'Raj' } // friend's, 5 left → 10000, still uses the limit
    ],
  }
  it('counts outstanding + every spend + unpaid EMIs, friends included', () => {
    const u = cardLimitUse(card)
    expect(u.spends).toBe(8000)
    expect(u.emiLeft).toBe(16000)
    expect(u.used).toBe(44000)
    expect(u.pct).toBe(44)
  })
  it('is 0% with no limit and never clamps rawPct', () => {
    expect(cardLimitUse({ outstanding: 5 }).pct).toBe(0)
    expect(cardLimitUse({ cardLimit: 1000, outstanding: 2000 }).rawPct).toBe(200)
    expect(cardLimitUse({ cardLimit: 1000, outstanding: 2000 }).pct).toBe(100)
  })
})

import { cardLimitUse as _clu } from '../cardLimit'
describe('cardLimitUse friends part', () => {
  it('reports the friends part that is already inside used', () => {
    const start = new Date(Date.now() - 86400000 * 35).toISOString().slice(0, 10)
    const u = _clu({ cardLimit: 100000, outstanding: 1000, spends: [{ amount: 500 }, { amount: 200, owedBy: 'A' }], emis: [{ emi: 1000, tenure: 12, startDate: start, owedBy: 'B' }] })
    expect(u.friends).toBeGreaterThanOrEqual(200 + 1000)
    expect(u.used).toBeGreaterThanOrEqual(u.friends + 1000 + 500)
  })
})
