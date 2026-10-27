import { PageHeader, LoadingSpinner, ErrorState } from '../components/common'
import { incomePct } from '../utils/incomePct'
import { useState, useEffect, useRef } from 'react'
import { useNavigateFrom } from '../hooks/useNavigateFrom'
import { ChevronDown } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { useHorizonState } from '../utils/horizonStore'
import { advanceAll } from '../utils/projection'
import HorizonBar from '../components/common/HorizonBar'
import IncomeSplitCard from '../components/common/IncomeSplitCard'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import axiosApi from '../api/axios'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi, incomeApi, expensesApi, insuranceApi, snapshotApi } from '../api'
import { calcOutflow, outflowTierLine } from '../utils/calcOutflow'
import { calcDebt, debtRows } from '../utils/calcDebt'
import { investTotals } from '../utils/investValue'
import { debtFreeMonths } from '../utils/debtFree'
import { fmtINR, getEff, monthlyIncomeTotal } from '../utils/format'
import { calcLoanSplit } from '../utils/loanCalc'

function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0)
  const ref = useRef<number>(0)
  useEffect(() => {
    const start = ref.current
    const diff = target - start
    const startTime = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      ref.current = start + diff * ease
      setValue(Math.round(ref.current))
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target])
  return value
}

export default function DashboardPage() {
  const navigate = useNavigateFrom()
  const qc = useQueryClient()
  const peopleOweMeApi2 = { getAll: () => axiosApi.get<{data:any[]}>('/people-owes').then(r=>r.data.data) }
  const { data: loansRaw = [],       isLoading: l1, isError: e1 } = useQuery({ queryKey: ['loans'],       queryFn: loansApi.getAll })
  const { data: cardsRaw = [],       isLoading: l2, isError: e2 } = useQuery({ queryKey: ['cards'],       queryFn: cardsApi.getAll })
  const { data: personalRaw = [],    isLoading: l3, isError: e3 } = useQuery({ queryKey: ['personal'],    queryFn: personalEmiApi.getAll })
  const { data: savingsRaw = [],     isLoading: l4, isError: e4 } = useQuery({ queryKey: ['savings'],     queryFn: savingsApi.getAll })
  const { data: investmentsRaw = [], isLoading: l5, isError: e5 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const { data: income = [],      isLoading: l6, isError: e6 } = useQuery({ queryKey: ['income'],      queryFn: incomeApi.getAll })
  const { data: expensesRaw = [],    isLoading: l7, isError: e7 } = useQuery({ queryKey: ['expenses'],    queryFn: expensesApi.getAll })
  const { data: insuranceRaw = [],   isLoading: l8, isError: e8 } = useQuery({ queryKey: ['insurance'],   queryFn: insuranceApi.getAll })
  const { data: peopleOweMe = [], isLoading: l10, isError: e10 } = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweMeApi2.getAll })
  const { data: snapshots = [], isFetched: snapsFetched } = useQuery({ queryKey: ['snapshots'], queryFn: snapshotApi.getLast6 })
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
  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8||l10
  // Was `e6` alone (income only) — a failure in loans, cards, personal, savings, investments,
  // expenses, insurance or peopleOwe rendered as a silently zeroed dashboard instead of an error.
  const isError = e1||e2||e3||e4||e5||e6||e7||e8||e10

  const [showInsights, setShowInsights] = useState(false)
  const snapMut = useMutation({ mutationFn: (v: { netWorth: number; silent?: boolean }) => snapshotApi.generate({ netWorth: v.netWorth }), onSuccess: (_d, v)=>{ qc.invalidateQueries({queryKey:['snapshots']}); qc.invalidateQueries({queryKey:['snapshots-all']}); if (!v.silent) toast.success('Snapshot saved') }, onError: ()=>toast.error('Could not save the snapshot') })
  const [showChart, setShowChart] = useState(false)

  // ── DEBT ──
  const totalCC = cards.reduce((s:number, c:any) => s + Number(c.outstanding ?? 0), 0)
  const totalCCEmiPending = cards.reduce((s:number, c:any) => s + (c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+(e.emi??0)*getEff(e).pending,0), 0)
  // Was a raw sum with no friend-owed exclusion — calcDebt.ts's `ccSpends` (baked into `totalDebt`
  // below) excludes a spend tagged "for a friend" and not yet settled, so this page's own itemised
  // CC Spends row/chart could show MORE than what the headline Debt total actually counts for it.
  const isFriendOwedSpend = (sp: any) => !!sp?.owedBy && !sp?.owedSettled
  const ccSpends = cards.reduce((s:number, c:any) => s + (c.spends??[]).filter((sp:any)=>!isFriendOwedSpend(sp)).reduce((a:number,sp:any)=>a+Number(sp.amount??0),0), 0)
  const ccEmi = cards.reduce((s:number, c:any) => s + (c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+Number(e.emi??0),0), 0)
  const totalLoans = loans.reduce((s:number, l:any) => {
    const e=getEff(l),t=l.tenure??(e.paid+e.pending)
    return s + calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined).princLeft
  }, 0)
  const totalLoanIntLeft = loans.reduce((s:number, l:any) => {
    const e=getEff(l),t=l.tenure??(e.paid+e.pending)
    return s + calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined).intLeft
  }, 0)
  const chitRepayDebt = savings.filter((v:any)=>(v.mode==='withdrew'||v.prizeTaken)&&getEff(v).pending>0).reduce((s:number,v:any)=>s+getEff(v).pending*Number(v.monthly??0),0)
  /* Shared with Hub via utils/calcDebt. These two pages reported ₹24,84,938 and ₹27,16,233 for the
     same data — the gap was remaining loan interest, which Hub included and this page did not. */
  const d = calcDebt(loans as any[], cards as any[], personal as any[], savings as any[])
  const totalDebt = d.total
  // Was a raw sum of every personal entry's `amount`, which double-counts interest-only entries
  // (their principal never reduces) and ignores amortising ones already partly repaid.
  // `iOwePrincipal` (via `ioweFacts`) is the same figure ClosedLoans/PersonalEmi use.
  const iOweTotal = d.iOwePrincipal

  // ── ASSETS ──
  const totalSavings = savings.filter((v:any)=>v.mode!=='withdrew'&&!v.prizeTaken).reduce((s:number,v:any)=>s+getEff(v).paid*Number(v.monthly??0),0)
  const totalCurrentValue = investTotals(investments as any[]).value
  const totalInvested = investments.reduce((s:number,v:any)=>s+Number(v.totalInvested??0),0)
  const investmentPnL = totalCurrentValue - totalInvested
  const peopleOweTotal = (peopleOweMe as any[]).filter((p:any)=>p.status!=='Paid'&&p.status!=='Settled').reduce((s:number,p:any)=>s+Number(p.amount??0)-Number(p.paidAmount??0),0)
  const totalOwnedAssets = loans.reduce((s:number,l:any)=>s+Number(l.currentValue??0),0)
  const ownedAssetsPending = loans.filter((l:any)=>Number(l.currentValue??0)>0).reduce((s:number,l:any)=>s+getEff(l).pending*Number(l.emi??0),0)
  const netOwnedAssets = totalOwnedAssets - ownedAssetsPending
  const totalAssets = totalSavings + totalCurrentValue + netOwnedAssets + peopleOweTotal
  /* Net worth uses PRINCIPAL, not the interest-inclusive debt total.
     Debt headlines report "total still to pay" — principal plus interest yet to come — because that
     is what the money will actually cost. But net worth answers a different question: what is owned
     minus what is owed *today*. Interest that has not accrued is not a present liability, and it
     would be serviced out of income not yet earned, so counting it here charges the same future
     rupee twice. `totalPrincipal` is the settle-today figure from the same calculator, so the two
     readings can never drift apart. */
  const netWorth = totalAssets - d.totalPrincipal

  // Record this month's net worth once, so the trend line builds itself instead of waiting for a click.
  // Only from real (not look-ahead) data, and only when this month has no recorded figure yet.
  const recordedThisMonth = (snapshots as any[]).some(s => s.monthYear === new Date().toISOString().slice(0, 7) && Number(s.netWorth ?? 0) !== 0)
  const autoSnapTried = useRef(false)
  useEffect(() => {
    if (autoSnapTried.current || isLoading || isError || !snapsFetched || hz.horizon || recordedThisMonth || netWorth === 0) return
    autoSnapTried.current = true
    snapMut.mutate({ netWorth: Math.round(netWorth), silent: true })
  }, [isLoading, isError, snapsFetched, hz.horizon, recordedThisMonth, netWorth])

  // ── CASH FLOW ──
  const monthlyIncome = monthlyIncomeTotal(income)
  /* Every component now comes from utils/calcOutflow so this page cannot drift from Lookup,
     Budget, Calendar or Hub again. The variable names are unchanged so the JSX below is untouched. */
  const o = calcOutflow(loans, cards, personal, savings, investments, expenses, insurance)
  // Was hardcoded to 0 with a comment claiming `o.iOweEmi` superseded it — nothing ever actually
  // read `o.iOweEmi`, so personal-loan EMIs were silently excluded from the "I Owe" sub-label, the
  // 12-month free-cash projection, and the Income-vs-Outflow chart's "Others" bar below.
  const persEmi = o.iOweEmi
  const loanEmi = o.loanEmi
  const savMo = o.savings
  const withdrewMo = o.chitRepay
  const insMo = o.insuranceEmi   // normalised by frequency in the shared calculator
  const sipMo = o.sipInvest
  const expMo = o.expenses
  // Total money leaving this month, including the credit-card statement balance.
  // The CC balance used to be excluded here, so this page reported an outflow lower
  // than Lookup, Calendar, Budget and the Hub by exactly that amount.
  // Two tiers from the shared calculator: `locked` repeats every month, `card` is this month only.
  const lockedMonthly   = o.locked
  const cardThisMonth   = o.card
  const recurringOutflow = o.total
  const freeCash = monthlyIncome - recurringOutflow
  // recurringOutflow already contains totalCC and ccSpends — don't subtract them twice.
  const freeCashThisMonth = monthlyIncome - recurringOutflow
  const dti = monthlyIncome > 0 ? Math.round((loanEmi + ccEmi) / monthlyIncome * 100) : 0
  const savingsRate = monthlyIncome > 0 ? Math.round((savMo + sipMo) / monthlyIncome * 100) : 0

  // ── SNAPSHOTS ──
  const trendData = [...snapshots].reverse()
  const thisYM = new Date().toISOString().slice(0, 7)
  // "vs last snapshot" means last MONTH's: this month's own snapshot is today's figure, so comparing
  // against it always reads zero. Older snapshots (before net worth was recorded) carry 0 — skip those.
  const lastSnap = [...trendData].reverse().find((s: any) => s.monthYear < thisYM && Number(s.netWorth ?? 0) !== 0) ?? null
  const nwTrend = lastSnap ? (() => {
    const diff = netWorth - Number(lastSnap.netWorth ?? 0)
    return Math.abs(diff) > 1000 ? diff : undefined
  })() : undefined
  const assetsTrend = lastSnap && Number(lastSnap.assets??0) > 0 ? totalAssets - Number(lastSnap.assets??0) : undefined
  const debtTrend   = lastSnap && Number(lastSnap.debt??0)   > 0 ? totalDebt  - Number(lastSnap.debt??0)   : undefined

  // ── PAYOFF ──
  const payoff = loans.filter((l:any)=>getEff(l).pending>0&&(l.tenure??0)>0).map((l:any)=>{
    const e=getEff(l),t=l.tenure??0,sp=calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined)
    const rate = (l.amount??0)>0 ? (Math.max(0,(l.emi??0)*t-(l.amount??0))/(l.amount??1)/(t/12)*100) : 0
    return {lender:l.lender,emi:l.emi??0,intLeft:sp.intLeft,rate,pending:e.pending,paid:e.paid}
  }).sort((a:any,b:any)=>b.rate-a.rate).slice(0,4)

  const currentPaceMonths = debtFreeMonths(loans as any[], cards as any[], personal as any[], savings as any[]) || null

  const animatedNW = useAnimatedNumber(netWorth)

  // ── PROJECTION DATA ──
  const projData = Array.from({length:12},(_,mo)=>{
    const activeLoanEmi = loans.filter((l:any)=>getEff(l).pending>mo).reduce((s:number,l:any)=>s+Number(l.emi??0),0)
    const activeCCEmi = (cards as any[]).reduce((s:number,c:any)=>s+(c.emis??[]).filter((e:any)=>getEff(e).pending>mo).reduce((a:number,e:any)=>a+Number(e.emi??0),0),0)
    const activeWithdrew = savings.filter((v:any)=>(v.mode==='withdrew'||v.prizeTaken)&&getEff(v).pending>mo).reduce((s:number,v:any)=>s+Number(v.monthly??0),0)
    const ccOneTime = mo===0?(totalCC+ccSpends):0
    const outflow = activeLoanEmi+activeCCEmi+persEmi+savMo+activeWithdrew+insMo+sipMo+expMo+ccOneTime
    const free = monthlyIncome-outflow
    const d=new Date(); d.setMonth(d.getMonth()+mo)
    return {month:d.toLocaleDateString('en-IN',{month:'short'}),free:Math.round(free)}
  })
  const projCumulative = projData.reduce((acc:any[],d,i)=>[...acc,{...d,cumulative:Math.round((acc[i-1]?.cumulative??0)+d.free)}],[])

  // ── NET WORTH TRAJECTORY (forward-looking) ──
  // Ported from the retired Finance Overview page. This is distinct from "Net Worth History"
  // below, which only plots saved snapshots (the past) — this instead forecasts forward using the
  // same loan payoff schedule as `payoff`/`currentPaceMonths` above, so it can show when net worth
  // is projected to turn positive even with zero snapshots saved yet.
  const nwMaxPending = loans.reduce((m:number,l:any)=>Math.max(m,getEff(l).pending),0)
  const nwChartData = Array.from({length:Math.min(nwMaxPending+1,37)},(_,mo)=>{
    const lLeft = loans.reduce((s:number,l:any)=>s+Math.max(0,getEff(l).pending-mo)*Number(l.emi??0),0)
    const nw = Math.round((totalSavings+totalCurrentValue+netOwnedAssets-lLeft-iOweTotal-Math.max(0,chitRepayDebt*(1-mo/Math.max(1,nwMaxPending)))-totalCCEmiPending)/1000)
    const d=new Date(); d.setMonth(d.getMonth()+mo)
    return {month:d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),nw}
  })
  const nwZeroMonth = nwChartData.findIndex((x:any)=>x.nw>=0)
  const nwZeroDate = nwZeroMonth >= 0
    ? (()=>{ const d=new Date(); d.setMonth(d.getMonth()+nwZeroMonth); return d.toLocaleDateString('en-IN',{month:'short',year:'numeric'}) })()
    : null

  // ── MATURING INVESTMENTS (≤ 12 months) ──
  // Also ported from Finance Overview — Dashboard had no surface for "something is about to mature
  // and needs a decision" before this.
  const maturingSoon = investments.filter((v:any) => {
    if (!v.endDate) return false
    const days = Math.ceil((new Date(v.endDate).getTime()-new Date().getTime())/(1000*60*60*24))
    return days > 0 && days <= 365
  })
  const maturingTotal = maturingSoon.reduce((s:number,v:any)=>s+Number(v.maturityValue??v.currentValue??0),0)

  // ── LOADING ──
  if (isLoading) return (
    <div className="space-y-4 animate-pulse">
      <HorizonBar />
      <div className="rounded-2xl p-6" style={{background:'var(--bg-card)'}}>
        <div className="h-3 w-20 rounded mb-3" style={{background:'var(--bg-hover)'}} />
        <div className="h-12 w-52 rounded mb-4" style={{background:'var(--bg-hover)'}} />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i=><div key={i} className="h-16 rounded-xl" style={{background:'var(--bg-hover)'}} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[1,2,3].map(i=><div key={i} className="rounded-2xl h-64" style={{background:'var(--bg-card)'}} />)}
      </div>
    </div>
  )

  if (isError) return <ErrorState message="Couldn't load your finance data." onRetry={() => qc.invalidateQueries()} />

  // The Debt tile's sub-label used to be just `debtLabel(d)` — "6 loans · CC · I Owe · chit", with
  // no numbers. CC outstanding + unbilled spends were already fully included in `totalDebt` above,
  // but with nothing but the word "CC" to show for it, it read as if they were missing. Now the
  // actual CC balance is spelled out, same convention Master Table's "Outstanding + Spend" tile uses.
  const ccBalance = totalCC + ccSpends
  const debtSub = [
    totalLoans > 0 ? `${loans.filter((l:any)=>getEff(l).pending>0).length} loans` : null,
    ccBalance > 0 ? `CC bal ${fmtINR(ccBalance)}` : (totalCCEmiPending > 0 ? 'CC EMI' : null),
    iOweTotal > 0 ? 'I Owe' : null,
    chitRepayDebt > 0 ? 'chit' : null,
      d.interestLeft > 0 ? `incl. ${fmtINR(d.interestLeft)} interest to come` : null,
  ].filter(Boolean).join(' · ')

  const missed = [
    ...loans.filter((l:any)=>(l.missedMonths??0)>0).map((l:any)=>`${l.lender} (${l.missedMonths} missed)`),
    ...(cards as any[]).flatMap((c:any)=>(c.emis??[]).filter((e:any)=>(e.missedMonths??0)>0).map((e:any)=>`${c.banker} EMI (${e.missedMonths} missed)`)),
  ]

  return (
    <div className="space-y-4 text-[13px]">
      <HorizonBar />
      {/* MISSED PAYMENTS */}
      {missed.length > 0 && (
        <div className="rounded-2xl p-4" style={{background:'color-mix(in srgb, var(--danger-strong) 8%, transparent)',border:'1px solid color-mix(in srgb, var(--danger-strong) 25%, transparent)'}}>
          <div className="font-semibold text-red-400 mb-1 text-[13px]">⚠️ Missed EMIs</div>
          <div className="text-[11px]" style={{color:'var(--text-muted)'}}>{missed.join(' · ')}</div>
        </div>
      )}

      {/* NET WORTH HERO */}
      <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)'}}>
        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-[12px] font-medium mb-0.5" style={{color:'var(--text-muted)'}}>Net worth <span style={{color:'var(--text-faint)'}}>· as of {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span></div>
              <div className={`text-2xl font-semibold tracking-tight tabular-nums whitespace-nowrap ${netWorth>=0?'text-green-400':'text-red-400'}`}>
                {netWorth<0?'−':''}{fmtINR(Math.abs(animatedNW))}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[11px]">
              {nwTrend !== undefined && (
                <span className={`font-semibold ${nwTrend>=0?'text-green-400':'text-red-400'}`}>
                  {nwTrend>=0?'↑':'↓'} {fmtINR(Math.abs(nwTrend))} vs last snapshot
                </span>
              )}
              <span style={{color:'var(--text-faint)'}}>
                <span className="text-[11px]">{freeCash>=0?'✓ Positive cash flow':'🚨 Deficit spending'}</span>
                <button onClick={()=>setShowChart(true)}
                  className="ml-2 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
                  style={{border:'1px solid var(--border)',color:'var(--text-muted)'}}>
                  View charts →
                </button>
              </span>
            </div>
          </div>
          <div className="flex-shrink-0 w-44">
            <div className="text-[12px] font-medium mb-1" style={{color:'var(--text-muted)'}}>
              {trendData.length>=2?'Net Worth Trend':'Net Worth Trend'}
            </div>
            {trendData.length>=2 ? (
              <ResponsiveContainer width="100%" height={44}>
                <AreaChart data={trendData.map((s:any)=>({mo:s.monthYear?.slice(5,7),nw:Math.round(Number(s.netWorth??0)/1000)}))} margin={{left:0,right:0,top:2,bottom:0}}>
                  <defs><linearGradient id="nwGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--success-strong)" stopOpacity={0.4}/><stop offset="95%" stopColor="var(--success-strong)" stopOpacity={0}/></linearGradient></defs>
                  <XAxis dataKey="mo" tick={{fontSize:7,fill:'var(--text-faint)'}} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:10}} formatter={(v:any)=>[`₹${v}K`,'']}/>
                  <Area type="monotone" dataKey="nw" stroke="var(--success-strong)" fill="url(#nwGrad2)" strokeWidth={2} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <button className="btn-secondary btn-xs" title="Save today's net worth so the trend line can start" disabled={snapMut.isPending} onClick={()=>snapMut.mutate({ netWorth: Math.round(netWorth) })}>{snapMut.isPending?'Saving…':'Save first snapshot'}</button>
            )}
          </div>
        </div>

        {/* 4 metrics strip */}

        <div className="grid grid-cols-4 gap-2 px-4 pb-3 pt-1">
          {[
            /* Assets and Debt had no `to`, so two of the four tiles in this strip were dead ends
               while the other two navigated — inconsistent, and no way to drill in from the two
               figures people most want to break down. */
            {label:'Assets',       value:fmtINR(totalAssets), sub:`${fmtINR(totalSavings)} sav · ${fmtINR(netOwnedAssets)} owned`, accent:'var(--success)', delta:assetsTrend, deltaPos:true,  to:'/hub/savings'},
            {label:'Debt',         value:fmtINR(totalDebt),   sub:debtSub,                              accent:'var(--danger)', delta:debtTrend,   deltaPos:false, to:'/hub/debt'},
            /* Used to link to the retired /overview page. That page's job — a fuller breakdown of
               this same free-cash figure — now lives in this page's own Chart Modal, so this tile
               opens that instead of navigating away. */
            {label:'Free / Month', value:`${freeCash>=0?'+':'−'}${fmtINR(Math.abs(freeCash))}${incomePct(freeCash, monthlyIncome)}`, sub:`incl. card bill · ${freeCash>=0?'buffer':'deficit'} vs ${fmtINR(monthlyIncome)} income`, accent:freeCash>=0?'var(--purple)':'var(--danger)', action:()=>setShowChart(true)},
            /* Tier split and itemisation from the shared calculator, so this reads identically on
               Hub, Budget, Calendar and Lookup. The hand-built version here grouped chit repayment
               into "EMIs" and — because `persEmi` was a zero placeholder (now fixed above) — left
               I Owe out of the line entirely, while the total above it included both. */
            {label:'Monthly Outflow', value:fmtINR(recurringOutflow),
              /* Tier split only. This card already links through to /lookup, which itemises every
                 component — repeating all ten here made the card unreadable. */
              sub:outflowTierLine(o), accent:'var(--cyan)', to:'/lookup'},
          ].map(m=>(
            <div key={m.label} className="card-link rounded-2xl px-4 py-3 relative overflow-hidden"
              style={{background:`linear-gradient(180deg, color-mix(in srgb, ${(m as any).accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`,border:`1px solid var(--hairline)`}}
              onClick={()=>{ if ((m as any).action) (m as any).action(); else if ((m as any).to) navigate((m as any).to) }}>
              <div className="relative">
              <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color: 'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:(m as any).accent}} />{m.label}</div>
              <div className="font-semibold tracking-tight tabular-nums text-[16px]" style={{color:(m as any).accent}}>{m.value}</div>
              {(m as any).delta !== undefined && Math.abs((m as any).delta) > 500 && (
                <div className="text-[11px] font-semibold" style={{color:(m as any).deltaPos?((m as any).delta>0?'var(--success)':'var(--danger)'):((m as any).delta<0?'var(--success)':'var(--danger)')}}>
                  {(m as any).delta>0?'↑':'↓'} {fmtINR(Math.abs((m as any).delta))}
                </div>
              )}
              <div className="text-[11px] mt-0.5 truncate" style={{color: 'var(--text-faint)'}}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SMART INSIGHTS */}
      {(() => {
        const insights: {icon:string,text:string,color:string}[] = []
        if (totalCC > 0) insights.push({icon:'🚨',text:`CC outstanding ${fmtINR(totalCC)} — ~40% interest if unpaid this cycle`,color:'text-red-400'})
        if (freeCash > 500 && totalLoans > 0) insights.push({icon:'💡',text:`${fmtINR(freeCash)}/mo free cash — prepaying saves ~${fmtINR(Math.round(freeCash*12*0.12))} interest/yr`,color:'text-green-400'})
        if (dti > 50) insights.push({icon:'⚠️',text:`DTI ${dti}% is high — aim for under 40%`,color:'text-yellow-400'})
        if (savingsRate < 10 && monthlyIncome > 0) insights.push({icon:'📈',text:`Savings rate ${savingsRate}% is low — target 20% to build wealth`,color:'text-blue-400'})
        if (totalSavings < expMo * 3) insights.push({icon:'🛡️',text:`Emergency fund covers ${Math.round(totalSavings/Math.max(1,expMo))} months — target 6 months (${fmtINR(expMo*6)})`,color:'text-orange-400'})
        if (currentPaceMonths) {
          const df=new Date(); df.setMonth(df.getMonth()+currentPaceMonths)
          insights.push({icon:'🎯',text:`Debt free: ${df.toLocaleDateString('en-IN',{month:'short',year:'numeric'})} — ${currentPaceMonths} months at current pace`,color:'text-blue-400'})
        }
        if (insights.length === 0) return null
        return (
          <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)'}}>
            <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{color:'var(--text)'}}>💬 Smart insights</span>
              {insights.length>2 && (
                <button className="text-[12px] font-medium hover:underline" style={{color:'var(--text-muted)'}} onClick={()=>setShowInsights(s=>!s)}>
                  {showInsights?'Show less':`Show all ${insights.length}`}
                </button>
              )}
            </div>
            <div className="pb-1.5">
              {(showInsights?insights:insights.slice(0,2)).map((ins,i)=>(
                <div key={i} className="flex items-start gap-3 px-4 py-1.5">
                  <span className="text-[13px] flex-shrink-0">{ins.icon}</span>
                  <span className={`text-[12px] ${ins.color} flex-1`}>{ins.text}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <IncomeSplitCard o={o} income={monthlyIncome} />

      {/* 3-COL GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* DEBT BREAKDOWN */}
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)'}}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{background:'transparent'}}>
            <span className="text-[13px] font-semibold" style={{color:'var(--text)'}}>Debt Breakdown</span>
            <span className="mono font-bold text-[13px]" style={{color:'var(--danger)'}}>{fmtINR(totalDebt)}</span>
          </div>
          {totalDebt > 0 && (
            <div className="px-4 pt-3 pb-1">
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                {debtRows(d).map((seg,i)=>(
                  <div key={i} title={`${seg.label} ${fmtINR(Math.round(seg.val))}`} style={{width:`${seg.val/totalDebt*100}%`,background:seg.color,minWidth:2}}/>
                ))}
              </div>
            </div>
          )}
          <div>
            {[
              {label:'Principal Remaining',val:totalLoans,sub:`${loans.filter((l:any)=>getEff(l).pending>0).length} loans · ${fmtINR(loanEmi)}/mo`,color:'text-red-400',to:'/loans'},
              {label:'Interest Remaining',val:totalLoanIntLeft,sub:'future cost of borrowing',color:'text-red-400',to:'/loans'},
              totalCC>0&&{label:'CC Outstanding',val:totalCC,sub:'pay this cycle',color:'text-red-400',to:'/cards'},
              totalCCEmiPending>0&&{label:'CC EMI Pending',val:totalCCEmiPending,sub:`${fmtINR(ccEmi)}/mo`,color:'text-yellow-400',to:'/cards'},
              ccSpends>0&&{label:'CC Spends',val:ccSpends,sub:'due next bill — clear now',color:'text-yellow-400',to:'/cards'},
              iOweTotal>0&&{label:'I Owe (Personal)',val:iOweTotal,sub:`${fmtINR(persEmi)}/mo`,color:'text-red-400',to:'/personal'},
              chitRepayDebt>0&&{label:'Chit Repayment',val:chitRepayDebt,sub:`${fmtINR(withdrewMo)}/mo`,color:'text-red-400',to:'/savings'},
            ].filter(Boolean).filter((r:any)=>r.val>0).map((r:any)=>(
              <div key={r.label} className="flex items-center justify-between px-4 py-2 cursor-pointer transition-colors rounded-lg mx-1"
                style={{}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='color-mix(in srgb, var(--text) 5%, transparent)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                onClick={()=>navigate(r.to)}>
                <div>
                  <div className="text-[13px]">{r.label}</div>
                  <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{r.sub}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`mono font-bold text-[13px] ${r.color}`}>{fmtINR(r.val)}</span>
                  <span className="text-[11px]" style={{color:'var(--text-faint)'}}>→</span>
                </div>
              </div>
            ))}
            {currentPaceMonths && (
              <div className="px-4 py-2.5 text-[11px] font-semibold" style={{background:'color-mix(in srgb, var(--success) 6%, transparent)',color:'var(--text-muted)'}}>
                🎯 Debt free in <span className="text-green-400 font-bold">{currentPaceMonths} months</span>
                {(()=>{const d=new Date();d.setMonth(d.getMonth()+currentPaceMonths);return ` · ${d.toLocaleDateString('en-IN',{month:'short',year:'numeric'})}`})()}
              </div>
            )}
          </div>
        </div>

        {/* PAYOFF PRIORITY */}
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)'}}>
          <button type="button" onClick={()=>navigate('/payoff')} title="Open the payoff plan — see which debt to clear first with this free cash"
            className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-white/5" style={{background:'transparent',border:'none',cursor:'pointer'}}>
            <span className="text-[13px] font-semibold" style={{color:'var(--text)'}}>Payoff Priority</span>
            <span className="flex items-center gap-2">
              {freeCash>0&&<span className="text-[11px] text-green-400 font-bold">{fmtINR(freeCash)} free/mo</span>}
              <span className="text-[11px]" style={{color:'var(--text-faint)'}}>Payoff plan →</span>
            </span>
          </button>
          <div className="p-3 space-y-2">
            {totalCC>0&&(
              <div onClick={()=>navigate('/cards')} role="button" title="Open Credit Cards" className="py-2.5 px-3 rounded-lg cursor-pointer transition-all hover:brightness-125 hover:-translate-y-px" style={{background:'color-mix(in srgb, var(--danger) 8%, transparent)',border:'1px solid color-mix(in srgb, var(--danger) 15%, transparent)'}}>
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[11px] font-bold text-red-400">⚡ CC Outstanding</span>
                  <span className="mono text-red-400 text-[11px] font-bold">{fmtINR(totalCC)}</span>
                </div>
                <div className="text-[11px]" style={{color:'var(--text-faint)'}}>~40% p.a. if revolving</div>
              </div>
            )}
            {ccSpends>0&&(
              <div onClick={()=>navigate('/cards')} role="button" title="Open Credit Cards" className="py-2.5 px-3 rounded-lg cursor-pointer transition-all hover:brightness-125 hover:-translate-y-px" style={{background:'color-mix(in srgb, var(--warning) 8%, transparent)',border:'1px solid color-mix(in srgb, var(--warning) 15%, transparent)'}}>
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[11px] font-bold text-orange-400">💳 CC Spends Due</span>
                  <span className="mono text-orange-400 text-[11px] font-bold">{fmtINR(ccSpends)}</span>
                </div>
                <div className="text-[11px]" style={{color:'var(--text-faint)'}}>Clear before billing date</div>
              </div>
            )}
            {payoff.map((p:any,i:number)=>(
              <div key={i} onClick={()=>navigate('/loans')} role="button" title={`Open ${p.lender} in Loans`} className="py-2.5 px-3 rounded-lg cursor-pointer transition-all hover:brightness-125 hover:-translate-y-px" style={{background:i===0&&!totalCC&&!ccSpends?'color-mix(in srgb, var(--warning) 8%, transparent)':'color-mix(in srgb, var(--text) 3%, transparent)',border:`1px solid ${i===0&&!totalCC&&!ccSpends?'color-mix(in srgb, var(--warning) 20%, transparent)':'color-mix(in srgb, var(--text) 6%, transparent)'}`}}>
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[11px] font-semibold">{i===0&&!totalCC&&!ccSpends?'★ ':''}{p.lender}</span>
                  <span className="mono text-red-400 text-[11px] font-bold">{fmtINR(p.intLeft)} int</span>
                </div>
                <div className="flex justify-between text-[11px] mb-1.5" style={{color:'var(--text-faint)'}}>
                  <span>{p.pending} EMIs · {fmtINR(p.emi)}/mo</span>
                  <span className="text-orange-400">~{p.rate.toFixed(1)}% p.a.</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
                  <div className="h-full rounded-full bg-blue-500" style={{width:`${Math.round(100 - (p.pending / (p.pending + (p.paid??p.pending)) * 100))}%`}}/>
                </div>
              </div>
            ))}
            {payoff.length===0&&!totalCC&&!ccSpends&&(
              <div className="text-center py-8">
                <div className="text-2xl mb-2">🎉</div>
                <div className="text-[13px] font-bold text-green-400">No active debt!</div>
              </div>
            )}
          </div>
        </div>

        {/* ASSETS & INCOME */}
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)'}}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{background:'transparent'}}>
            <span className="text-[13px] font-semibold" style={{color:'var(--text)'}}>Assets & Income</span>
            <span className="mono font-bold text-[13px]" style={{color:'var(--success)'}}>{fmtINR(totalAssets)}</span>
          </div>
          <div>
            {[
              /* Every row here owns a page, so every row links to it. This block was entirely
                 static — the numbers with the most obvious "show me why" were dead text. */
              {label:'Savings Corpus',val:totalSavings,sub:`${savings.filter((v:any)=>v.mode!=='withdrew'&&getEff(v).pending>0).length} building · ${fmtINR(savMo)}/mo`,color:'text-green-400',to:'/savings'},
              {label:'Investments',val:totalCurrentValue,sub:`${fmtINR(totalInvested)} invested${investmentPnL!==0?` · ${investmentPnL>0?'+':''}${fmtINR(investmentPnL)} P&L`:''}`,color:'text-blue-400',to:'/investments'},
              netOwnedAssets!==0&&{label:'Owned Assets (net)',val:netOwnedAssets,sub:`gross ${fmtINR(totalOwnedAssets)} − EMI pending`,color:netOwnedAssets>=0?'text-blue-400':'text-red-400',neg:netOwnedAssets<0,to:'/closed-loans'},
              peopleOweTotal>0&&{label:'People Owe Me',val:peopleOweTotal,sub:`${(peopleOweMe as any[]).filter((p:any)=>p.status!=='Paid'&&p.status!=='Settled').length} pending`,color:'text-green-400',to:'/people-owe'},
            ].filter(Boolean).map((r:any)=>(
              <div key={r.label} onClick={()=>r.to && navigate(r.to)} title={r.to?`Open ${r.label}`:undefined}
                   className={`flex items-center justify-between px-4 py-2 ${r.to?'cursor-pointer transition-colors hover:bg-[var(--bg-hover)]':''}`}>
                <div><div className="text-[13px]">{r.label}{r.to && <span className="ml-1 text-[11px]" style={{color:'var(--text-faint)'}}>›</span>}</div><div className="text-[11px]" style={{color:'var(--text-faint)'}}>{r.sub}</div></div>
                <div className={`mono font-bold text-[13px] ${r.color}`}>{r.neg?'−':''}{fmtINR(Math.abs(r.val))}</div>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-2 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" title="Open Monthly Income" onClick={()=>navigate('/income')}>
              <div><div className="text-[13px]">Monthly Income <span className="text-[11px]" style={{color:'var(--text-faint)'}}>›</span></div><div className="text-[11px]" style={{color:'var(--text-faint)'}}>{income.filter((v:any)=>v.active!==false).length} sources</div></div>
              <div className="mono font-bold text-[13px] text-green-400">{fmtINR(monthlyIncome)}</div>
            </div>
            <div className="flex items-center justify-between px-4 py-2 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" title="Open Recurring Outflow" onClick={()=>navigate('/lookup')}>
              <div><div className="text-[13px]">Recurring Outflow <span className="text-[11px]" style={{color:'var(--text-faint)'}}>›</span></div><div className="text-[11px]" style={{color:'var(--text-faint)'}}>EMIs + savings + expenses</div></div>
              <div className="mono font-bold text-[13px] text-yellow-400">{fmtINR(recurringOutflow)}</div>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5" style={{background:'color-mix(in srgb, var(--success-strong) 6%, transparent)'}}>
              <div><div className="text-[13px] font-bold text-green-400">Free / Month</div><div className="text-[11px]" style={{color:'var(--text-faint)'}}>after fixed commitments + card bill</div></div>
              <div className={`mono font-bold text-[13px] ${freeCash>=0?'text-green-400':'text-red-400'}`}>{freeCash>=0?'+':'−'}{fmtINR(Math.abs(freeCash))}</div>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5" style={{background:freeCashThisMonth<0?'color-mix(in srgb, var(--danger-strong) 6%, transparent)':'var(--bg-base)'}}>
              <div><div className="text-[13px] font-bold">After This Month</div><div className="text-[11px]" style={{color:'var(--text-faint)'}}>incl. CC outstanding + spends</div></div>
              <div className={`mono font-bold text-[13px] ${freeCashThisMonth>=0?'text-green-400':'text-red-400'}`}>{freeCashThisMonth>=0?'+':'−'}{fmtINR(Math.abs(freeCashThisMonth))}</div>
            </div>
          </div>
        </div>
      </div>

      {/* CHART MODAL */}
      {showChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)'}} onClick={()=>setShowChart(false)}>
          <div className="rounded-2xl overflow-hidden w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{background:'var(--bg-card)'}} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b sticky top-0 z-10" style={{borderColor:'var(--border)',background:'var(--bg-card)'}}>
              <div>
                <div className="font-bold text-[13px]">Financial Charts</div>
                <div className="text-[11px]" style={{color:'var(--text-muted)'}}>Debt · Cash flow · Net worth trajectory · History</div>
              </div>
              <button onClick={()=>setShowChart(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 text-red-400 font-bold">✕</button>
            </div>
            <div className="p-5 space-y-6">

              {/* Debt Composition */}
              <div>
                <div className="text-[13px] font-semibold mb-3" style={{color:'var(--text)'}}>Debt Composition</div>
                <div className="space-y-2">
                  {[
                    {label:'Loan Principal',val:totalLoans,color:'var(--danger-strong)'},
                    {label:'Future Interest',val:totalLoanIntLeft,color:'#f97316'},
                    {label:'CC total',val:totalCC+totalCCEmiPending+ccSpends,color:'#eab308',sub:'EMI+spends+outstanding'},
                    {label:'I Owe (Personal)',val:iOweTotal,color:'#f59e0b'},
                    {label:'Chit Repayment',val:chitRepayDebt,color:'#a855f7'},
                  ].filter(d=>d.val>0).map(d=>{
                    const tot=totalLoans+totalLoanIntLeft+totalCC+totalCCEmiPending+ccSpends+iOweTotal+chitRepayDebt
                    const pct=tot>0?Math.round(d.val/tot*100):0
                    return (
                      <div key={d.label}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span style={{color:'var(--text-muted)'}}>{d.label}</span>
                          {/* Value takes the category colour so it matches its bar below;
                              the percentage stays faint. A duplicate `color` key greyed out both. */}
                          <span className="mono font-bold" style={{color:d.color}}>{fmtINR(d.val)} <span style={{color:'var(--text-faint)'}}>({pct}%)</span></span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{background:'var(--bg-base)'}}>
                          <div className="h-full rounded-full" style={{width:`${pct}%`,background:d.color}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 12-Month Projection */}
              <div>
                <div className="text-[13px] font-semibold mb-1" style={{color:'var(--text)'}}>12-Month Free Cash Projection</div>
                <div className="text-[11px] mb-3" style={{color:'var(--text-faint)'}}>Accounts for loans closing — red = still in deficit, green = surplus</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={projCumulative} margin={{left:0,right:0,top:4,bottom:0}}>
                    <XAxis dataKey="month" tick={{fontSize:10,fill:'var(--text-faint)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--text-faint)'}} tickFormatter={v=>`₹${Math.round(v/1000)}K`}/>
                    <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}} formatter={(v:any)=>[fmtINR(v),'Cumulative']}/>
                    <ReferenceLine y={0} stroke="var(--danger-strong)" strokeDasharray="4 2"/>
                    <Bar dataKey="cumulative" radius={[4,4,0,0]}>
                      {projCumulative.map((d:any,i:number)=><Cell key={i} fill={d.cumulative>=0?'var(--success-strong)':'var(--danger-strong)'} fillOpacity={0.85}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Income vs Outflow */}
              <div>
                <div className="text-[13px] font-semibold mb-3" style={{color:'var(--text)'}}>Income vs Outflow</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={[
                    {name:'Income',val:monthlyIncome,fill:'var(--success-strong)'},
                    {name:'Loan EMIs',val:loanEmi,fill:'var(--danger-strong)'},
                    {name:'CC EMIs',val:ccEmi,fill:'#f59e0b'},
                    {name:'Savings',val:savMo+sipMo,fill:'#3b82f6'},
                    {name:'Expenses',val:expMo,fill:'#8b5cf6'},
                    {name:'Others',val:persEmi+withdrewMo+insMo,fill:'var(--text-muted)'},
                  ].filter(d=>d.val>0)} layout="vertical" margin={{left:60,right:0,top:0,bottom:0}}>
                    <XAxis type="number" tick={{fontSize:9,fill:'var(--text-faint)'}} tickFormatter={v=>`₹${Math.round(v/1000)}K`}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:'var(--text-muted)'}} width={56}/>
                    <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}} formatter={(v:any)=>[fmtINR(v),'']}/>
                    <Bar dataKey="val" radius={[0,4,4,0]}>
                      {[{fill:'var(--success-strong)'},{fill:'var(--danger-strong)'},{fill:'#f59e0b'},{fill:'#3b82f6'},{fill:'#8b5cf6'},{fill:'var(--text-muted)'}].map((d,i)=><Cell key={i} fill={d.fill} fillOpacity={0.85}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Net Worth Trajectory — forward-looking, ported from Finance Overview. Distinct from
                  "Net Worth History" below: that one only plots saved snapshots (the past), this one
                  forecasts forward off the current loan schedule so it works even with 0 snapshots. */}
              <div>
                <div className="text-[13px] font-semibold mb-1" style={{color:'var(--text)'}}>
                  Net Worth Trajectory{nwMaxPending>0 ? ` — ${nwMaxPending} months to debt free` : ''}
                </div>
                {nwChartData.length > 1 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={nwChartData} margin={{top:4,right:8,bottom:0,left:0}}>
                        <defs>
                          <linearGradient id="nwTrajGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--success-strong)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--success-strong)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{fontSize:9,fill:'var(--text-faint)'}} tickLine={false} axisLine={false} interval={3}/>
                        <YAxis tick={{fontSize:9,fill:'var(--text-faint)'}} tickLine={false} axisLine={false} tickFormatter={(v:number)=>`₹${v}K`} width={50}/>
                        <Tooltip formatter={(v:number)=>[`₹${v}K net worth`,'']} labelStyle={{color:'var(--text-muted)'}} contentStyle={{background:'var(--bg-hover)',border:'1px solid var(--hairline)',borderRadius:8}}/>
                        <ReferenceLine y={0} stroke="var(--danger-strong)" strokeDasharray="4 4" strokeWidth={1}/>
                        <Area type="monotone" dataKey="nw" stroke="var(--success-strong)" fill="url(#nwTrajGrad)" strokeWidth={2} dot={false}/>
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex justify-between text-[11px] mt-1" style={{color:'var(--text-faint)'}}>
                      <span>Today: <span className={netWorth>=0?'text-green-400':'text-red-400'}>{netWorth<0?'−':''}{fmtINR(Math.abs(netWorth))}</span></span>
                      {nwZeroDate && netWorth<0 && <span>🎯 Turns positive: <span className="text-green-400">{nwZeroDate}</span></span>}
                    </div>
                  </>
                ) : (
                  <div className="h-20 rounded-xl flex items-center justify-center text-[11px]" style={{background:'var(--bg-base)',color:'var(--text-faint)'}}>
                    No active loans to project against
                  </div>
                )}
              </div>

              {/* Maturing Investments — ported from Finance Overview, had no equivalent on Dashboard */}
              {maturingSoon.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="text-[13px] font-semibold text-yellow-400">⏰ Maturing ≤ 12 Months</span>
                    <span className="mono text-[11px] text-green-400 font-bold">{fmtINR(maturingTotal)}</span>
                  </div>
                  <div className="space-y-1">
                    {maturingSoon.map((v:any) => {
                      const days = Math.ceil((new Date(v.endDate).getTime()-new Date().getTime())/(1000*60*60*24))
                      const months = Math.ceil(days/30)
                      return (
                        <div key={v.id} className="flex justify-between gap-2 text-[11px] py-1.5 px-3 rounded-lg" style={{background:'rgba(234,179,8,0.08)'}}>
                          <span className="font-semibold truncate">{v.name} <span className="text-yellow-400">({months}mo)</span></span>
                          <span className="mono text-green-400 flex-shrink-0">{fmtINR(v.maturityValue??v.currentValue??0)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Net Worth History — last */}
              <div>
                <div className="text-[13px] font-semibold mb-3" style={{color:'var(--text)'}}>Net Worth History</div>
                {trendData.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={trendData.map((s:any)=>({mo:s.monthYear?.slice(0,7),nw:Math.round(Number(s.netWorth??0)/1000)}))} margin={{left:0,right:0,top:4,bottom:0}}>
                      <defs><linearGradient id="nwGradModal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--success-strong)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--success-strong)" stopOpacity={0}/></linearGradient></defs>
                      <XAxis dataKey="mo" tick={{fontSize:10,fill:'var(--text-faint)'}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:'var(--text-faint)'}} tickFormatter={v=>`₹${v}K`}/>
                      <Tooltip contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:11}} formatter={(v:any)=>[`₹${v}K`,'Net Worth']}/>
                      <ReferenceLine y={0} stroke="var(--danger-strong)" strokeDasharray="4 2" strokeWidth={1}/>
                      <Area type="monotone" dataKey="nw" stroke="var(--success-strong)" fill="url(#nwGradModal)" strokeWidth={2} dot={{r:3,fill:'var(--success-strong)'}}/>
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-32 rounded-xl flex flex-col items-center justify-center gap-2" style={{background:'var(--bg-base)'}}>
                    <span className="text-2xl">📸</span>
                    <div className="text-[11px]" style={{color:'var(--text-muted)'}}>Take monthly snapshots to see trend</div>
                    <div className="text-[11px]" style={{color:'var(--text-faint)'}}>Settings → Save Snapshot</div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
