/**
 * Credit-card billing cycle: which bill a spend lands on, and when that bill is due.
 *
 * A statement generated on day S covers spends from S of the previous month up to S − 1 of this
 * month (HDFC: statement on 3 Oct covers 3 Sep – 2 Oct). Its payment is due on the first due day D
 * after the statement (20 Oct) — the following month when D comes before S (statement 25th, due 12th).
 * Money counts in the month its DUE DATE falls in, not the month it was spent.
 *
 * Outstanding vs. logged spends: when a statement amount is typed into `outstanding`, that is the
 * bill, and spends dated inside that statement (or earlier ones) are already part of it — they are
 * not added again. With no amount typed, the bill is built from the logged spends.
 *
 * A card without a statement day keeps the old behaviour: everything counts this month.
 */

const num = (v: any) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** 'YYYY-MM-DD' as a local date (new Date('YYYY-MM-DD') is UTC and can land on the previous day). */
const parseDay = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
/** Day `day` of the given month, clamped to the month's length (a "31st" statement is 28 Feb). */
const onDay = (y: number, m: number, day: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))

/** The statement that will include a spend made on `spend`: the first statement date strictly after it. */
export function statementAfter(spend: Date, statementDay: number): Date {
  const d = dayOnly(spend)
  const same = onDay(d.getFullYear(), d.getMonth(), statementDay)
  return same > d ? same : onDay(d.getFullYear(), d.getMonth() + 1, statementDay)
}

/** The payment due date for a statement generated on `statement`: the first due day after it. */
export function dueFor(statement: Date, dueDay: number): Date {
  const same = onDay(statement.getFullYear(), statement.getMonth(), dueDay)
  return same > statement ? same : onDay(statement.getFullYear(), statement.getMonth() + 1, dueDay)
}

/** The most recent statement generated on or before `now`. */
export function lastStatementOn(now: Date, statementDay: number): Date {
  const d = dayOnly(now)
  const same = onDay(d.getFullYear(), d.getMonth(), statementDay)
  return same <= d ? same : onDay(d.getFullYear(), d.getMonth() - 1, statementDay)
}

export interface CardCycle {
  /** Money on this card that falls due in the current calendar month (statement balance and/or spends). */
  billThisMonth: number
  /** Of that, the typed statement balance and the logged spends. */
  outstandingThisMonth: number
  spendsThisMonth: number
  /** When this month's bill is due (undefined when nothing is due this month). */
  billDue?: Date
  /** Money already on the card that is due in a later month (the next bill). */
  nextBill: number
  /** The part of nextBill that is EMIs starting on that bill (Calendar projects EMIs separately). */
  nextBillEmis: number
  nextDue?: Date
  /** Every bill with money on it, by due date (this month's and later ones), earliest first. */
  dues: { due: Date; amount: number }[]
  /** The same money split by what it is — typed statement balance, logged spends, EMIs starting on a later bill. */
  parts: { kind: 'out' | 'spend' | 'emi'; amount: number; due: Date }[]
  lastStatement?: Date
  /** False when the card has no statement day, so no cycle can be worked out. */
  hasCycle: boolean
}

const isFriends = (x: any) => !!x?.owedBy && !x?.owedSettled

/**
 * A card EMI's first instalment is billed on the statement after its start date, like a spend: started
 * 10 Sep → 3 Oct statement → due 20 Oct; started 5 Oct → 3 Nov statement → due 20 Nov. True when that
 * first due date is after this month, so the EMI belongs on the next bill, not this month's.
 */
export function emiStartsLater(card: any, emi: any, now: Date = new Date()): boolean {
  const firstDue = emiFirstDue(card, emi)
  return !!firstDue && firstDue > new Date(now.getFullYear(), now.getMonth() + 1, 0)
}

/** When a card EMI's first instalment is due: the due date of the statement after its start date
 *  (statement 6th / due 25th, start 6 Oct → 6 Nov statement → 25 Nov). Null without a statement day. */
export function emiFirstDue(card: any, emi: any): Date | null {
  const S = num(card?.billingDay)
  if (!(S >= 1 && S <= 31) || !emi?.startDate) return null
  const start = new Date(emi.startDate)
  if (isNaN(start.getTime())) return null
  const Dd = num(card?.dueDay)
  return dueFor(statementAfter(start, S), Dd >= 1 && Dd <= 31 ? Dd : S)
}

