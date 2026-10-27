import { describe, it, expect } from 'vitest'
import { calcOutflow } from '../calcOutflow'
import { buildDueRows } from '../dueRows'

// Fixed "today" so renewal months are deterministic: 15 Oct 2026.
const now = new Date(2026, 9, 15)

const expenses = [
  { id: 1, label: 'Rent', amount: 20000, frequency: 'Monthly', active: true },
  { id: 2, label: 'School fee', amount: 45000, frequency: 'Quarterly', startDate: '2026-04-10', active: true }, // Apr, Jul, Oct → due now
  { id: 3, label: 'Club', amount: 12000, frequency: 'Yearly', startDate: '2026-03-01', active: true },           // March → not due
  { id: 4, label: 'Laptop', amount: 60000, frequency: 'One-time', startDate: '2026-10-05', active: true },      // this month
  { id: 5, label: 'Trip', amount: 30000, frequency: 'One-time', startDate: '2026-12-05', active: true },        // later
]
const insurance = [
  { id: 1, name: 'Health', premium: 2000, frequency: 'Monthly', active: true },
  { id: 2, name: 'LIC', premium: 24000, frequency: 'Yearly', startDate: '2019-10-15', active: true },   // October → due now
  { id: 3, name: 'Term', premium: 9000, frequency: 'Half-Yearly', startDate: '2022-08-01', active: true }, // Feb/Aug → not due
  { id: 4, name: 'Card-paid', premium: 12000, frequency: 'Yearly', startDate: '2020-10-01', active: true, isCardEmi: true }, // already a card EMI
]
const personal = [
  { id: 1, person: 'Suresh', amount: 50000, paybackDate: '2027-01-31' }, // lump sum, not this month
  { id: 2, person: 'Mohan', amount: 15000, paybackDate: '2026-10-28' },  // lump sum, this month
]

describe('calcOutflow: non-monthly bills due this month', () => {
  const o = calcOutflow([], [{ id: 1, outstanding: 10000, emis: [], spends: [] }], personal, [], [], expenses, insurance, now)

  it('adds full amounts of renewals, one-time payments and lump sums falling due this month', () => {
    // 45,000 school fee + 60,000 laptop + 24,000 LIC + 15,000 Mohan
    expect(o.dueNow).toBe(144000)
  })

  it('total = committed + card bill + due-now, so every page shows one figure', () => {
    expect(o.locked).toBe(20000 + 2000)
    expect(o.card).toBe(10000)
    expect(o.total).toBe(o.locked + o.card + o.dueNow)
  })

  it('set-aside covers every non-monthly bill and premium, not just insurance', () => {
    // 45,000/3 + 12,000/12 + 24,000/12 + 9,000/6
    expect(o.setAside).toBe(15000 + 1000 + 2000 + 1500)
    expect(o.setAside).toBe(o.expenseProvision + o.insuranceProvision)
  })

  it('matches the shared due list item for item', () => {
    const { rows } = buildDueRows({ cards: [{ id: 1, outstanding: 10000, emis: [], spends: [] }], personal, expenses, insurance }, now)
    const nonMonthly = rows.filter(r => r.kind === 'one-time' || r.kind === 'iowe-lump' ||
      (r.kind === 'bill' && r.ref?.frequency !== 'Monthly') || (r.kind === 'insurance' && r.ref?.frequency !== 'Monthly'))
    expect(nonMonthly.reduce((s, r) => s + r.amount, 0)).toBe(o.dueNow)
  })

  it('nothing due → dueNow is 0 and total is unchanged from before', () => {
    const quiet = calcOutflow([], [], [], [], [], [expenses[0]], [insurance[0]], now)
    expect(quiet.dueNow).toBe(0)
    expect(quiet.total).toBe(quiet.locked + quiet.card)
  })
})
