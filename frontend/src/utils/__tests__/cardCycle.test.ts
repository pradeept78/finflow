import { describe, it, expect } from 'vitest'
import { cardCycle, statementAfter, dueFor, emiStartsLater } from '../cardCycle'
import { calcOutflow } from '../calcOutflow'

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// HDFC: statement on the 3rd covers the 3rd of last month to the 2nd of this month; payment due on the 20th.
const hdfc = (extra: any = {}) => ({ id: 1, banker: 'HDFC', cardLimit: 300000, billingDay: 3, dueDay: 20, outstanding: 0, emis: [], spends: [], ...extra })

describe('which statement and due date a spend belongs to', () => {
  it('3 Sep – 2 Oct is on the 3 Oct statement, due 20 Oct', () => {
    expect(iso(statementAfter(D(2026, 9, 3), 3))).toBe('2026-10-03')
    expect(iso(statementAfter(D(2026, 10, 2), 3))).toBe('2026-10-03')
    expect(iso(dueFor(D(2026, 10, 3), 20))).toBe('2026-10-20')
  })
  it('a spend on the statement day itself starts the next cycle', () => {
    expect(iso(statementAfter(D(2026, 10, 3), 3))).toBe('2026-11-03')
  })
  it('due day before the statement day means the bill is due next month', () => {
    // statement on the 25th, due on the 12th
    expect(iso(dueFor(D(2026, 10, 25), 12))).toBe('2026-11-12')
  })
  it('a statement day of 31 lands on the last day of short months', () => {
    expect(iso(statementAfter(D(2026, 2, 10), 31))).toBe('2026-02-28')
  })
})

describe('cardCycle: logged spends, no statement amount typed', () => {
  const card = hdfc({ spends: [
    { id: 1, purpose: 'Groceries', amount: 6000, spendDate: '2026-09-15' },   // 3 Oct statement → due 20 Oct
    { id: 2, purpose: 'Fuel', amount: 3000, spendDate: '2026-10-10' },        // 3 Nov statement → due 20 Nov
    { id: 3, purpose: 'Dinner', amount: 2000, spendDate: '2026-10-01', owedBy: 'Ravi' }, // a friend's: never counted
  ] })

  it('on 15 Oct: September spends make the bill due 20 Oct; October spends go to the next bill', () => {
    const c = cardCycle(card, D(2026, 10, 15))
    expect(iso(c.lastStatement!)).toBe('2026-10-03')
    expect(c.billThisMonth).toBe(6000)
    expect(iso(c.billDue!)).toBe('2026-10-20')
    expect(c.nextBill).toBe(3000)
    expect(iso(c.nextDue!)).toBe('2026-11-20')
  })

  it('on 1 Oct (before the statement): those spends are the ongoing cycle but still due this month, on the 20th', () => {
    const c = cardCycle(card, D(2026, 10, 1))
    expect(c.billThisMonth).toBe(6000)
    expect(iso(c.billDue!)).toBe('2026-10-20')
  })
})

describe('cardCycle: statement amount typed into Outstanding', () => {
  const card = hdfc({ outstanding: 25000, spends: [
    { id: 1, amount: 6000, spendDate: '2026-09-15' },  // already inside the 3 Oct statement → not added again
    { id: 2, amount: 3000, spendDate: '2026-10-10' },  // next cycle
  ] })
  it('the typed amount is the bill; spends from that statement are not counted twice', () => {
    const c = cardCycle(card, D(2026, 10, 15))
    expect(c.billThisMonth).toBe(25000)
    expect(c.nextBill).toBe(3000)
  })
  it('statement after the due day (25th / 12th): on 28 Oct the typed balance is due 12 Nov, not this month', () => {
    const c = cardCycle({ ...card, billingDay: 25, dueDay: 12 }, D(2026, 10, 28))
    expect(c.billThisMonth).toBe(0)
    expect(c.nextBill).toBeGreaterThanOrEqual(25000)
    expect(iso(c.nextDue!)).toBe('2026-11-12')
  })
})

describe('no statement day set: old behaviour', () => {
  it('everything counts this month', () => {
    const c = cardCycle({ id: 9, outstanding: 1000, dueDay: 10, spends: [{ amount: 500, spendDate: '2026-10-20' }] }, D(2026, 10, 15))
    expect(c.billThisMonth).toBe(1500)
    expect(c.nextBill).toBe(0)
  })
})

describe('calcOutflow uses the cycle', () => {
  it("this month's card bill = only what falls due this month", () => {
    const card = hdfc({ outstanding: 0, spends: [{ amount: 6000, spendDate: '2026-09-15' }, { amount: 3000, spendDate: '2026-10-10' }] })
    const o = calcOutflow([], [card], [], [], [], [], [], D(2026, 10, 15))
    expect(o.card).toBe(6000)
    expect(o.cardNext).toBe(3000)
  })
})

describe('card EMIs follow the same cycle', () => {
  // On HDFC (statement 3rd, due 20th), on 15 Oct:
  const card = hdfc({ emis: [
    { id: 1, label: 'Phone', emi: 7000, tenure: 12, startDate: '2026-09-10' },  // 3 Oct statement → first due 20 Oct
    { id: 2, label: 'TV', emi: 4000, tenure: 12, startDate: '2026-10-05' },     // 3 Nov statement → first due 20 Nov
  ] })
  it('an EMI started 10 Sep is due this month; one started 5 Oct starts on next month\'s bill', () => {
    const now = D(2026, 10, 15)
    expect(emiStartsLater(card, card.emis[0], now)).toBe(false)
    expect(emiStartsLater(card, card.emis[1], now)).toBe(true)
    const o = calcOutflow([], [card], [], [], [], [], [], now)
    expect(o.ccEmi).toBe(7000)
    expect(o.cardNext).toBe(4000)
  })
})
