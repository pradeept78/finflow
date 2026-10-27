import { getEff, toMonthly, isOneOff, freqMonths, isDueInMonth } from './format'
import { isLive } from './ended'
import { isChitRepaying } from './kinds'
import { ioweFacts } from './iowe'

/**
 * SINGLE SOURCE OF TRUTH for monthly outflow.
 *
 * This file already carried that title and was imported by zero pages. All seven pages the old
 * header named hand-rolled their own version, which is why the same figure kept drifting apart and
 * why every fix had to be applied seven times over.
 *
 * The old header was also wrong on the substance. It stated "CC Outstanding — already counted in
 * CC spends", which is false: the statement balance and the current unbilled cycle are different
 * amounts, and that assumption is what made the page totals disagree in the first place.
 *
 * TWO TIERS, deliberately kept apart:
 *
 *   locked — the standing commitment. Repeats identically next month and is not optional. Loan
 *            EMIs, CC EMIs, I Owe servicing, bills, recurring insurance, savings and chit
 *            instalments, SIPs.
 *
 *   card   — a balance, not a commitment. Clear it and it is gone; next month it is whatever was
 *            spent. Statement outstanding plus the current unbilled cycle.
 *
 *   dueNow — non-monthly money that actually falls due THIS month at its full amount: a quarterly or
 *            yearly bill/premium in its renewal month, a one-time payment dated this month, an I Owe
 *            lump sum paid back this month. Same rules as buildDueRows, so the due list adds up to it.
 *
 * `total` is locked + card + dueNow: what actually has to be settled this month. Free cash is measured
 * against `locked` alone, because subtracting the card balance as well understates free cash in
 * every month the card is cleared in full.
 */

export interface OutflowComponents {
  loanEmi:      number
  ccEmi:        number
  iOweEmi:      number
  /** Monthly-frequency expenses only — cash that actually leaves every month. */
  expenses:     number
  /** Monthly-equivalent of NON-monthly expenses (e.g. a yearly school fee): a set-aside, not a
   *  payment due this month. Same reasoning as insuranceProvision below. */
  expenseProvision: number
  /** Monthly-frequency premiums only — cash that actually leaves every month. */
  insuranceEmi: number
  /** Monthly-equivalent of NON-monthly premiums: a set-aside, not a payment. */
  insuranceProvision: number
  /** expenseProvision + insuranceProvision — the one "set aside for renewals" figure every page shows. */
  setAside:     number
  savings:      number
  chitRepay:    number
  sipInvest:    number
  /** Sum of everything above: the standing monthly commitment. */
  locked:       number

  ccOutstanding: number
  ccSpends:      number
  /** Statement balance plus the unbilled cycle. A one-month figure. */
  card:          number

  /** Full amounts of non-monthly bills, premiums, one-time payments and lump sums due this month. */
  dueNow:        number

  /** locked + card + dueNow — what has to be settled this month. */
  total:         number
}

