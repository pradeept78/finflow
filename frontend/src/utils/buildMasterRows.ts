import { fmtINR, getEff, resolveDueDay, toMonthly, isOneOff, isDueThisMonth, freqMonths } from './format'
import { isLive } from './ended'
import { isChitRepaying } from './kinds'
import { calcLoanSplit } from './loanCalc'
import { ioweFacts } from './iowe'
import { emiFacts } from './emiFacts'
import { buildDueRows, masterKeyOf } from './dueRows'

/**
 * Extracted from MasterTablePage.tsx (the /master "All Commitments" page) so the exact same
 * row-building logic can run on another user's raw data too — specifically, the Admin panel's
 * per-user commitment ledger, which fetches a user's loans/cards/personal/savings/investments/
 * expenses/insurance via GET /admin/users/{id}/commitments instead of the usual "current user"
 * endpoints. Moving this here changes nothing about /master's own behavior: MasterTablePage now
 * imports buildMasterRows() instead of inlining it, but the function body is verbatim.
 */

export type MasterRow = {
  key: string
  due: number | null
  type: string
  name: string
  sub?: string
  /** Borrowed / paid-so-far / rate / extra — filled for Loan, CC EMI and amortising I Owe rows. */
  paidAmount?: number | null
  rate?: number | null
  rateEstimated?: boolean
  enteredRate?: number | null
  extraPayable?: number | null
  interestLeft?: number | null
  loanAmount: number | null
  totalLimit: number | null
  ccOutstanding: number | null
  emi: number | null
  pendingEmis: number | string | null
  paidEmis: number | null
  totalEmis: number | null
  totalPending: number
  startDate?: string
  endDate?: string
  endDateEstimated?: boolean
  owedBy?: string
  owedSettled?: boolean
  // A non-monthly Insurance/Expense row reports `emi` as a smoothed monthly-equivalent for planning
  // (same figure calcOutflow.ts calls insuranceProvision/expenseProvision) — NOT cash leaving this
  // month, so isProvision rows only count toward "Funds Needed" in their actual due month, at the
  // full amount, never the smoothed one. Same split AllCommitments used to make.
  isProvision?: boolean
  dueThisMonth?: boolean
  fullAmount?: number
  // Insurance only: this premium is already being paid off as a Credit Card EMI, so its cost is
  // already in the CC EMI row for that card. Still listed here (dimmed) for visibility, but excluded
  // from every total the same way a friend-owed row is — same reasoning calcOutflow.ts now uses.
  isCardEmi?: boolean
  // Credit-card rows only (CC Outstanding/CC EMI/CC Spends): the card's own name, so a "By Card"
  // view can cluster a card's Outstanding + every EMI + its Spends together under one header even
  // though their `name` fields differ (e.g. "HDFC — Phone EMI" vs "HDFC Spends"). Every other row
  // type falls back to its own `type` as the group key there, so each still gets a sensible header
  // instead of being forced into a "card" grouping that doesn't apply to it.
  cardGroup?: string
  // What this item actually "is" one level below the structural Type badge (Loan/CC EMI/Expense/
  // etc.) — a Loan's loanType (Personal/Home/Gold/Vehicle), a CC EMI or Expense's spend category
  // (Food/Fuel/Gold/Rent/...), an Investment's investType, a Savings/Chit's savingType. A "By Type"
  // view groups by this, since a structural Type is really more like a row's shape (does it have an
  // EMI schedule, is it a card balance) than what it's actually for — grouping by category instead
  // answers "where is my money going". Rows with no real category concept (CC Outstanding, the
  // aggregated CC Spends row, I Owe, Insurance) leave this unset and fall back to their Type.
  category?: string
  // Insurance only — two different "last paid" signals, shown together so one can catch the other
  // being wrong: `lastPaidDate` is what the InsurancePolicy record actually stores (manually updated
  // whenever the user marks it paid, so it's only as current as they keep it); `lastDueDate` is
  // auto-derived from startDate + frequency (the most recent renewal month on or before today),
  // so it stays correct even if the stored field is never touched again.
  lastPaidDate?: string
  lastDueDate?: string
  /** Non-monthly premium that is due this month AND already marked paid this month — it must not be
   *  counted again as cash still needed. */
  paidThisCycle?: boolean
  /** A single payment, not a recurring commitment: listed only in its due month. */
  isOneTime?: boolean
  /** A payment lands this month — decided by the shared due-list (utils/dueRows), the same one Calendar and Lookup use. */
  charging?: boolean
  route: string
}

