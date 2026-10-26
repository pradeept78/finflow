import { getEff, resolveDueDay, isDueThisMonth, isOneOff, toMonthly } from './format'
import { isLive } from './ended'
import { ioweFacts } from './iowe'
import { isChitRepaying } from './kinds'

/**
 * THE list of payments that land this month — one definition, used by the Calendar's current month and by
 * Quick Lookup. Each page used to decide for itself which rows exist (is a friend's EMI a payment? a switched-off
 * SIP? a "Single" premium? a chit that has paid out?), and every disagreement showed up as "31 here, 32 there".
 * Decisions live here; the pages only decide how to DRAW a row.
 *
 * Rules (the same ones calcOutflow and Master apply):
 *  - an instalment is a payment only while it has instalments left (an EMI whose last payment is already made
 *    this month is done);
 *  - carried-for-a-friend EMIs and insurance already paid as a Card EMI are real but not the user's own
 *    payments → returned in `notCounted`, never in `rows`;
 *  - switched-off entries aren't payments;
 *  - a non-monthly bill/premium lands only in its renewal month; a one-time one lands once, in its own month.
 */
export interface DueRow {
  /** Stable id, also the paid-mark key (so ticking a row on one page shows on the other). */
  key: string
  /** Canonical kind id — see utils/kinds.ts. */
  kind: string
  label: string
  sub: string
  amount: number
  dueDay?: number
  /** The source record, so a page can draw its own detail panel. */
  ref: any
  /** The card, for card rows. */
  parent?: any
  /** This is the final instalment. */
  isLast?: boolean
  /** Instalments left including this one (EMI-like rows). */
  pending?: number
  /** Bill category, for bill rows. */
  category?: string
}
export interface NotCountedRow { key: string; label: string; sub: string; amount: number; dueDay?: number; why: string }

export interface DueData {
  loans?: any[]; cards?: any[]; personal?: any[]; expenses?: any[]; savings?: any[]; investments?: any[]; insurance?: any[]
}

