import { advanceAll, type RawData, type ProjectOpts } from './projection'
import { calcDebt } from './calcDebt'

export interface TrajPoint { month: number; debt: number; principal: number }

/** Total debt (and principal-only) for each of the next `months` months, from the same projection the Look-ahead uses. */
export function debtTrajectory(raw: RawData, months: number, opts: ProjectOpts = {}): TrajPoint[] {
  const out: TrajPoint[] = []
  for (let m = 0; m <= months; m++) {
    const x = advanceAll(raw, m, opts)
    const d = calcDebt(x.loans, x.cards, x.personal, x.savings)
    out.push({ month: m, debt: Math.round(d.total), principal: Math.round(d.totalPrincipal) })
  }
  return out
}

/** First month at which the debt is cleared (≤ ₹1), or null if it isn't within the range. */
export const debtFreeMonth = (pts: TrajPoint[]): number | null => pts.find(p => p.debt <= 1)?.month ?? null
