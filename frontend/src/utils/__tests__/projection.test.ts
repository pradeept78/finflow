import { describe, it, expect } from 'vitest'
import { advanceAll } from '../projection'
import { calcDebt } from '../calcDebt'
import { calcOutflow } from '../calcOutflow'

const iso = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10) }
const loan = { id: 1, lender: 'X', amount: 120000, emi: 10000, tenure: 12, startDate: iso(4), dueDay: 5 }
const card = { id: 1, banker: 'K', cardLimit: 100000, outstanding: 5000, spends: [{ amount: 1000 }], emis: [{ id: 1, label: 'phone', emi: 2000, tenure: 6, startDate: iso(1) }] }
const data = { loans: [loan], cards: [card], personal: [], savings: [], investments: [] }

describe('projection', () => {
  it('debt falls as instalments are paid and card balances clear', () => {
    const now = calcDebt(data.loans, data.cards, [], [])
    const p3 = calcDebt(...Object.values(advanceAll(data, 3)).slice(0, 4) as [any[], any[], any[], any[]])
    expect(p3.total).toBeLessThan(now.total)
    expect(p3.ccOutstanding).toBe(0)
    expect(p3.ccSpends).toBe(0)
  })
  it('a loan that ends inside the horizon is gone, and its EMI with it', () => {
    const p = advanceAll(data, 12)
    const o = calcOutflow(p.loans, p.cards, [], [], [], [], [])
    expect(o.loanEmi).toBe(0)
    expect(calcDebt(p.loans, p.cards, [], []).loanTotal).toBe(0)
  })
  it('horizon 0 is the same data', () => {
    expect(advanceAll(data, 0)).toBe(data)
  })
})

import { monthsUntil } from '../projection'
describe('end dates inside the horizon', () => {
  const inMonths = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }
  it('monthsUntil counts months to an end date, 0 when none or past', () => {
    expect(monthsUntil(undefined)).toBe(0)
    expect(monthsUntil(inMonths(-2))).toBe(0)
    expect(monthsUntil(inMonths(4))).toBeGreaterThanOrEqual(4)
  })
  it('a bill or premium ending by then is switched off, a later one is not', () => {
    const p = advanceAll({ loans: [], cards: [], personal: [], savings: [], investments: [], expenses: [{ amount: 500, endDate: inMonths(2) }, { amount: 700, endDate: inMonths(20) }], insurance: [{ premium: 900, endDate: inMonths(3) }] }, 6)
    expect(p.expenses![0].active).toBe(false)
    expect(p.expenses![1].active).not.toBe(false)
    expect(p.insurance![0].active).toBe(false)
  })
})

import { advance } from '../projection'
describe('advance', () => {
  it('moves a month-end start date back without overflowing into the next month', () => {
    const a = advance({ startDate: '2026-08-31', tenure: 24 }, 6)
    expect(a.startDate).toBe('2026-02-28')
  })
  it('counts down an item that has pending months but no tenure', () => {
    const a = advance({ paid: 2, pending: 10 }, 4)
    expect(a.pending).toBe(6)
  })
})
