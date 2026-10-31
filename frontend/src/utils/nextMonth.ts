import { emiFirstDue } from './cardCycle'
import { ioweFacts } from './iowe'
import { isLive } from './ended'
import { isChitRepaying } from './kinds'

/**
 * Commitments that haven't started yet. A loan, I Owe EMI, savings plan or SIP whose start date is after
 * this month has no payment this month — it must not sit in this month's "committed" figure — and the ones
 * whose first payment is NEXT month are worth a heads-up ("committed ₹X (+₹15,000 from Nov)").
 * Card EMIs start on the statement cycle instead (cardCycle.emiFirstDue).
 */

const num = (v: any) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
/** 'YYYY-MM-DD' as a local date */
const parseDay = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const monthEnd = (d: Date, add = 0) => new Date(d.getFullYear(), d.getMonth() + 1 + add, 0, 23, 59, 59)

/** True when an item's first payment (its start date) is after this month. */
export const startsAfterThisMonth = (item: any, now: Date = new Date()): boolean => {
  const s = parseDay(item?.startDate)
  return !!s && s > monthEnd(now)
}

export interface NewCommitment { kind: 'loan' | 'card-emi' | 'iowe' | 'savings' | 'sip'; label: string; amount: number; firstDue: Date; owedBy?: string }

/** Monthly commitments whose first payment falls in NEXT calendar month (friends' card EMIs flagged with owedBy). */
export function newCommitmentsNextMonth(d: { loans?: any[]; cards?: any[]; personal?: any[]; savings?: any[]; investments?: any[] }, now: Date = new Date()): NewCommitment[] {
  const from = new Date(now.getFullYear(), now.getMonth() + 1, 1), to = monthEnd(now, 1)
  const inNext = (x: Date | null) => !!x && x >= from && x <= to
  const out: NewCommitment[] = []
  ;(d.loans ?? []).forEach(l => { const s = parseDay(l.startDate); if (inNext(s) && num(l.emi) > 0) out.push({ kind: 'loan', label: l.lender, amount: num(l.emi), firstDue: s! }) })
  ;(d.personal ?? []).forEach(p => { const s = parseDay(p.startDate); const m = p.active === false ? 0 : ioweFacts(p).monthly; if (inNext(s) && m > 0) out.push({ kind: 'iowe', label: p.person, amount: m, firstDue: s! }) })
  ;(d.savings ?? []).forEach(v => { const s = parseDay(v.startDate); if (inNext(s) && num(v.monthly) > 0 && !isChitRepaying(v)) out.push({ kind: 'savings', label: v.name, amount: num(v.monthly), firstDue: s! }) })
  ;(d.investments ?? []).forEach(v => { const s = parseDay(v.startDate); if (inNext(s) && num(v.monthly) > 0 && isLive(v)) out.push({ kind: 'sip', label: v.name, amount: num(v.monthly), firstDue: s! }) })
  ;(d.cards ?? []).forEach(c => (c.emis ?? []).forEach((e: any) => {
    const f = emiFirstDue(c, e)
    if (inNext(f) && num(e.emi) > 0) out.push({ kind: 'card-emi', label: `${e.label} (${c.banker})`, amount: num(e.emi), firstDue: f!, owedBy: e.owedBy && !e.owedSettled ? e.owedBy : undefined })
  }))
  return out.sort((a, b) => a.firstDue.getTime() - b.firstDue.getTime())
}
