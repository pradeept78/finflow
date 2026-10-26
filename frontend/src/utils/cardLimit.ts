import { getEff } from './format'

/**
 * How much of a card's limit is in use — ONE definition for every page.
 *
 * A card's limit is blocked by three things, whoever they are for:
 *   1. the statement balance you still owe (outstanding),
 *   2. purchases made this cycle that are not on a statement yet (spends),
 *   3. every running EMI's unpaid instalments (the bank blocks the limit for the whole EMI until it is repaid).
 * A friend's spend or EMI is charged to YOUR card, so it uses your limit too — it is only left out of what YOU
 * owe in the monthly totals, never out of limit used.
 *
 * (The cards list/tiles used to include EMIs, the Outstanding table counted only outstanding + spends and skipped
 * friends, Budget counted only this month's spends, and Quick Lookup only the outstanding — four answers for the
 * same card.)
 */
export interface CardLimitUse {
  outstanding: number
  spends: number
  /** Unpaid instalments of running EMIs (instalments left × EMI). */
  emiLeft: number
  used: number
  limit: number
  /** 0–100, rounded; 0 when the card has no limit set. */
  pct: number
  /** Real, unclamped percentage (can pass 100). */
  rawPct: number
  /** The part of `used` that is a friend's unsettled spend or EMI (counted in `used`, not in what you owe). */
  friends: number
}

export function cardLimitUse(c: any): CardLimitUse {
  const outstanding = Number(c?.outstanding ?? 0)
  const spends = (c?.spends ?? []).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
  const emiLeft = (c?.emis ?? []).reduce((a: number, e: any) => { const p = getEff(e).pending; return p > 0 ? a + p * Number(e.emi ?? 0) : a }, 0)
  const used = outstanding + spends + emiLeft
  const limit = Number(c?.cardLimit ?? 0)
  const rawPct = limit > 0 ? (used / limit) * 100 : 0
  const isFriend = (x: any) => !!(x?.owedBy && !x?.owedSettled)
  const friends =
    (c?.spends ?? []).filter(isFriend).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0) +
    (c?.emis ?? []).filter(isFriend).reduce((a: number, e: any) => { const p = getEff(e).pending; return p > 0 ? a + p * Number(e.emi ?? 0) : a }, 0)
  return { outstanding, spends, emiLeft, used, limit, pct: Math.min(100, Math.round(rawPct)), rawPct, friends }
}
