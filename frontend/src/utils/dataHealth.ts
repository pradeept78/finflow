import { getEff } from './format'
import { hasEnded } from './ended'
import { calcLoanSplit } from './loanCalc'
import { ioweFacts } from './iowe'

/**
 * Records the app can't keep up to date on its own — each one is a place where a number will quietly go stale.
 * Most of the "why is this page showing a different figure?" questions trace back to one of these: no start date or tenure
 * (so months can't be counted), a bank-statement principal that disagrees with the EMIs left, a SIP with no start date,
 * a bill that has ended but is still switched on.
 */
export interface HealthIssue {
  key: string
  level: 'fix' | 'check'
  /** Which record. */
  label: string
  /** What the record is (Loan, Card EMI…) — shown as a tag. */
  kind: string
  /** What is missing / wrong, and what it affects. */
  why: string
  to: string
}

interface Data { loans?: any[]; cards?: any[]; personal?: any[]; savings?: any[]; investments?: any[]; expenses?: any[]; insurance?: any[] }

const noSchedule = (v: any) => !v?.startDate || !(Number(v?.tenure) > 0)

export function dataHealth(d: Data): HealthIssue[] {
  const out: HealthIssue[] = []
  const add = (i: HealthIssue) => out.push(i)

  ;(d.loans ?? []).forEach(l => {
    if (l.active === false) return
    if (noSchedule(l)) add({ key: `loan-${l.id}`, level: 'fix', kind: 'Loan', label: l.lender, to: '/loans', why: `no ${!l.startDate ? 'start date' : 'tenure'} — instalments paid can't be counted by date, so "EMIs left" won't move on its own` })
    const stmt = Number(l.principalPaid ?? 0), emi = Number(l.emi ?? 0), left = getEff(l).pending
    if (stmt > 0 && emi > 0 && Number(l.tenure) > 0 && stmt > emi * left + 1) {
      const sp = calcLoanSplit(Number(l.amount ?? 0), emi, Number(l.tenure), getEff(l).paid, stmt)
      if (sp.capped) add({ key: `loanstmt-${l.id}`, level: 'check', kind: 'Loan', label: l.lender, to: '/loans', why: `bank-statement principal ₹${Math.round(stmt).toLocaleString('en-IN')} is more than the ${left} EMIs left can repay (₹${Math.round(emi * left).toLocaleString('en-IN')}) — the EMI total is being used` })
    }
  })

  ;(d.cards ?? []).forEach(c => (c.emis ?? []).forEach((e: any) => {
    if (noSchedule(e) && !(Number(e.pending) > 0 || Number(e.paid) > 0)) add({ key: `cemi-${e.id}`, level: 'fix', kind: 'Card EMI', label: `${c.banker} · ${e.label}`, to: '/cards', why: `no ${!e.startDate ? 'start date' : 'tenure'} — instalments left can't be worked out` })
  }))

  ;(d.personal ?? []).forEach(p => {
    if (p.active === false) return
    const f = ioweFacts(p)
    if (f.mode === 'lump' || f.mode === 'interest-only') return
    if (Number(p.emi ?? 0) > 0 && noSchedule(p)) add({ key: `iowe-${p.id}`, level: 'check', kind: 'I Owe', label: p.person ?? p.name, to: '/personal', why: `has an EMI but no ${!p.startDate ? 'start date' : 'tenure'} — it will never count down` })
  })

  ;(d.savings ?? []).forEach(v => {
    if (v.active === false) return
    if (Number(v.monthly ?? 0) > 0 && noSchedule(v) && !(Number(v.paid) > 0 || Number(v.pending) > 0)) add({ key: `sav-${v.id}`, level: 'fix', kind: 'Savings / chit', label: v.name, to: '/savings', why: `no ${!v.startDate ? 'start date' : 'tenure'} — the corpus can't grow month by month` })
  })

  ;(d.investments ?? []).forEach(v => {
    if (v.active === false) return
    if (Number(v.monthly ?? 0) > 0 && !v.startDate) add({ key: `sip-${v.id}`, level: 'fix', kind: 'SIP', label: v.name, to: '/investments', why: 'has a monthly amount but no start date — "invested" can\'t grow with each instalment' })
    else if (v.currentValue == null && v.maturityValue == null && Number(v.totalInvested ?? 0) > 0) add({ key: `invval-${v.id}`, level: 'check', kind: 'Investment', label: v.name, to: '/investments', why: 'no current value entered — shown at what was invested (0% return)' })
  })

  ;[['Bill', d.expenses, '/expenses', (v: any) => v.label], ['Insurance', d.insurance, '/insurance', (v: any) => v.name], ['SIP', d.investments, '/investments', (v: any) => v.name]].forEach(([kind, list, to, nm]: any) => {
    ;(list ?? []).forEach((v: any) => { if (v.active !== false && hasEnded(v)) add({ key: `end-${kind}-${v.id}`, level: 'check', kind, label: nm(v), to, why: `ended on ${new Date(v.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} but is still switched on (no longer counted — switch it off or move the end date)` }) })
  })

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'fix' ? -1 : 1))
}