const num = (v: any) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function calcOutflow(
  loans:       any[] = [],
  cards:       any[] = [],
  personal:    any[] = [],
  savings:     any[] = [],
  investments: any[] = [],
  expenses:    any[] = [],
  insurance:   any[] = [],
  now:         Date  = new Date(),
): OutflowComponents {

  const loanEmi = loans
    .filter(l => getEff(l).pending > 0)
    .reduce((s, l) => s + num(l.emi), 0)

  // A spend/EMI tagged "for a friend" and not yet paid back is real money leaving the account this
  // cycle, but not the user's own spending — same exclusion AllCommitmentsPage and calcDebt.ts both
  // make, now made here too so this calculator's "Committed / month" can't disagree with either.
  const isFriendOwed = (x: any) => !!x?.owedBy && !x?.owedSettled

  const ccEmi = cards.reduce((s, c) =>
    s + (c.emis ?? [])
      .filter((e: any) => getEff(e).pending > 0 && !isFriendOwed(e))
      .reduce((a: number, e: any) => a + num(e.emi), 0), 0)

  // An interest-only entry keeps paying for as long as it is open, so its servicing cost belongs
  // here — but its principal is not amortising and must not be shown as reducing. `ioweFacts`
  // classifies each row and returns the right monthly figure for its shape.
  const iOweEmi = personal
    .filter(p => p.active !== false)
    .reduce((s, p) => s + ioweFacts(p).monthly, 0)

  // Same bug class the header above already fixed for insurance, just never applied here: this
  // used to sum every active expense's raw `amount` regardless of frequency, so a Yearly ₹1,20,000
  // school fee added the full ₹1,20,000 to the monthly commitment instead of ~₹10,000, and a
  // One-time expense was counted every month forever. Split the same way insurance is split below:
  // genuinely-monthly expenses are real cash leaving this month; non-monthly ones are a
  // monthly-equivalent set-aside, kept out of `locked` for the same reason insuranceProvision is.
  const activeExpenses = expenses.filter(v => isLive(v) && !isOneOff(v.frequency))
  const expenses_ = activeExpenses
    .filter(v => freqMonths(v.frequency) <= 1)
    .reduce((s, v) => s + num(v.amount), 0)
  const expenseProvision = activeExpenses
    .filter(v => freqMonths(v.frequency) > 1)
    .reduce((s, v) => s + toMonthly(v.amount, v.frequency), 0)

  /* Two different things, kept apart.
     `insuranceEmi` is cash that genuinely leaves every month — monthly-frequency policies only.
     `insuranceProvision` is the monthly-equivalent of a yearly or half-yearly premium: money that
     should be set aside, but is NOT paid this month. Folding the second into the first made the
     recurring figure claim ₹14,024/mo when only ₹9,000 actually leaves the account each month.
     `isCardEmi` is excluded here too: that premium is already being paid off as an EMI on a credit
     card, so its cost already shows up in `ccEmi` above. Counting it again here would double it. */
  const active = insurance.filter(v => isLive(v) && !isOneOff(v.frequency) && !v.isCardEmi)
  const insuranceEmi = active
    .filter(v => freqMonths(v.frequency) <= 1)
    .reduce((s, v) => s + num(v.premium), 0)
  const insuranceProvision = active
    .filter(v => freqMonths(v.frequency) > 1)
    .reduce((s, v) => s + toMonthly(v.premium, v.frequency), 0)

  // A chit in 'withdrew' state, or with the prize taken, has already paid out and is now being
  // repaid — that is an outflow against a debt. Anything still building is a savings contribution.
  const isRepaying = isChitRepaying

  const openPlans = savings.filter(v => getEff(v).pending > 0)
  const savings_  = openPlans.filter(v => !isRepaying(v)).reduce((s, v) => s + num(v.monthly), 0)
  const chitRepay = openPlans.filter(isRepaying).reduce((s, v) => s + num(v.monthly), 0)

  const sipInvest = investments
    .filter(v => isLive(v))
    .reduce((s, v) => s + num(v.monthly), 0)

  const locked = loanEmi + ccEmi + iOweEmi + expenses_ + insuranceEmi + savings_ + chitRepay + sipInvest

  const ccOutstanding = cards.reduce((s, c) => s + num(c.outstanding), 0)
  const ccSpends = cards.reduce((s, c) =>
    s + (c.spends ?? []).filter((sp: any) => !isFriendOwed(sp)).reduce((a: number, sp: any) => a + num(sp.amount), 0), 0)
  const card = ccOutstanding + ccSpends

  // Kept in step with buildDueRows (dueRows.ts): the same items it lists as due this month, at the
  // same full amounts. A provision above is the smoothed monthly share; this is the actual bill.
  const y = now.getFullYear(), m = now.getMonth()
  const inThisMonth = (iso?: string) => {
    const d = iso ? new Date(iso) : null
    return !!d && !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m
  }
  const renewsNow = (v: any) => isOneOff(v.frequency) ? inThisMonth(v.startDate)
    : freqMonths(v.frequency) > 1 && isDueInMonth(v.startDate, v.frequency, y, m)
  const dueNow =
      expenses.filter(v => isLive(v) && renewsNow(v)).reduce((s, v) => s + num(v.amount), 0)
    + insurance.filter(v => isLive(v) && !v.isCardEmi && renewsNow(v)).reduce((s, v) => s + num(v.premium), 0)
    + personal.filter(p => p.active !== false && inThisMonth(p.paybackDate)).reduce((s, p) => s + num(p.amount), 0)

  return {
    loanEmi, ccEmi, iOweEmi, expenses: expenses_, expenseProvision, insuranceEmi, insuranceProvision,
    setAside: expenseProvision + insuranceProvision,
    savings: savings_, chitRepay, sipInvest, locked,
    ccOutstanding, ccSpends, card, dueNow,
    total: locked + card + dueNow,
  }
}

/* `insuranceProvision` is deliberately absent from these rows and from `locked`: it is money that
   should be set aside for a future renewal, not cash leaving this month. Including it made the
   recurring figure claim ₹14,024/mo when only ₹9,000 actually goes out. Surface it as its own note
   — never inside a total these rows are supposed to add up to. */
/** Itemised rows for a breakdown line: non-zero only, in display order, tagged by tier. */
export const outflowRows = (o: OutflowComponents) => ([
  { label: 'Loan EMIs',      val: o.loanEmi,       tier: 'locked' as const },
  { label: 'CC EMIs',        val: o.ccEmi,         tier: 'locked' as const },
  { label: 'I Owe',          val: o.iOweEmi,       tier: 'locked' as const },
  { label: 'Bills',          val: o.expenses,      tier: 'locked' as const },
  { label: 'Insurance',      val: o.insuranceEmi,  tier: 'locked' as const },
  { label: 'Savings',        val: o.savings,       tier: 'locked' as const },
  { label: 'Chit repayment', val: o.chitRepay,     tier: 'locked' as const },
  { label: 'SIP',            val: o.sipInvest,     tier: 'locked' as const },
  { label: 'CC outstanding', val: o.ccOutstanding, tier: 'card' as const },
  { label: 'CC spends',      val: o.ccSpends,      tier: 'card' as const },
  { label: 'Renewals & one-offs', val: o.dueNow,    tier: 'due' as const },
]).filter(r => r.val > 0)

/**
 * The itemised sub-line, generated once so every page prints the SAME grouping.
 *
 * This existed as hand-written JSX on each page and the groupings had drifted apart: on the same
 * data Hub showed "EMIs ₹1,31,101" (loans + CC EMI + I Owe), Budget showed ₹1,56,101 (the same plus
 * chit repayment, which it then omitted from its own list), Dashboard ₹1,48,101 and Calendar
 * ₹1,92,625. The totals agreed while the parts did not, which is worse than either being wrong —
 * it looks like a rounding error and it is not.
 */
export const outflowSubLine = (o: OutflowComponents): string =>
  outflowRows(o).map(r => `${r.label} ₹${Math.round(r.val).toLocaleString('en-IN')}`).join(' · ')

/** "committed ₹2,76,575 + card bill ₹1,83,690 + renewals ₹45,000" — the tiers of `total` as one line. Same words on every page. */
export const outflowTierLine = (o: OutflowComponents): string =>
  `committed ₹${Math.round(o.locked).toLocaleString('en-IN')} + card bill ₹${Math.round(o.card).toLocaleString('en-IN')}`
  + (o.dueNow > 0 ? ` + renewals & one-offs ₹${Math.round(o.dueNow).toLocaleString('en-IN')}` : '')
