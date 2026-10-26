import { describe, it, expect } from 'vitest'
import { calcOutflow, outflowRows } from '../calcOutflow'
import { calcDebt, debtRows } from '../calcDebt'
import { ioweFacts } from '../iowe'
import { freqMonths, toMonthly, isDueInMonth, resolveDueDay, isPaidThisMonth } from '../format'

/**
 * These three modules decide every money figure in the app. Before they existed, eleven pages each
 * computed their own version and the same number came out different on different screens. A
 * regression in here now reaches every page at once, which is exactly why it needs tests.
 *
 * Every case below is a bug that actually shipped. The names say what went wrong, so a failure tells
 * you which defect came back rather than just which assertion broke.
 */

// ── Frequency ───────────────────────────────────────────────────────────────────────────────────

describe('frequency normalisation', () => {
  it('accepts the hyphenated spelling the forms actually write', () => {
    // Two maps only had the underscore variant, missed the lookup, fell through to a `?? 12`
    // default and divided a half-yearly premium by 12 instead of 6 — understating it by half.
    expect(freqMonths('Half-Yearly')).toBe(6)
    expect(freqMonths('Half_Yearly')).toBe(6)
    expect(toMonthly(60000, 'Half-Yearly')).toBe(10000)
  })

  it('falls back to monthly, never to yearly, on an unknown frequency', () => {
    // Guessing "yearly" silently divides a real commitment by twelve.
    expect(freqMonths('Fortnightly')).toBe(1)
    expect(freqMonths(undefined)).toBe(1)
    expect(toMonthly(5000, 'Fortnightly')).toBe(5000)
  })

  it('never returns NaN for junk input', () => {
    expect(toMonthly(undefined, 'Monthly')).toBe(0)
    expect(toMonthly(Number.NaN, 'Monthly')).toBe(0)
  })
})

// ── Renewal months ──────────────────────────────────────────────────────────────────────────────

describe('isDueInMonth', () => {
  it('puts a half-yearly premium in exactly two months a year', () => {
    // It used to be normalised and listed as due every month: a payment on a date nothing is owed,
    // for an amount never actually paid.
    const due = [...Array(12).keys()].filter(m => isDueInMonth('2024-02-20', 'Half-Yearly', 2026, m))
    expect(due).toEqual([1, 7])          // February and August
  })

  it('puts a yearly premium in one month a year', () => {
    const due = [...Array(12).keys()].filter(m => isDueInMonth('2022-07-01', 'Yearly', 2026, m))
    expect(due).toEqual([6])
  })

  it('treats a monthly premium as due every month', () => {
    expect([...Array(12).keys()].every(m => isDueInMonth('2022-07-08', 'Monthly', 2026, m))).toBe(true)
  })

  it('never marks a one-off as recurring', () => {
    // freqMonths('One-time') is 1, so a naive monthly shortcut reported it as due every month.
    expect([...Array(12).keys()].some(m => isDueInMonth('2025-01-01', 'One-time', 2026, m))).toBe(false)
  })

  it('does not report a premium as due before it started', () => {
    expect(isDueInMonth('2027-02-20', 'Half-Yearly', 2026, 1)).toBe(false)
  })
})

// ── Due day and paid state ──────────────────────────────────────────────────────────────────────

describe('resolveDueDay', () => {
  it('falls back to the start date when no due day is set', () => {
    // Loans, cards and I Owe passed `dueDay` straight through. With none set, the item never
    // auto-marked as paid and never appeared under a day heading at all.
    expect(resolveDueDay({ dueDay: 12 })).toBe(12)
    expect(resolveDueDay({ startDate: '2025-03-02' })).toBe(2)
    expect(resolveDueDay({})).toBeUndefined()
    expect(resolveDueDay({}, 1)).toBe(1)
  })

  it('prefers the due day over the billing day for a card', () => {
    // Calendar preferred billingDay and Lookup preferred dueDay, so the same card landed on two
    // different days depending on which page you were looking at.
    expect(resolveDueDay({ dueDay: 15, billingDay: 22 })).toBe(15)
    expect(resolveDueDay({ billingDay: 22 })).toBe(22)
  })
})

describe('isPaidThisMonth', () => {
  const today = new Date().getDate()
  const past = Math.max(1, today - 1)
  const future = Math.min(28, today + 1)

  it('treats a day already past as paid', () => {
    expect(isPaidThisMonth('k', past, [])).toBe(true)
  })

  it('treats an explicitly un-marked past day as NOT paid', () => {
    // Calendar checked `markedKeys.includes(key)` only, so a past-due item the user had
    // deliberately un-marked showed as PAID — the inverse of what they meant.
    expect(isPaidThisMonth('k', past, ['k'])).toBe(false)
  })

  it('treats a future day as unpaid unless explicitly ticked', () => {
    expect(isPaidThisMonth('k', future, [])).toBe(false)
    expect(isPaidThisMonth('k', future, ['k'])).toBe(true)
  })

  it('does not claim a dateless item is paid', () => {
    expect(isPaidThisMonth('k', undefined, [])).toBe(false)
  })
})

// ── I Owe classification ────────────────────────────────────────────────────────────────────────

