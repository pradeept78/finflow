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
  const S = num(card?.billingDay)
  if (!(S >= 1 && S <= 31) || !emi?.startDate) return false
  const start = new Date(emi.startDate)
  if (isNaN(start.getTime())) return false
  const Dd = num(card?.dueDay)
  const firstDue = dueFor(statementAfter(start, S), Dd >= 1 && Dd <= 31 ? Dd : S)
  return firstDue > new Date(now.getFullYear(), now.getMonth() + 1, 0)
}

export function cardCycle(card: any, now: Date = new Date()): CardCycle {
  const S = num(card?.billingDay), Dd = num(card?.dueDay)
  const outstanding = num(card?.outstanding)
  const ownSpends = (card?.spends ?? []).filter((sp: any) => !isFriends(sp))

  if (!(S >= 1 && S <= 31)) {
    const spends = ownSpends.reduce((a: number, sp: any) => a + num(sp.amount), 0)
    return { billThisMonth: outstanding + spends, outstandingThisMonth: outstanding, spendsThisMonth: spends, nextBill: 0, nextBillEmis: 0, hasCycle: false,
      billDue: Dd > 0 ? onDay(now.getFullYear(), now.getMonth(), Dd) : undefined }
  }

  const due = Dd >= 1 && Dd <= 31 ? Dd : S     // no due day: treat the statement day as the due day (old fallback)
  const today = dayOnly(now)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const last = lastStatementOn(today, S)

  let outstandingThisMonth = 0, spendsThisMonth = 0, nextBill = 0, nextBillEmis = 0
  let billDue: Date | undefined, nextDue: Date | undefined
  const book = (amount: number, dueDate: Date, kind: 'out' | 'spend') => {
    if (amount <= 0 || dueDate < monthStart) return               // an older bill — assumed settled
    if (dueDate <= monthEnd) {
      if (kind === 'out') outstandingThisMonth += amount; else spendsThisMonth += amount
      if (!billDue || dueDate < billDue) billDue = dueDate
    } else {
      nextBill += amount
      if (!nextDue || dueDate < nextDue) nextDue = dueDate
    }
  }

  // A typed balance is the latest statement's amount, due on that statement's due date.
  if (outstanding > 0) book(outstanding, dueFor(last, due), 'out')

  ownSpends.forEach((sp: any) => {
    const when = sp.spendDate ? new Date(sp.spendDate) : today
    const stmt = statementAfter(isNaN(when.getTime()) ? today : when, S)
    if (outstanding > 0 && stmt <= last) return                  // already inside the typed statement
    book(num(sp.amount), dueFor(stmt, due), 'spend')
  })

  // EMIs that only start on a later bill (see emiStartsLater) are part of that next bill.
  ;(card?.emis ?? []).forEach((e: any) => {
    if (isFriends(e) || !emiStartsLater(card, e, now)) return
    const first = dueFor(statementAfter(new Date(e.startDate), S), due)
    nextBill += num(e.emi); nextBillEmis += num(e.emi)
    if (!nextDue || first < nextDue) nextDue = first
  })

  // Nothing on the card yet: still say when the ongoing cycle's bill will be due.
  if (!nextDue) { const ongoingDue = dueFor(statementAfter(today, S), due); if (ongoingDue > monthEnd) nextDue = ongoingDue }

  return { billThisMonth: outstandingThisMonth + spendsThisMonth, outstandingThisMonth, spendsThisMonth, billDue, nextBill, nextBillEmis, nextDue, lastStatement: last, hasCycle: true }
}

/** "20 Oct" — short label for a due date. */
export const fmtDueDate = (d?: Date) => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
