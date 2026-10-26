import { getEff } from './format'
import { impliedAnnualRate } from './emiFacts'
import { investValue, investInvested } from './investValue'
import { isChitRepaying } from './kinds'

/**
 * "What will this look like in N months?" — the data, moved forward in time.
 *
 * Instead of a second set of calculators, every EMI-style record is shifted N instalments ahead (as if N more
 * months had been paid) and then the SAME shared calculators (calcDebt, calcOutflow, …) run on it, so the future
 * view can never disagree with today's view on the rules — only on the date.
 *
 * Assumptions (shown to the user): every EMI is paid on time; card statement balances are cleared and nothing new is
 * spent on cards; savings and SIPs keep going in; no new borrowing. Income, bills and insurance stay as they are, and
 * returns on investments are not guessed.
 */
export const HORIZONS = [0, 3, 6, 12] as const
export type Horizon = typeof HORIZONS[number]

// Calendar-safe: 31 Aug minus 6 months is 29 Feb (not 3 Mar), and no time-zone shift — a few days of drift here can flip
// whether this month's instalment has "happened yet" and move an EMI count by one.
const monthsBack = (iso: string, k: number) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  const lastDay = new Date(Date.UTC(y, m - 1 - k + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 - k, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

/** An EMI-style record N instalments further along. Records with no tenure (open-ended) are left alone. */
export function advance<T extends Record<string, any>>(x: T, k: number): T {
  if (!k || !x) return x
  if (!x.tenure && !(Number(x.pending) > 0)) return x   // open-ended and nothing counted down: leave alone
  if (x.startDate && x.tenure) return { ...x, startDate: monthsBack(x.startDate, k) }
  const e = getEff(x)
  return { ...x, paid: e.paid + k, paidMonths: e.paid + k, pending: Math.max(0, e.pending - k) }
}

/** A loan N months on, including the bank-statement principal (if one is on record) amortised forward at its real rate. */
export function advanceLoan(l: any, k: number) {
  const a = advance(l, k)
  const stmt = Number(l?.principalPaid ?? 0)   // field stores PRINCIPAL REMAINING from the bank statement
  if (!k || !(stmt > 0)) return a
  const emi = Number(l.emi ?? 0), tenure = Number(l.tenure ?? 0)
  const left = getEff(l).pending
  const now = getEff(a).pending
  if (now <= 0) return { ...a, principalPaid: 0 }
  const r = impliedAnnualRate(Number(l.amount ?? 0), emi, tenure) / 1200
  let bal = stmt
  if (r > 0 && emi > 0) { for (let i = 0; i < Math.min(k, left); i++) bal = Math.max(0, bal * (1 + r) - emi) }
  else if (left > 0) bal = stmt * (now / left)
  return { ...a, principalPaid: Math.round(bal) }
}

export interface RawData { loans: any[]; cards: any[]; personal: any[]; savings: any[]; investments: any[]; expenses?: any[]; insurance?: any[] }

/** Months from today until an end date (0 when it has none or has already passed). */
export const monthsUntil = (iso?: string): number => {
  if (!iso) return 0
  const e = new Date(iso), n = new Date()
  if (isNaN(e.getTime()) || e.getTime() < n.getTime()) return 0
  return Math.max(1, (e.getFullYear() - n.getFullYear()) * 12 + (e.getMonth() - n.getMonth()) + (e.getDate() > n.getDate() ? 1 : 0))
}
/** A bill, premium or SIP whose end date falls inside the horizon is over by then: switch it off. */
const endedBy = (v: any, k: number) => { const m = monthsUntil(v?.endDate); return m > 0 && m <= k }

/** What-if switches for the future view. */
export interface ProjectOpts {
  /** Keep this cycle's card spends as a typical month (default: nothing new goes on cards). */
  typicalSpend?: boolean
  /** Stop adding to savings/chits and SIPs: balances stay where they are today. */
  noDeposits?: boolean
}

export function advanceAll(d: RawData, k: number, opts: ProjectOpts = {}): RawData {
  if (!k) return d
  const corpusNow = (v: any) => { const c = v.currentCorpus != null ? Number(v.currentCorpus) : Number(v.monthly ?? 0) * getEff(v).paid; return Number.isFinite(c) ? c : 0 }
  return {
    loans: d.loans.map(l => advanceLoan(l, k)),
    cards: d.cards.map(c => ({
      ...c,
      outstanding: 0,        // this statement gets paid…
      spends: opts.typicalSpend ? (c.spends ?? []) : [],   // …and nothing new is put on the card (or, by choice, a typical month's spend continues)
      emis: (c.emis ?? []).map((e: any) => advance(e, k)),
    })),
    personal: d.personal.map(p => advance(p, k)),
    // No new deposits: a saving that is still being built is frozen at today's balance and stops costing a monthly amount.
    // (A chit you are repaying is a debt, not a deposit — it keeps running.)
    savings: d.savings.map(v => opts.noDeposits && !isChitRepaying(v) ? { ...v, currentCorpus: corpusNow(v), monthly: 0 } : advance(v, k)),
    expenses: (d.expenses ?? []).map(v => endedBy(v, k) ? { ...v, active: false } : v),
    insurance: (d.insurance ?? []).map(v => endedBy(v, k) ? { ...v, active: false } : v),
    // SIPs keep going in: each active one adds k months of its instalment to its value (no return is assumed).
    investments: d.investments.map(v => {
      if (opts.noDeposits) return { ...v, totalInvested: investInvested(v), currentValue: investValue(v), monthly: 0 }
      const a = endedBy(v, k) ? { ...advance(v, k), active: false } : advance(v, k)
      const stillRunning = a.active !== false && (!v.tenure || getEff(a).pending > 0 || getEff(v).pending > 0)
      const add = stillRunning ? Number(v.monthly ?? 0) * k : 0
      return add > 0 ? { ...a, totalInvested: investInvested(v) + add, currentValue: investValue(v) + add } : a
    }),
  }
}

export const horizonLabel = (k: number) => {
  const d = new Date(); d.setMonth(d.getMonth() + k)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}