const sameMonth = (iso: string | undefined, now: Date) => {
  const d = iso ? new Date(iso) : null
  return !!d && !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function buildDueRows(data: DueData, now: Date = new Date()): { rows: DueRow[]; notCounted: NotCountedRow[] } {
  const rows: DueRow[] = []
  const notCounted: NotCountedRow[] = []
  const { loans = [], cards = [], personal = [], expenses = [], savings = [], investments = [], insurance = [] } = data

  // Loans
  loans.forEach(l => {
    const eff = getEff(l)
    if (eff.pending <= 0) return
    rows.push({ key: `loan-${l.id}`, kind: 'loan', label: l.lender, sub: l.loanType ?? '', amount: Number(l.emi ?? 0), dueDay: resolveDueDay(l), ref: l, pending: eff.pending, isLast: eff.pending === 1 })
  })

  // Cards: one row per instalment, one for the statement balance, one for this cycle's own spends.
  cards.forEach(c => {
    const dueDay = resolveDueDay(c, c.billingDay)
    ;(c.emis ?? []).forEach((e: any) => {
      const eff = getEff(e)
      if (eff.pending <= 0) return
      if (e.owedBy && !e.owedSettled) {
        notCounted.push({ key: `card-emi-${e.id}`, label: `${c.banker} — ${e.label}`, sub: 'CC EMI', amount: Number(e.emi ?? 0), dueDay, why: `carried for ${e.owedBy}` })
        return
      }
      rows.push({ key: `card-emi-${e.id}`, kind: 'card-emi', label: `${c.banker} — ${e.label}`, sub: `CC EMI · ${eff.pending} left`, amount: Number(e.emi ?? 0), dueDay, ref: e, parent: c, pending: eff.pending, isLast: eff.pending === 1 })
    })
    if (Number(c.outstanding ?? 0) > 0) {
      rows.push({ key: `card-out-${c.id}`, kind: 'card-out', label: `${c.banker} Outstanding`, sub: 'CC statement balance', amount: Number(c.outstanding), dueDay, ref: c, parent: c })
    }
    const own = (c.spends ?? []).filter((sp: any) => !(sp.owedBy && !sp.owedSettled)).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
    if (own > 0) {
      rows.push({ key: `spend-${c.id}`, kind: 'card-spend', label: c.banker, sub: '🛍️ Spends — next bill', amount: own, dueDay, ref: c, parent: c })
    }
  })

  // I Owe: EMI / interest-only, plus a lump sum falling due this month.
  personal.forEach(p => {
    if (p.active === false) return
    if (Number(p.emi ?? 0) > 0) {
      const isOpen = ioweFacts(p).mode !== 'amortising'
      const eff = getEff(p)
      if (isOpen || eff.pending > 0) {
        rows.push({ key: `personal-${p.id}`, kind: 'iowe', label: p.person, sub: isOpen ? 'Interest Payment' : 'Personal EMI', amount: Number(p.emi ?? 0), dueDay: resolveDueDay(p), ref: p, pending: isOpen ? undefined : eff.pending, isLast: !isOpen && eff.pending === 1 })
      }
    }
    if (Number(p.amount ?? 0) > 0 && sameMonth(p.paybackDate, now)) {
      rows.push({ key: `lump-${p.id}`, kind: 'iowe-lump', label: `${p.person} lump sum`, sub: 'Lump sum', amount: Number(p.amount), dueDay: new Date(p.paybackDate).getDate(), ref: p })
    }
  })

  // Bills: recurring ones only in a month they are due; one-time ones once, in their own month.
  expenses.forEach(e => {
    if (!isLive(e)) return
    if (isOneOff(e.frequency)) {
      if (sameMonth(e.startDate, now) && Number(e.amount ?? 0) > 0) rows.push({ key: `exp-${e.id}`, kind: 'one-time', label: e.label, sub: 'One-time expense', amount: Number(e.amount), dueDay: resolveDueDay(e, 1), ref: e, category: e.category })
      return
    }
    if (!isDueThisMonth(e.startDate, e.frequency)) return
    rows.push({ key: `exp-${e.id}`, kind: 'bill', label: e.label, sub: e.category ?? 'Expense', amount: Number(e.amount ?? 0), dueDay: resolveDueDay(e, 1), ref: e, category: e.category })
  })

  // Savings / chit: still-building is a savings contribution; paid-out is a repayment.
  savings.forEach(v => {
    const eff = getEff(v)
    if (eff.pending <= 0) return
    const repaying = isChitRepaying(v)
    rows.push({
      key: `sav-${v.id}`, kind: repaying ? 'chit-repay' : 'savings',
      label: repaying ? `${v.name} (${v.prizeTaken ? 'won - paying back' : 'withdrew'})` : v.name,
      sub: repaying ? 'Still Owe' : (v.savingType ?? 'Savings'), amount: Number(v.monthly ?? 0), dueDay: resolveDueDay(v) ?? 10, ref: v, pending: eff.pending, isLast: eff.pending === 1,
    })
  })

  // Insurance
  insurance.forEach(v => {
    if (!isLive(v)) return
    if (v.isCardEmi) {
      if (!isOneOff(v.frequency)) notCounted.push({ key: `ins-${v.id}`, label: v.name, sub: 'Insurance', amount: toMonthly(v.premium, v.frequency), dueDay: resolveDueDay(v, 1), why: 'already a Card EMI' })
      return
    }
    const amt = Number(v.premium ?? 0)
    if (amt <= 0) return
    if (isOneOff(v.frequency)) {
      if (sameMonth(v.startDate, now)) rows.push({ key: `ins-${v.id}`, kind: 'one-time', label: v.name, sub: 'One-time premium', amount: amt, dueDay: resolveDueDay(v, 1), ref: v })
      return
    }
    if (!isDueThisMonth(v.startDate, v.frequency)) return
    rows.push({ key: `ins-${v.id}`, kind: 'insurance', label: v.name, sub: `Insurance · ${v.frequency}`, amount: amt, dueDay: resolveDueDay(v, 1), ref: v })
  })

  // SIP / investments
  investments.forEach(v => {
    if (!isLive(v) || !(Number(v.monthly ?? 0) > 0)) return
    rows.push({ key: `inv-${v.id}`, kind: 'sip', label: v.name, sub: v.investType ?? 'SIP', amount: Number(v.monthly), dueDay: resolveDueDay(v) ?? 1, ref: v })
  })

  return { rows, notCounted }
}

/**
 * Master's row keys differ from the due-list's (cc-emi- vs card-emi-, insurance- vs ins-, ...). This maps a due-list
 * key onto the Master key of the same record, so Master can ask "is this row charging this month?" of the shared list
 * instead of re-deciding it.
 */
export const masterKeyOf = (key: string): string =>
  key.replace(/^card-emi-/, 'cc-emi-').replace(/^card-out-/, 'cc-out-').replace(/^spend-/, 'cc-spend-')
    .replace(/^ins-/, 'insurance-').replace(/^lump-/, 'personal-')
