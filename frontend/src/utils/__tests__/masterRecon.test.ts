import { it, expect } from 'vitest'
import { buildMasterRows, isFriendOwed } from '../buildMasterRows'
import { calcOutflow } from '../calcOutflow'
const now = new Date(); const Y = now.getFullYear(), M = now.getMonth()
const iso = (y: number, m: number, d = 5) => { const x = new Date(y, m, d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const data: any = {
  loans: [{ id: 1, lender: 'SBI', loanType: 'Car', amount: 500000, emi: 10000, tenure: 60, startDate: iso(Y, M - 10) }],
  cards: [{ id: 1, banker: 'H', billingDay: 12, outstanding: 5000, emis: [{ id: 11, label: 'TV', emi: 500, principal: 5000, tenure: 12, startDate: iso(Y, M - 2) }, { id: 12, label: 'F', emi: 700, principal: 7000, tenure: 12, startDate: iso(Y, M - 2), owedBy: 'Raj' }], spends: [] }],
  personal: [{ id: 1, person: 'Amma', amount: 50000, emi: 2000, tenure: 24, interestRate: 12, startDate: iso(Y, M - 1) }, { id: 2, person: 'IntOnly', amount: 100000, emi: 1500, interestRate: 18 }, { id: 3, person: 'NoEnd', amount: 9000, emi: 300 }],
  savings: [{ id: 1, name: 'Chit A', monthly: 5000, tenure: 20, startDate: iso(Y, M - 3), savingType: 'Chit', mode: 'withdrew', actualReceived: 80000, chitValue: 100000 }],
  investments: [], expenses: [], insurance: [],
}
// Mirrors MasterTablePage's reconciliation: bill = own EMIs with an end date; the rest (interest-only, no end date) is listed
// separately. Together they must equal what the Hub shows as Monthly EMIs (loans + card EMIs + I Owe + chit repayment).
it("Master's 'Hub all-in EMIs' ledger (bill + what can't close) equals the Hub's Monthly EMIs", () => {
  const rows = buildMasterRows(data.loans, data.cards, data.personal, data.savings, data.investments, data.expenses, data.insurance)
  const o = calcOutflow(data.loans, data.cards, data.personal, data.savings, data.investments, data.expenses, data.insurance)
  const EMI_TYPES = new Set(['Loan', 'Gold Loan', 'CC EMI', 'I Owe', 'I Owe (Interest-only)', 'Chit Repay'])
  const own = rows.filter(r => EMI_TYPES.has(r.type) && (r.emi ?? 0) > 0 && !isFriendOwed(r))
  const all = own.filter(r => r.emi != null && r.endDate && r.totalPending > 0)
  const outside = own.filter(r => !all.some(a => a.key === r.key))
  const master = all.reduce((s, r) => s + (r.emi ?? 0), 0) + outside.reduce((s, r) => s + (r.emi ?? 0), 0)
  expect(master).toBe(o.loanEmi + o.ccEmi + o.iOweEmi + o.chitRepay)
})
