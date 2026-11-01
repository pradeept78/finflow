import { describe, it, expect } from 'vitest'
import { dataHealth } from '../dataHealth'
// Mid-month anchor: setMonth() on the 29th-31st rolls into the next month (31 Oct - 8 months = "31 Feb" = 3 Mar).
const iso = (m: number) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10) }
describe('dataHealth', () => {
  it('flags records that cannot auto-calculate', () => {
    const h = dataHealth({
      loans: [{ id: 1, lender: 'A', amount: 100000, emi: 5000, tenure: 24 }, { id: 2, lender: 'B', amount: 120000, emi: 10000, tenure: 12, startDate: iso(9), principalPaid: 50000 }],
      savings: [{ id: 3, name: 'Chit', monthly: 1000 }],
      investments: [{ id: 4, name: 'SIP', monthly: 5000 }, { id: 5, name: 'FD', totalInvested: 1000 }],
      expenses: [{ id: 6, label: 'Gym', amount: 500, frequency: 'Monthly', endDate: iso(2) }],
    })
    const keys = h.map(x => x.key)
    expect(keys).toContain('loan-1')        // no start date
    // 2–3 EMIs left (depending on whether today is past the 15th) can repay at most ₹30,000 < ₹50,000.
    // It used to be ₹40,000 against 3–4 left, which stopped being flagged on the 1st–14th of a month.
    expect(keys).toContain('loanstmt-2')    // statement principal > EMIs left
    expect(keys).toContain('sav-3')
    expect(keys).toContain('sip-4')
    expect(keys).toContain('invval-5')
    expect(keys).toContain('end-Bill-6')
    expect(h[0].level).toBe('fix')
  })
  it('clean data → nothing', () => {
    expect(dataHealth({ loans: [{ id: 1, lender: 'A', amount: 1, emi: 1, tenure: 12, startDate: iso(2) }] })).toEqual([])
  })
})
