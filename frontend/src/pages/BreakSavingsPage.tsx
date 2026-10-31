import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { Fragment, useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { savingsApi, loansApi, cardsApi, personalEmiApi, incomeApi } from '../api'
import { runSnowball, type SimDebt } from '../utils/snowball'
import { calcLoanSplit } from '../utils/loanCalc'
import { fmtINR, getEff, monthlyIncomeTotal } from '../utils/format'
import { ioweFacts } from '../utils/iowe'
import { LoadingSpinner, PageHeader, ErrorState } from '../components/common'
import { ChevronDown } from 'lucide-react'

export default function BreakSavingsPage() {
  const { data: savings = [], isLoading: s1, isError: e1, refetch: refetch1 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: loans = [], isLoading: s2, isError: e2, refetch: refetch2 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: cards = [], isLoading: s3, isError: e3, refetch: refetch3 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: personal = [], isLoading: s4, isError: e4, refetch: refetch4 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: incomeEntries = [], isLoading: s5, isError: e5, refetch: refetch5 } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  // Was only tracking savings/loans — cards/personal/incomeEntries all feed `debtItems`/`currentIncome`
  // directly, so a failure in any of them rendered silently with partial/zeroed data.
  const isLoading = s1 || s2 || s3 || s4 || s5
  const isError = e1 || e2 || e3 || e4 || e5
  const [selectedSaving, setSelectedSaving] = useState<number | null>(null)
  // Monthly-equivalent total (frequency-aware), same calculation used everywhere else (Budget,
  // Payoff, Hub). Was checking a nonexistent `endDate` field and summing raw `amount` with no
  // frequency conversion, so a Yearly bonus counted as if it were paid every month.
  const currentIncome = monthlyIncomeTotal(incomeEntries as any[])
  const [income, setIncome] = useState(0)
  const [incomeInput, setIncomeInput] = useState('')
  // Auto-fill income from Income tab if not manually set
  const effectiveIncome = income > 0 ? income : currentIncome

  // "Leave behind" and "org cut" are per-saving what-if inputs the user tweaks while comparing
  // scenarios — without persistence they silently reset to blank on every navigation/refresh,
  // discarding work. Both load from and save to localStorage, same pattern as the budget rules
  // in BudgetRulesPage.
  const [leaveBehind, setLeaveBehind] = useState<Record<number, number>>(() => {
    try { const s = localStorage.getItem('finflow-break-savings-leave'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const [fixedCuts, setFixedCuts] = useState<Record<number, number>>(() => {
    try { const s = localStorage.getItem('finflow-break-savings-orgcut'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  useEffect(() => { try { localStorage.setItem('finflow-break-savings-leave', JSON.stringify(leaveBehind)) } catch {} }, [leaveBehind])
  useEffect(() => { try { localStorage.setItem('finflow-break-savings-orgcut', JSON.stringify(fixedCuts)) } catch {} }, [fixedCuts])

  const [combinedExtra, setCombinedExtra] = useState(0)
  const [showPrizeTaken, setShowPrizeTaken] = useState(false)
  const [selectedForBreak, setSelectedForBreak] = useState<Set<number>>(new Set())
  const [prizeAmountGot, setPrizeAmountGot] = useState<Record<number, number>>({})
  const [prizeFixedCut, setPrizeFixedCut] = useState<Record<number, number>>({})

  // Savings analysis
  // Build debt items for snowball simulation
  const COLORS = ['bg-blue-500','bg-purple-500','bg-orange-500','bg-pink-500','bg-yellow-500','bg-green-500','bg-red-500','bg-teal-500']
  const debtItems: SimDebt[] = useMemo(() => {
    const items: SimDebt[] = []
    let ci = 0
    loans.filter(l => getEff(l).pending > 0).forEach(l => {
      const eff = getEff(l)
      const t = l.tenure ?? (eff.paid + eff.pending)
      const sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, eff.paid, l.principalPaid ?? undefined)
      items.push({ id: `loan-${l.id}`, label: l.lender, emi: l.emi ?? 0, monthsLeft: eff.pending, princLeft: sp.princLeft, intLeft: sp.intLeft, type: 'Loan', color: COLORS[ci++ % COLORS.length] })
    })
    cards.forEach(c => {
      ;(c.emis ?? []).filter((e: any) => getEff(e).pending > 0).forEach((e: any) => {
        const eff = getEff(e)
        items.push({ id: `emi-${e.id}`, label: `${c.banker} EMI`, emi: e.emi ?? 0, monthsLeft: eff.pending, princLeft: (e.principal ?? 0) * (eff.pending / (e.tenure ?? 1)), intLeft: 0, type: 'CC EMI', color: COLORS[ci++ % COLORS.length] })
      })
    })
    // Was two separate ad-hoc filters — `p.emi>0` (treated as plain amortising, using the raw
    // original `p.amount` as princLeft instead of what's actually left) and `!p.emi && interestRate>0`
    // (missed any interest-only entry that DOES have an emi — e.g. one detected by a paybackDate or
    // by the payments-can't-cover-principal arithmetic, which is the common real case). Lump-sum
    // entries (no emi, no interestRate) fell through both filters and were silently absent from the
    // simulation entirely. `ioweFacts()` is the shared classifier (same one PayoffPage uses) that
    // gets all three shapes — amortising, interest-only, lump — right in one pass.
    ;(personal as any[]).forEach(p => {
      const f = ioweFacts(p)
      if (f.mode === 'lump') {
        if (f.principalLeft > 0) items.push({ id: `personal-${p.id}`, label: `${p.person} (I Owe)`, emi: f.principalLeft, monthsLeft: 1, princLeft: f.principalLeft, intLeft: 0, type: 'I Owe', color: COLORS[ci++ % COLORS.length], isLumpSum: true })
      } else if (f.mode === 'interest-only') {
        items.push({ id: `intonly-${p.id}`, label: `${p.person} (interest only)`, emi: f.monthly, monthsLeft: 999, princLeft: f.principalLeft, intLeft: f.principalLeft, type: 'I Owe', color: COLORS[ci++ % COLORS.length], isInterestOnly: true })
      } else {
        const eff = getEff(p)
        if (eff.pending > 0) items.push({ id: `personal-${p.id}`, label: `${p.person} (I Owe)`, emi: p.emi ?? 0, monthsLeft: eff.pending, princLeft: f.principalLeft, intLeft: Math.max(0, (p.emi ?? 0) * eff.pending - f.principalLeft), type: 'I Owe', color: COLORS[ci++ % COLORS.length] })
      }
    })
    return items.sort((a, b) => a.monthsLeft - b.monthsLeft)
  }, [loans, cards, personal])

  // Baseline simulation (no break, no extra)
  const baseline = useMemo(() => runSnowball(debtItems, 0), [debtItems])

  const savingsAnalysis = useMemo(() => savings
    .filter(s => getEff(s).pending > 0 && !s.prizeTaken && s.mode !== 'withdrew') // exclude withdrawn/prize-taken
    .map(s => {
    const eff = getEff(s)
    const paidMonths = eff.paid
    const pendingMonths = eff.pending
    const monthly = Number(s.monthly ?? 0)
    const corpusToday = paidMonths * monthly  // what you've paid in (built from day 1)
    const remainingEmi = pendingMonths * monthly  // still to pay
    const cashFreed = remainingEmi  // monthly cash freed if you break now (pending × monthly)
    const isChit = !!(s.chitValue && Number(s.chitValue) > 0)
    const prizeAmount = isChit
      ? Number(s.chitValue)
      : Number(s.maturityAmount ?? (s.tenure ?? 0) * monthly)
    const doublesBonus = (s.doublePayments ?? 0) * monthly  // months saved × monthly = real saving
    const totalYouPay = (s.tenure ?? 0) * monthly - doublesBonus  // actual total cost
    const leaveAmount = leaveBehind[s.id!] ?? 0
    const fixedCutAmount = fixedCuts[s.id!] ?? 0
    // org cut deducted from prize; leave behind is additional forfeit
    const netAtMaturity = prizeAmount - fixedCutAmount
    const netCashIfBreak = Math.max(0, netAtMaturity - leaveAmount)
    // Profit if complete = prize - what you actually pay (doubles already reduce cost)
    const continueProfit = netAtMaturity - totalYouPay
    const lostProfit = Math.max(0, continueProfit)
    // Interest saved using actual avg loan rate
    const avgLoanRate = loans.filter(l => Number(l.interestRate ?? 0) > 0)
      .reduce((s, l, _, a) => s + Number(l.interestRate ?? 0) / a.length, 0) || 12
    const intSaved = Math.round(netCashIfBreak * (avgLoanRate / 100) * pendingMonths / 12)
    const netBenefit = intSaved - lostProfit
    return {
      id: s.id, name: s.name ?? s.type, type: s.type,
      monthly, paidMonths, pendingMonths, tenure: s.tenure ?? 0, cashFreed,
      corpusToday, remainingEmi, prizeAmount, doublesBonus, totalYouPay,
      netCashIfBreak, lostProfit: Math.max(0, lostProfit), fixedCutAmount,
      intSaved, netBenefit,
      verdict: netBenefit > 10000 ? 'BREAK' : netBenefit > -10000 ? 'MARGINAL' : 'KEEP',
      // Break in 3 months: you'll have paid 3 more months, get same prize
      in3Months: (() => {
        const extraPaid = 3 * monthly
        const netIn3 = Math.max(0, prizeAmount - fixedCutAmount - leaveAmount)
        // But you've paid 3 more months toward it
        const benefitIn3 = netIn3 - (totalYouPay + extraPaid - totalYouPay)
        return { netCash: netIn3, extraCost: extraPaid, netBenefit: intSaved - lostProfit - extraPaid }
      })(),
      netCashAfterBalance: netCashIfBreak
    }
  }), [savings, loans, leaveBehind, fixedCuts])

    // Combined simulation with selected breaks + extra
  const combinedResult = useMemo(() => {
    const totalLumpSum = savingsAnalysis
      .filter(s => selectedForBreak.has(s.id!))
      .reduce((sum, s) => sum + s.netCashIfBreak, 0)

    if (totalLumpSum === 0 && combinedExtra === 0) return null

    // Apply lump sum to shortest loan first
    const lumpByDebt: Record<string, number> = {}
    let remaining = totalLumpSum
    for (const debt of debtItems.filter(d => !d.isLumpSum && !d.isInterestOnly)) {
      if (remaining <= 0) break
      const payoff = Math.min(remaining, debt.princLeft)
      lumpByDebt[debt.id] = payoff
      remaining -= payoff
    }
    // Rest goes to interest-only
    if (remaining > 0) {
      const intOnly = debtItems.find(d => d.isInterestOnly)
      if (intOnly) lumpByDebt[intOnly.id] = remaining
    }

    return runSnowball(debtItems, combinedExtra, {}, lumpByDebt)
  }, [debtItems, savingsAnalysis, selectedForBreak, combinedExtra])


  const selected = savingsAnalysis.find(s => s.id === selectedSaving)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your savings/loans data." onRetry={() => { refetch1(); refetch2(); refetch3(); refetch4(); refetch5() }} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Break savings simulator"/>
      {/* Smart insight */}
      {savingsAnalysis.length > 0 && savingsAnalysis.some((v:any)=>v.verdict==='BREAK') && (
        <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg,color-mix(in srgb, var(--success) 8%, transparent) 0%,color-mix(in srgb, var(--success) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--success) 15%, transparent)'}}>
          <span className="text-lg">💡</span>
          <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
            {/* Both the count and the net benefit are the point of this banner, so both are
                emphasised. The keys here were duplicated and the amount had lost its styling. */}
            <span style={{color:'var(--success)',fontWeight:600}}>{savingsAnalysis.filter((v:any)=>v.verdict==='BREAK').length} savings</span> are worth breaking — you'd net <span style={{color:'var(--success)',fontWeight:600}}>{fmtINR(savingsAnalysis.filter((v:any)=>v.verdict==='BREAK').reduce((s:number,v:any)=>s+v.netBenefit,0))}</span> after paying off remaining EMIs.
          </div>
        </div>
      )}

      {savingsAnalysis.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            {label:'Total to Break',  value:fmtINR(savingsAnalysis.reduce((s:number,v:any)=>s+v.netCashIfBreak,0)), sub:`${savingsAnalysis.length} savings`, accent:'var(--success)'},
            {label:'Still Owe',       value:fmtINR(savingsAnalysis.reduce((s:number,v:any)=>s+v.remainingEmi,0)),   sub:'if you break all',    accent:'var(--danger)'},
            {label:'Interest saved',  value:fmtINR(savingsAnalysis.reduce((s:number,v:any)=>s+v.intSaved,0)),       sub:'vs keeping loans',     accent:'var(--info)'},
            {label:'Break worthy',    value:`${savingsAnalysis.filter((v:any)=>v.verdict==='BREAK').length} of ${savingsAnalysis.length}`, sub:'worth breaking', accent:'var(--purple)'},
          ].map(m=>(
            <div key={m.label} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{background:`linear-gradient(180deg, color-mix(in srgb, ${m.accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`,border:`1px solid var(--hairline)`}}>
              <div className="relative">
                <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color: 'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:m.accent}} />{m.label}</div>
                <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{color:m.accent}}>{m.value}</div>
                <div className="text-[11px]" style={{color: 'var(--text-faint)'}}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px]" style={{color:'var(--text-muted)'}}>Should you withdraw a chit/saving early to pay off loans faster?</p>

      {/* Summary recommendation */}
      

      {savingsAnalysis.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)", color: 'var(--text-muted)'}} >No active savings/chits found</div>
      ) : (
        <div className="rounded-2xl overflow-hidden mb-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[12px] font-medium " style={{ color: 'var(--text-muted)' }}>Savings / Chit Analysis</div>
            <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Already withdrawn? Archive it from Savings tab → it won't show here</div>
          </div>
          <div>
            <div className="grid px-4 py-2 text-[12px] font-medium border-b"
              style={{gridTemplateColumns:"minmax(190px,2.4fr) minmax(110px,1.02fr) minmax(110px,1.02fr) minmax(120px,1.12fr) minmax(200px,1.2fr)",borderColor:"var(--hairline)",background:"color-mix(in srgb, var(--text) 4%, transparent)",color:"var(--text-faint)"}}>
              <span>Saving</span><span className="text-right">Paid in</span><span className="text-right">Net benefit</span><span className="text-center">Verdict</span><span className="text-center">Action</span>
            </div>
            <div>
                {savingsAnalysis.map((s, idx) => (
                  // The shorthand <>...</> cannot take a key prop, so React saw every iteration of
                  // this map as an unkeyed list item even though the div one level down had one —
                  // that div is not what map returns. React.Fragment can take the key; <> cannot.
                  <Fragment key={s.id}>
                    <div className="grid items-start px-4 py-3 cursor-pointer transition-colors"
                      style={{gridTemplateColumns:"minmax(190px,2.4fr) minmax(110px,1.02fr) minmax(110px,1.02fr) minmax(120px,1.12fr) minmax(200px,1.2fr)",borderTop:"1px solid color-mix(in srgb, var(--text) 5%, transparent)",background:idx%2===0?"transparent":"color-mix(in srgb, var(--text) 2%, transparent)"}}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="var(--bg-hover)"}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
                      onClick={() => setSelectedSaving(selectedSaving === s.id ? null : s.id!)}>
                      {/* This row carried TEN direct children against a five-column header, so the
                          grid wrapped onto two lines and every header sat over the wrong figure:
                          "Paid In" above corpusToday, "Net Benefit" above remainingEmi, "Verdict"
                          above prizeAmount. One child was even a bare <td> with no table ancestor.
                          Now exactly five cells, matching the five headers. The intermediate
                          figures that used to be squeezed in here (still owed, prize value, lost
                          profit, interest saved) are already shown as tiles in the expanded panel
                          below, so nothing is lost. */}

                      {/* 1 · Saving */}
                      <div className="min-w-0">
                        <div className="font-medium text-[13px] truncate">{s.name}</div>
                        <div className="text-[11px] mt-0.5" style={{color:"var(--text-faint)"}}>{s.paidMonths} paid · {s.pendingMonths} left · {fmtINR(s.monthly)}/mo</div>
                      </div>

                      {/* 2 · Paid In */}
                      <div className="text-right">
                        <div className="mono font-semibold text-[13px]" style={{color:"var(--info)"}}>{fmtINR(s.corpusToday)}</div>
                        <div className="text-[11px]" style={{color:"var(--text-faint)"}}>{s.paidMonths}mo × {fmtINR(s.monthly)}</div>
                        {s.cashFreed>0&&<div className="text-[11px]" style={{color:"var(--success)"}}>+{fmtINR(s.cashFreed)} freed</div>}
                      </div>

                      {/* 3 · Net Benefit */}
                      <div className="text-right">
                        <div className="mono font-semibold text-[13px]" style={{color:s.netBenefit>0?"var(--success)":"var(--danger)"}}>{s.netBenefit>0?"+":""}{fmtINR(s.netBenefit)}</div>
                        <div className="text-[11px]" style={{color:"var(--text-faint)"}}>net {fmtINR(s.netCashIfBreak)} in hand</div>
                      </div>

                      {/* 4 · Verdict */}
                      <div className="text-center">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold" style={{background:s.verdict==='BREAK'?"color-mix(in srgb, var(--success) 15%, transparent)":s.verdict==='MARGINAL'?"color-mix(in srgb, var(--warning) 15%, transparent)":"color-mix(in srgb, var(--danger) 15%, transparent)",color:s.verdict==='BREAK'?"var(--success)":s.verdict==='MARGINAL'?"var(--warning)":"var(--danger)"}}>
                          {s.verdict==='BREAK'?'✅ Break':s.verdict==='MARGINAL'?'⚠ Marginal':'❌ Keep'}
                        </span>
                        {s.verdict!=='KEEP'&&<div className="text-[11px] mt-0.5" style={{color:`color-mix(in srgb, ${s.verdict==='BREAK'?'var(--success)':'var(--warning)'} 60%, transparent)`}}>
                          {s.verdict==='BREAK'?`Save ${fmtINR(s.netBenefit)}`:`${fmtINR(Math.abs(s.netBenefit))} ${s.netBenefit>0?'gain':'cost'}`}
                        </div>}
                      </div>

                      {/* 5 · Action — the two what-if inputs, plus the expand chevron */}
                      <div className="flex items-center justify-center gap-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-right whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>Leave behind</span>
                            <input className="input text-[11px] w-16 py-0.5 px-1 mono" type="number" placeholder="0"
                              value={leaveBehind[s.id!] ?? ''}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); setLeaveBehind(prev => ({ ...prev, [s.id!]: +e.target.value || 0 })) }} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-right whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>Organiser cut</span>
                            <input className="input text-[11px] w-16 py-0.5 px-1 mono" type="number" placeholder="0"
                              value={fixedCuts[s.id!] ?? ''}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); setFixedCuts(prev => ({ ...prev, [s.id!]: +e.target.value || 0 })) }} />
                          </div>
                        </div>
                        <ChevronDown size={13} style={{color:'var(--text-faint)',transform:selectedSaving===s.id?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s',cursor:'pointer',flexShrink:0}} onClick={e=>{e.stopPropagation();setSelectedSaving(selectedSaving===s.id?null:s.id)}}/>
                      </div>
                    </div>
                    {selectedSaving === s.id && (
                      <div className="px-4 py-3" style={{background:"var(--bg-base)",borderTop:"1px solid color-mix(in srgb, var(--text) 5%, transparent)"}}>
                        <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                          {[
                            {l:'Corpus Today',v:fmtINR(s.corpusToday),c:'var(--info)'},
                            {l:'Still Owe',v:fmtINR(s.remainingEmi),c:'var(--danger)'},
                            {l:'Prize Value',v:fmtINR(s.prizeAmount),c:'var(--purple)'},
                            {l:'Lost Profit',v:fmtINR(s.lostProfit),c:'var(--warning)'},
                            {l:'Int Saved',v:fmtINR(s.intSaved),c:'var(--success)'},
                            {l:'Net Benefit',v:(s.netBenefit>0?'+':'')+fmtINR(s.netBenefit),c:s.netBenefit>0?'var(--success)':'var(--danger)'},
                          ].map(m=>(
                            <div key={m.l} className="rounded-lg p-2 text-center" style={{background:`color-mix(in srgb, ${m.c} 7%, transparent)`,border:`1px solid color-mix(in srgb, ${m.c} 15%, transparent)`}}>
                              <div className="text-[11px] mb-0.5" style={{color:`color-mix(in srgb, ${m.c} 60%, transparent)`}}>{m.l}</div>
                              <div className="mono font-bold" style={{color:m.c}}>{m.v}</div>
                            </div>
                          ))}
                        </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
                            <div>
                              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Scenario: Continue</div>
                              <div>Pay <span className="mono text-red-400">{fmtINR(s.remainingEmi)}</span> more ({s.pendingMonths}mo)</div>
                              <div>Prize: <span className="mono">{fmtINR(s.prizeAmount)}</span> − org cut <span className="mono text-orange-400">{fmtINR(s.fixedCutAmount)}</span> = <span className="mono text-green-400">{fmtINR(s.prizeAmount - s.fixedCutAmount)}</span></div>
                              <div>Total paid: <span className="mono">{fmtINR(s.totalYouPay)}</span> ({s.tenure}mo − {Math.round(s.doublesBonus/(s.monthly||1))} doubles)</div>
                              <div className="font-bold">Net profit: <span className="mono text-green-400">{fmtINR(s.prizeAmount - s.fixedCutAmount - s.totalYouPay)}</span></div>
                            </div>
                            <div>
                              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Scenario: Break Now</div>
                              <div>Prize/Value: <span className="mono text-blue-400">{fmtINR(s.prizeAmount)}</span></div>
                              <div>Leave behind: <span className="mono text-red-400">−{fmtINR(leaveBehind[s.id!] ?? 0)}</span></div>
                              <div className="font-bold">Get today: <span className="mono text-green-400">{fmtINR(s.netCashIfBreak)}</span></div>
                              <div className="text-yellow-400">Still owe: <span className="mono">{fmtINR(s.remainingEmi)}</span> ({s.pendingMonths}mo remaining)</div>
                              {s.paidMonths > 0 && <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>Paid {s.paidMonths} × {fmtINR(s.monthly)} = {fmtINR(s.corpusToday)}</div>}
              {s.cashFreed > 0 && <div className="text-[11px] text-green-400 mt-0.5">Breaking frees {fmtINR(s.monthly)}/mo × {s.pendingMonths}mo = {fmtINR(s.cashFreed)} total</div>}
                              {s.doublesBonus > 0 && <div className="text-[11px] text-green-400">Doubles save you: {fmtINR(s.doublesBonus)} ({s.monthly > 0 ? Math.round(s.doublesBonus/s.monthly) : 0} months free)</div>}
                            </div>
                            <div>
                              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>If prepay loan</div>
                              <div>Put <span className="mono text-blue-400">{fmtINR(s.netCashIfBreak)}</span> toward loan</div>
                              <div>Save <span className="mono text-green-400">{fmtINR(s.intSaved)}</span> interest</div>
                              <div className="text-[11px] text-yellow-400">Note: still pay {fmtINR(s.monthly)}/mo for {s.pendingMonths} months</div>
                            </div>
                            <div>
                              <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Net decision</div>
                              <div className={`font-bold text-lg mono ${s.netBenefit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {s.netBenefit > 0 ? '+' : ''}{fmtINR(s.netBenefit)}
                              </div>
                              <div className={`font-bold ${s.verdict === 'BREAK' ? 'text-green-400' : s.verdict === 'MARGINAL' ? 'text-yellow-400' : 'text-red-400'}`}>
                                {s.verdict === 'BREAK' ? '✅ Worth breaking' : s.verdict === 'MARGINAL' ? '⚠️ Marginal call' : '❌ Better to keep'}
                              </div>
                              {s.verdict === 'MARGINAL' && (
                                <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Difference is small — your call</div>
                              )}
                            </div>
                          </div>
                      </div>
                    )}
                  </Fragment>
                ))}
            </div>
          </div>
        </div>
      )}


      {/* Combined scenario simulator */}
      {savingsAnalysis.length > 0 && debtItems.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="text-[12px] font-medium mb-4" style={{color:'var(--text-muted)'}}>
            Combined Scenario — Break Selected + Throw Cash at Debt
          </div>

          {/* Select savings to break */}
          <div className="mb-4">
            <div className="text-[13px] font-semibold mb-2">Select savings to break:</div>
            <div className="flex flex-wrap gap-2">
              {savingsAnalysis.map((s, idx) => (
                <button key={s.id} onClick={() => setSelectedForBreak(prev => {
                  const next = new Set(prev)
                  next.has(s.id!) ? next.delete(s.id!) : next.add(s.id!)
                  return next
                })}
                className={`btn btn-sm ${selectedForBreak.has(s.id!) ? 'bg-orange-500 text-white' : 'btn-secondary'}`}>
                  {s.name} → {fmtINR(s.netCashIfBreak)}
                  {selectedForBreak.has(s.id!) && ' ✓'}
                </button>
              ))}
            </div>
          </div>

          {/* Extra monthly */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[13px] font-semibold">Extra per month on top of EMIs</div>
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>e.g. if you add ₹5,000/mo toward debt after breaking</div>
            </div>
            <input className="input w-32 mono" type="number" placeholder="0"
              value={combinedExtra || ''} onChange={e => setCombinedExtra(+e.target.value || 0)} />
            {combinedExtra > 0 && <span className="text-[11px] text-blue-400">+{fmtINR(combinedExtra)}/mo snowballed into loans</span>}
          </div>

          {/* Result */}
          {combinedResult ? (
            <div className="mt-2 space-y-3">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-red-500/20 text-center">
                  <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>Without breaking</div>
                  <div className="mono text-xl font-bold text-red-400">{baseline.months} mo</div>
                  <div className="text-[11px]" style={{color:'var(--text-muted)'}}>{baseline.debtFreeDate}</div>
                </div>
                <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-center">
                  <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>With break</div>
                  <div className="mono text-xl font-bold text-green-400">{combinedResult.months} mo</div>
                  {baseline.months - combinedResult.months > 0
                    ? <div className="text-[11px] text-green-400">−{baseline.months - combinedResult.months}mo faster</div>
                    : <div className="text-[11px] text-yellow-400">same timeline</div>}
                  <div className="text-[11px] text-green-400 font-bold">{fmtINR(combinedResult.intSaved)} interest saved</div>
                </div>
                <div className="p-3 rounded-lg border border-blue-500/20">
                  <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>First 3 paid off</div>
                  {debtItems.filter(d => !d.isLumpSum).map(d => ({
                    ...d, newClose: combinedResult!.scheduleByItem[d.id] ?? d.monthsLeft,
                    oldClose: baseline.scheduleByItem[d.id] ?? d.monthsLeft
                  })).sort((a,b) => a.newClose - b.newClose).slice(0,3).map(d => (
                    <div key={d.id} className="text-[11px] flex justify-between">
                      <span className="truncate" style={{color:'var(--text-muted)'}}>{d.label}</span>
                      <span className="mono text-green-400 ml-1 flex-shrink-0">M{d.newClose}{d.newClose < d.oldClose ? ` (-${d.oldClose-d.newClose})` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Visual timeline bars */}
              <div className="space-y-1">
                {debtItems.filter(d => !d.isLumpSum).slice(0,6).map(d => {
                  const newClose = combinedResult!.scheduleByItem[d.id] ?? d.monthsLeft
                  const oldClose = baseline.scheduleByItem[d.id] ?? d.monthsLeft
                  const maxMo = baseline.months
                  return (
                    <div key={d.id} className="flex items-center gap-2 text-[11px]">
                      <div className="w-24 truncate flex-shrink-0" style={{color:'var(--text-muted)'}}>{d.label}</div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:'color-mix(in srgb, var(--text) 4%, transparent)'}}>
                        <div className="h-full rounded-full" style={{width:`${(newClose/maxMo)*100}%`, background: newClose < oldClose ? 'var(--success-strong)' : '#3b82f6'}} />
                      </div>
                      <div className={`w-12 text-right mono flex-shrink-0 ${newClose < oldClose ? 'text-green-400' : ''}`}>M{newClose}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-[13px]" style={{color:'var(--text-muted)'}}>Select a saving above to see the impact</div>
          )}
        </div>
      )}
    </div>
  )
}