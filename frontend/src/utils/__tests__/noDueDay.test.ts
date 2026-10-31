import { describe, it, expect } from 'vitest'
import { buildDueRows } from '../dueRows'
import { buildMasterRows } from '../buildMasterRows'

const now = new Date(2026, 9, 20)
const data = {
  expenses: [
    { id: 1, label: 'Groceries', amount: 15000, frequency: 'Monthly', active: true },             // no due day, no start date
    { id: 2, label: 'Rent', amount: 28000, frequency: 'Monthly', dueDay: 3, active: true },       // explicit day
  ],
  insurance: [{ id: 1, name: 'Health', premium: 2100, frequency: 'Monthly', active: true }],
  savings: [{ id: 1, name: 'RD', monthly: 5000, tenure: 60, paidMonths: 2, active: true }],
  investments: [
    { id: 1, name: 'Undated SIP', monthly: 10000, active: true },
    { id: 2, name: 'Dated SIP', monthly: 5000, startDate: '2024-06-07', active: true },          // start date gives the 7th
  ],
}

describe('items with no due day', () => {
  const { rows } = buildDueRows(data, now)
  const day = (key: string) => rows.find(r => r.key === key)?.dueDay

  it('are not given a made-up day (they used to land on day 1, or day 10 for savings)', () => {
    expect(day('exp-1')).toBeUndefined()
    expect(day('ins-1')).toBeUndefined()
    expect(day('sav-1')).toBeUndefined()
    expect(day('inv-1')).toBeUndefined()
  })

  it('keep a real day when one is set or can be read from the start date', () => {
    expect(day('exp-2')).toBe(3)
    expect(day('inv-2')).toBe(7)
  })

  it('Commitments rows agree: no day, not day 1', () => {
    const m = buildMasterRows([], [], [], data.savings, data.investments, data.expenses, data.insurance)
    expect(m.find((r: any) => r.key === 'exp-1')?.due ?? null).toBeNull()
    expect(m.find((r: any) => r.key === 'insurance-1')?.due ?? null).toBeNull()
  })
})
