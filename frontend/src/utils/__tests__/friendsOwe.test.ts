import { describe, it, expect } from 'vitest'
import { friendsOwe } from '../friendsOwe'
describe('friendsOwe', () => {
  it('sums unsettled friend spends and unpaid EMI instalments, per person', () => {
    const r = friendsOwe([{ spends: [{ amount: 1000, owedBy: 'A', spendDate: '2026-09-01' }, { amount: 500, owedBy: 'A', owedSettled: true }, { amount: 700 }], emis: [{ emi: 1000, tenure: 6, pending: 4, paid: 2, owedBy: 'B' }] }])
    expect(r.total).toBe(5000)
    expect(r.items).toBe(2)
    expect(r.perMonth).toBe(1000)
    expect(r.people[0]).toMatchObject({ name: 'B', amount: 4000, emi: 4000, spends: 0, perMonth: 1000 })
    expect(r.people[1]).toMatchObject({ name: 'A', amount: 1000, spends: 1000, emi: 0 })
    expect(r.oldest).toBe('2026-09-01')
  })
  it('nothing owed → zero', () => { expect(friendsOwe([]).total).toBe(0) })
})
