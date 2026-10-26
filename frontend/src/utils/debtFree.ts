import { getEff } from './format'
import { ioweFacts } from './iowe'

/**
 * Single source of truth for "how many months until every debt is cleared at the current pace".
 * Covers loans, card EMIs, withdrawn-chit repayment and I Owe EMIs; interest-only I Owe entries are
 * cleared one after another with the freed EMIs once the last EMI ends. Lump sums are due next bill
 * and don't extend the horizon. Dashboard, Hub, Closed Assets and Payoff all read this so the
 * debt-free date can never disagree between pages.
 */
export function debtFreeMonths(loans: any[], cards: any[], personal: any[], savings: any[]): number {
  let maxEmiMonths = 0
  let totalEmi = 0
  const bump = (months: number, emi: number) => {
    if (months > 0) { maxEmiMonths = Math.max(maxEmiMonths, months); totalEmi += emi }
  }

  ;(loans ?? []).forEach(l => { const m = getEff(l).pending; if (m > 0) bump(m, Number(l.emi ?? 0)) })
  ;(cards ?? []).forEach(c => (c.emis ?? []).forEach((e: any) => { const m = getEff(e).pending; if (m > 0) bump(m, Number(e.emi ?? 0)) }))
  ;(savings ?? []).filter(s => s.prizeTaken || s.mode === 'withdrew').forEach(s => { const m = getEff(s).pending; if (m > 0) bump(m, Number(s.monthly ?? 0)) })

  let intOnlyMonths = 0
  const intOnlyPrincipals: number[] = []
  ;(personal ?? []).forEach(p => {
    const f = ioweFacts(p)
    if (f.mode === 'lump') return
    if (f.mode === 'interest-only') { intOnlyPrincipals.push(Number(p.amount ?? 0)); return }
    const m = getEff(p).pending
    if (m > 0) bump(m, Number(p.emi ?? 0))
  })
  intOnlyPrincipals.forEach(princ => { intOnlyMonths += Math.ceil(princ / (totalEmi || 1)) })

  return maxEmiMonths + intOnlyMonths
}

export function addMonthsLabel(months: number, long = false): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' })
}
