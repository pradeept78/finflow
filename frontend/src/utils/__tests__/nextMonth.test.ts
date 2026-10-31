import { describe, it, expect } from 'vitest'
import { newCommitmentsNextMonth, startsAfterThisMonth } from '../nextMonth'
import { calcOutflow, outflowTierLine } from '../calcOutflow'
import { buildDueRows } from '../dueRows'

const now = new Date(2026, 9, 31) // 31 Oct 2026
const loans = [
  { id: 1, lender: 'HDFC', emi: 11122, tenure: 60, startDate: '2025-04-05' },          // running
  { id: 2, lender: 'Bajaj (new)', emi: 15000, tenure: 24, startDate: '2026-11-05' },    // first EMI 5 Nov
  { id: 3, lender: 'Car (Jan)', emi: 9000, tenure: 36, startDate: '2027-01-10' },       // starts later still
]
const cards = [{ id: 7, banker: 'Axis', billingDay: 6, dueDay: 25, outstanding: 0, spends: [],
  emis: [{ id: 70, label: 'Laptop', emi: 5000, tenure: 12, startDate: '2026-10-06' }] }]   // first due 25 Nov

describe('commitments that have not started yet', () => {
  it('a loan starting next month (or later) is not in this month\'s committed figure', () => {
    expect(startsAfterThisMonth(loans[1], now)).toBe(true)
    const o = calcOutflow(loans, cards, [], [], [], [], [], now)
    expect(o.loanEmi).toBe(11122)
    expect(o.ccEmi).toBe(0)
  })
  it('nor in this month\'s due list', () => {
    const { rows } = buildDueRows({ loans }, now)
    expect(rows.map(r => r.label)).toEqual(['HDFC'])
  })
  it('lists what starts next month: the new loan and the card EMI, not January\'s car loan', () => {
    const n = newCommitmentsNextMonth({ loans, cards }, now)
    expect(n.map(x => [x.kind, x.label, x.amount])).toEqual([['loan', 'Bajaj (new)', 15000], ['card-emi', 'Laptop (Axis)', 5000]])
  })
  it('the committed line says what\'s coming: committed ₹11,122 (+₹20,000 from Nov)', () => {
    const o = calcOutflow(loans, cards, [], [], [], [], [], now)
    expect(o.startingNext).toBe(20000)
    expect(outflowTierLine(o)).toBe('committed ₹11,122 (+₹20,000 from Nov) + card bill ₹0')
  })
})
