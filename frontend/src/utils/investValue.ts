import { monthsElapsed } from './format'

/**
 * What an investment is worth, and what has been put into it — ONE definition for every page.
 *
 * The Investments page is where these records live, so its rules win:
 *   • only active entries count (a paused/closed one is out of the totals);
 *   • value = current value, else the maturity value, else what was invested (an entry with no value recorded reads
 *     as "no change" rather than as worth nothing).
 *
 * SIPs keep growing without anyone editing them. An entry with a monthly amount and a start date has put in
 * `monthly × instalments so far` by now, so "invested" is never less than that — month 4 of a ₹10,000 SIP reads ₹40,000
 * even if ₹30,000 was what got typed in month 3. The instalments not yet written into the record are added at cost to the
 * value too, unless a real current value was entered (that one is yours to keep up to date).
 */
export const isActiveInvestment = (v: any) => v?.active !== false

/** Instalments a monthly investment has made so far (null when it has no monthly amount / start date). */
export function sipInstalments(v: any): number | null {
  const monthly = Number(v?.monthly ?? 0)
  if (!(monthly > 0) || !v?.startDate) return null
  let n = monthsElapsed(v.startDate)
  if (v.endDate) {
    const s = new Date(v.startDate), e = new Date(v.endDate)
    if (!isNaN(e.getTime())) n = Math.min(n, Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1))
  }
  return n
}

/** What the schedule says has gone in so far (null when it isn't a monthly investment). */
export const sipInvestedSoFar = (v: any): number | null => {
  const n = sipInstalments(v)
  return n == null ? null : Math.round(Number(v.monthly) * n)
}

const stored = (v: any) => Number(v?.totalInvested ?? 0)
/** Instalments the schedule has made that the record doesn't show yet. */
const unrecorded = (v: any) => Math.max(0, (sipInvestedSoFar(v) ?? 0) - stored(v))

export const investInvested = (v: any) => stored(v) + unrecorded(v)

export const investValue = (v: any) => {
  const hasRealValue = v?.currentValue != null && v?.currentValue !== '' && Number(v.currentValue) !== stored(v)
  const base = Number(v?.currentValue ?? v?.maturityValue ?? v?.totalInvested ?? 0)
  return hasRealValue ? base : base + unrecorded(v)
}

export function investTotals(list: any[] = []) {
  const active = list.filter(isActiveInvestment)
  const invested = active.reduce((s, v) => s + investInvested(v), 0)
  const value = active.reduce((s, v) => s + investValue(v), 0)
  return { count: active.length, invested, value, pnl: value - invested }
}
