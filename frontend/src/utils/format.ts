export const fmtINR = (n: number | undefined | null): string => {
  if (n == null) return '₹0'
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export const calcTotalInterest = (emi: number, tenure: number, principal: number): number => {
  return Math.max(0, emi * tenure - principal)
}

// Core: months elapsed since startDate (1-indexed: first month = month 1)
export const monthsElapsed = (startDate: string): number => {
  const sd = new Date(startDate)
  if (isNaN(sd.getTime())) return 0
  const now = new Date()
  let elapsed = (now.getFullYear() - sd.getFullYear()) * 12 + (now.getMonth() - sd.getMonth())
  // if today >= start day of month, current month counts
  if (now.getDate() >= sd.getDate()) elapsed += 1
  return Math.max(0, elapsed)
}

// Calculate paid/pending from startDate + tenure
// First EMI is DUE in the start month itself (e.g. start 2024-06-03 → EMI #1 = June 2024)
// So today 2026-06-13 (after due day 3) = 25 EMIs paid from 48
export const calcPaidFromDate = (
  startDate: string | undefined,
  tenure: number | undefined,
  missedMonths = 0,
  doubleMonths = 0
): { paid: number; pending: number; elapsed: number } => {
  if (!startDate || !tenure) return { paid: 0, pending: tenure ?? 0, elapsed: 0 }
  const sd = new Date(startDate)
  if (isNaN(sd.getTime())) return { paid: 0, pending: tenure, elapsed: 0 }
  const now = new Date()
  // Months since start, inclusive of start month
  let elapsed = (now.getFullYear() - sd.getFullYear()) * 12 + (now.getMonth() - sd.getMonth()) + 1
  // If today is BEFORE the due day this month, this month's EMI not yet paid
  if (now.getDate() < sd.getDate()) elapsed -= 1
  elapsed = Math.max(0, elapsed)
  const paid = Math.min(Math.max(0, elapsed + doubleMonths - missedMonths), tenure)
  const pending = Math.max(0, tenure - paid)
  return { paid, pending, elapsed }
}

// Universal getEff — use this everywhere
// Supports missed/double months for savings
export const getEff = (item: {
  startDate?: string
  tenure?: number
  paid?: number
  pending?: number
  doublePayments?: number
  missedMonths?: number
}): { paid: number; pending: number; elapsed: number } => {
  if (item.startDate && item.tenure) {
    // Best case: auto-calculate from startDate + tenure. A card EMI counts from its first BILLED due date
    // (`_firstDue`, see utils/cardCycle withCycleDates) rather than the day it was taken.
    return calcPaidFromDate(
      (item as any)._firstDue ?? item.startDate,
      item.tenure,
      item.missedMonths ?? 0,
      item.doublePayments ?? 0
    )
  }
  // No startDate: use DB paid/pending/paidMonths if they exist
  const p = (item as any).paidMonths ?? item.paid ?? 0
  const t = item.tenure ?? 0
  const pend = item.pending ?? (t > p ? t - p : 0)
  return { paid: p, pending: pend, elapsed: p }
}

// Is this item's due day in the past this month? (likely already paid)
export const isPastDue = (dueDay: number | undefined): boolean => {
  if (!dueDay) return false
  return dueDay < new Date().getDate()
}

export const dueStatus = (dueDay: number | undefined, hasPending = true): 'overdue' | 'today' | 'soon' | 'ok' | 'none' => {
  if (!dueDay || !hasPending) return 'none'
  const today = new Date().getDate()
  const diff = dueDay - today
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return 'ok'
}

/* ── Frequency ────────────────────────────────────────────────────────────────────────────────
 * There were three of these maps in the codebase with three different spellings and three
 * different fallbacks. The forms write 'Half-Yearly' with a HYPHEN; two maps only carried the
 * underscore variant, missed the lookup, fell through to a `?? 12` default and divided a
 * half-yearly premium by 12 instead of 6 — so Lookup silently disagreed with Budget and Calendar.
 * One map, and one fallback, for the whole app.
 *
 * Value = how many months one payment covers. Divide the amount by this to get a monthly figure.
 */
export const FREQ_MONTHS: Record<string, number> = {
  Monthly: 1,
  Weekly: 12 / 52,         // ExpensesPage's own dropdown offers this; it had no entry here at all,
                           // so freqMonths() silently fell back to 1 and a weekly amount was
                           // treated as if it were already monthly (52x overstatement).
  Quarterly: 3,
  'Half-Yearly': 6,
  Half_Yearly: 6,          // legacy spelling still present in older rows
  Yearly: 12,
  Annual: 12,              // ExpensesPage's dropdown says 'Annual', not 'Yearly' — same reasoning
                           // as Half_Yearly above: recognize both rather than silently mis-scaling
                           // whichever one this map didn't happen to carry.
  '2-Year': 24,
  '3-Year': 36,
  '5-Year': 60,
  // A one-off has no recurrence. Treated as 1 so the amount passes through unscaled; callers that
  // must exclude one-offs from a recurring total should filter on the frequency, not on a divisor.
  'One-time': 1,
  Single: 1,
}

/** Months covered by one payment. Unknown frequencies fall back to Monthly, never to Yearly —
 *  guessing "yearly" silently divides a real commitment by twelve. */
export const freqMonths = (frequency?: string | null): number =>
  FREQ_MONTHS[frequency ?? 'Monthly'] ?? FREQ_BY_KEY[freqKey(frequency)] ?? 1

/* Spelling-tolerant lookup. Rows that come from an import, the API or older forms carry "Half-yearly",
   "half yearly", "QUARTERLY"…; an exact-match miss fell back to Monthly, so a ₹9,800 half-yearly premium
   was counted as ₹9,800 every month. Case, spaces, hyphens and underscores are ignored. */
const freqKey = (f?: string | null) => (f ?? '').toLowerCase().replace(/[\s_-]/g, '')
const FREQ_BY_KEY: Record<string, number> = Object.fromEntries(Object.entries(FREQ_MONTHS).map(([k, v]) => [freqKey(k), v]))

/** Normalise any amount at any frequency to a per-month figure. */
export const toMonthly = (amount: number | undefined | null, frequency?: string | null): number => {
  const n = Number(amount ?? 0)
  if (!Number.isFinite(n)) return 0
  return n / freqMonths(frequency)
}

/** True for frequencies that do not recur, so they can be excluded from recurring totals. */
export const isOneOff = (frequency?: string | null): boolean =>
  ['onetime', 'single'].includes(freqKey(frequency))

/**
 * Monthly-equivalent total for a list of IncomeEntry-shaped rows ({ amount, frequency, active }).
 *
 * Five pages (Dashboard, FinanceOverview, Calendar, History, Hub) each independently summed raw
 * `amount` with no frequency conversion at all — a Yearly ₹6,00,000 bonus counted as ₹6,00,000/mo
 * instead of ~₹50,000/mo, wildly overstating free cash and understating DTI everywhere it fed in.
 * IncomePage itself got the conversion right but still folded 'One-time' income into the recurring
 * total forever, since `freqMonths('One-time')` is deliberately 1 (so the raw amount passes through
 * unscaled for callers that DO want it) rather than excluded — exclusion is the caller's job, same
 * as every other one-off exclusion in this file. One function, used everywhere, fixes both at once.
 */
export const monthlyIncomeTotal = (income: { amount?: number; frequency?: string; active?: boolean }[]): number =>
  (income ?? [])
    .filter(v => v.active !== false && !isOneOff(v.frequency))
    .reduce((s, v) => s + toMonthly(v.amount, v.frequency), 0)

/* ── Due day and paid state ───────────────────────────────────────────────────────────────────
 * Lookup and Calendar each had their own rules for both of these, and they disagreed.
 *
 * DUE DAY. Calendar carried seven different expressions: `l.dueDay` for loans with no fallback,
 * `c.billingDay` for one card row and `c.billingDay ?? c.dueDay` for another, `v.dueDay ?? 1` for
 * insurance, and so on. Lookup resolved a missing day from the start date. Net effect: a loan with
 * no explicit due day was dateless on Calendar but dated on Lookup, and every credit card landed on
 * a different day in the two views because one page preferred `dueDay` and the other `billingDay`.
 *
 * PAID STATE. A payment is paid only when the user has ticked it — see isPaidThisMonth.
 */

/** Resolve the day of the month a payment falls on: explicit day, else the start date's day. */
export const resolveDueDay = (item: any, fallback?: number): number | undefined => {
  const explicit = Number(item?.dueDay ?? 0)
  if (explicit > 0) return explicit
  // A card's statement day is the sensible second choice; the due day is what matters for paying.
  const billing = Number(item?.billingDay ?? 0)
  if (billing > 0) return billing
  if (item?.startDate) {
    const d = new Date(item.startDate).getDate()
    if (d > 0) return d
  }
  return fallback
}

/**
 * Is this payment settled for the current month? Only if the user has ticked it.
 *
 * It used to assume any payment whose day had passed was paid (a tick then meant "not paid"). For a
 * debt tracker that hid missed payments — a new account showed most of the month as settled — and a
 * payment ticked early flipped back to unpaid the day its due date passed. A past, unticked payment
 * is now overdue instead. `dueDay` is kept in the signature so callers needn't change.
 */
export const isPaidThisMonth = (key: string, _dueDay: number | undefined, markedKeys: string[]): boolean =>
  (markedKeys ?? []).includes(key)

/**
 * Is a non-monthly premium actually due in the given month?
 *
 * A yearly or half-yearly policy is not a monthly payment. Normalising it to a per-month figure and
 * then listing that figure as due every month shows a payment on a date nothing is owed, for an
 * amount never actually paid — a ₹30,144 half-yearly premium appeared as "₹5,024 due" in all twelve
 * months instead of ₹30,144 in two of them.
 *
 * Renewal months are startMonth + n × freqMonths, so a policy is due when the elapsed month count
 * divides evenly by its frequency.
 */
export const isDueInMonth = (
  startDate: string | undefined,
  frequency: string | undefined,
  year: number,
  month: number,           // 0-indexed, as Date.getMonth()
): boolean => {
  // One-off first: freqMonths('One-time') is 1, so the monthly shortcut below would swallow it
  // and report a single premium as due every month.
  if (isOneOff(frequency)) return false
  const per = freqMonths(frequency)
  if (per <= 1) return true                    // monthly (or unknown) — due every month
  if (!startDate) return false                 // no anchor date, so no renewal month can be known
  const sd = new Date(startDate)
  if (isNaN(sd.getTime())) return false
  const elapsed = (year - sd.getFullYear()) * 12 + (month - sd.getMonth())
  if (elapsed < 0) return false
  return elapsed % per === 0
}

/** Convenience: is it due in the current calendar month? */
export const isDueThisMonth = (startDate?: string, frequency?: string): boolean => {
  const now = new Date()
  return isDueInMonth(startDate, frequency, now.getFullYear(), now.getMonth())
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st — for "due 2nd". */
export const ordinal = (n: number): string => {
  const t = n % 100
  return `${n}${t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}