describe('ioweFacts', () => {
  it('classifies a payback date as interest-only and keeps the principal intact', () => {
    const f = ioweFacts({ amount: 846000, emi: 8000, startDate: '2024-08-01', paybackDate: '2028-08-01' })
    expect(f.mode).toBe('interest-only')
    expect(f.principalLeft).toBe(846000)      // servicing interest buys no equity
    expect(f.monthly).toBe(8000)
    expect(Math.round(f.impliedRatePct!)).toBe(11)
  })

  it('classifies payments that cannot cover the principal as interest-only', () => {
    const f = ioweFacts({ amount: 846000, emi: 8000, tenure: 105, startDate: '2024-08-01' })
    expect(f.mode).toBe('interest-only')
    expect(f.cannotAmortise).toBe(true)
  })

  it('never drops a payment that has no schedule recorded', () => {
    // This is the regression that lost ₹8,000/mo from every total: with no tenure, getEff returns
    // pending 0, and the monthly was gated on pending > 0. The money leaves the account regardless.
    const f = ioweFacts({ amount: 846000, emi: 8000 })
    expect(f.monthly).toBe(8000)
    expect(f.principalLeft).toBe(846000)
  })

  it('still amortises a genuine instalment loan', () => {
    const f = ioweFacts({ amount: 96000, emi: 8000, tenure: 12, startDate: '2024-01-01' })
    expect(f.mode).toBe('amortising')
    expect(f.monthly).toBe(0)                 // finished, so nothing more leaves
    expect(f.principalLeft).toBe(0)
  })

  it('treats a lump sum with no monthly payment as lump', () => {
    const f = ioweFacts({ amount: 200000, paybackDate: '2027-01-01' })
    expect(f.mode).toBe('lump')
    expect(f.monthly).toBe(0)
    expect(f.principalLeft).toBe(200000)
  })
})

// ── Outflow ─────────────────────────────────────────────────────────────────────────────────────

describe('calcOutflow', () => {
  const cards = [{ outstanding: 79292, emis: [{ emi: 5000, tenure: 40, startDate: '2025-06-01' }], spends: [{ amount: 3000 }] }]
  const ins = [
    { name: 'LIC',  premium: 9000,  frequency: 'Monthly',     startDate: '2022-07-08', active: true },
    { name: 'Star', premium: 30144, frequency: 'Half-Yearly', startDate: '2024-02-20', active: true },
  ]

  it('keeps the card balance out of the recurring figure', () => {
    // `locked` must be what repeats; the statement balance and unbilled cycle are a one-month event.
    const o = calcOutflow([], cards, [], [], [], [], [])
    expect(o.card).toBe(79292 + 3000)
    expect(o.locked).toBe(5000)               // the CC EMI only
    expect(o.total).toBe(o.locked + o.card)
  })

  it('counts only monthly premiums as recurring cash, and the rest as a set-aside', () => {
    // Folding the monthly-equivalent of a half-yearly premium into `locked` made it claim
    // ₹14,024/mo when only ₹9,000 actually leaves the account.
    const o = calcOutflow([], [], [], [], [], [], ins)
    expect(o.insuranceEmi).toBe(9000)
    expect(Math.round(o.insuranceProvision)).toBe(5024)
    expect(o.locked).toBe(9000)               // the set-aside is NOT locked cash
  })

  it('itemised rows always sum to the total', () => {
    // A total computed one way above a breakdown computed another is how pages disagreed while both
    // looked plausible.
    const o = calcOutflow([{ emi: 29833, tenure: 60, startDate: '2023-01-05', amount: 1500000 }], cards, [], [], [], [{ amount: 50000, active: true }], ins)
    const sum = outflowRows(o).reduce((s, r) => s + r.val, 0)
    expect(Math.round(sum)).toBe(Math.round(o.total))
  })

  it('separates a chit being repaid from one still building', () => {
    const o = calcOutflow([], [], [], [
      { monthly: 22500, tenure: 36, startDate: '2026-02-01', mode: 'saving' },
      { monthly: 25000, tenure: 36, startDate: '2026-02-01', mode: 'withdrew', prizeTaken: true },
    ], [], [], [])
    expect(o.savings).toBe(22500)
    expect(o.chitRepay).toBe(25000)
  })

  it('survives empty and malformed input without NaN', () => {
    const o = calcOutflow()
    expect(o.total).toBe(0)
    const junk = calcOutflow([{ emi: null }] as any, [{ outstanding: 'x' }] as any, [], [{ monthly: undefined }] as any, [], [], [])
    expect(Number.isFinite(junk.total)).toBe(true)
  })
})

// ── Debt ────────────────────────────────────────────────────────────────────────────────────────

describe('calcDebt', () => {
  const loans = [{ amount: 1500000, emi: 29833, tenure: 60, startDate: '2023-01-05', interestRate: 9.5 }]

  it('reports principal and interest separately and adds them into the total', () => {
    // Hub summed principal + interest while Dashboard summed principal alone, so the same data
    // produced ₹27,16,233 on one page and ₹24,84,938 on another.
    const d = calcDebt(loans, [], [], [])
    expect(d.loanTotal).toBe(d.loanPrincipal + d.interestLeft)
    expect(d.total - d.totalPrincipal).toBeCloseTo(d.interestLeft, 6)
  })

  it('breakdown rows sum to the total', () => {
    const d = calcDebt(loans, [{ outstanding: 79292, emis: [], spends: [{ amount: 3000 }] }],
      [{ amount: 846000, emi: 8000, startDate: '2024-08-01', paybackDate: '2028-08-01' }],
      [{ monthly: 25000, tenure: 36, startDate: '2026-02-01', mode: 'withdrew', prizeTaken: true }])
    const sum = debtRows(d).reduce((s, r) => s + r.val, 0)
    expect(Math.round(sum)).toBe(Math.round(d.total))
  })

  it('does not reduce an interest-only principal', () => {
    const d = calcDebt([], [], [{ amount: 846000, emi: 8000, startDate: '2020-01-01', paybackDate: '2030-01-01' }], [])
    expect(d.iOwePrincipal).toBe(846000)      // years of payments, principal untouched
  })

  it('survives empty input', () => {
    const d = calcDebt()
    expect(d.total).toBe(0)
    expect(Number.isFinite(d.totalPrincipal)).toBe(true)
  })
})
