import { getEff } from './format'
import { calcLoanSplit } from './loanCalc'
import { ioweFacts } from './iowe'

/**
 * SINGLE SOURCE OF TRUTH for what is owed.
 *
 * Hub and Dashboard disagreed by ₹2,31,295 on the same data because they used two different
 * definitions of "debt": Hub summed `princLeft + intLeft` (principal plus all interest still to be
 * paid), Dashboard summed `princLeft` alone. Neither was wrong in isolation — but a page showing
 * "Total Debt ₹27,16,233" next to another showing "Debt ₹24,84,938" is just broken.
 *
 * The definition in use: DEBT IS TOTAL AMOUNT STILL TO PAY — principal plus the interest that is
 * still to come if each loan runs to term. This is the "what will this actually cost me before it
 * is gone" reading, and it is what `total` reports.
 *
 * The alternative reading — principal outstanding, i.e. what it would take to settle today — is
 * still available as `totalPrincipal`, and `interestLeft` is still broken out separately. Both are
 * legitimate; the one thing that must never happen is a total computed one way sitting above a
 * breakdown computed the other, which is what produced ₹27,16,233 on Hub against ₹24,84,938 on
 * Dashboard for identical data.
 *
 * NOTE ON NET WORTH: because `total` now carries future interest, any net worth derived from it is
 * correspondingly more negative — it treats interest not yet accrued as a present liability. That
 * is a deliberate consequence of this definition, not a bug. Use `totalPrincipal` for a
 * settle-today view.
 *
 * The credit-card side splits the same way the outflow does:
 *   ccEmiPrincipal — instalments still to run. A commitment.
 *   ccOutstanding  — the statement balance. Owed now.
 *   ccSpends       — the unbilled cycle. Will be owed on the next statement.
 */

export interface DebtComponents {
  /** Loan principal still outstanding, excluding interest. */
  loanPrincipal: number
  /** Interest still to be paid if every loan runs to term. Included in `loanTotal` and `total`. */
  interestLeft: number
  /** Principal + remaining interest — the full amount still to pay on the loans. */
  loanTotal: number

  ccEmiPrincipal: number
  ccOutstanding:  number
  ccSpends:       number
  /** Everything owed on cards right now, including the unbilled cycle. */
  ccTotal:        number

  /** I Owe principal. Interest-only entries contribute their full principal — it is not reducing. */
  iOwePrincipal: number
  /** Instalments still owed on chits whose payout has already been taken. */
  chitRepayLeft: number

  /** loanTotal + ccTotal + iOwePrincipal + chitRepayLeft — includes remaining interest. */
  total: number
  /** The same figure excluding future interest: what it would take to settle today. */
  totalPrincipal: number
}

const num = (v: any) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function calcDebt(
  loans:    any[] = [],
  cards:    any[] = [],
  personal: any[] = [],
  savings:  any[] = [],
): DebtComponents {

  let loanPrincipal = 0, interestLeft = 0
  for (const l of loans) {
    const e = getEff(l)
    const t = l.tenure ?? (e.paid + e.pending)
    const sp = calcLoanSplit(num(l.amount), num(l.emi), t, e.paid, l.principalPaid ?? undefined)
    loanPrincipal += num(sp.princLeft)
    interestLeft  += num(sp.intLeft)
  }

  // A spend/EMI tagged "for a friend" and not yet paid back is real money the card owes the bank
  // today, but not the user's own spending — the mirror image of "People Owe Me" being tracked as
  // an asset rather than debt. AllCommitmentsPage already excluded these from its totals (with this
  // reasoning); this calculator didn't, so its "Total Debt" ran ahead of AllCommitments' total by
  // however much sat in unsettled friend-owed spends/EMIs on the same data. Matching that exclusion
  // here so every page built on calcDebt (Dashboard/Hub/Finance Overview/Payoff) agrees with it.
  const isFriendOwed = (x: any) => !!x?.owedBy && !x?.owedSettled

  const ccEmiPrincipal = cards.reduce((s, c) =>
    s + (c.emis ?? [])
      .filter((e: any) => getEff(e).pending > 0 && !isFriendOwed(e))
      .reduce((a: number, e: any) => a + getEff(e).pending * num(e.emi), 0), 0)

  const ccOutstanding = cards.reduce((s, c) => s + num(c.outstanding), 0)
  const ccSpends = cards.reduce((s, c) =>
    s + (c.spends ?? []).filter((sp: any) => !isFriendOwed(sp)).reduce((a: number, sp: any) => a + num(sp.amount), 0), 0)
  const ccTotal = ccEmiPrincipal + ccOutstanding + ccSpends

  // An interest-only entry's principal does not reduce, so `ioweFacts` returns it in full.
  // An amortising entry returns only what is left after the instalments already paid.
  const iOwePrincipal = personal
    .filter(p => p.active !== false)
    .reduce((s, p) => s + ioweFacts(p).principalLeft, 0)

  // A chit whose prize has been taken is being repaid: the instalments still to run are a debt.
  const chitRepayLeft = savings
    .filter(v => (v.mode === 'withdrew' || v.prizeTaken === true || v.status === 'Repaying') && getEff(v).pending > 0)
    .reduce((s, v) => s + getEff(v).pending * num(v.monthly), 0)

  const loanTotal = loanPrincipal + interestLeft
  return {
    loanPrincipal, interestLeft, loanTotal,
    ccEmiPrincipal, ccOutstanding, ccSpends, ccTotal,
    iOwePrincipal, chitRepayLeft,
    total:          loanTotal     + ccTotal + iOwePrincipal + chitRepayLeft,
    totalPrincipal: loanPrincipal + ccTotal + iOwePrincipal + chitRepayLeft,
  }
}

/** Breakdown rows for a debt bar or list: non-zero only, in display order. */
export const debtRows = (d: DebtComponents) => ([
  // Principal and interest as separate segments so the split stays visible while still summing
  // to `total`. Two segments beats one merged bar that hides where the money goes.
  { label: 'Loan principal',  val: d.loanPrincipal,  color: '#ef4444' },
  { label: 'Loan interest',   val: d.interestLeft,   color: '#fb7185' },
  { label: 'CC EMI pending',  val: d.ccEmiPrincipal, color: '#eab308' },
  { label: 'CC outstanding',  val: d.ccOutstanding,  color: '#f97316' },
  { label: 'CC spends',       val: d.ccSpends,       color: '#ec4899' },
  { label: 'I Owe',           val: d.iOwePrincipal,  color: '#f59e0b' },
  { label: 'Chit repayment',  val: d.chitRepayLeft,  color: '#a855f7' },
]).filter(r => r.val > 0)

/** The components actually present, for an accurate sub-label instead of a hardcoded list. */
export const debtLabel = (d: DebtComponents, loanCount?: number): string => {
  const parts: string[] = []
  if (d.loanPrincipal > 0) parts.push(loanCount != null ? `${loanCount} loans` : 'loans')
  if (d.ccTotal > 0)       parts.push('CC')
  if (d.iOwePrincipal > 0) parts.push('I Owe')
  if (d.chitRepayLeft > 0) parts.push('chit')
  return parts.join(' · ') || 'no debt'
}
