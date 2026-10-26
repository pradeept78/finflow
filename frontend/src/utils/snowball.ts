// Snowball simulation engine — true month-by-month
export interface SimDebt {
  id: string
  label: string
  emi: number
  monthsLeft: number
  intLeft: number
  princLeft: number
  isLumpSum?: boolean
  isInterestOnly?: boolean
  interestRate?: number
  type: string
  color: string
}

export interface SimEvent {
  month: number
  date: string
  closedDebts: string[]
  freedEmi: number
  totalFreed: number
}

export interface SimResult {
  months: number
  debtFreeDate: string
  intSaved: number
  scheduleByItem: Record<string, number>
  timeline: SimEvent[]
}

function addMonths(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export function runSnowball(
  debts: SimDebt[],
  extraPerMonth: number = 0,
  variableExtra: Record<number, number> = {},
  lumpSumPayments: Record<string, number> = {}
): SimResult {
  if (!debts.length) return { months: 0, debtFreeDate: addMonths(0), intSaved: 0, scheduleByItem: {}, timeline: [] }

  const emiDebts = debts
    .filter(d => !d.isLumpSum && !d.isInterestOnly)
    .map(d => ({ ...d, remaining: d.monthsLeft, done: false }))
    .sort((a, b) => a.monthsLeft - b.monthsLeft) // shortest tenure first = frees cash soonest

  const intOnlyDebts = debts
    .filter(d => d.isInterestOnly)
    .map(d => ({ ...d, balance: d.princLeft - (lumpSumPayments[d.id] ?? 0), done: false }))

  const lumpSums = debts.filter(d => d.isLumpSum)

  // Apply lump sum to shortest EMI debts first
  let lumpRemaining = Object.values(lumpSumPayments).reduce((s, v) => s + v, 0)
  for (const debt of emiDebts) {
    if (lumpRemaining <= 0) break
    const reduce = Math.min(lumpRemaining, debt.princLeft)
    // Reduce months proportionally: months saved = reduce / emi
    const monthsSaved = Math.floor(reduce / debt.emi)
    debt.remaining = Math.max(1, debt.remaining - monthsSaved)
    lumpRemaining -= reduce
  }

  const baselineMonths = Math.max(...emiDebts.map(d => d.monthsLeft), 1)
  let freedEmi = 0
  const scheduleByItem: Record<string, number> = {}
  const timeline: SimEvent[] = []

  for (const ls of lumpSums) {
    scheduleByItem[ls.id] = 1
  }

  let month = 0

  // Phase 1: Pay off EMI debts with snowball
  while (emiDebts.some(d => !d.done) && month < 600) {
    month++
    const extra = (variableExtra[month] ?? extraPerMonth) + freedEmi
    const target = emiDebts.find(d => !d.done)!
    const closedThisMonth: string[] = []

    for (const debt of emiDebts) {
      if (debt.done) continue
      debt.remaining = Math.max(0, debt.remaining - 1)

      // Extra only goes to current target
      if (debt === target && extra > 0 && debt.remaining > 0) {
        const monthsSaved = Math.min(debt.remaining, Math.floor(extra / debt.emi))
        debt.remaining = Math.max(0, debt.remaining - monthsSaved)
      }

      if (debt.remaining <= 0) {
        debt.done = true
        scheduleByItem[debt.id] = month
        freedEmi += debt.emi
        closedThisMonth.push(debt.label)
      }
    }

    if (closedThisMonth.length > 0) {
      timeline.push({ month, date: addMonths(month), closedDebts: closedThisMonth, freedEmi, totalFreed: freedEmi })
    }
  }

  // Phase 2: Use all freed EMI + extra toward interest-only debts
  const totalAvailableForIntOnly = freedEmi + extraPerMonth
  for (const debt of intOnlyDebts) {
    if (debt.balance <= 0) { scheduleByItem[debt.id] = month; continue }
    if (totalAvailableForIntOnly <= 0) continue
    const monthsToClose = Math.ceil(debt.balance / totalAvailableForIntOnly)
    month += monthsToClose
    scheduleByItem[debt.id] = month
    timeline.push({ month, date: addMonths(month), closedDebts: [debt.label], freedEmi: totalAvailableForIntOnly, totalFreed: totalAvailableForIntOnly })
  }

  const avgMonthlyInt = emiDebts.reduce((s, d) => s + d.intLeft / (d.monthsLeft || 1), 0)
  const intSaved = Math.max(0, Math.round((baselineMonths - month) * avgMonthlyInt))

  return { months: month, debtFreeDate: addMonths(month), intSaved, scheduleByItem, timeline }
}
