import { describe, it, expect } from 'vitest'
import { buildDueRows } from '../dueRows'

// getEff / isDueThisMonth read the real clock, so every date here is relative to it.
const now = new Date()
const iso = (y: number, m: number, d = 5) => { const x = new Date(y, m, d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const Y = now.getFullYear(), M = now.getMonth()

describe('buildDueRows', () => {
  it('drops an EMI with no instalments left, keeps one on its last', () => {
    const mk = (id: number, paid: number) => ({ id, lender: 'L' + id, emi: 1000, tenure: 12, startDate: iso(Y, M - 11), paidMonths: paid, dueDay: 5 })
    const { rows } = buildDueRows({ loans: [mk(1, 12), mk(2, 11), mk(3, 3)].map(l => ({ ...l, startDate: undefined })) }, now)
    expect(rows.map(r => r.key)).toEqual(['loan-2', 'loan-3'])
    expect(rows[0].isLast).toBe(true)
  })

  it("sends a friend's card EMI and card-EMI insurance to notCounted, not rows", () => {
    const card = { id: 1, banker: 'HDFC', billingDay: 10, outstanding: 0, emis: [{ id: 7, label: 'TV', emi: 500, tenure: 6, paidMonths: 0, startDate: iso(Y, M), owedBy: 'Raj' }] }
    const ins = [{ id: 1, name: 'Health', premium: 12000, frequency: 'Yearly', startDate: iso(Y - 1, M), isCardEmi: true }]
    const { rows, notCounted } = buildDueRows({ cards: [card], insurance: ins }, now)
    expect(rows).toHaveLength(0)
    expect(notCounted).toHaveLength(2)
  })

  it('lists a Single premium once, only in its own month, as one-time', () => {
    const ins = [{ id: 1, name: 'Family', premium: 20048, frequency: 'Single', startDate: iso(Y, M, 15) }]
    expect(buildDueRows({ insurance: ins }, now).rows.map(r => r.kind)).toEqual(['one-time'])
    expect(buildDueRows({ insurance: ins }, new Date(Y, M + 1, 6)).rows).toHaveLength(0)
  })

  it('treats a repaying chit as chit-repay and a building one as savings', () => {
    const sv = [
      { id: 1, name: 'A', monthly: 1000, tenure: 10, paidMonths: 2, startDate: iso(Y, M - 2), mode: 'withdrew' },
      { id: 2, name: 'B', monthly: 1000, tenure: 10, paidMonths: 2, startDate: iso(Y, M - 2) },
    ]
    expect(buildDueRows({ savings: sv }, now).rows.map(r => r.kind)).toEqual(['chit-repay', 'savings'])
  })

  it('skips switched-off bills, SIPs and I Owe entries', () => {
    const r = buildDueRows({
      expenses: [{ id: 1, label: 'Rent', amount: 100, frequency: 'Monthly', startDate: iso(Y, M - 2), active: false }],
      investments: [{ id: 1, name: 'SIP', monthly: 500, active: false }],
      personal: [{ id: 1, person: 'X', emi: 100, active: false }],
    }, now)
    expect(r.rows).toHaveLength(0)
  })
})
