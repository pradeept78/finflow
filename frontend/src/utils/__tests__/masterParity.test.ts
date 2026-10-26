import { describe, it, expect } from 'vitest'
import { buildMasterRows, isFriendOwed } from '../buildMasterRows'
import { buildDueRows, masterKeyOf } from '../dueRows'

// getEff / isDueThisMonth read the real clock, so every date is relative to it.
const now = new Date()
const Y = now.getFullYear(), M = now.getMonth()
const iso = (y: number, m: number, d = 5) => { const x = new Date(y, m, d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }

const data = {
  loans: [
    { id: 1, lender: 'SBI', loanType: 'Car', amount: 500000, emi: 10000, tenure: 60, startDate: iso(Y, M - 10), dueDay: 10 },
    { id: 2, lender: 'Done', amount: 1000, emi: 100, tenure: 6, startDate: iso(Y - 1, M - 6), dueDay: 3 },
  ],
  cards: [{
    id: 1, banker: 'HDFC', billingDay: 12, outstanding: 5000, cardLimit: 100000,
    emis: [
      { id: 11, label: 'TV', emi: 500, principal: 5000, tenure: 12, startDate: iso(Y, M - 2) },
      { id: 12, label: 'Friend phone', emi: 700, principal: 7000, tenure: 12, startDate: iso(Y, M - 2), owedBy: 'Raj' },
    ],
    spends: [{ amount: 300, purpose: 'x', spendDate: iso(Y, M, 1) }, { amount: 900, purpose: 'y', spendDate: iso(Y, M, 2), owedBy: 'Raj' }],
  }],
  personal: [
    { id: 1, person: 'Amma', amount: 50000, emi: 2000, interestRate: 12, startDate: iso(Y, M - 1) },
    { id: 2, person: 'Later', amount: 9000, paybackDate: iso(Y, M + 3) },
    { id: 3, person: 'Now', amount: 4000, paybackDate: iso(Y, M, 20) },
  ],
  savings: [
    { id: 1, name: 'Chit A', monthly: 5000, tenure: 20, startDate: iso(Y, M - 3), savingType: 'Chit', mode: 'withdrew', actualReceived: 80000, chitValue: 100000 },
    { id: 2, name: 'Gold', monthly: 1000, tenure: 12, startDate: iso(Y, M - 1), savingType: 'Gold' },
  ],
  investments: [{ id: 1, name: 'SIP1', monthly: 2000, investType: 'SIP' }, { id: 2, name: 'Off', monthly: 500, active: false }],
  expenses: [
    { id: 1, label: 'Rent', amount: 20000, frequency: 'Monthly', startDate: iso(Y, M - 4) },
    { id: 2, label: 'Tax', amount: 12000, frequency: 'Yearly', startDate: iso(Y - 1, M + 4) },
    { id: 3, label: 'Trip', amount: 8000, frequency: 'One-time', startDate: iso(Y, M, 9) },
    { id: 4, label: 'Old trip', amount: 8000, frequency: 'One-time', startDate: iso(Y, M - 2, 9) },
  ],
  insurance: [
    { id: 1, name: 'Term', premium: 9000, frequency: 'Monthly', startDate: iso(Y, M - 5) },
    { id: 2, name: 'Health', premium: 24000, frequency: 'Yearly', startDate: iso(Y - 1, M + 2) },
    { id: 3, name: 'Family', premium: 20048, frequency: 'Single', startDate: iso(Y, M, 15) },
    { id: 4, name: 'CardEMI policy', premium: 12000, frequency: 'Yearly', startDate: iso(Y - 1, M), isCardEmi: true },
  ],
}

describe('Master vs the shared due-list', () => {
  const rows = buildMasterRows(data.loans, data.cards, data.personal, data.savings, data.investments, data.expenses, data.insurance)
  const due = buildDueRows(data)
  const own = rows.filter(r => !isFriendOwed(r) && !r.isCardEmi)

  it("Master's charging count equals the shared list's count", () => {
    expect(own.filter(r => r.charging).length).toBe(due.rows.length)
  })

  it('every payment in the shared list has a Master row (Master cannot be missing one)', () => {
    const keys = new Set(rows.map(r => r.key))
    const missing = due.rows.map(r => masterKeyOf(r.key)).filter(k => !keys.has(k))
    expect(missing).toEqual([])
  })

  it('friend-owed and card-EMI rows are not charging, and match the shared "not counted" list', () => {
    expect(rows.filter(r => isFriendOwed(r) || r.isCardEmi).some(r => r.charging)).toBe(false)
    const masterUncounted = rows.filter(r => (isFriendOwed(r) && r.type === 'CC EMI') || r.isCardEmi).map(r => r.key).sort()
    expect(masterUncounted).toEqual(due.notCounted.map(x => masterKeyOf(x.key)).sort())
  })
})
