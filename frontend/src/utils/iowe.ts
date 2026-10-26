import { getEff, monthsElapsed } from './format'

/**
 * "I Owe" entries come in three shapes, and the app used to recognise only two.
 *
 *   amortising     — emi pays down principal over `tenure` months. Progress is real: after 12 of
 *                    36 payments you owe a third less. This was the assumed default.
 *   lump           — no monthly payment at all; the whole `amount` is due on `paybackDate`.
 *   interest-only  — a monthly payment that services INTEREST only. The principal does not move.
 *                    Paying ₹8,000/mo against ₹8,46,000 for years leaves ₹8,46,000 still owed.
 *
 * The third case was being treated as amortising, which produced two serious errors:
 *   1. `monthsElapsed × emi` was reported as money paid *toward the debt*, so the balance appeared
 *      to shrink when it had not moved at all.
 *   2. `emi × tenure` implied an end date, so the entry looked like it would clear itself.
 *
 * Detection needs no schema change — `paybackDate` already exists on the entity and means exactly
 * "the date the principal comes back". A monthly payment that coexists with a principal-return date
 * cannot be amortising that principal.
 */
export type IOweMode = 'amortising' | 'interest-only' | 'lump'

export interface IOweFacts {
  mode: IOweMode
  /** Principal still owed. For interest-only and lump this never decreases. */
  principalLeft: number
  /** Monthly cash out. Interest for interest-only, instalment for amortising, 0 for lump. */
  monthly: number
  /** Interest paid so far. A sunk cost — it buys no equity in the debt. */
  interestPaid: number
  /** Months the loan has been serviced. */
  monthsServiced: number
  /** Months until the principal falls due, when that is knowable. */
  monthsToPayback: number | null
  /** Implied annual rate from the payment, so an unstated rate is still visible. */
  impliedRatePct: number | null
  /** True when the figures on the row cannot describe a self-clearing loan. */
  cannotAmortise: boolean
  /** Short human label for the row. */
  label: string
}

const num = (v: any) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const monthsUntil = (date?: string): number | null => {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth())
}

export function ioweFacts(p: any): IOweFacts {
  const amount = num(p?.amount)
  const emi    = num(p?.emi)
  const tenure = num(p?.tenure)
  const serviced = p?.startDate ? monthsElapsed(p.startDate) : getEff(p ?? {}).paid
  const toPayback = monthsUntil(p?.paybackDate)

  // No monthly payment: the whole principal is a single future obligation.
  if (emi <= 0) {
    return {
      mode: 'lump', principalLeft: amount, monthly: 0, interestPaid: 0,
      monthsServiced: 0, monthsToPayback: toPayback, impliedRatePct: null,
      cannotAmortise: false, label: 'Lump sum',
    }
  }

  const impliedRatePct = amount > 0 ? (emi * 12) / amount * 100 : null

  /* Three signals that a payment is servicing interest rather than retiring principal:
       paybackSignals   — a date is recorded for the principal coming back.
       arithmeticSignal — the payments cannot add up to the principal, so they cannot be repaying it.
       noSchedule       — there is a monthly payment but no tenure at all, so no amortisation
                          schedule exists. This case matters: an earlier version fell through to
                          the amortising branch, where `getEff` returns pending:0 without a tenure,
                          and the monthly was gated on pending > 0 — so the payment silently
                          dropped out of every outflow total. A payment with no recorded schedule
                          still leaves the account every month; treat the principal as unchanged
                          (the conservative reading) and flag the missing data rather than
                          assuming the debt is settled. */
  const paybackSignals   = !!p?.paybackDate
  const arithmeticSignal = tenure > 0 && emi * tenure < amount
  const noSchedule       = tenure <= 0 && !p?.paybackDate
  if (paybackSignals || arithmeticSignal || noSchedule) {
    return {
      mode: 'interest-only',
      principalLeft: amount,                 // unchanged, by definition
      monthly: emi,                          // always the payment — it leaves the account regardless
      interestPaid: serviced * emi,
      monthsServiced: serviced,
      monthsToPayback: toPayback,
      impliedRatePct,
      cannotAmortise: (arithmeticSignal || noSchedule) && !paybackSignals,
      label: noSchedule && !arithmeticSignal ? 'No schedule set' : 'Interest only',
    }
  }

  const eff = getEff(p ?? {})
  const paidDown = Math.min(amount, eff.paid * emi)
  return {
    mode: 'amortising',
    principalLeft: Math.max(0, amount - paidDown),
    monthly: eff.pending > 0 ? emi : 0,
    interestPaid: Math.max(0, emi * tenure - amount) * (tenure > 0 ? eff.paid / tenure : 0),
    monthsServiced: eff.paid,
    monthsToPayback: tenure > 0 ? eff.pending : toPayback,
    impliedRatePct,
    cannotAmortise: false,
    label: 'EMI',
  }
}

/** Total principal owed across all I Owe entries — interest payments do not reduce this. */
export const iowePrincipalTotal = (items: any[]) =>
  (items ?? []).reduce((s, p) => s + ioweFacts(p).principalLeft, 0)

/** Total monthly cash out across all I Owe entries. */
export const ioweMonthlyTotal = (items: any[]) =>
  (items ?? []).reduce((s, p) => s + ioweFacts(p).monthly, 0)
