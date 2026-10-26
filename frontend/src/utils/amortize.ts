// True amortization schedule using Newton-Raphson to find monthly rate
export interface AmortRow {
  month: number
  openingBalance: number
  emi: number
  interest: number
  principal: number
  closingBalance: number
}

export function getMonthlyRate(principal: number, emi: number, tenure: number): number {
  if (principal <= 0 || emi <= 0 || tenure <= 0) return 0
  // Newton-Raphson
  let r = 0.01
  for (let i = 0; i < 200; i++) {
    const pw = Math.pow(1 + r, tenure)
    const f = principal * r * pw / (pw - 1) - emi
    const fd = principal * (pw * (tenure * r - tenure - 1) + tenure) / Math.pow(pw - 1, 2)
    const delta = f / (fd || 1)
    r -= delta
    if (Math.abs(delta) < 0.0000001) break
  }
  return Math.max(0, r)
}

export function buildSchedule(principal: number, emi: number, tenure: number, extraPayments: Record<number, number> = {}): AmortRow[] {
  const r = getMonthlyRate(principal, emi, tenure)
  const rows: AmortRow[] = []
  let balance = principal

  for (let m = 1; m <= tenure && balance > 0.01; m++) {
    const interest = r > 0 ? balance * r : 0
    const extra = extraPayments[m] ?? 0
    const principalPaid = Math.min(balance, emi - interest + extra)
    const closing = Math.max(0, balance - principalPaid)
    rows.push({ month: m, openingBalance: balance, emi: emi + extra, interest, principal: principalPaid, closingBalance: closing })
    balance = closing
  }
  return rows
}

export function getAmortSummary(principal: number, emi: number, tenure: number, paidMonths: number, extraPayments: Record<number, number> = {}) {
  const schedule = buildSchedule(principal, emi, tenure, extraPayments)
  const paid = schedule.slice(0, paidMonths)
  const remaining = schedule.slice(paidMonths)
  return {
    schedule,
    principalPaid: paid.reduce((s, r) => s + r.principal, 0),
    interestPaid: paid.reduce((s, r) => s + r.interest, 0),
    principalLeft: remaining.reduce((s, r) => s + r.principal, 0),
    interestLeft: remaining.reduce((s, r) => s + r.interest, 0),
    monthsLeft: remaining.length,
    totalInterest: schedule.reduce((s, r) => s + r.interest, 0),
  }
}
