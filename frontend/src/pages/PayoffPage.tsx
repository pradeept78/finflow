import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, incomeApi, savingsApi, expensesApi, insuranceApi, investmentsApi } from '../api'
import { fmtINR, getEff, toMonthly, isOneOff, monthlyIncomeTotal, freqMonths } from '../utils/format'
import { calcLoanSplit } from '../utils/loanCalc'
import { LoadingSpinner, PageHeader, ErrorState, FromLink } from '../components/common'
import { runSnowball, type SimDebt } from '../utils/snowball'
import { calcDebt } from '../utils/calcDebt'
import { ioweFacts } from '../utils/iowe'
import { debtFreeMonths as sharedDebtFreeMonths } from '../utils/debtFree'

const COLORS = ['bg-blue-500','bg-purple-500','bg-orange-500','bg-pink-500','bg-yellow-500','bg-green-500','bg-red-500','bg-teal-500','bg-indigo-500','bg-rose-500']

function addMonths(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export default function PayoffPage() {
  const { data: loans = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: cards = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: personal = [], isLoading: l3, isError: e3, refetch: r3 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: savings = [], isLoading: l4, isError: e4, refetch: r4 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: incomeEntries = [], isLoading: l5, isError: e5, refetch: r5 } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const { data: expenses = [], isLoading: l6, isError: e6, refetch: r6 } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const { data: insurance = [], isLoading: l7, isError: e7, refetch: r7 } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const { data: investments = [], isLoading: l8, isError: e8, refetch: r8 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  // Was `l1||l2||l3` for loading and had NO isError anywhere in this file — a failure in any of
  // these 8 queries (5 of which had no tracking at all) rendered silently with partial data instead
  // of an error state.
  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8
  const isError = e1||e2||e3||e4||e5||e6||e7||e8
  const refetch = () => { r1();r2();r3();r4();r5();r6();r7();r8() }

  const [extraPerMonth, setExtraPerMonth] = useState(0)
  const [inputVal, setInputVal] = useState('')
  const [showVariable, setShowVariable] = useState(false)
  const [variableMonths, setVariableMonths] = useState<Record<number, number>>({})
  const [includeLumpSums, setIncludeLumpSums] = useState(true)
  const [expandedLoan, setExpandedLoan] = useState<string|null>(null)
  const [expandedScheduleStep, setExpandedScheduleStep] = useState<number|null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['current']))
  const toggleSection = (s: string) => setOpenSections(p => { const n=new Set(p); n.has(s)?n.delete(s):n.add(s); return n })
  const [refinanceIds, setRefinanceIds] = useState<Set<string>>(new Set())
  const refinanceId = refinanceIds.size === 1 ? [...refinanceIds][0] : refinanceIds.size > 1 ? 'multi' : null
  const [refinanceRate, setRefinanceRate] = useState(0)

  // Income — monthly-equivalent total (frequency-aware), same calculation used everywhere else
  // (Budget, Break Savings, Hub). Was checking a nonexistent `endDate` field (IncomeEntry has no
  // such field — only `active`) and summing raw `amount` with no frequency conversion, so a Yearly
  // bonus counted as if it were paid every month.
  const currentIncome = monthlyIncomeTotal(incomeEntries as any[])

  // Build debt items
  const allDebts: SimDebt[] = useMemo(() => {
    const items: SimDebt[] = []
    let ci = 0

    // Loans
    loans.filter(l => getEff(l).pending > 0).forEach(l => {
      const eff = getEff(l)
      const t = l.tenure ?? (eff.paid + eff.pending)
      const sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, eff.paid, l.principalPaid ?? undefined)
      items.push({ id: `loan-${l.id}`, label: l.lender, emi: l.emi ?? 0, monthsLeft: eff.pending, princLeft: sp.princLeft, intLeft: sp.intLeft, type: 'Loan', color: COLORS[ci++ % COLORS.length], interestRate: l.interestRate })
    })

    // CC EMIs
    cards.forEach(c => {
      ;(c.emis ?? []).filter((e: any) => getEff(e).pending > 0).forEach((e: any) => {
        const eff = getEff(e)
        items.push({ id: `emi-${e.id}`, label: `${c.banker} — ${e.label}`, emi: e.emi ?? 0, monthsLeft: eff.pending, princLeft: (e.principal ?? 0) * (eff.pending / (e.tenure ?? 1)), intLeft: Math.max(0, (e.emi ?? 0) * eff.pending - (e.principal ?? 0)), type: 'CC EMI', color: COLORS[ci++ % COLORS.length] })
      })
    })

    // Withdrawn chit balances
    ;(savings as any[]).filter(s => (s.prizeTaken || s.mode === 'withdrew') && getEff(s).pending > 0).forEach(s => {
      const eff = getEff(s)
      items.push({ id: `chit-${s.id}`, label: `${s.name} (chit balance)`, emi: Number(s.monthly ?? 0), monthsLeft: eff.pending, princLeft: eff.pending * Number(s.monthly ?? 0), intLeft: 0, type: 'I Owe', color: COLORS[ci++ % COLORS.length] })
    })

    // I Owe
    ;(personal as any[]).forEach(p => {
      /* This page used to require an `interestRate` to be entered before it would recognise an
         interest-only entry (`rate > 0 && emi <= monthlyInt * 1.1`), so an entry with no rate
         recorded was simulated as amortising and appeared to clear itself. The shared classifier
         infers the mode from the payback date, the arithmetic, or the absence of a schedule. */
      const f = ioweFacts(p)
      const isLumpSum = f.mode === 'lump'
      const isIntOnly = f.mode === 'interest-only'
      const monthlyInt = f.monthly

      if (isLumpSum && Number(p.amount ?? 0) > 0) {
        items.push({ id: `personal-${p.id}`, label: `${p.person} (I Owe)`, emi: Number(p.amount ?? 0), monthsLeft: 1, princLeft: Number(p.amount ?? 0), intLeft: 0, type: 'I Owe', color: COLORS[ci++ % COLORS.length], isLumpSum: true })
      } else if (isIntOnly) {
        items.push({ id: `personal-${p.id}`, label: `${p.person} (I Owe — interest only)`, emi: monthlyInt, monthsLeft: 999, princLeft: Number(p.amount ?? 0), intLeft: Number(p.amount ?? 0), type: 'I Owe', color: COLORS[ci++ % COLORS.length], isInterestOnly: true })
      } else {
        // Amortising: was `Number(p.amount ?? 0)` — the ORIGINAL amount, not what's actually left
        // after months already paid. `f.principalLeft` (= amount - paidDown) is the correct
        // starting balance for the snowball sim; using the original amount overstated how much is
        // still owed on any entry already partway through, and made the payoff timeline too long.
        const eff = getEff(p)
        if (eff.pending > 0) {
          items.push({ id: `personal-${p.id}`, label: `${p.person} (I Owe)`, emi: p.emi ?? 0, monthsLeft: eff.pending, princLeft: f.principalLeft, intLeft: Math.max(0, (p.emi ?? 0) * eff.pending - f.principalLeft), type: 'I Owe', color: COLORS[ci++ % COLORS.length] })
        }
      }
    })

    // CC Outstanding
    if (includeLumpSums) {
      ;(cards as any[]).filter(c => (c.outstanding ?? 0) > 0).forEach(c => {
        items.push({ id: `out-${c.id}`, label: `${c.banker} Outstanding`, emi: c.outstanding ?? 0, monthsLeft: 1, princLeft: c.outstanding ?? 0, intLeft: 0, type: 'CC Outstanding', color: COLORS[ci++ % COLORS.length], isLumpSum: true })
      })
    }

    return items
  }, [loans, cards, personal, savings, includeLumpSums])

  // Run simulations
  // Current pace = max pending months (no cascade, no snowball)
  // Refinance simulation - rebuild debt items with new rate for selected loan
  const refinanceDebts = useMemo(() => {
    if (!refinanceIds.size || !refinanceRate) return allDebts
    return allDebts.map(d => {
      if (!refinanceIds.has(d.id)) return d
      // Recalculate EMI with new interest rate on remaining principal
      const newMonthlyRate = refinanceRate / 100 / 12
      const newEmi = newMonthlyRate > 0 && d.monthsLeft > 0
        ? Math.round(d.princLeft * newMonthlyRate * Math.pow(1 + newMonthlyRate, d.monthsLeft) / (Math.pow(1 + newMonthlyRate, d.monthsLeft) - 1))
        : d.monthsLeft > 0 ? Math.round(d.princLeft / d.monthsLeft) : d.emi
      const newIntLeft = Math.max(0, newEmi * d.monthsLeft - d.princLeft)
      return { ...d, emi: newEmi, intLeft: newIntLeft }
    })
  }, [allDebts, refinanceIds, refinanceRate])

  const refinanceResult = useMemo(() =>
    refinanceIds.size && refinanceRate ? runSnowball(refinanceDebts, extraPerMonth, variableMonths) : null,
    [refinanceDebts, refinanceIds, refinanceRate, extraPerMonth, variableMonths])

  // Shared with Dashboard / Hub / Closed Assets so the debt-free date is identical everywhere.
  const currentPaceMonths = useMemo(() => sharedDebtFreeMonths(loans as any[], cards as any[], personal as any[], savings as any[]), [loans, cards, personal, savings])

  // Snowball = cascade freed EMIs
  const snowballOnly = useMemo(() => runSnowball(allDebts, 0), [allDebts])
  const withExtra = useMemo(() => runSnowball(allDebts, extraPerMonth, variableMonths), [allDebts, extraPerMonth, variableMonths])

  const emiDebts = allDebts.filter(d => !d.isLumpSum && !d.isInterestOnly)
    .sort((a, b) => a.monthsLeft - b.monthsLeft)
  const interestOnlyDebts = allDebts.filter(d => d.isInterestOnly)
  const lumpSumDebts = allDebts.filter(d => d.isLumpSum)
  const totalEmi = emiDebts.reduce((s, d) => s + d.emi, 0)
  const totalIntLeft = emiDebts.reduce((s, d) => s + d.intLeft, 0)
  const totalOutstanding = lumpSumDebts.reduce((s, d) => s + d.princLeft, 0)
  // Was summing every active expense's raw amount regardless of frequency — unlike totalInsurance
  // right below, which already special-cases Monthly/Single/renewal-window correctly. A Yearly
  // ₹1,20,000 school fee added the full ₹1,20,000 to this month's "fixed costs" instead of its true
  // ~₹10,000/mo share, directly corrupting freeMoney and every payoff/extra-payment recommendation
  // derived from it. toMonthly + isOneOff gives the true monthly-equivalent, one-time items excluded.
  const totalExpenses = (expenses as any[]).filter(e => e.active !== false && !isOneOff(e.frequency)).reduce((s, e) => s + toMonthly(e.amount, e.frequency), 0)
  // Was a special-cased "only count a non-monthly premium if its renewal falls within the next 30
  // days" rule — inconsistent with `totalExpenses` right above (and with `calcOutflow`, the shared
  // calculator every other page uses), which instead spreads a non-monthly amount into a steady
  // monthly-equivalent set-aside. The old rule made this page's "fixed costs" spike to the full
  // premium in the renewal month and silently drop it to zero every other month, which is exactly
  // the kind of month-to-month disagreement `calcOutflow` exists to prevent.
  const totalInsurance = (insurance as any[]).filter((v:any)=>v.active!==false && !isOneOff(v.frequency)).reduce((s:number,v:any)=>s+toMonthly(v.premium, v.frequency),0)
  // Real cash only (Monthly-frequency premiums) — same freqMonths(...)<=1 split calcOutflow.ts uses
  // everywhere else. `totalInsurance` just above smooths non-monthly premiums into the same figure,
  // which is fine for a "fixed costs" total but wrong for a payment SCHEDULE: a Yearly premium's
  // smoothed share isn't a real monthly charge that can "close" the way an EMI does, so it has no
  // business sitting in paymentSchedule below alongside things that actually drop off over time.
  const realInsuranceMo = (insurance as any[]).filter((v:any)=>v.active!==false && !isOneOff(v.frequency) && freqMonths(v.frequency)<=1).reduce((s:number,v:any)=>s+Number(v.premium??0),0)
  const totalSavingsMonthly = (savings as any[]).filter(s => getEff(s).pending > 0 && !s.prizeTaken && s.mode !== 'withdrew').reduce((s, sv) => s + Number(sv.monthly ?? 0), 0)
  const totalInvestments = (investments as any[]).filter(i => getEff(i).pending > 0).reduce((s, i) => s + Number(i.monthly ?? 0), 0)
  const totalCCSpends = (cards as any[]).reduce((s:number,card:any)=>(card.spends??[]).reduce((a:number,sp:any)=>a+Number(sp.amount??0),0)+s,0)
  const totalFixed = totalEmi + totalCCSpends + totalExpenses + totalInsurance + totalSavingsMonthly + totalInvestments
  const freeMoney = currentIncome - totalFixed
  const maxMonths = currentPaceMonths || 1
  const monthsSaved = Math.max(0, currentPaceMonths - withExtra.months)

  // Was `if (l1||l2||l3) return <LoadingSpinner/>` immediately followed by an identical
  // `if (isLoading) return <LoadingSpinner/>` a few lines later — dead, unreachable duplicate code,
  // and it ran the "You're debt free!" celebration check while savings/income/expenses/insurance/
  // investments could still be mid-fetch. Check isLoading/isError first, then the debt-free state.
  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your payoff data." onRetry={() => refetch()} />
  if (!allDebts.length) return <div className="rounded-2xl p-10 text-center" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}><div className="text-5xl mb-3">🎉</div><div className="font-bold text-xl text-green-400">You're debt free!</div></div>

  /* Was `d.remaining ?? 0` — `SimDebt` has no `remaining` field (it is `princLeft`), so this
     summed to zero on every render. The page reported "TOTAL DEBT ₹0 · 7 active debts" and a debt
     free date of this month. The `(d:any)` annotation is why tsc never flagged it.
     Headline now comes from the shared calculator so Payoff agrees with Hub and Dashboard. */
  const dShared = calcDebt(loans as any[], cards as any[], personal as any[], savings as any[])
  const totalDebt = dShared.total
  const totalEmiAll = allDebts.reduce((s:number,d:any)=>s+(d.emi??0),0)
  /* Was `d.months??0` — SimDebt items only ever carry `monthsLeft` (see `allDebts` above); `months`
     only exists on the *result* of runSnowball(). This always evaluated to 0, so the hero and this
     stat card showed "0 months away" / the current month even with a nonzero Total Debt right next
     to it. `currentPaceMonths` (already computed above from `monthsLeft`) is the correct figure. */
  const debtFreeMonths = currentPaceMonths
  const debtFreeDate = (()=>{const d=new Date();d.setMonth(d.getMonth()+debtFreeMonths);return d.toLocaleDateString('en-IN',{month:'short',year:'numeric'})})()
  const debtFreeDateLong = (()=>{const d=new Date();d.setMonth(d.getMonth()+debtFreeMonths);return d.toLocaleDateString('en-IN',{month:'long',year:'numeric'})})()

  // ── Monthly Payment Schedule ──
  // Combined Loans + CC EMIs + Chit Repayment (+ I Owe) + real-cash Insurance, and how that
  // combined total naturally steps DOWN as each one finishes. Deliberately the "minimum payments,
  // no snowball" numbers — with snowball, a freed EMI gets redirected into the next debt instead of
  // becoming free cash, so the combined total wouldn't actually drop, which is the opposite of what
  // this is answering ("how much will I actually owe per month from here"). Built from `allDebts`
  // directly (not `runSnowball`) for exactly that reason: `d.monthsLeft` is each item's own natural
  // payoff length, untouched by any extra-payment or snowball redirection elsewhere on this page.
  // Grouped into contiguous flat-total steps (collapsing however many months share a total) rather
  // than one row per month, since a 20-year loan would otherwise mean 240 identical rows.
  // Plain computation, not useMemo: this sits after the isLoading/isError/debt-free early returns
  // above, and a useMemo here would be a hook called on some renders but not others (the loading
  // render returns before ever reaching this line) — exactly the "Rendered more hooks than during
  // the previous render" crash. Nothing else after those early returns in this file uses useMemo
  // either (see debtFreeDate right above), so a plain const matches the page's own convention.
  const paymentSchedule = (() => {
    const items = allDebts.filter(d => !d.isLumpSum)
    // Interest-only items carry the 999 sentinel (see allDebts above) — they never close on their
    // own within any normal horizon, so they're excluded from the closure-month list but still
    // count in every step's total and `active` list below (their own `monthsLeft` of 999 makes
    // that obvious in the per-item breakdown too — "ongoing", not a date).
    const closureMonths = [...new Set(items.filter(d => d.monthsLeft < 900).map(d => d.monthsLeft))].sort((a, b) => a - b)
    const steps: { fromMonth: number; toMonth: number | null; total: number; closing: { label: string; emi: number }[]; active: { label: string; emi: number; monthsLeft: number }[] }[] = []
    // `active` is the full per-item breakdown for that step — every loan/CC EMI/chit/I-Owe item
    // (plus insurance, folded in as its own synthetic row) still being paid during that month
    // range, each with its own remaining EMI — not just which ones close. This is what expands
    // under a step on click, so "₹80,000/mo" doesn't stay a black box.
    let activeItems = [...items]
    let stepStart = 1
    const withInsurance = (list: typeof items) => {
      const rows = list.map(d => ({ label: d.label, emi: d.emi, monthsLeft: d.monthsLeft }))
      return realInsuranceMo > 0 ? [...rows, { label: 'Insurance (monthly premiums)', emi: realInsuranceMo, monthsLeft: 999 }] : rows
    }
    closureMonths.forEach(closeMonth => {
      const closingItems = activeItems.filter(d => d.monthsLeft === closeMonth)
      const total = activeItems.reduce((s, d) => s + d.emi, 0) + realInsuranceMo
      steps.push({ fromMonth: stepStart, toMonth: closeMonth, total, closing: closingItems.map(d => ({ label: d.label, emi: d.emi })), active: withInsurance(activeItems) })
      activeItems = activeItems.filter(d => d.monthsLeft !== closeMonth)
      stepStart = closeMonth + 1
    })
    const finalTotal = activeItems.reduce((s, d) => s + d.emi, 0) + realInsuranceMo
    steps.push({ fromMonth: stepStart, toMonth: null, total: finalTotal, closing: [], active: withInsurance(activeItems) })
    return steps
  })()

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Payoff Simulator"/>
      {allDebts.length > 0 && (
        <div className="rounded-2xl px-5 py-4 relative overflow-hidden" style={{background:'linear-gradient(180deg, color-mix(in srgb, var(--purple) 6%, var(--bg-card)) 0%, var(--bg-card) 75%)',border:'1px solid var(--hairline)'}}>
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color:'var(--text-muted)'}}><span className="w-1.5 h-1.5 rounded-full" style={{background:'var(--purple)'}}/>Debt-free date</div>
              <div className="text-[34px] leading-none font-semibold tracking-tight tabular-nums" style={{color:'var(--text)'}}>{debtFreeDateLong}</div>
              <div className="text-[13px] mt-1.5" style={{color:'var(--text-faint)'}}>{debtFreeMonths > 0 ? `${debtFreeMonths} months away` : 'Calculate below'} · {fmtINR(totalDebt)} total debt</div>
            </div>
            <div className="flex gap-4 flex-wrap">
              {[
                {label:'Monthly payments', val:fmtINR(totalEmiAll), color:'var(--danger)'},
                {label:'Steady free/mo', val:`${freeMoney>=0?'+':'-'}${fmtINR(Math.abs(freeMoney))}`, color:freeMoney>=0?'var(--success)':'var(--warning)'},
              ].map(m=>(
                <div key={m.label} className="text-right pl-4" style={{borderLeft:'1px solid var(--hairline)'}}>
                  <div className="text-[12px] font-medium mb-0.5" style={{color:'var(--text-muted)'}}>{m.label}</div>
                  <div className="text-[22px] font-semibold tracking-tight tabular-nums" style={{color:m.color}}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Income vs total outgoing */}
      {currentIncome > 0 && (
        <div className={`card px-4 py-2.5 border ${freeMoney < 0 ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/20 bg-green-500/5'}`}>
          <div className="flex flex-wrap gap-3 text-[13px] items-center">
            <span>Income: <span className="mono text-green-400 font-bold">{fmtINR(currentIncome)}/mo</span></span>
            <span style={{color:'var(--text-muted)'}}>−</span>
            <span>EMIs: <span className="mono text-red-400">{fmtINR(totalEmi)}</span></span>
            <span style={{color:'var(--text-muted)'}}>−</span>
            <span>Expenses+Insurance: <span className="mono text-orange-400">{fmtINR(totalExpenses + totalInsurance)}</span></span>
            {(totalSavingsMonthly + totalInvestments) > 0 && <>
              <span style={{color:'var(--text-muted)'}}>−</span>
              <span>Savings+SIP: <span className="mono text-blue-400">{fmtINR(totalSavingsMonthly + totalInvestments)}</span></span>
            </>}
            <span style={{color:'var(--text-muted)'}}>=</span>
            <span className={`font-bold text-[13px] ${freeMoney < 0 ? 'text-red-400' : 'text-green-400'}`}>
              {freeMoney < 0 ? `🚨 Short ${fmtINR(Math.abs(freeMoney))}/mo` : `✅ Free: ${fmtINR(freeMoney)}/mo`}
            </span>
            <FromLink to="/break-savings" className="btn btn-xs bg-blue-500/20 text-blue-400 ml-auto">Full Cash Flow →</FromLink>
          </div>
        </div>
      )}

      {/* Scenario cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 border-red-500/20" style={{background:"var(--bg-card)"}}>
          <div className="text-[14px] font-semibold mb-2" style={{color:'var(--text-muted)'}}>Current Pace</div>
          <div className="text-3xl font-bold mono text-red-400">{currentPaceMonths} <span className="text-lg">mo</span></div>
          <div className="font-semibold mt-1">{addMonths(currentPaceMonths)}</div>
          <div className="text-[11px] mt-2" style={{color:'var(--text-faint)'}}>Pay minimums, no snowball</div>
          <div className="mono text-[13px] mt-1" style={{color:'var(--text-muted)'}}>{fmtINR(totalIntLeft)} interest left</div>
        </div>
        <div className="rounded-2xl p-4 border-yellow-500/20" style={{background:"var(--bg-card)"}}>
          <div className="text-[14px] font-semibold mb-2" style={{color:'var(--text-muted)'}}>Snowball</div>
          <div className="text-3xl font-bold mono text-yellow-400">{snowballOnly.months} <span className="text-lg">mo</span></div>
          <div className="font-semibold mt-1">{snowballOnly.debtFreeDate}</div>
          <div className="text-[11px] mt-2 text-yellow-400">Redirect freed EMIs — free</div>
          {snowballOnly.months < currentPaceMonths && <div className="text-green-400 text-[13px] mt-1">🎯 Save {currentPaceMonths - snowballOnly.months} months FREE</div>}
        </div>
        <div className="rounded-2xl p-4 border-green-500/20" style={{background:"var(--bg-card)"}}>
          <div className="text-[14px] font-semibold mb-2" style={{color:'var(--text-muted)'}}>{extraPerMonth > 0 ? `Snowball + ${fmtINR(extraPerMonth)}/mo` : 'With Extra Payment'}</div>
          <div className="text-3xl font-bold mono text-green-400">{withExtra.months} <span className="text-lg">mo</span></div>
          <div className="font-semibold mt-1">{withExtra.debtFreeDate}</div>
          {monthsSaved > 0 && <>
            <div className="text-green-400 font-semibold text-[13px] mt-2">🎯 Save {monthsSaved} months</div>
            <div className="text-green-400 text-[13px]">💰 Save {fmtINR(withExtra.intSaved)} interest</div>
          </>}
          {extraPerMonth === 0 && <div className="text-[11px] mt-2" style={{color:'var(--text-faint)'}}>Set extra payment below</div>}
        </div>
      </div>

      {/* Extra payment */}
      <div className="rounded-2xl p-5 mb-4" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Extra Payment / Month</div>
          <div className="flex items-center gap-2">
            <span style={{color:'var(--text-muted)'}}>₹</span>
            <input className="input w-32 text-right mono font-semibold text-[13px] py-1.5" type="number" placeholder="0"
              value={inputVal} onChange={e => { setInputVal(e.target.value); setExtraPerMonth(+e.target.value || 0) }} />
            <button className="btn-secondary btn-sm" onClick={() => setShowVariable(!showVariable)}>
              {showVariable ? 'Fixed' : 'Variable by month'}
            </button>
          </div>
        </div>
        <input type="range" aria-label="Extra payment per month" min={0} max={Math.min(300000, totalEmi * 2)} step={1000} value={extraPerMonth}
          onChange={e => { setExtraPerMonth(+e.target.value); setInputVal(String(+e.target.value)) }}
          className="w-full accent-orange-500 mb-2" />
        <div className="flex justify-between text-[11px]" style={{color:'var(--text-muted)'}}>
          <span>₹0</span>
          <span>{fmtINR(Math.round(totalEmi * 0.5))}</span>
          <span>{fmtINR(totalEmi)} (match EMIs)</span>
          <span>{fmtINR(totalEmi * 2)}</span>
        </div>
        {freeMoney > 0 && <div className="text-[11px] text-green-400 mt-2">💡 You have {fmtINR(freeMoney)}/mo free — put it here to save interest</div>}
      </div>

      {/* Refinance scenario */}
      <div className="rounded-2xl p-5 mb-4" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
        <div className="text-[14px] font-semibold mb-3" style={{color:'var(--text-muted)'}}>What If I Refinance?</div>
        {emiDebts.length === 0 && (
          <div className="text-[11px] mb-3" style={{color:'var(--text-muted)'}}>No active EMI loans found. Add loans with pending months to simulate refinancing.</div>
        )}
        {emiDebts.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px]" style={{color:'var(--text-muted)'}}>Select loans:</span>
              <button className="btn btn-xs btn-secondary" onClick={() => setRefinanceIds(new Set(emiDebts.map(d => d.id)))}>All</button>
              <button className="btn btn-xs btn-secondary" onClick={() => setRefinanceIds(new Set())}>None</button>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[13px]" style={{color:'var(--text-muted)'}}>New rate:</span>
                <input className="input w-24 mono text-[13px] py-1.5" type="number" step="0.1" placeholder="8.5"
                  value={refinanceRate || ''} onChange={e => setRefinanceRate(+e.target.value || 0)} />
                <span className="text-[13px]" style={{color:'var(--text-muted)'}}>% p.a.</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {emiDebts.map(d => {
                const sel = refinanceIds.has(d.id)
                return (
                  <button key={d.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] transition-all ${sel ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-orange-500/30'}`}
                    onClick={() => {
                      const next = new Set(refinanceIds)
                      if (sel) next.delete(d.id); else { next.add(d.id); if (d.interestRate && !refinanceRate) setRefinanceRate(d.interestRate) }
                      setRefinanceIds(next)
                    }}>
                    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[11px] ${sel ? 'bg-green-500 border-green-500 text-white' : 'border-[var(--border)]'}`}>{sel ? '✓' : ''}</span>
                    <span className="font-semibold">{d.label}</span>
                    <span style={{color:'var(--text-faint)'}}>{fmtINR(d.emi)}/mo{d.interestRate ? ` @ ${d.interestRate}%` : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {refinanceResult && refinanceIds.size > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded-lg border border-red-500/20">
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>Current</div>
              <div className="mono font-bold text-red-400">{snowballOnly.months} mo</div>
              <div className="text-[11px]">{snowballOnly.debtFreeDate}</div>
              <div className="text-[11px] mt-1" style={{color:'var(--text-muted)'}}>Int left: {fmtINR(emiDebts.filter(d => refinanceIds.has(d.id)).reduce((s,d) => s + (d.intLeft ?? 0), 0))}</div>
            </div>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>After Refinance @{refinanceRate}%</div>
              <div className="mono font-bold text-green-400">{refinanceResult.months} mo</div>
              <div className="text-[11px]">{refinanceResult.debtFreeDate}</div>
              <div className="text-[11px] mt-1 text-green-400">
                New EMI: {fmtINR(refinanceDebts.filter(d => refinanceIds.has(d.id)).reduce((s,d) => s + (d.emi ?? 0), 0))}/mo ({refinanceIds.size} loan{refinanceIds.size > 1 ? 's' : ''})
              </div>
            </div>
            <div className="p-3 rounded-lg border border-blue-500/20">
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>Savings</div>
              <div className="mono font-bold text-blue-400">{Math.max(0, snowballOnly.months - refinanceResult.months)} months</div>
              <div className="text-[11px] text-blue-400">
                Interest saved: {fmtINR(refinanceResult.intSaved)}
              </div>
              <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>
                EMI diff: {fmtINR(Math.abs((emiDebts.find(d=>d.id===refinanceId)?.emi??0) - (refinanceDebts.find(d=>d.id===refinanceId)?.emi??0)))}/mo
              </div>
            </div>
          </div>
        )}
        
      </div>

      {/* Variable monthly */}
      {showVariable && (
        <div className="rounded-2xl p-4 mb-4" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="flex justify-between items-center mb-2 cursor-pointer select-none" onClick={() => toggleSection("variable")}><span className="text-[14px] font-semibold" style={{color:'var(--text-muted)'}}>📅 Variable Monthly Budget</span><span className="text-[11px] ">{openSections.has("variable") ? "▲" : "▼"}</span></div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1
              const d = new Date(); d.setMonth(d.getMonth() + i)
              const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
              return (
                <div key={m}>
                  <div className="text-[11px] mb-1 text-center" style={{color:'var(--text-muted)'}}>{label}</div>
                  <input className="input text-[11px] text-center w-full" type="number" placeholder={String(extraPerMonth)}
                    value={variableMonths[m] ?? ''}
                    onChange={e => setVariableMonths(prev => e.target.value === '' ? { ...prev } : { ...prev, [m]: +e.target.value })} />
                </div>
              )
            })}
          </div>
          {Object.keys(variableMonths).length > 0 && <button className="btn-secondary btn-sm mt-3" onClick={() => setVariableMonths({})}>Clear</button>}
        </div>
      )}

      {/* Visual bars */}
      <div className="rounded-2xl p-5 mb-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
        <div className="text-[14px] font-semibold mb-4" style={{color:'var(--text-muted)'}}>
          Visual Payoff Timeline
        </div>
        <div className="space-y-3">
          {[...allDebts.filter(d => !d.isLumpSum)].sort((a, b) => a.monthsLeft - b.monthsLeft).map(item => {
            const closesIn = withExtra.scheduleByItem[item.id] ?? item.monthsLeft
            const origClosesIn = item.monthsLeft
            const pct = Math.min(100, Math.round((closesIn / maxMonths) * 100))
            const origPct = Math.min(100, Math.round((origClosesIn / maxMonths) * 100))
            return (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-44 text-[11px] truncate flex-shrink-0" style={{color:'var(--text-muted)'}}>
                  {item.label}
                  {item.isInterestOnly && <span className="text-red-400 ml-1">⚠</span>}
                </div>
                <div className="flex-1 relative h-6 rounded overflow-hidden" style={{background:'var(--border)', minWidth:0}}>
                  {extraPerMonth > 0 && origClosesIn > closesIn && (
                    <div className={`h-full rounded ${item.color} opacity-20 absolute top-0 left-0`} style={{width:`${origPct}%`}} />
                  )}
                  <div className={`h-full rounded ${item.color} opacity-80 transition-all duration-500 relative`} style={{width:`${pct}%`}} />
                  <div className="absolute inset-0 flex items-center px-2">
                    <span className="text-[11px] text-white font-semibold drop-shadow">
                      {item.isInterestOnly ? 'Interest only' : `${closesIn}mo`} · {addMonths(closesIn)}
                      {extraPerMonth > 0 && origClosesIn > closesIn && <span className="ml-1 text-green-300">(-{origClosesIn - closesIn}mo)</span>}
                    </span>
                  </div>
                </div>
                <div className="w-24 text-right mono text-[11px] flex-shrink-0" style={{color:'var(--text-muted)'}}>
                  {fmtINR(item.emi)}/mo
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly Payment Schedule — the combined Loans+CC+Chit+Insurance total, and how it steps
          down as each one finishes (minimum payments, not snowballed — see paymentSchedule above). */}
      <div className="rounded-2xl p-5 mb-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
        <div className="flex justify-between items-center mb-4 cursor-pointer select-none" onClick={() => toggleSection("schedule")}>
          <div>
            <div className="text-[14px] font-semibold" style={{color:'var(--text-muted)'}}>📉 Monthly Payment Schedule</div>
            <div className="text-[12px] mt-0.5" style={{color:'var(--text-faint)'}}>Combined Loans + CC EMIs + Chit Repayment + I Owe + Insurance · minimum payments, not snowballed</div>
          </div>
          <span className="text-[11px]">{openSections.has("schedule") ? "▲" : "▼"}</span>
        </div>
        {openSections.has("schedule") && (
          <div className="space-y-1">
            {paymentSchedule.map((step, i) => (
              <div key={i}>
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer select-none"
                  style={{background: i % 2 ? 'color-mix(in srgb, var(--text) 4%, transparent)' : 'transparent'}}
                  onClick={() => setExpandedScheduleStep(p => p === i ? null : i)}
                >
                  <span className="text-[13px] font-medium flex items-center gap-1.5">
                    <span className="text-[11px]" style={{color:'var(--text-faint)'}}>{expandedScheduleStep === i ? '▾' : '▸'}</span>
                    {step.toMonth == null
                      ? `From ${addMonths(Math.max(0, step.fromMonth - 1))} onward`
                      : step.fromMonth === step.toMonth
                        ? addMonths(step.fromMonth - 1)
                        : `${addMonths(step.fromMonth - 1)} – ${addMonths(step.toMonth - 1)}`}
                  </span>
                  <span className="mono font-bold text-[14px]" style={{color: step.total > 0 ? (i === 0 ? 'var(--danger)' : 'var(--warning)') : 'var(--success)'}}>
                    {step.total > 0 ? `${fmtINR(step.total)}/mo` : 'Clear — ₹0/mo'}
                  </span>
                </div>
                {step.closing.length > 0 && (
                  <div className="ml-3 pl-3 border-l-2 border-dashed border-green-500/30 my-0.5 py-1 text-[11px] text-green-400">
                    ↓ {step.closing.map(c => c.label).join(', ')} {step.closing.length > 1 ? 'close' : 'closes'} → frees {fmtINR(step.closing.reduce((s,c)=>s+c.emi,0))}/mo
                  </div>
                )}
                {expandedScheduleStep === i && (
                  <div className="ml-3 pl-3 my-1 py-1 space-y-1" style={{borderLeft:'1px solid color-mix(in srgb, var(--text) 10%, transparent)'}}>
                    {step.active.length === 0 && (
                      <div className="text-[11px]" style={{color:'var(--text-faint)'}}>Nothing left — fully paid off.</div>
                    )}
                    {step.active.map((it, j) => (
                      <div key={j} className="flex items-center justify-between text-[11px]">
                        <span style={{color:'var(--text-muted)'}}>
                          {it.label}
                          {it.monthsLeft >= 900 && <span className="ml-1" style={{color:'var(--text-faint)'}}>(ongoing)</span>}
                        </span>
                        <span className="mono" style={{color:'var(--text-muted)'}}>{fmtINR(it.emi)}/mo</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {realInsuranceMo > 0 && (
              <div className="text-[11px] mt-2 px-3" style={{color:'var(--text-faint)'}}>
                Includes {fmtINR(realInsuranceMo)}/mo insurance (Monthly-frequency premiums) — it has no end date tracked, so it doesn't step down on its own; only loan/CC/chit/I Owe closures shrink the total above. A Yearly or Half-Yearly premium's smoothed set-aside isn't in this total at all — see the Cash Flow tab for that figure.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Snowball cascade */}
      <div className="rounded-2xl p-5 mb-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
        <div className="flex justify-between items-center mb-4 cursor-pointer select-none" onClick={() => toggleSection("snowball")}><div><div className="text-[14px] font-semibold" style={{color:'var(--text-muted)'}}>❄️ Snowball Cascade</div><div className="text-[12px] mt-0.5" style={{color:'var(--text-faint)'}}>How freed EMIs roll into next debt · order of payoff</div></div><span className="text-[11px] ">{openSections.has("snowball") ? "▲" : "▼"}</span></div>
        {openSections.has("snowball") && (<>
        <div className="space-y-3">
          {(() => {
            let runningFreed = extraPerMonth
            return emiDebts.map((item, i) => {
              const closesIn = withExtra.scheduleByItem[item.id] ?? item.monthsLeft
              const attackEmi = runningFreed
              runningFreed += item.emi
              const isLast = i === emiDebts.length - 1
              return (
                <div key={item.id}>
                  <div className="flex items-start gap-3">
                    <div className={`w-3 h-3 rounded-full mt-1 ${item.color} flex-shrink-0`} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[13px]">{item.label}</span>
                        <span className="badge text-[11px] badge-muted">{item.type}</span>
                        <span className="mono text-[11px] text-red-400">{fmtINR(item.emi)}/mo</span>
                        {attackEmi > 0 && <span className="mono text-[11px] text-green-400">+ {fmtINR(attackEmi)} freed</span>}
                        <span className="mono text-[11px] font-bold">= {fmtINR(item.emi + attackEmi)}/mo total</span>
                        <span className="text-[11px]" style={{color:'var(--text-muted)'}}>{item.monthsLeft}mo → closes {addMonths(closesIn)}</span>
                      </div>
                      {item.intLeft > 0 && <div className="text-[12px] mt-0.5" style={{color:'var(--text-faint)'}}>Int left: {fmtINR(item.intLeft)} · Principal: {fmtINR(item.princLeft)}</div>}
                    </div>
                  </div>
                  {!isLast && (
                    <div className="ml-4 pl-3 border-l-2 border-dashed border-green-500/30 my-1 py-0.5">
                      <div className="text-[11px] text-green-400">↓ frees {fmtINR(item.emi)}/mo → next attack: {fmtINR(runningFreed)}/mo</div>
                    </div>
                  )}
                </div>
              )
            })
          })()}

          {/* Post-EMI: freed money goes to interest-only */}
          {interestOnlyDebts.length > 0 && emiDebts.length > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
              <div className="text-[11px] font-bold text-orange-400 mb-2">After all EMIs close → {fmtINR(totalEmi)}/mo freed</div>
              {interestOnlyDebts.map(debt => {
                const monthsToClose = totalEmi > 0 ? Math.ceil(debt.princLeft / totalEmi) : 999
                return (
                  <div key={debt.id}>
                    <div className="text-[13px] font-semibold">{debt.label}</div>
                    <div className="text-[11px] mt-0.5" style={{color:'var(--text-muted)'}}>
                      {fmtINR(debt.princLeft)} ÷ {fmtINR(totalEmi)}/mo = <span className="text-orange-400 font-bold">{monthsToClose} months to clear</span>
                    </div>
                    <div className="text-[11px] text-orange-400">→ Debt free: {addMonths((withExtra.scheduleByItem[debt.id] ?? 0) || (currentPaceMonths + monthsToClose))}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Lump sums */}
          {lumpSumDebts.map(item => (
            <div key={item.id} className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <div>
                <span className="font-semibold text-[13px]">{item.label}</span>
                <span className="mono text-yellow-400 font-bold ml-2">{fmtINR(item.princLeft)}</span>
                <span className="text-[11px] text-yellow-400 ml-2">pay ASAP this billing cycle</span>
              </div>
            </div>
          ))}
        </div>
        </>)}
      </div>

      {/* Timeline events */}
      {(extraPerMonth > 0 ? withExtra : snowballOnly).timeline.filter(t => t.closedDebts.length > 0).length > 0 && (
        <div className="rounded-2xl p-5" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="flex justify-between items-center mb-2 cursor-pointer select-none" onClick={() => toggleSection("events")}><div><div className="text-[14px] font-semibold" style={{color:'var(--text-muted)'}}>⚡ Snowball Events</div><div className="text-[12px] mt-0.5" style={{color:'var(--text-faint)'}}>Timeline of debt closures · which month each loan gets paid off</div></div><span className="text-[11px] ">{openSections.has("events") ? "▲" : "▼"}</span></div>
          <div className={openSections.has("events") ? "" : "hidden"}>
          {(extraPerMonth > 0 ? withExtra : snowballOnly).timeline.filter(t => t.closedDebts.length > 0).length > 0 && (
            <div className="mb-3">
              <ResponsiveContainer width="100%" height={50}>
                <BarChart data={(extraPerMonth > 0 ? withExtra : snowballOnly).timeline.filter(t => t.closedDebts.length > 0).map((t:any) => ({ month: t.month, count: t.closedDebts.length }))} margin={{left:0,right:0,top:0,bottom:0}}>
                  <XAxis dataKey="month" tick={{fontSize:8}} label={{value:'Month',position:'insideBottom',offset:-2,fontSize:8}} />
                  <YAxis hide />
                  <Tooltip contentStyle={{background:'var(--bg-hover)',border:'1px solid var(--hairline)',borderRadius:'8px',fontSize:'12px',boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}} labelStyle={{color:'var(--text-muted)',fontSize:'11px'}} itemStyle={{color:'#e8eaf0'}} cursor={{fill:'color-mix(in srgb, var(--text) 5%, transparent)'}} offset={12} wrapperStyle={{zIndex:100}} formatter={(v:any) => [`${v} debt(s) paid off`, 'Payoffs']} labelFormatter={(l:any) => `Month ${l}`} />
                  <Bar dataKey="count" fill="var(--success-strong)" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-3">
            {(extraPerMonth > 0 ? withExtra : snowballOnly).timeline.filter(t => t.closedDebts.length > 0).map((e, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="badge badge-blue mono w-24 flex-shrink-0 text-center">Month {e.month}</div>
                <div className="flex-1">
                  <div className="font-semibold text-green-400">✓ {e.closedDebts.join(', ')} closes</div>
                  <div className="text-[13px] mt-0.5" style={{color:'var(--text-muted)'}}>
                    Total freed: <span className="mono text-green-400 font-bold">{fmtINR(e.freedEmi)}/mo</span>
                  </div>
                </div>
                <div className="text-[13px] font-semibold" style={{color:'var(--text-muted)'}}>{e.date}</div>
              </div>
            ))}
            <div className="flex items-center gap-4 pt-2 border-t" style={{borderColor:'color-mix(in srgb, var(--text) 5%, transparent)'}}>
              <div className="badge badge-green mono w-24 text-center">Month {(extraPerMonth > 0 ? withExtra : snowballOnly).months}</div>
              <div className="font-bold text-green-400 text-lg">🎉 Completely Debt Free!</div>
              <div className="font-semibold">{(extraPerMonth > 0 ? withExtra : snowballOnly).debtFreeDate}</div>
            </div>
          </div>
          </div>
        </div>
      )}
      {/* Amortization Schedule */}
      {emiDebts.length > 0 && (
        <div className="rounded-2xl p-5 mt-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="flex justify-between items-center mb-3 cursor-pointer select-none" onClick={() => toggleSection("amortiz")}><div><div className="text-[14px] font-semibold" style={{color:'var(--text-muted)'}}>📊 Amortization — Month-by-Month</div><div className="text-[12px] mt-0.5" style={{color:'var(--text-faint)'}}>Principal vs interest split for each loan · tap a loan to expand</div></div><span className="text-[11px] ">{openSections.has("amortiz") ? "▲" : "▼"}</span></div>
          <div className={openSections.has("amortiz") ? "" : "hidden"}>
          <div className="space-y-2">
            {emiDebts.map(item => {
              const isExpanded = expandedLoan === item.id
              // Build schedule
              const schedule: {mo:number;date:string;emi:number;principal:number;interest:number;balance:number}[] = []
              if (isExpanded && item.princLeft > 0 && item.monthsLeft > 0) {
                const rate = (item as any).interestRate ? (item as any).interestRate / 100 / 12 : 0
                let bal = item.princLeft
                const now = new Date()
                for (let mo = 1; mo <= Math.min(item.monthsLeft, 360); mo++) {
                  const d = new Date(now.getFullYear(), now.getMonth() + mo, 1)
                  const intPart = rate > 0 ? bal * rate : (item.intLeft / item.monthsLeft)
                  const princPart = item.emi - intPart
                  bal = Math.max(0, bal - princPart)
                  schedule.push({
                    mo, date: d.toLocaleDateString('en-IN', {month:'short', year:'numeric'}),
                    emi: item.emi, principal: princPart, interest: intPart, balance: bal
                  })
                  if (bal <= 0) break
                }
              }
              return (
                <div key={item.id}>
                  <button
                    className="w-full flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--bg-base)] transition-colors text-left"
                    onClick={() => setExpandedLoan(isExpanded ? null : item.id)}
                  >
                    <div className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0`} />
                    <span className="font-semibold text-[13px] flex-1">{item.label}</span>
                    <span className="badge badge-muted">{item.type}</span>
                    <span className="mono text-[11px]" style={{color:'var(--text-muted)'}}>{item.monthsLeft}mo · {fmtINR(item.emi)}/mo</span>
                    <span className="text-[11px]" style={{color:'var(--text-faint)'}}>{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-1 mb-2 rounded-lg overflow-hidden border" style={{borderColor:'color-mix(in srgb, var(--text) 5%, transparent)'}}>
                      {item.princLeft <= 0 ? (
                        <div className="p-4 text-[13px]" style={{color:'var(--text-muted)'}}>
                          Enter "Principal Remaining (from bank statement)" on the loan to see accurate amortization.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr style={{background:'color-mix(in srgb, var(--text) 4%, transparent)'}}>
                                <th className="px-3 py-2 text-left">#</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-right">EMI</th>
                                <th className="px-3 py-2 text-right text-blue-400">Principal</th>
                                <th className="px-3 py-2 text-right text-red-400">Interest</th>
                                <th className="px-3 py-2 text-right">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {schedule.map((row, i) => (
                                <tr key={i} style={{borderTop:'1px solid var(--border)', background: row.balance <= 0 ? 'var(--bg-base)' : undefined}}>
                                  <td className="px-3 py-1.5 mono" style={{color:'var(--text-faint)'}}>{row.mo}</td>
                                  <td className="px-3 py-1.5" style={{color:'var(--text-muted)'}}>{row.date}</td>
                                  <td className="px-3 py-1.5 mono text-right">{fmtINR(row.emi)}</td>
                                  <td className="px-3 py-1.5 mono text-right text-blue-400">{fmtINR(Math.max(0,row.principal))}</td>
                                  <td className="px-3 py-1.5 mono text-right text-red-400">{fmtINR(Math.max(0,row.interest))}</td>
                                  <td className="px-3 py-1.5 mono text-right font-bold">{fmtINR(Math.max(0,row.balance))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
