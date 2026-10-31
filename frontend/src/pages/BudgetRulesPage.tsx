import SegTabs from '../components/common/SegTabs'
import { useState } from 'react'
import { incomePct } from '../utils/incomePct'
import { useNavigateFrom } from '../hooks/useNavigateFrom'
import { useHorizonState } from '../utils/horizonStore'
import { advanceAll } from '../utils/projection'
import HorizonBar from '../components/common/HorizonBar'
import IncomeSplitCard from '../components/common/IncomeSplitCard'
import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, savingsApi, expensesApi, incomeApi, investmentsApi, insuranceApi } from '../api'
import { calcOutflow, outflowTierLine, freeFigures } from '../utils/calcOutflow'
import { fmtINR, getEff, monthlyIncomeTotal, toMonthly, isOneOff } from '../utils/format'
import { cardLimitUse } from '../utils/cardLimit'
import { ioweFacts } from '../utils/iowe'
import { calcLoanSplit } from '../utils/loanCalc'
import { PageHeader, LoadingSpinner, ErrorState } from '../components/common'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import axiosApi from '../api/axios'

const personalEmiApi2 = { getAll: () => axiosApi.get<{data:any[]}>('/personal-emis').then(r=>r.data.data) }
const peopleOweApi2   = { getAll: () => axiosApi.get<{data:any[]}>('/people-owes').then(r=>r.data.data) }

const DEFAULT_RULES = [
  { id: 'housing',   label: 'Home Loan',             limit: 30, color: 'var(--info)', icon: '🏠' },
  { id: 'vehicle',   label: 'Car / Bike Loan',        limit: 15, color: 'var(--warning)', icon: '🚗' },
  { id: 'debt',      label: 'Other Loans + CC EMIs',  limit: 10, color: 'var(--danger-strong)', icon: '🏦' },
  { id: 'savings',   label: 'Savings + Investments',  limit: 20, color: 'var(--success-strong)', icon: '💰' },
  { id: 'food',      label: 'Food / Groceries',       limit: 10, color: 'var(--orange)', icon: '🍱' },
  { id: 'lifestyle', label: 'Lifestyle + CC Spends',  limit: 10, color: 'var(--purple)', icon: '🛍️' },
  { id: 'insurance', label: 'Insurance',              limit: 3,  color: 'var(--cyan)', icon: '🛡️' },
  { id: 'other',     label: 'Other / Misc',           limit: 2,  color: 'var(--text-muted)', icon: '📦' },
]