/**
 * Tag each card EMI with `_firstDue` (its first instalment's due date, 'YYYY-MM-DD') so getEff counts
 * instalments from when they're actually billed, not from the start date: an EMI started 6 Oct on a
 * 6th/25th card is 0 paid until 25 Nov, not "1/12 paid" in October. The start date itself is untouched.
 * Applied once when cards are loaded (api/index.ts), so every page counts the same way.
 */
export function withCycleDates<T extends { emis?: any[] }>(card: T): T {
  if (!card?.emis?.length) return card
  return { ...card, emis: card.emis.map(e => {
    const d = emiFirstDue(card, e)
    return d ? { ...e, _firstDue: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` } : e
  }) }
}

export function cardCycle(card: any, now: Date = new Date()): CardCycle {
  const S = num(card?.billingDay), Dd = num(card?.dueDay)
  const outstanding = num(card?.outstanding)
  const ownSpends = (card?.spends ?? []).filter((sp: any) => !isFriends(sp))

  if (!(S >= 1 && S <= 31)) {
    const spends = ownSpends.reduce((a: number, sp: any) => a + num(sp.amount), 0)
    return { billThisMonth: outstanding + spends, outstandingThisMonth: outstanding, spendsThisMonth: spends, nextBill: 0, nextBillEmis: 0, dues: [], parts: [], hasCycle: false,
      billDue: Dd > 0 ? onDay(now.getFullYear(), now.getMonth(), Dd) : undefined }
  }

  const due = Dd >= 1 && Dd <= 31 ? Dd : S     // no due day: treat the statement day as the due day (old fallback)
  const today = dayOnly(now)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const last = lastStatementOn(today, S)

  let outstandingThisMonth = 0, spendsThisMonth = 0, nextBill = 0, nextBillEmis = 0
  let billDue: Date | undefined, nextDue: Date | undefined
  const byDue = new Map<number, number>()
  const parts: CardCycle['parts'] = []
  const book = (amount: number, dueDate: Date, kind: 'out' | 'spend') => {
    // Spends on an older bill are assumed settled with it. A typed balance is different: it's still on the
    // card until it's cleared, so one from an earlier statement counts now (overdue) instead of vanishing.
    if (amount <= 0 || (dueDate < monthStart && kind !== 'out')) return
    byDue.set(dueDate.getTime(), (byDue.get(dueDate.getTime()) ?? 0) + amount)
    const same = parts.find(x => x.kind === kind && x.due.getTime() === dueDate.getTime())
    if (same) same.amount += amount; else parts.push({ kind, amount, due: dueDate })
    if (dueDate <= monthEnd) {
      if (kind === 'out') outstandingThisMonth += amount; else spendsThisMonth += amount
      if (!billDue || dueDate < billDue) billDue = dueDate
    } else {
      nextBill += amount
      if (!nextDue || dueDate < nextDue) nextDue = dueDate
    }
  }

  // A typed balance is the statement that was out when it was entered (`outstandingAsOf`, set by the backend
  // or chosen in the card form): typed on 26 Oct with a 28th statement day, it's the 28 Sep statement, due
  // 18 Oct — not the 28 Oct one. No date recorded: assume the latest statement.
  const asOf = parseDay(card?.outstandingAsOf)
  const typedFor = asOf ? lastStatementOn(asOf, S) : last
  if (outstanding > 0) book(outstanding, dueFor(typedFor, due), 'out')

  ownSpends.forEach((sp: any) => {
    const when = sp.spendDate ? new Date(sp.spendDate) : today
    const stmt = statementAfter(isNaN(when.getTime()) ? today : when, S)
    if (outstanding > 0 && stmt <= typedFor) return              // already inside the typed statement
    book(num(sp.amount), dueFor(stmt, due), 'spend')
  })

  // EMIs that only start on a later bill (see emiStartsLater) are part of that next bill.
  ;(card?.emis ?? []).forEach((e: any) => {
    if (isFriends(e) || !emiStartsLater(card, e, now)) return
    const first = dueFor(statementAfter(new Date(e.startDate), S), due)
    nextBill += num(e.emi); nextBillEmis += num(e.emi)
    byDue.set(first.getTime(), (byDue.get(first.getTime()) ?? 0) + num(e.emi))
    parts.push({ kind: 'emi', amount: num(e.emi), due: first })
    if (!nextDue || first < nextDue) nextDue = first
  })

  // Nothing on the card yet: still say when the ongoing cycle's bill will be due.
  if (!nextDue) { const ongoingDue = dueFor(statementAfter(today, S), due); if (ongoingDue > monthEnd) nextDue = ongoingDue }

  return { billThisMonth: outstandingThisMonth + spendsThisMonth, outstandingThisMonth, spendsThisMonth, billDue, nextBill, nextBillEmis, nextDue, lastStatement: last, hasCycle: true, parts,
    dues: [...byDue.entries()].sort((a, b) => a[0] - b[0]).map(([t, amount]) => ({ due: new Date(t), amount })) }
}

/** "20 Oct" — short label for a due date. */
export const fmtDueDate = (d?: Date) => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

export interface BillingPeriod { from: Date; to: Date; statement: Date; due: Date }

/**
 * The two periods worth showing on a card, worked out from its statement and due days:
 *  - last:    the statement already generated (spends from → to), and when it must be paid
 *  - current: the cycle running now, the statement that will close it, and its due date
 * Statement 18th / due 4th on 31 Oct → last 18 Sep–17 Oct (due 4 Nov); current 18 Oct–17 Nov (statement 18 Nov, due 4 Dec).
 * Null when the card has no statement day.
 */
export function billingPeriods(card: any, now: Date = new Date()): { last: BillingPeriod; current: BillingPeriod } | null {
  const S = num(card?.billingDay)
  if (!(S >= 1 && S <= 31)) return null
  const Dd = num(card?.dueDay)
  const due = Dd >= 1 && Dd <= 31 ? Dd : S
  const dayBefore = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
  const last = lastStatementOn(now, S)
  const prev = lastStatementOn(dayBefore(last), S)
  const next = statementAfter(last, S)
  return {
    last:    { from: prev, to: dayBefore(last), statement: last, due: dueFor(last, due) },
    current: { from: last, to: dayBefore(next), statement: next, due: dueFor(next, due) },
  }
}

/** "18 Oct – 17 Nov · due 4 Dec" */
export const periodLabel = (p: BillingPeriod) => `${fmtDueDate(p.from)} – ${fmtDueDate(p.to)} · due ${fmtDueDate(p.due)}`

/** Money on the card's bill due on a given date (0 when none). */
export const amountDueOn = (c: CardCycle, due: Date) =>
  c.dues.find(d => d.due.getFullYear() === due.getFullYear() && d.due.getMonth() === due.getMonth() && d.due.getDate() === due.getDate())?.amount ?? 0

export interface HeadsUp {
  /** Short name of next month, e.g. "Nov" */
  month: string
  /** EMIs whose first instalment is billed next month (yours) */
  newEmis: { card: string; label: string; emi: number; firstDue: Date }[]
  /** Same, but carried for a friend — shown for information, not added to your totals */
  friendEmis: { card: string; label: string; emi: number; firstDue: Date; owedBy: string }[]
  /** Spends already logged that land on next month's bills (after this cycle's statement date) */
  spends: { card: string; amount: number; due: Date }[]
  newEmiTotal: number
  spendTotal: number
}

/**
 * "What's new on next month's card bills" — for a heads-up in the current month: EMIs that start being
 * billed next month (taken after the statement date) and spends already logged that fall on next month's
 * bill. Same rules as cardCycle / emiFirstDue, so the heads-up and next month's totals agree.
 */
export function nextMonthHeadsUp(cards: any[], now: Date = new Date()): HeadsUp {
  const from = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59)
  const inNext = (d: Date | null | undefined) => !!d && d >= from && d <= to
  const out: HeadsUp = { month: from.toLocaleDateString('en-IN', { month: 'short' }), newEmis: [], friendEmis: [], spends: [], newEmiTotal: 0, spendTotal: 0 }
  ;(cards ?? []).forEach(c => {
    ;(c.emis ?? []).forEach((e: any) => {
      const first = emiFirstDue(c, e)
      if (!first || !inNext(first)) return
      if (isFriends(e)) out.friendEmis.push({ card: c.banker, label: e.label, emi: num(e.emi), firstDue: first, owedBy: e.owedBy })
      else { out.newEmis.push({ card: c.banker, label: e.label, emi: num(e.emi), firstDue: first }); out.newEmiTotal += num(e.emi) }
    })
    cardCycle(c, now).parts.filter(pt => pt.kind === 'spend' && inNext(pt.due)).forEach(pt => {
      out.spends.push({ card: c.banker, amount: pt.amount, due: pt.due }); out.spendTotal += pt.amount
    })
  })
  return out
}
