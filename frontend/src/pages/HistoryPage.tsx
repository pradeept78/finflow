import SegTabs from '../components/common/SegTabs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { snapshotApi, loansApi, cardsApi, savingsApi, investmentsApi, incomeApi, expensesApi, insuranceApi, personalEmiApi } from '../api'
import { fmtINR, monthlyIncomeTotal } from '../utils/format'
import { calcOutflow } from '../utils/calcOutflow'
import { LoadingSpinner, PageHeader, ErrorState } from '../components/common'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useState } from 'react'

export default function HistoryPage() {
  const qc = useQueryClient()
  const qSnapshots = useQuery({ queryKey: ['snapshots-all'], queryFn: snapshotApi.getAll })
  const qLoans      = useQuery({ queryKey: ['loans'],      queryFn: loansApi.getAll })
  const qCards      = useQuery({ queryKey: ['cards'],      queryFn: cardsApi.getAll })
  const qSavings    = useQuery({ queryKey: ['savings'],    queryFn: savingsApi.getAll })
  const qInvestments= useQuery({ queryKey: ['investments'],queryFn: investmentsApi.getAll })
  const qIncome     = useQuery({ queryKey: ['income'],     queryFn: incomeApi.getAll })
  const qExpenses   = useQuery({ queryKey: ['expenses'],   queryFn: expensesApi.getAll })
  const qInsurance  = useQuery({ queryKey: ['insurance'],  queryFn: insuranceApi.getAll })
  const qPersonal   = useQuery({ queryKey: ['personal'],   queryFn: personalEmiApi.getAll })
  const { data: snapshots = [], isLoading } = qSnapshots
  const { data: loans = [] } = qLoans
  const { data: cards = [] } = qCards
  const { data: savings = [] } = qSavings
  const { data: investments = [] } = qInvestments
  const { data: income = [] } = qIncome
  const { data: expenses = [] } = qExpenses
  const { data: insurance = [] } = qInsurance
  const { data: personal = [] } = qPersonal

  // Every source query feeds the "Live now" figures — previously only snapshots/income were
  // tracked, so a failed loans/cards/savings/etc. fetch silently rendered live totals computed from
  // an empty array (looks like "you owe nothing" instead of "this failed to load").
  const allQueries = [qSnapshots, qLoans, qCards, qSavings, qInvestments, qIncome, qExpenses, qInsurance, qPersonal]
  const anyLoading = allQueries.some(q => q.isLoading)
  const anyError = allQueries.some(q => q.isError)
  const refetchAll = () => allQueries.forEach(q => q.refetch())
  const [view, setView] = useState<'months'|'table'>('months')
  const [expandedMonth, setExpandedMonth] = useState<string|null>(null)

  const genMut = useMutation({ mutationFn: () => snapshotApi.generate(), onSuccess: ()=>{ qc.invalidateQueries({queryKey:['snapshots-all']}); qc.invalidateQueries({queryKey:['snapshots']}); toast.success('Snapshot saved') } })

  useQuery({ queryKey: ['snapshot-auto'], queryFn: async ()=>{ await snapshotApi.generate(); return true }, enabled: !isLoading && snapshots.length===0, staleTime: Infinity, retry: false })

  const sorted = [...snapshots].sort((a:any,b:any)=>a.monthYear.localeCompare(b.monthYear))

  // Live numbers — was hand-rolled here (raw expense sums ignoring frequency, insurance counted
  // only when frequency==='Monthly' instead of using the shared provision split, and I Owe summed
  // `emi` for every entry regardless of whether it's still pending). `calcOutflow` is the same
  // calculator Dashboard/Budget/Calendar/Hub use, so this page can no longer drift from them.
  const liveIncome  = monthlyIncomeTotal(income as any[])
  const o           = calcOutflow(loans as any[], cards as any[], personal as any[], savings as any[], investments as any[], expenses as any[], insurance as any[])
  const liveLoanEmi = o.loanEmi
  const liveCcEmi   = o.ccEmi
  const liveSavEmi  = o.savings
  const liveInsEmi  = o.insuranceEmi
  const liveExp     = o.expenses
  const livePersonal= o.iOweEmi
  const liveOut     = o.locked
  const liveFree    = liveIncome - liveOut

  if (anyLoading) return <LoadingSpinner/>
  if (anyError) return <ErrorState message="Failed to load some of your data. The figures below would be wrong if we showed them anyway." onRetry={refetchAll} />

  const CATS = [
    {key:'loanEmi',    label:'Loans',     color:'var(--info)'},
    {key:'ccEmi',      label:'CC EMI',    color:'var(--purple)'},
    {key:'ccSpends',   label:'CC Spends', color:'var(--pink)'},
    {key:'savingsEmi', label:'Savings',   color:'var(--success)'},
    {key:'expenses',   label:'Expenses',  color:'var(--orange)'},
    {key:'personalEmi',label:'I Owe',     color:'var(--warning)'},
  ]

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Monthly History" action={
        <div className="flex gap-2">
          <SegTabs options={[{id:'months',label:'Months'},{id:'table',label:'Table'}]} value={view as any} onChange={v=>setView(v as any)} />
          <button className="btn-primary btn-sm flex items-center gap-1.5" onClick={()=>genMut.mutate()} disabled={genMut.isPending} style={{background:snapshots.length===0?'linear-gradient(135deg,#f97316,#f59e0b)':''}}>
            <RefreshCw size={13} className={genMut.isPending?'animate-spin':''}/>Save Snapshot
          </button>
        </div>
      }/>

      {/* WOW Hero */}
      {snapshots.length > 0 && (() => {
        const latest = sorted[sorted.length-1]
        const prev   = sorted[sorted.length-2]
        const debtChange = prev ? Number(latest?.totalDebt??0)-Number(prev?.totalDebt??0) : 0
        const improving = debtChange <= 0
        return (
          <div className="rounded-2xl p-5 relative overflow-hidden" style={{background:improving?'linear-gradient(135deg,color-mix(in srgb, var(--success) 13%, transparent) 0%,color-mix(in srgb, var(--success) 3%, transparent) 100%)':'linear-gradient(135deg,color-mix(in srgb, var(--danger) 13%, transparent) 0%,color-mix(in srgb, var(--danger) 3%, transparent) 100%)',border:improving?'1px solid color-mix(in srgb, var(--success) 25%, transparent)':'1px solid color-mix(in srgb, var(--danger) 25%, transparent)'}}>
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full -translate-y-12 translate-x-12 opacity-10" style={{background:improving?'var(--success)':'var(--danger)'}}/>
            <div className="relative flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-[12px] mb-1" style={{color:improving?'color-mix(in srgb, var(--success) 60%, transparent)':'color-mix(in srgb, var(--danger) 60%, transparent)'}}>{improving?'📉 Debt Reducing':'📈 Debt Growing'}</div>
                <div className="text-4xl font-semibold tracking-tight mono" style={{color:improving?'var(--success)':'var(--danger)',textShadow:improving?'0 0 40px color-mix(in srgb, var(--success) 25%, transparent)':'0 0 40px color-mix(in srgb, var(--danger) 25%, transparent)'}}>{fmtINR(Number(latest?.totalDebt??0))}</div>
                <div className="text-[11px] mt-1" style={{color:improving?'color-mix(in srgb, var(--success) 53%, transparent)':'color-mix(in srgb, var(--danger) 53%, transparent)'}}>current debt · {snapshots.length} snapshots saved</div>
              </div>
              {debtChange!==0&&prev&&(
                <div className="text-right">
                  <div className="text-[12px] mb-1" style={{color:improving?'color-mix(in srgb, var(--success) 60%, transparent)':'color-mix(in srgb, var(--danger) 60%, transparent)'}}>vs last snapshot</div>
                  <div className="text-2xl font-semibold tracking-tight mono" style={{color:improving?'var(--success)':'var(--danger)'}}>{debtChange>0?'+':''}{fmtINR(debtChange)}</div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Live now */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {label:'Monthly Outflow', value:fmtINR(liveOut),    sub:`EMIs ${fmtINR(liveLoanEmi+liveCcEmi+livePersonal)} · Savings ${fmtINR(liveSavEmi)} · Bills ${fmtINR(liveExp+Math.round(liveInsEmi))}`,      accent:'var(--danger)'},
          {label:'Free / Month',    value:`${liveFree>=0?'+':''}${fmtINR(liveFree)}`, sub:'fixed commitments · before card bill', accent:liveFree>=0?'var(--success)':'var(--danger)'},
          {label:'Income',          value:fmtINR(liveIncome), sub:'monthly income',        accent:'var(--success)'},
          {label:'Snapshots',       value:String(snapshots.length), sub:`${sorted[0]?.monthYear||'—'} → ${sorted[sorted.length-1]?.monthYear||'—'}`, accent:'var(--purple)'},
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

      {/* Smart insight */}
      {sorted.length >= 2 && (() => {
        const latest = sorted[sorted.length-1], prev = sorted[sorted.length-2]
        const debtChange = Number(latest.totalDebt??0)-Number(prev.totalDebt??0)
        const freeChange = Number(latest.freeCash??0)-Number(prev.freeCash??0)
        return (
          <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:debtChange<0?'linear-gradient(135deg,color-mix(in srgb, var(--success) 8%, transparent) 0%,color-mix(in srgb, var(--success) 2%, transparent) 100%)':'linear-gradient(135deg,color-mix(in srgb, var(--danger) 8%, transparent) 0%,color-mix(in srgb, var(--danger) 2%, transparent) 100%)',border:debtChange<0?'1px solid color-mix(in srgb, var(--success) 15%, transparent)':'1px solid color-mix(in srgb, var(--danger) 15%, transparent)'}}>
            <span className="text-lg">{debtChange<0?'📉':'📈'}</span>
            <div className="text-[11px]" style={{color:'var(--text-faint)'}}>
              Debt {debtChange<0?'reduced by':'grew by'} <span style={{color:debtChange<0?'var(--success)':'var(--danger)',fontWeight:700}}>{fmtINR(Math.abs(debtChange))}</span> since last snapshot
              {freeChange!==0&&<> · Free cash {freeChange>0?'improved by':'dropped by'} <span style={{color:freeChange>0?'var(--success)':'var(--danger)',fontWeight:700}}>{fmtINR(Math.abs(freeChange))}</span></>}.
            </div>
          </div>
        )
      })()}

      {snapshots.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
          <div className="text-3xl mb-3">📊</div>
          <div className="font-semibold mb-1">No snapshots yet</div>
          <div className="text-[13px] mb-4" style={{color:'var(--text-faint)'}}>Auto-generated on 1st of each month. Save one now to start tracking.</div>
          <button className="btn-primary" onClick={()=>genMut.mutate()}>Generate Now</button>
        </div>
      ) : view==='months' ? (
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(90px,0.9fr) minmax(190px,2.4fr) minmax(110px,1.1fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(90px,0.9fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
<span>Month</span><span className="px-2">Breakdown</span><span className="text-right">Outflow</span><span className="text-right">Debt</span><span className="text-right">Free Cash</span><span className="text-right">MoM</span>
          </div>
          {sorted.slice().reverse().map((s:any,idx:number)=>{
            const totalOut = Number(s.totalOutflow??0)
            const free = Number(s.freeCash??0)
            const cats = CATS.map(c=>({...c,val:Number((s as any)[c.key]??0)})).filter(c=>c.val>0)
            return (
              <div key={s.id} className="cursor-pointer transition-colors" onClick={()=>setExpandedMonth(expandedMonth===s.monthYear?null:s.monthYear)}>
              <div className="grid items-center px-4 py-3" style={{gridTemplateColumns:'minmax(90px,0.9fr) minmax(190px,2.4fr) minmax(110px,1.1fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(90px,0.9fr)',borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}>
                <div className="font-medium text-[13px]">{s.monthYear}</div>
                <div className="px-2">
                  <div className="flex h-2 rounded-full overflow-hidden mb-1">
                    {cats.map(c=><div key={c.key} style={{width:`${Math.max(2,Math.round(c.val/totalOut*100))}%`,background:c.color}} title={`${c.label}: ${fmtINR(c.val)}`}/>)}
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {cats.map(c=><span key={c.key} className="text-[11px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:c.color, color:'var(--text-faint)'}}/><span >{c.label} {fmtINR(c.val)}</span></span>)}
                  </div>
                </div>
                <div className="text-right"><span className="mono font-semibold" style={{color:'var(--danger)'}}>{fmtINR(totalOut)}</span></div>
                <div className="text-right"><span className="mono text-[13px]" style={{color:'var(--text-faint)'}}>{fmtINR(Number(s.totalDebt??0))}</span></div>
                <div className="text-right"><span className="mono font-semibold" style={{color:free>=0?'var(--success)':'var(--danger)'}}>{free>=0?'+':''}{fmtINR(free)}</span></div>
                <div className="text-right">
                  {idx<sorted.length-1?(()=>{
                    const prev=sorted[sorted.length-2-idx]
                    const diff=Number(s.totalDebt??0)-Number(prev?.totalDebt??0)
                    if(!prev||Math.abs(diff)<500) return <span style={{color:'var(--text-faint)'}}>—</span>
                    return <span className="text-[11px] font-bold" style={{color:diff<0?'var(--success)':'var(--danger)'}}>{diff<0?'↓':'↑'}{fmtINR(Math.abs(diff))}</span>
                  })():<span style={{color:'var(--text-faint)'}}>—</span>}
                </div>
              </div>
              {expandedMonth===s.monthYear&&(
                <div className="px-4 pb-3 pt-1 grid grid-cols-6 gap-2 text-[11px]" style={{background:'color-mix(in srgb, var(--text) 3%, transparent)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                  {[{l:'Loans',v:s.loanEmi,c:'var(--info)'},{l:'CC EMI',v:s.ccEmi,c:'var(--purple)'},{l:'Spends',v:s.ccSpends,c:'var(--pink)'},{l:'Savings',v:s.savingsEmi,c:'var(--success)'},{l:'Expenses',v:s.expenses,c:'var(--orange)'},{l:'I Owe',v:s.personalEmi,c:'var(--warning)'}].map(m=>(
                    <div key={m.l} className="rounded-lg p-2 text-center" style={{background:`color-mix(in srgb, ${m.c} 7%, transparent)`,border:`1px solid color-mix(in srgb, ${m.c} 15%, transparent)`}}>
                      <div className="text-[11px] mb-0.5" style={{color:`color-mix(in srgb, ${m.c} 60%, transparent)`}}>{m.l}</div>
                      <div className="mono font-bold text-[11px]" style={{color:m.c}}>{fmtINR(m.v??0)}</div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(90px,1.03fr) minmax(100px,1.15fr) minmax(90px,1.03fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(100px,1.15fr) minmax(90px,1.03fr)',borderColor:'var(--border)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>Month</span><span className="text-right">Outflow</span><span className="text-right">Loans</span><span className="text-right">CC EMI</span><span className="text-right">Spends</span><span className="text-right">Savings</span><span className="text-right">Expenses</span><span className="text-right">I Owe</span><span className="text-right">Debt</span><span className="text-right">Free</span>
          </div>
          {sorted.slice().reverse().map((s:any,idx:number)=>{
            const free=Number(s.freeCash??0)
            return (
              <div key={s.id} className="grid items-center px-4 py-2 text-[13px]" style={{gridTemplateColumns:'minmax(90px,1.03fr) minmax(100px,1.15fr) minmax(90px,1.03fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(80px,0.92fr) minmax(100px,1.15fr) minmax(90px,1.03fr)',borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}>
                <span className="font-medium">{s.monthYear}</span>
                <span className="text-right mono" style={{color:'var(--danger)'}}>{fmtINR(s.totalOutflow)}</span>
                <span className="text-right mono" style={{color:'var(--info)'}}>{fmtINR(s.loanEmi)}</span>
                <span className="text-right mono" style={{color:'var(--purple)'}}>{fmtINR(s.ccEmi)}</span>
                <span className="text-right mono" style={{color:'var(--pink)'}}>{fmtINR(s.ccSpends)}</span>
                <span className="text-right mono" style={{color:'var(--success)'}}>{fmtINR(s.savingsEmi)}</span>
                <span className="text-right mono" style={{color:'var(--orange)'}}>{fmtINR(s.expenses)}</span>
                <span className="text-right mono" style={{color:'var(--warning)'}}>{fmtINR(s.personalEmi)}</span>
                <span className="text-right mono" style={{color:'var(--text-faint)'}}>{fmtINR(s.totalDebt)}</span>
                <span className="text-right mono font-semibold" style={{color:free>=0?'var(--success)':'var(--danger)'}}>{free>=0?'+':''}{fmtINR(free)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
