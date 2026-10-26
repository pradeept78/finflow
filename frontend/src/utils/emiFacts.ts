import { calcLoanSplit } from './loanCalc'

/**
 * Annual interest rate (%) implied by a fixed-EMI schedule: the monthly rate r that solves
 * principal = emi * (1 - (1+r)^-n) / r, found by bisection. Returns 0 for a no-cost EMI (the
 * instalments only add up to the principal) or when the inputs can't describe a schedule.
 */
export function impliedAnnualRate(principal: number, emi: number, tenure: number): number {
  if (!(principal > 0) || !(emi > 0) || !(tenure > 0)) return 0
  if (emi * tenure <= principal + 0.5) return 0
  const pv = (r: number) => (r === 0 ? emi * tenure : (emi * (1 - Math.pow(1 + r, -tenure))) / r)
  let lo = 0, hi = 1 // monthly rate 0 – 100%
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (pv(mid) > principal) lo = mid; else hi = mid
  }
  const annual = ((lo + hi) / 2) * 12 * 100
  return Math.round(annual * 10) / 10
}

export interface EmiFacts {
  /** What was originally borrowed. */
  borrowed: number | null
  /** Instalments paid so far (EMI × months paid). */
  totalPaid: number
  /** Annual rate %: the stored one when entered, otherwise implied from the schedule. */
  rate: number | null
  /** true = worked out from amount/EMI/tenure (what the Loans and Hub pages show). */
  rateEstimated: boolean
  /** The rate typed into the record, when there is one — shown on hover if it disagrees with `rate`. */
  enteredRate: number | null
  /** Total interest over the life of the loan — the "extra" paid on top of what was borrowed. */
  extraPayable: number
  /** Part of that extra that is still to be paid. */
  interestLeft: number
  /** Principal + interest over the whole schedule. */
  totalPayable: number
}

/**
 * One place that answers "how much was borrowed, how much have I paid, at what rate, and what
 * extra am I paying on top" for any EMI-style row (Loan, Card EMI, I Owe EMI), so the Master page,
 * the Cards page and the Loans page can't disagree. When a bank-statement principal remaining is
 * on record it is used for the paid/left split, same as calcLoanSplit everywhere else.
 */
export function emiFacts(opts: {
  amount?: number | null
  emi?: number | null
  tenure?: number | null
  paid?: number | null
  rate?: number | null
  principalRemaining?: number | null
}): EmiFacts {
  const amount = Number(opts.amount ?? 0)
  const emi = Number(opts.emi ?? 0)
  const tenure = Number(opts.tenure ?? 0)
  const paid = Number(opts.paid ?? 0)
  const sp = calcLoanSplit(amount, emi, tenure, paid, opts.principalRemaining ?? undefined)
  const stored = Number(opts.rate ?? 0)
  // Same rule the Loans and Hub pages already use: when amount, EMI and tenure are all known, the
  // schedule itself decides the rate (it is what the bank is actually charging); the typed-in rate
  // is only the fallback. Preferring the typed rate made /master show e.g. 3.1% for a loan whose
  // EMIs work out to 9.1%, which is how the two pages disagreed.
  const canDerive = amount > 0 && emi > 0 && tenure > 0
  const rate = canDerive ? impliedAnnualRate(amount, emi, tenure) : stored > 0 ? stored : null
  return {
    borrowed: amount > 0 ? amount : null,
    totalPaid: sp.totalPaid,
    rate,
    // `~` means "worked out, not confirmed": drop it when the rate typed on the record agrees with the EMIs.
    rateEstimated: canDerive && !(stored > 0 && Math.abs(stored - (rate ?? 0)) <= 0.5),
    enteredRate: stored > 0 ? stored : null,
    extraPayable: sp.totalInterest,
    interestLeft: sp.intLeft,
    totalPayable: amount + sp.totalInterest,
  }
}

/** Same bands the Loans page uses for its rate badge: above 12% high, above 8% medium, otherwise low. */
export const rateColor = (rate: number | null | undefined): string =>
  rate == null ? 'var(--text-faint)' : rate > 12 ? 'var(--danger)' : rate > 8 ? 'var(--warning)' : 'var(--success)'
