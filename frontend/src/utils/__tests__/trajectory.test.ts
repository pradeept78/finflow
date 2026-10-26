import { describe, it, expect } from 'vitest'
import { debtTrajectory, debtFreeMonth } from '../trajectory'
const iso = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m, 5); return d.toISOString().slice(0, 10) }
describe('debtTrajectory', () => {
  const raw = { loans: [{ id: 1, lender: 'A', amount: 60000, emi: 5500, tenure: 12, startDate: iso(6) }], cards: [], personal: [], savings: [], investments: [] }
  it('debt falls month by month and reaches zero', () => {
    const t = debtTrajectory(raw as any, 12)
    expect(t).toHaveLength(13)
    expect(t[0].debt).toBeGreaterThan(t[3].debt)
    expect(t[12].debt).toBe(0)
    const m = debtFreeMonth(t)
    expect(m).not.toBeNull(); expect(m!).toBeLessThanOrEqual(7)
  })
})