export default function BudgetRulesPage() {
  const navigate = useNavigateFrom()
  const [rules, setRules] = useState(() => {
    try { const s = localStorage.getItem('finflow-budget-rules2'); return s ? JSON.parse(s) : DEFAULT_RULES } catch { return DEFAULT_RULES }
  })
  const [editing, setEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview'|'loans'|'cards'|'iowe'>('overview')

  const { data: loansRaw = [], isLoading: l1, isError: e1, refetch: r1 }       = useQuery({ queryKey: ['loans'],        queryFn: loansApi.getAll })
  const { data: cardsRaw = [], isLoading: l2, isError: e2, refetch: r2 }       = useQuery({ queryKey: ['cards'],        queryFn: cardsApi.getAll })
  const { data: savingsRaw = [], isLoading: l3, isError: e3, refetch: r3 }     = useQuery({ queryKey: ['savings'],      queryFn: savingsApi.getAll })
  const { data: expensesRaw = [], isLoading: l4, isError: e4, refetch: r4 }    = useQuery({ queryKey: ['expenses'],     queryFn: expensesApi.getAll })
  const { data: income = [], isLoading: l5, isError: e5, refetch: r5 }      = useQuery({ queryKey: ['income'],       queryFn: incomeApi.getAll })
  const { data: investmentsRaw = [], isLoading: l6, isError: e6, refetch: r6 } = useQuery({ queryKey: ['investments'],  queryFn: investmentsApi.getAll })
  const { data: personalRaw = [], isLoading: l7, isError: e7, refetch: r7 }    = useQuery({ queryKey: ['personal'],     queryFn: personalEmiApi2.getAll })
  const { data: peopleOwe = [], isLoading: l8, isError: e8, refetch: r8 }   = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApi2.getAll })
  // This page never loaded the insurance table, so real premiums were missing from
  // Total Outflow — `insExp` below only catches expenses whose label mentions "insur".
  const { data: insuranceRaw = [], isLoading: l9, isError: e9, refetch: r9 }   = useQuery({ queryKey: ['insurance'],   queryFn: insuranceApi.getAll })

  // Was only ever tracking the `investments` query — a failure in any of the other 8 queries this
  // page depends on (loans/cards/savings/expenses/income/personal/peopleOwe/insurance) rendered
  // silently with partial/zeroed data instead of the error state.
  // Look ahead (shared with the Hub): everything below is computed from the data as it will stand N months from now.
  const hz = useHorizonState()
  const proj = advanceAll({ loans: loansRaw as any[], cards: cardsRaw as any[], personal: personalRaw as any[], savings: savingsRaw as any[], investments: investmentsRaw as any[], expenses: expensesRaw as any[], insurance: insuranceRaw as any[] }, hz.horizon, hz)
  const loans: any[] = proj.loans ?? []
  const cards: any[] = proj.cards ?? []
  const personal: any[] = proj.personal ?? []
  const savings: any[] = proj.savings ?? []
  const investments: any[] = proj.investments ?? []
  const expenses: any[] = proj.expenses ?? []
  const insurance: any[] = proj.insurance ?? []
  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8||l9
  const isError = e1||e2||e3||e4||e5||e6||e7||e8||e9
  const refetch = () => { r1();r2();r3();r4();r5();r6();r7();r8();r9() }

  if (isLoading) return <><HorizonBar /><LoadingSpinner /></>
  if (isError) return <ErrorState message="Couldn't load your budget data." onRetry={() => refetch()} />

  const monthlyIncome = monthlyIncomeTotal(income as any[])
  const now = new Date()

  // ── LOANS ──
  const activeLoans   = (loans as any[]).filter((l:any) => getEff(l).pending > 0)
  const homeEmi       = activeLoans.filter((l:any) => /home/i.test(l.loanType??'')).reduce((s:number,l:any) => s+Number(l.emi??0), 0)
  const carEmi        = activeLoans.filter((l:any) => /car|bike|vehicle/i.test(l.loanType??'')).reduce((s:number,l:any) => s+Number(l.emi??0), 0)
  const otherLoanEmi  = activeLoans.filter((l:any) => !/home|car|bike|vehicle/i.test(l.loanType??'')).reduce((s:number,l:any) => s+Number(l.emi??0), 0)
  const totalLoanEmi  = homeEmi + carEmi + otherLoanEmi
  const totalLoanPrincipal = activeLoans.reduce((s:number,l:any) => {
    const e=getEff(l), t=l.tenure??(e.paid+e.pending), sp=calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined)
    return s + sp.princLeft
  }, 0)
  const totalLoanIntLeft = activeLoans.reduce((s:number,l:any) => {
    const e=getEff(l), t=l.tenure??(e.paid+e.pending), sp=calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined)
    return s + sp.intLeft
  }, 0)

  // ── CREDIT CARDS ──
  const o = calcOutflow(loans as any[], cards as any[], personal as any[], savings as any[],
                        investments as any[], expenses as any[], insurance as any[])
  const ccOutstanding  = o.ccOutstanding
  const ccEmiMonthly   = (cards as any[]).reduce((s:number,c:any) => s+(c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+Number(e.emi??0),0), 0)
  const ccEmiPending   = (cards as any[]).reduce((s:number,c:any) => s+(c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+getEff(e).pending*Number(e.emi??0),0), 0)
  const ccSpendsCurrent = (cards as any[]).reduce((s:number,c:any)=>(c.spends??[]).reduce((a:number,sp:any)=>a+Number(sp.amount??0),0)+s,0)
  
  const totalCCLimit   = (cards as any[]).reduce((s:number,c:any) => s+Number(c.cardLimit??0), 0)
  const ccUtilization  = totalCCLimit > 0 ? Math.round((ccOutstanding + ccSpendsCurrent + ccEmiPending) / totalCCLimit * 100) : 0

  // ── I OWE / PEOPLE OWE ──
  // Was `getEff(p).pending*Number(p.emi??0)` — an interest-only entry's principal never reduces,
  // so multiplying its EMI by months-pending understates (or, for a lump entry with no `emi`, zeros
  // out entirely) what's actually still owed. `ioweFacts().principalLeft` is the same figure
  // calcDebt/Dashboard/PersonalEmi use.
  const iOwePending    = (personal as any[]).reduce((s:number,p:any) => s+ioweFacts(p).principalLeft, 0)
  const iOweMo         = (personal as any[]).reduce((s:number,p:any) => s+Number(p.emi??0), 0)
  const peopleOwePending = (peopleOwe as any[]).filter((p:any)=>p.status!=='Paid').reduce((s:number,p:any)=>s+Number(p.amount??0)-Number(p.paidAmount??0),0)

  // ── SAVINGS ──
  const withdrewMo = (savings as any[]).filter((v:any)=>v.mode==='withdrew'&&getEff(v).pending>0).reduce((s:number,v:any)=>s+Number(v.monthly??0),0)
  const savMo  = (savings as any[]).filter((v:any)=>getEff(v).pending>0&&v.mode!=='withdrew').reduce((s:number,v:any)=>s+Number(v.monthly??0),0)
  const invMo  = (investments as any[]).filter((v:any)=>Number(v.monthly??0)>0).reduce((s:number,v:any)=>s+Number(v.monthly??0),0)
  // Was summing each category's raw `amount` regardless of frequency — the same bug class the
  // headline `monthlyIncome`/`totalOutflow` above were already fixed for, just never applied to this
  // category breakdown. A Yearly grocery-adjacent expense inflated `foodExp` by its full amount
  // instead of its true monthly share. `toMonthly` (with one-offs excluded) matches how totalExpenses
  // is computed everywhere else in the app.
  const foodExp  = (expenses as any[]).filter((v:any)=>v.active!==false&&!isOneOff(v.frequency)&&/food|grocer|dining|restaurant|swiggy|zomato/i.test(v.label??'')).reduce((s:number,v:any)=>s+toMonthly(v.amount,v.frequency),0)
  const insExp   = (expenses as any[]).filter((v:any)=>v.active!==false&&!isOneOff(v.frequency)&&/insur/i.test(v.label??'')).reduce((s:number,v:any)=>s+toMonthly(v.amount,v.frequency),0)
  const otherExp = (expenses as any[]).filter((v:any)=>v.active!==false&&!isOneOff(v.frequency)&&!/food|grocer|dining|restaurant|swiggy|zomato|insur/i.test(v.label??'')).reduce((s:number,v:any)=>s+toMonthly(v.amount,v.frequency),0)

  const ACTUALS: Record<string,number> = {
    housing: homeEmi, vehicle: carEmi, debt: otherLoanEmi + ccEmiMonthly,
    savings: savMo + invMo, food: foodExp, lifestyle: otherExp + ccSpendsCurrent,
    // Real insurance-table premiums (o.insuranceEmi) plus `insExp` — previously ONLY `insExp` was
    // used, so a policy tracked properly on the Insurance page (rather than as a manual expense
    // line) was invisible here even though Total Outflow above already counted it correctly via
    // the shared calculator. Kept `insExp` too so a legacy manually-tracked "insurance" expense
    // line doesn't silently disappear from every category (otherExp explicitly excludes it).
    insurance: o.insuranceEmi + insExp,
    // Was hardcoded to 0 — always "No data" regardless of actual spend. I Owe EMIs and chit
    // repayments are real monthly commitments (see calcOutflow's iOweEmi/chitRepay) that don't
    // belong in any of the other seven buckets, so they land here instead of nowhere.
    other: iOweMo + withdrewMo,
  }

  // Includes the credit-card statement balance: it is money leaving this month, and omitting
  // it made this total disagree with the Calendar and Lookup figures.
  /* From the shared calculator, so this total cannot drift from the other pages. The food/lifestyle
     splits above are presentation only and sum to o.expenses; insurance and other now pull from the
     shared calculator's own fields instead of an expense-label regex. */
  const lockedMonthly = o.locked
  const cardThisMonth = o.card
  const totalOutflow  = o.total
  // Free / month = income − committed, same as every page (calcOutflow.freeFigures)
  const freeCash     = freeFigures(o, monthlyIncome).free
  const totalRules   = rules.reduce((s:number,r:any) => s + r.limit, 0)

  const chartData = rules.map((r:any) => {
    const budget = Math.round(monthlyIncome * r.limit / 100)
    const actual = ACTUALS[r.id] ?? 0
    const pct    = monthlyIncome > 0 ? Math.round(actual / monthlyIncome * 100) : 0
    return { ...r, budget, actual, pct, over: actual > budget }
  })

  const overCount = chartData.filter((r:any) => r.over).length
  const score     = monthlyIncome === 0 ? 0 : Math.max(0, 100 - Math.round(chartData.filter((r:any)=>r.actual>0).reduce((s:any,r:any) => s + (r.over ? Math.min(30, Math.abs(r.pct - r.limit) * 1.5) : 0), 0)))

  const saveRules = (updated: typeof rules) => { setRules(updated); localStorage.setItem('finflow-budget-rules2', JSON.stringify(updated)) }

  const Metric = ({ label, value, sub, color='text-[var(--text)]' }: any) => (
    <div>
      <div className="text-[12px] " style={{color:'var(--text-muted)'}}>{label}</div>
      <div className={`mono font-bold text-lg ${color}`}>{value}</div>
      {sub && <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{sub}</div>}
    </div>
  )

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'loans',    label: '🏦 Loans' },
    { id: 'cards',    label: '💳 Cards' },
    { id: 'iowe',     label: '🤝 I Owe / Owed' },
  ]

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Budget & Spending"
        action={<button className="text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{background: editing ? '#c2410c' : 'var(--bg-hover)', border:'1px solid var(--hairline)', color: editing ? '#fff' : 'var(--text-muted)', cursor:'pointer'}} onClick={() => setEditing(!editing)}>{editing ? '✓ Done editing' : '✏ Edit limits'}</button>}
      />

      <HorizonBar />

      {/* ── INCOME VS OUTFLOW ── */}
      <div className="space-y-3 text-[13px]">

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {label:'Monthly Income', val:fmtINR(monthlyIncome), color:'var(--success)', sub:'total income'},
            /* Shared line. This page folded chit repayment into "EMIs" and then omitted chit from
               its own list, so ₹25,000 was counted under a label that did not mention it. */
            {label:'Total Outflow',  val:fmtINR(totalOutflow),  color:'var(--danger)',
              /* Tier split only — see /lookup for the itemised components. */
              sub:outflowTierLine(o), to:'/lookup'},
            {label:'Free / month',   val:(freeCash>=0?'+':'-')+fmtINR(Math.abs(freeCash))+incomePct(freeCash, monthlyIncome), color:freeCash>=0?'var(--purple)':'var(--warning)', sub:(freeCash<0?'🚨 deficit':freeCash<monthlyIncome*0.1?'⚠ low buffer':'✓ healthy')+' · before card bills'},
            {label:'Budget Score',   val:`${score}/100`, color:score>=70?'var(--success)':score>=40?'var(--warning)':'var(--danger)', sub:score>=70?'On track ✓':score>=40?'Needs work':'Off track 🚨'},
          ].map(m=>(
            /* `to` makes a tile navigable. The Total Outflow tile needs it now that it shows only
               the tier split — the itemised components live on /lookup. */
            <div key={m.label} onClick={()=>{ if ((m as any).to) navigate((m as any).to) }}
                 className={`rounded-2xl px-4 py-3 relative overflow-hidden ${(m as any).to ? 'card-link' : ''}`}
                 title={(m as any).to ? 'See the full breakdown' : undefined}
                 style={{background:`linear-gradient(180deg, color-mix(in srgb, ${m.color} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`,border:`1px solid var(--hairline)`}}>
              <div className="relative">
              <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color: 'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:m.color}} />{m.label}</div>
              <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{color:m.color}}>{m.val}</div>
              <div className="text-[11px] mt-0.5" style={{color: 'var(--text-faint)'}}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <IncomeSplitCard o={o} income={monthlyIncome} />
      </div>

            {/* ── TABS ── */}
      <SegTabs options={TABS as any} value={activeTab as any} onChange={(id: any) => setActiveTab(id)} />

      {/* ── TAB: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-2">
          <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
            {/* Header */}
            <div className="hidden md:grid px-4 py-2 text-[12px] font-medium border-b"
              style={{gridTemplateColumns:'minmax(190px,1.6fr) minmax(90px,0.8fr) minmax(100px,0.9fr) minmax(170px,1.8fr) minmax(100px,0.9fr)',columnGap:16,borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 4%, transparent)',color:'var(--text-faint)'}}>
              <span>Category</span><span className="text-right">Spent</span><span className="text-right">Budget</span><span>Used</span><span className="text-right">Status</span>
            </div>
            {chartData.map((r:any,idx:number) => {
              const used = r.budget > 0 ? Math.round(r.actual / r.budget * 100) : 0
              const barColor = r.over ? 'var(--danger)' : used >= 80 ? 'var(--warning)' : r.color
              return (
              <div key={r.id} className="grid items-center px-4 py-3 gap-y-2 hover:bg-[var(--bg-hover)] transition-colors grid-cols-2 md:[grid-template-columns:minmax(190px,1.6fr)_minmax(90px,0.8fr)_minmax(100px,0.9fr)_minmax(170px,1.8fr)_minmax(100px,0.9fr)]"
                style={{columnGap:16,borderTop:idx===0?'none':'1px solid var(--hairline)'}}>
                <div className="flex items-center gap-2.5 min-w-0 col-span-2 md:col-span-1">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:`color-mix(in srgb, ${r.color} 14%, transparent)`}}>{r.icon}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-[13px] truncate">{r.label}</div>
                    {editing ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <input type="number" aria-label={`${r.label} limit percent`} className="input w-14 text-[11px] py-0.5 px-1.5" value={r.limit}
                          onChange={e => saveRules(rules.map((x:any) => x.id===r.id ? {...x,limit:Number(e.target.value)} : x))} />
                        <span className="text-[11px]" style={{color:'var(--text-faint)'}}>% of income</span>
                      </div>
                    ) : <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{r.limit}% of income · {r.pct}% used</div>}
                  </div>
                </div>
                <div className="md:text-right"><div className="md:hidden text-[11px]" style={{color:'var(--text-faint)'}}>Spent</div><span className="mono font-semibold text-[13px] tabular-nums" style={{color:r.over?'var(--danger)':'var(--text)'}}>{fmtINR(r.actual)}</span></div>
                <div className="text-right md:text-right"><div className="md:hidden text-[11px]" style={{color:'var(--text-faint)'}}>Budget</div><span className="mono text-[13px] tabular-nums" style={{color:'var(--text-muted)'}}>{fmtINR(r.budget)}</span></div>
                <div className="col-span-2 md:col-span-1">
                  <div className="h-2 rounded-full overflow-hidden" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)'}} role="progressbar" aria-valuenow={Math.min(used,100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.label}: ${used}% of budget used`}>
                    <div className="h-full rounded-full transition-all" style={{width:`${Math.min(100,used)}%`,background:barColor}}/>
                  </div>
                  <div className="text-[11px] mt-1 tabular-nums" style={{color:r.over?'var(--danger)':'var(--text-faint)'}}>{r.actual===0?'Nothing spent yet':`${used}% of budget used`}</div>
                </div>
                <div className="col-span-2 md:col-span-1 md:text-right">
                  <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{background:r.over?'color-mix(in srgb, var(--danger) 13%, transparent)':r.actual===0?'color-mix(in srgb, var(--text) 8%, transparent)':'color-mix(in srgb, var(--success) 13%, transparent)',color:r.over?'var(--danger)':r.actual===0?'var(--text-muted)':'var(--success)'}}>
                    {r.over?`⚠ over by ${fmtINR(r.actual-r.budget)}`:r.actual===0?'No data':'✓ Within budget'}
                  </span>
                </div>
              </div>
            )})}
          </div>

          {/* Suggestions */}
          {freeCash > 0 && (
            <div className="rounded-2xl p-4" style={{background:'color-mix(in srgb, var(--warning) 8%, transparent)',border:'1px solid color-mix(in srgb, var(--warning) 28%, transparent)'}}>
              <div className="text-[13px] font-semibold mb-2 text-yellow-400">💡 {fmtINR(freeCash)}/mo unallocated — where should it go?</div>
              <div className="space-y-1 text-[11px]">
                {(savMo+invMo) < monthlyIncome*0.20 && <div style={{color:'var(--text-muted)'}}>📈 <b>Boost savings</b> to 20% — add <span className="mono font-semibold tracking-tight text-green-400">{fmtINR(Math.round(monthlyIncome*0.20)-(savMo+invMo))}/mo</span> more to SIP/savings</div>}
                {totalLoanEmi > monthlyIncome*0.40 && <div style={{color:'var(--text-muted)'}}>🏦 <b>Prepay loans</b> — EMIs are {Math.round(totalLoanEmi/monthlyIncome*100)}% of income, consider prepaying to reduce interest</div>}
                <div style={{color:'var(--text-muted)'}}>🛡️ <b>Emergency fund</b> — target {fmtINR(totalOutflow*3)} to {fmtINR(totalOutflow*6)} (3-6 months)</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: LOANS ── */}
      {activeTab === 'loans' && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total EMI/mo', val: fmtINR(totalLoanEmi), sub: `${activeLoans.length} active loans`, color: 'text-red-400' },
              { label: 'Principal Left', val: fmtINR(totalLoanPrincipal), sub: 'outstanding balance', color: 'text-[var(--text)]' },
              { label: 'Interest Left', val: fmtINR(totalLoanIntLeft), sub: 'future cost of debt', color: 'text-orange-400' },
            ].map(m => (
              <div key={m.label} className="rounded-2xl p-3" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
                <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>{m.label}</div>
                <div className={`mono font-bold text-lg ${m.color}`}>{m.val}</div>
                <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* By loan type */}
          <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
            <div className="px-4 py-2 text-[13px] font-semibold" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-muted)'}}>By Loan Type vs Budget Limit</div>
            {[
              { label: '🏠 Home Loan', emi: homeEmi,      pct: Math.round(homeEmi/Math.max(1,monthlyIncome)*100),      limit: rules.find((r:any)=>r.id==='housing')?.limit??30, color: '#3b82f6' },
              { label: '🚗 Car/Bike',  emi: carEmi,       pct: Math.round(carEmi/Math.max(1,monthlyIncome)*100),       limit: rules.find((r:any)=>r.id==='vehicle')?.limit??15, color: '#f59e0b' },
              { label: '🏦 Other',     emi: otherLoanEmi, pct: Math.round(otherLoanEmi/Math.max(1,monthlyIncome)*100), limit: rules.find((r:any)=>r.id==='debt')?.limit??10,    color: 'var(--danger-strong)' },
            ].filter(r => r.emi > 0).map(r => (
              <div key={r.label} className="px-4 py-3 border-b" style={{borderColor:'var(--hairline)'}}>
                <div className="flex justify-between mb-1 text-[13px]">
                  <span className="font-semibold">{r.label}</span>
                  <span className="mono font-bold">{fmtINR(r.emi)}/mo <span className="text-[11px]" style={{color:'var(--text-faint)'}}>({r.pct}% vs {r.limit}% limit)</span></span>
                </div>
                <div className="relative h-1.5 rounded-full overflow-hidden" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)'}}>
                  <div className="absolute top-0 left-0 h-full rounded-full" style={{width:`${r.limit}%`,background:r.color,opacity:0.2}} />
                  <div className="absolute top-0 left-0 h-full rounded-full" style={{width:`${Math.min(100,r.pct)}%`,background:r.pct>r.limit?'var(--danger-strong)':r.color}} />
                  <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-white opacity-60" style={{left:`${r.limit}%`}} />
                </div>
              </div>
            ))}
          </div>

          {/* Per loan */}
          <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
            <div className="px-4 py-2 text-[13px] font-semibold" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-muted)'}}>All Active Loans</div>
            {activeLoans.map((l:any) => {
              const e=getEff(l), t=l.tenure??(e.paid+e.pending), sp=calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined)
              const pct = Math.round(e.paid/Math.max(1,e.paid+e.pending)*100)
              return (
                <div key={l.id} className="px-4 py-3 border-b" style={{borderColor:'var(--hairline)'}}>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-[13px]">{l.lender}</span>
                    <span className="mono text-[13px] text-red-400">{fmtINR(l.emi)}/mo</span>
                  </div>
                  <div className="flex gap-4 text-[11px] mb-1.5" style={{color:'var(--text-faint)'}}>
                    <span>Principal left: <span className="mono" style={{color:'var(--text)'}}>{fmtINR(sp.princLeft)}</span></span>
                    <span>Int left: <span className="mono text-orange-400">{fmtINR(sp.intLeft)}</span></span>
                    <span>{e.pending}mo left</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)'}}>
                    <div className="h-full bg-blue-500 rounded-full" style={{width:`${pct}%`}} />
                  </div>
                  <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{pct}% paid · {l.loanType}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB: CARDS ── */}
      {activeTab === 'cards' && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'CC Utilization', val: `${ccUtilization}%`, sub: `${ccOutstanding+ccSpendsCurrent+ccEmiPending} used of ${fmtINR(totalCCLimit)}`, color: ccUtilization>70?'text-red-400':ccUtilization>40?'text-yellow-400':'text-green-400' },
              { label: 'Outstanding',    val: fmtINR(ccOutstanding),    sub: 'pay this cycle',    color: 'text-red-400' },
              { label: 'CC EMI/mo',      val: fmtINR(ccEmiMonthly),     sub: `${fmtINR(ccEmiPending)} total pending`, color: 'text-yellow-400' },
              { label: 'This Mo Spends', val: fmtINR(ccSpendsCurrent),  sub: 'current month',    color: 'text-orange-400' },
            ].map(m => (
              <div key={m.label} className="rounded-2xl p-3" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
                <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>{m.label}</div>
                <div className={`mono font-bold text-lg ${m.color}`}>{m.val}</div>
                <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Per card */}
          <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
            <div className="px-4 py-2 text-[13px] font-semibold" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-muted)'}}>Per Card Breakdown</div>
            {(cards as any[]).map((c:any) => {
              const emi = (c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+Number(e.emi??0),0)
              const emiPending = (c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+getEff(e).pending*Number(e.emi??0),0)
              const spends = (c.spends??[]).filter((sp:any)=>{if(!sp.spendDate)return true;const d=new Date(sp.spendDate);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((a:number,sp:any)=>a+Number(sp.amount??0),0)
              const used = cardLimitUse(c).used
              const util = cardLimitUse(c).limit>0 ? Math.round(cardLimitUse(c).rawPct) : 0
              const utilColor = util>70?'var(--danger-strong)':util>40?'#f59e0b':'var(--success-strong)'
              return (
                <div key={c.id} className="px-4 py-3 border-b" style={{borderColor:'var(--hairline)'}}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold">{c.banker}</span>
                    <span className="text-[11px] mono font-bold" style={{color:utilColor}}>{util}% used</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)'}}>
                    <div className="h-full rounded-full" style={{width:`${Math.min(100,util)}%`,background:utilColor}} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div><div style={{color:'var(--text-faint)'}}>Outstanding</div><div className="mono font-bold text-red-400">{fmtINR(c.outstanding??0)}</div></div>
                    <div><div style={{color:'var(--text-faint)'}}>EMI/mo</div><div className="mono font-bold text-yellow-400">{fmtINR(emi)}</div><div className="text-[11px]" style={{color:'var(--text-faint)'}}>{fmtINR(emiPending)} pending</div></div>
                    <div><div style={{color:'var(--text-faint)'}}>Spends (this mo)</div><div className="mono font-bold text-orange-400">{fmtINR(spends)}</div></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB: I OWE / OWED ── */}
      {activeTab === 'iowe' && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{background:'var(--bg-card)',border:'1px solid color-mix(in srgb, var(--danger-strong) 25%, transparent)'}}>
              <div className="text-[12px] mb-1 text-red-400">I Owe (Personal)</div>
              <div className="mono font-bold text-2xl text-red-400">{fmtINR(iOwePending)}</div>
              <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>{fmtINR(iOweMo)}/mo EMI · {(personal as any[]).filter((p:any)=>!(p.emi>0)).length} lump sums</div>
              {(personal as any[]).map((p:any) => (
                <div key={p.id} className="flex justify-between text-[11px] mt-2 pt-2 border-t" style={{borderColor:'var(--hairline)'}}>
                  <span>{p.person}</span>
                  <span className="mono font-semibold tracking-tight text-red-400">{fmtINR(ioweFacts(p).principalLeft)} left</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl p-4" style={{background:'var(--bg-card)',border:'1px solid color-mix(in srgb, var(--success-strong) 25%, transparent)'}}>
              <div className="text-[12px] mb-1 text-green-400">People Owe Me</div>
              <div className="mono font-bold text-2xl text-green-400">{fmtINR(peopleOwePending)}</div>
              <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>{(peopleOwe as any[]).filter((p:any)=>p.status!=='Paid').length} pending</div>
              {(peopleOwe as any[]).filter((p:any)=>p.status!=='Paid').map((p:any) => {
                const pending = Number(p.amount??0)-Number(p.paidAmount??0)
                const days = p.expectedDate ? Math.ceil((new Date(p.expectedDate).getTime()-now.getTime())/(1000*60*60*24)) : null
                return (
                  <div key={p.id} className="flex justify-between text-[11px] mt-2 pt-2 border-t" style={{borderColor:'var(--hairline)'}}>
                    <div>
                      <div>{p.person}</div>
                      {days!==null&&<div className={`text-[11px] ${days<0?'text-red-400':days<30?'text-yellow-400':'text-green-400'}`}>{days<0?`${Math.abs(days)}d overdue`:`${days}d left`}</div>}
                    </div>
                    <span className="mono font-semibold tracking-tight text-green-400">{fmtINR(pending)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Net position */}
          <div className="rounded-2xl p-4" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
            <div className="text-[12px] mb-2" style={{color:'var(--text-muted)'}}>Net Personal Finance Position</div>
            <div className="flex items-center justify-between">
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>People owe you <span className="mono font-bold text-green-400">{fmtINR(peopleOwePending)}</span></div>
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>You owe <span className="mono font-bold text-red-400">{fmtINR(iOwePending)}</span></div>
            </div>
            <div className="mt-2 text-center">
              <div className={`text-2xl font-semibold tracking-tight mono ${peopleOwePending-iOwePending>=0?'text-green-400':'text-red-400'}`}>
                {peopleOwePending-iOwePending>=0?'+':''}{fmtINR(peopleOwePending-iOwePending)}
              </div>
              <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{peopleOwePending-iOwePending>=0?'net positive — more is owed to you':'net negative — you owe more than owed to you'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