/**
 * The most recent renewal month on or before today, derived purely from a start date and a
 * frequency — same "elapsed months divides evenly by the renewal period" rule isDueInMonth (in
 * ./format) uses to decide whether a month IS a renewal month, just walked backward to find the
 * latest one that already happened instead of checking one specific month.
 */
const mostRecentRenewal = (startDate: string | undefined, frequency: string | undefined): string | undefined => {
  if (!startDate || isOneOff(frequency)) return undefined
  const per = freqMonths(frequency)
  if (per <= 1) return undefined // monthly (or unknown): every month is a renewal, no distinct "last one" worth calling out
  const sd = new Date(startDate)
  if (isNaN(sd.getTime())) return undefined
  const now = new Date()
  const elapsed = (now.getFullYear() - sd.getFullYear()) * 12 + (now.getMonth() - sd.getMonth())
  if (elapsed < 0) return undefined // hasn't even started yet
  const cycles = Math.floor(elapsed / per)
  const renewal = new Date(sd)
  renewal.setMonth(renewal.getMonth() + cycles * per)
  return renewal.toISOString()
}

export const TYPE_COLOR: Record<string, string> = {
  'Loan': 'var(--danger)',
  'Gold Loan': '#d4a017',
  'CC Outstanding': 'var(--danger)',
  'CC EMI': 'var(--warning)',
  'CC Spends': '#f472b6',
  'I Owe': 'var(--orange)',
  'I Owe (Interest-only)': 'var(--orange)',
  'I Owe (Lump)': 'var(--orange)',
  'Chit Repay': 'var(--purple)',
  'Savings/Chit': '#34d399',
  'Investment/SIP': '#60a5fa',
  'Expense': '#c084fc',
  'Insurance': 'var(--info, #38bdf8)',
}

export const isFriendOwed = (r: { owedBy?: string; owedSettled?: boolean }) => !!r.owedBy && !r.owedSettled
const isRepaying = isChitRepaying

// The Full List table used to spend 13 columns on every row even though no single row type ever
// fills more than a handful of them (an Insurance row leaves Total Limit/CC Outstanding/Pending/
// Paid/Total blank, a Loan row leaves Total Limit/CC Outstanding blank, etc.) — mostly dashes,
// which is what made the page feel dense. This helper merges the three "amount" columns down to
// one sortable value. No figure is dropped — CSV export still has all the original columns.
export const amountSortVal = (r: MasterRow) => r.ccOutstanding ?? r.loanAmount ?? r.totalLimit ?? 0

/** Format a date string as e.g. "Mar 2027", matching the compact style used across this page. */
export const fmtMonthYear = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/**
 * Many rows have no explicit end date stored on the record itself, but we already know how many
 * months are left — derive "today + monthsLeft" so the column is never just blank. Marked with
 * endDateEstimated so the UI can show it's a projection, not a date the user actually entered.
 */
const deriveEndDate = (explicit: string | undefined, monthsLeft: number | null | undefined): { endDate?: string; estimated?: boolean } => {
  if (explicit) return { endDate: explicit, estimated: false }
  if (monthsLeft == null || typeof monthsLeft !== 'number' || monthsLeft <= 0) return {}
  const d = new Date()
  d.setMonth(d.getMonth() + monthsLeft)
  return { endDate: d.toISOString(), estimated: true }
}

