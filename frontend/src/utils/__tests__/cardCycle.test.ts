import { describe, it, expect } from 'vitest'
import { cardCycle, statementAfter, dueFor, emiStartsLater, billingPeriods, periodLabel, amountDueOn } from '../cardCycle'
import { calcOutflow } from '../calcOutflow'
import { buildDueRows } from '../dueRows'

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

describe('billing periods for display', () => {
  // Statement on the 18th, due on the 4th (next month) — on 31 Oct.
  const card = { billingDay: 18, dueDay: 4 }
  it('last bill: 18 Sep – 17 Oct, statement 18 Oct, due 4 Nov; current cycle: 18 Oct – 17 Nov, statement 18 Nov, due 4 Dec', () => {
    const p = billingPeriods(card, D(2026, 10, 31))!
    expect(iso(p.last.from)).toBe('2026-09-18')
    expect(iso(p.last.to)).toBe('2026-10-17')
    expect(iso(p.last.statement)).toBe('2026-10-18')
    expect(iso(p.last.due)).toBe('2026-11-04')
    expect(iso(p.current.from)).toBe('2026-10-18')
    expect(iso(p.current.to)).toBe('2026-11-17')
    expect(iso(p.current.statement)).toBe('2026-11-18')
    expect(iso(p.current.due)).toBe('2026-12-04')
  })
  it('on the statement day itself, today starts the new cycle', () => {
    const p = billingPeriods(card, D(2026, 10, 18))!
    expect(iso(p.current.from)).toBe('2026-10-18')
    expect(iso(p.last.statement)).toBe('2026-10-18')
  })
  it('HDFC 3rd / 20th: 3 Sep – 2 Oct is due 20 Oct', () => {
    const p = billingPeriods({ billingDay: 3, dueDay: 20 }, D(2026, 10, 15))!
    expect(`${iso(p.last.from)} ${iso(p.last.to)} ${iso(p.last.due)}`).toBe('2026-09-03 2026-10-02 2026-10-20')
  })
  it('no statement day: nothing to show', () => {
    expect(billingPeriods({ dueDay: 4 }, D(2026, 10, 31))).toBeNull()
  })
  it('short label', () => {
    expect(periodLabel(billingPeriods(card, D(2026, 10, 31))!.current)).toBe('18 Oct – 17 Nov · due 4 Dec')
  })
})

describe('amount per bill', () => {
  it('statement 18th / due 4th on 31 Oct: typed ₹42,000 is due 4 Nov; a 25 Oct spend is on the 4 Dec bill', () => {
    const c = cardCycle({ billingDay: 18, dueDay: 4, outstanding: 42000, spends: [{ amount: 18000, spendDate: '2026-10-25' }], emis: [] }, D(2026, 10, 31))
    expect(c.dues.map(d => `${iso(d.due)} ${d.amount}`)).toEqual(['2026-11-04 42000', '2026-12-04 18000'])
    expect(amountDueOn(c, D(2026, 12, 4))).toBe(18000)
    expect(amountDueOn(c, D(2026, 11, 4))).toBe(42000)
  })
})

describe('card bills due soon (next month, within 30 days)', () => {
  // 31 Oct: SBI statement 12th / due 2nd — the 12 Oct statement (₹87,000 typed) is due 2 Nov.
  const sbi = { id: 13, banker: 'SBI SimplyClick', billingDay: 12, dueDay: 2, outstanding: 87000, emis: [],
    spends: [{ id: 1, amount: 3000, spendDate: '2026-10-20' }] } // 12 Nov statement → due 2 Dec: too far
  it('the due list keeps this month clean and lists the 2 Nov bill under upcoming, tickable for November', () => {
    const { rows, upcoming, notCounted } = buildDueRows({ cards: [sbi] }, D(2026, 10, 31))
    expect(rows.filter(r => r.parent?.id === 13)).toEqual([])
    expect(upcoming.map(u => [u.key, u.amount, iso(u.dueDate!), u.monthYear])).toEqual([['card-out-13', 87000, '2026-11-02', '2026-11']])
    // only the 2 Dec spend is left as a next-bill note; the ₹87,000 due 2 Nov is a real row now
    expect(notCounted.find(n => n.key === 'card-next-13')?.amount).toBe(3000)
  })
  it('a bill more than 30 days out is not "due soon" but stays visible as a next bill', () => {
    const { upcoming, notCounted } = buildDueRows({ cards: [{ ...sbi, outstanding: 0 }] }, D(2026, 10, 31))
    expect(upcoming).toEqual([])
    expect(notCounted.find(n => n.key === 'card-next-13')?.amount).toBe(3000)
  })
})