/**
 * Build the flat commitment ledger from each feature's raw records — the same categories and
 * formulas calcDebt.ts's Total Debt is built from (calcLoanSplit, ioweFacts, getEff, the same
 * friend-owed exclusion), so a caller's Total Debt tile can't drift from Dashboard/Hub/Finance
 * Overview/Payoff. Non-debt rows (Investments/SIP, still-building Savings/Chit, recurring
 * Expenses, Insurance) are shown for reference — they carry totalPending: 0 and never feed the
 * debt total.
 */
export function buildMasterRows(
  loans: any[], cards: any[], personal: any[], savings: any[],
  investments: any[], expenses: any[], insurance: any[],
): MasterRow[] {
  const rows: MasterRow[] = []

  // ── Loans ──
  ;(loans as any[]).filter(l => getEff(l).pending > 0).forEach(l => {
    const eff = getEff(l)
    const t = l.tenure ?? (eff.paid + eff.pending)
    const sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, eff.paid, l.principalPaid ?? undefined)
    const ed = deriveEndDate(l.endDate, eff.pending)
    const ef = emiFacts({ amount: l.amount, emi: l.emi, tenure: t, paid: eff.paid, rate: l.interestRate, principalRemaining: l.principalPaid })
    rows.push({
      paidAmount: ef.totalPaid, rate: ef.rate, rateEstimated: ef.rateEstimated, enteredRate: ef.enteredRate, extraPayable: ef.extraPayable, interestLeft: ef.interestLeft,
      key: `loan-${l.id}`, due: resolveDueDay(l) ?? null, type: l.loanType === 'Gold Loan' ? 'Gold Loan' : 'Loan', category: l.loanType || 'Personal Loan', name: l.lender,
      loanAmount: l.amount ?? null, totalLimit: null, ccOutstanding: null,
      emi: l.emi ?? null, pendingEmis: eff.pending, paidEmis: eff.paid, totalEmis: t,
      totalPending: sp.princLeft + sp.intLeft, startDate: l.startDate, endDate: ed.endDate, endDateEstimated: ed.estimated, route: '/loans',
    })
  })

  // ── Credit Cards: Outstanding + each EMI + Spends ──
  ;(cards as any[]).forEach(c => {
    const dueDay = resolveDueDay(c, c.billingDay) ?? null
    if (Number(c.outstanding ?? 0) > 0) {
      rows.push({
        key: `cc-out-${c.id}`, due: dueDay, type: 'CC Outstanding', name: c.banker, cardGroup: c.banker,
        loanAmount: null, totalLimit: c.cardLimit ?? null, ccOutstanding: c.outstanding ?? null,
        emi: null, pendingEmis: null, paidEmis: null, totalEmis: null,
        totalPending: Number(c.outstanding ?? 0), route: '/cards',
      })
    }
    ;(c.emis ?? []).filter((e: any) => getEff(e).pending > 0).forEach((e: any) => {
      const eff = getEff(e)
      const t = e.tenure ?? (eff.paid + eff.pending)
      const ed = deriveEndDate(e.endDate, eff.pending)
      const ef = emiFacts({ amount: e.principal, emi: e.emi, tenure: t, paid: eff.paid, rate: e.interestRate })
      rows.push({
        paidAmount: ef.totalPaid, rate: ef.rate, rateEstimated: ef.rateEstimated, enteredRate: ef.enteredRate, extraPayable: ef.borrowed != null ? ef.extraPayable : null, interestLeft: ef.borrowed != null ? ef.interestLeft : null,
        key: `cc-emi-${e.id}`, due: resolveDueDay(e) ?? dueDay, type: 'CC EMI', name: `${c.banker} — ${e.label}`, sub: e.category ?? undefined, cardGroup: c.banker, category: e.category ?? 'Uncategorized',
        loanAmount: e.principal ?? null, totalLimit: c.cardLimit ?? null, ccOutstanding: null,
        emi: e.emi ?? null, pendingEmis: eff.pending, paidEmis: eff.paid, totalEmis: t,
        totalPending: eff.pending * Number(e.emi ?? 0), startDate: e.startDate, endDate: ed.endDate, endDateEstimated: ed.estimated,
        owedBy: e.owedBy, owedSettled: e.owedSettled, route: '/cards',
      })
    })
    // One row per card for this cycle's spends — same exclusion calcDebt.ts's ccSpends makes
    // (precise, per-spend, not "the whole card is someone else's"): the number itself is already
    // net of unsettled friend spends, with a note when any exist.
    const ownSpends = (c.spends ?? []).filter((sp: any) => !isFriendOwed(sp)).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
    const friendSpends = (c.spends ?? []).filter((sp: any) => isFriendOwed(sp)).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
    if (ownSpends > 0 || friendSpends > 0) {
      rows.push({
        key: `cc-spend-${c.id}`, due: dueDay, type: 'CC Spends', name: `${c.banker} Spends`, cardGroup: c.banker,
        sub: friendSpends > 0 ? `this billing cycle · excl. ${fmtINR(friendSpends)} owed by friends` : 'this billing cycle',
        loanAmount: null, totalLimit: c.cardLimit ?? null, ccOutstanding: null,
        emi: null, pendingEmis: null, paidEmis: null, totalEmis: null,
        totalPending: ownSpends, route: '/cards',
      })
    }
  })

  // ── I Owe (Personal) — every mode ──
  ;(personal as any[]).forEach(p => {
    const facts = ioweFacts(p)
    const eff = getEff(p)
    if (facts.mode === 'amortising' && eff.pending <= 0) return
    const t = p.tenure ?? (eff.paid + eff.pending)
    const ed = deriveEndDate(p.paybackDate, facts.mode === 'amortising' ? eff.pending : null)
    const ef = facts.mode === 'amortising' ? emiFacts({ amount: p.amount, emi: p.emi, tenure: t, paid: eff.paid, rate: p.interestRate }) : null
    rows.push({
      ...(ef ? { paidAmount: ef.totalPaid, rate: ef.rate, rateEstimated: ef.rateEstimated, enteredRate: ef.enteredRate, extraPayable: ef.extraPayable, interestLeft: ef.interestLeft } : {}),
      key: `personal-${p.id}`, due: resolveDueDay(p) ?? null,
      type: facts.mode === 'lump' ? 'I Owe (Lump)' : facts.mode === 'interest-only' ? 'I Owe (Interest-only)' : 'I Owe',
      name: p.person,
      loanAmount: p.amount ?? null, totalLimit: null, ccOutstanding: null,
      emi: facts.mode === 'lump' ? null : (p.emi ?? null),
      pendingEmis: facts.mode === 'lump' ? null : (facts.mode === 'interest-only' ? '—' : eff.pending),
      paidEmis: facts.mode === 'lump' ? null : eff.paid,
      totalEmis: facts.mode === 'amortising' ? t : null,
      totalPending: facts.principalLeft, startDate: p.startDate, endDate: ed.endDate, endDateEstimated: ed.estimated, route: '/personal',
    })
  })

  // ── Savings / Chit — repaying (debt) and still-building (not debt, shown for reference) ──
  ;(savings as any[]).filter((v: any) => getEff(v).pending > 0).forEach((v: any) => {
    const eff = getEff(v)
    const ed = deriveEndDate(v.endDate, eff.pending)
    const repaying = isRepaying(v)
    rows.push({
      key: `sav-${v.id}`, due: resolveDueDay(v) ?? null, type: repaying ? 'Chit Repay' : 'Savings/Chit', name: v.name,
      // For a chit being repaid, the "borrowed" figure is what you actually GOT after the bid (the discount is
      // the cost of that money), not the face value of the chit. Falls back to the face value if not entered.
      sub: repaying && Number(v.actualReceived ?? 0) > 0 ? `${v.savingType ?? 'Chit'} · got after bid` : v.savingType,
      category: v.savingType || undefined,
      loanAmount: repaying && Number(v.actualReceived ?? 0) > 0 ? Number(v.actualReceived) : (v.chitValue ?? null), totalLimit: null, ccOutstanding: null,
      emi: v.monthly ?? null, pendingEmis: eff.pending, paidEmis: eff.paid, totalEmis: v.tenure ?? null,
      totalPending: repaying ? eff.pending * Number(v.monthly ?? 0) : 0,
      // Money, not instalment count: a "free month" (doublePayments) is an instalment you did NOT have to pay, so it
      // shortens the chit without costing cash. Savings page uses the same basis (cashPaid = elapsed × monthly).
      //   paid so far  = cash actually paid       = elapsed × monthly
      //   total payable = paid so far + still to pay = (elapsed + pending) × monthly  (= (tenure − free months) × monthly)
      //   extra payable = total payable − what you GOT after the bid
      //   extra "left"  = still to pay − the part of it that is still principal (payments repay the amount received first)
      // Left unset for a chit that is still building — that is savings contributed, not debt paid.
      paidAmount: repaying ? eff.elapsed * Number(v.monthly ?? 0) : undefined,
      extraPayable: repaying && Number(v.actualReceived ?? 0) > 0 ? Math.max(0, (eff.elapsed + eff.pending) * Number(v.monthly ?? 0) - Number(v.actualReceived)) : undefined,
      interestLeft: repaying && Number(v.actualReceived ?? 0) > 0 ? Math.max(0, eff.pending * Number(v.monthly ?? 0) - Math.max(0, Number(v.actualReceived) - eff.elapsed * Number(v.monthly ?? 0))) : undefined,
      startDate: v.startDate, endDate: ed.endDate, endDateEstimated: ed.estimated, route: '/savings',
    })
  })

  // ── Investments / SIP — reference only, never debt ──
  ;(investments as any[]).filter((v: any) => isLive(v) && (v.monthly ?? 0) > 0).forEach((v: any) => {
    rows.push({
      key: `inv-${v.id}`, due: resolveDueDay(v) ?? null, type: 'Investment/SIP', name: v.name, sub: v.investType ?? 'SIP', category: v.investType || 'SIP',
      loanAmount: v.totalInvested ?? null, totalLimit: null, ccOutstanding: null,
      emi: v.monthly ?? null, pendingEmis: null, paidEmis: null, totalEmis: null,
      totalPending: 0, startDate: v.startDate, endDate: v.endDate, endDateEstimated: false, route: '/investments',
    })
  })

  // ── Recurring Expenses — reference only; a non-monthly bill is a smoothed set-aside, only really
  // due (at its full amount) in its actual renewal month, same split calcOutflow.ts makes. ──
  ;(expenses as any[]).filter((v: any) => isLive(v) && !isOneOff(v.frequency)).forEach((v: any) => {
    const isProvision = freqMonths(v.frequency) > 1
    const dueNow = isProvision && isDueThisMonth(v.startDate, v.frequency)
    rows.push({
      key: `exp-${v.id}`, due: resolveDueDay(v, 1) ?? null, type: 'Expense', name: v.label, sub: v.category ?? v.frequency, category: v.category || 'Other',
      loanAmount: null, totalLimit: null, ccOutstanding: null,
      emi: toMonthly(v.amount, v.frequency), pendingEmis: null, paidEmis: null, totalEmis: null,
      totalPending: 0, isProvision, dueThisMonth: dueNow, fullAmount: Number(v.amount ?? 0), route: '/expenses',
    })
  })

  // ── Insurance — reference only; same provision split as Expenses above ──
  ;(insurance as any[]).filter((v: any) => isLive(v) && !isOneOff(v.frequency)).forEach((v: any) => {
    const isProvision = freqMonths(v.frequency) > 1
    const dueNow = isProvision && isDueThisMonth(v.startDate, v.frequency)
    rows.push({
      key: `insurance-${v.id}`, due: resolveDueDay(v, 1) ?? null, type: 'Insurance', name: v.name,
      sub: v.isCardEmi ? 'already a Card EMI' : undefined,
      loanAmount: v.sumAssured ?? null, totalLimit: null, ccOutstanding: null,
      emi: toMonthly(v.premium, v.frequency), pendingEmis: null, paidEmis: null, totalEmis: null,
      totalPending: 0, isProvision, dueThisMonth: dueNow, fullAmount: Number(v.premium ?? 0), isCardEmi: v.isCardEmi,
      startDate: v.startDate, endDate: v.paymentEndDate ?? v.endDate, endDateEstimated: false,
      lastPaidDate: v.lastPaidDate, lastDueDate: mostRecentRenewal(v.startDate, v.frequency),
      paidThisCycle: !!(dueNow && v.lastPaidDate && new Date(v.lastPaidDate) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      route: '/insurance',
    })
  })

  // ── One-time payments (a "Single" premium, a one-time expense) ──
  // Not recurring, so they have no monthly figure and never appear in committed/month. They are listed
  // only in the month they fall due, as a full-amount payment — which also keeps this page's count in
  // step with the Calendar, which lists them once in that same month.
  const dueOnce = (start?: string) => {
    const sd = start ? new Date(start) : null
    const n = new Date()
    return !!sd && !isNaN(sd.getTime()) && sd.getFullYear() === n.getFullYear() && sd.getMonth() === n.getMonth()
  }
  ;(insurance as any[]).filter((v: any) => v.active !== false && isOneOff(v.frequency) && !v.isCardEmi && dueOnce(v.startDate) && Number(v.premium ?? 0) > 0).forEach((v: any) => {
    rows.push({
      key: `insurance-${v.id}`, due: resolveDueDay(v, 1) ?? null, type: 'Insurance', name: v.name, sub: 'one-time premium · due this month',
      loanAmount: v.sumAssured ?? null, totalLimit: null, ccOutstanding: null,
      emi: null, pendingEmis: null, paidEmis: null, totalEmis: null,
      totalPending: 0, isProvision: true, dueThisMonth: true, fullAmount: Number(v.premium ?? 0), isOneTime: true,
      paidThisCycle: !!(v.lastPaidDate && new Date(v.lastPaidDate) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      startDate: v.startDate, endDate: undefined, endDateEstimated: false, route: '/insurance',
    })
  })
  ;(expenses as any[]).filter((v: any) => v.active !== false && isOneOff(v.frequency) && dueOnce(v.startDate) && Number(v.amount ?? 0) > 0).forEach((v: any) => {
    rows.push({
      key: `exp-${v.id}`, due: resolveDueDay(v, 1) ?? null, type: 'Expense', name: v.label, sub: `${v.category ?? 'One-time'} · one-time, due this month`, category: v.category || 'Other',
      loanAmount: null, totalLimit: null, ccOutstanding: null,
      emi: null, pendingEmis: null, paidEmis: null, totalEmis: null,
      totalPending: 0, isProvision: true, dueThisMonth: true, fullAmount: Number(v.amount ?? 0), isOneTime: true, route: '/expenses',
    })
  })

  // Whether a row is charging this month is NOT decided here — it is read off the shared due-list, so this page's
  // "charging this month" count is by construction the Calendar's / Lookup's count. Master's own rules above only
  // shape the row's detail and which reference rows exist.
  const due = buildDueRows({ loans, cards, personal, expenses, savings, investments, insurance })
  const charging = new Set(due.rows.map(r => masterKeyOf(r.key)))
  rows.forEach(r => { r.charging = charging.has(r.key) })

  return rows
}
