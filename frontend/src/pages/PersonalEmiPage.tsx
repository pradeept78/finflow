import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { personalEmiApi, paidMarksApi, closedLoansApi, incomeApi } from '../api'
import { usePicks, PickBox, WhatIfBar, SelectAllLink } from '../components/common/WhatIf'
import type { PersonalEmi } from '../types'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, InputModal, SortHeader } from '../components/common'
import { ioweFacts } from '../utils/iowe'
import { fmtINR, getEff, isPaidThisMonth, resolveDueDay, monthlyIncomeTotal } from '../utils/format'
import { Plus, Pencil, Trash2, Archive, ChevronDown, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

const empty: PersonalEmi = { person: '', amount: 0 }

// Due date badge helper
const getDueBadge = (dueDay: number | undefined | null, isPaid: boolean) => {
  if (!dueDay || isPaid) return null
  const now = new Date()
  const today = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()

  // Days until this month's due
  let diff = dueDay - today

  // If already past this month's due day, check next month
  if (diff < -7) {
    // Next month's due: days remaining in this month + dueDay days into next month
    diff = (daysInMonth - today) + dueDay
  }

  if (diff === 0)             return { label: '🔴 Due Today',      color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff < 0 && diff >= -7) return { label: `⚠ ${Math.abs(diff)}d overdue`, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff > 0 && diff <= 3)  return { label: `🔴 Due in ${diff}d`, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff > 3 && diff <= 7)  return { label: `⚡ Due in ${diff}d`, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 15%, transparent)' }
  if (diff > 7 && diff <= 10) return { label: `Due in ${diff}d`,    color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 10%, transparent)' }
  return null
}

export default function PersonalEmiPage() {
  const qc = useQueryClient()
  const wi = usePicks()
  const { data: incomeRows = [] } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const { data: items = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: markedKeys = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  // Was only tracking the `personal` query — `paid-marks` feeds the paid/due state below.
  const isLoading = l1 || l2
  const isError = e1 || e2
  const refetch = () => { r1(); r2() }
  const [modal, setModal] = useState<{ open: boolean; item: PersonalEmi; mode: 'emi'|'lump' }>({ open: false, item: empty, mode: 'emi' })
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [inputModal, setInputModal] = useState<any>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const saveMut    = useMutation({ mutationFn: (d: PersonalEmi) => d.id ? personalEmiApi.update(d.id, d) : personalEmiApi.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['personal'] }); toast.success('Saved'); setModal({ open: false, item: empty, mode: 'emi' }) } })
  const deleteMut  = useMutation({ mutationFn: async (p: any) => { const e=getEff(p),tp=e.paid*Number(p.emi??0); try{await closedLoansApi.create({lender:p.person,purpose:p.label??'I Owe',assetType:'Other',amount:Number(p.amount??0),totalPaid:tp,closedMonths:e.paid,closedDate:new Date().toISOString().slice(0,10)})}catch{}; return personalEmiApi.delete(p.id) }, onSuccess: ()=>{qc.invalidateQueries({queryKey:['personal']});qc.invalidateQueries({queryKey:['closed-loans']});toast.success('Deleted')} })
  const settleMut  = useMutation({ mutationFn: (id: number) => personalEmiApi.delete(id), onSuccess: ()=>{qc.invalidateQueries({queryKey:['personal']});toast.success('Settled')} })
  const markMut    = useMutation({ mutationFn: paidMarksApi.toggle, onSuccess: ()=>qc.invalidateQueries({queryKey:['paid-marks']}) })

  // Raw `p.amount` double-counts interest-only entries (principal never reduces there, so summing
  // the original amount is fine for those) but overstates amortising entries already partly repaid.
  // `ioweFacts().principalLeft` is the same figure calcDebt/ClosedLoans use for "what's actually left."
  const totalOwed  = (items as any[]).reduce((s:number,p:any)=>s+ioweFacts(p).principalLeft,0)
  // Was filtering on `getEff(p).pending>0` before summing raw `p.emi` — correct for amortising
  // entries (a settled one has pending:0 and drops out), but interest-only entries have no
  // tenure at all, so `getEff` always returns pending:0 for them regardless of whether they're
  // still being paid. That silently dropped every interest-only "I Owe" out of this tile, even
  // though the banner two lines below (`intOnlyMonthly`) shows the same money is still going out
  // every month. `ioweFacts(p).monthly` already returns the right figure for every mode — 0 once
  // an amortising entry is paid off, the instalment while it's still active, and the interest
  // payment for as long as an interest-only entry stays open — matching what calcOutflow.iOweEmi
  // (Dashboard/Hub/Budget/Lookup) already sums.
  const totalEmi   = (items as any[]).reduce((s:number,p:any)=>s+ioweFacts(p).monthly,0)
  // what-if: ticked entries — closing costs the principal still owed and stops the monthly payment (interest-only included)
  const pickedItems = (items as any[]).filter((p: any) => wi.picked.has(String(p.id)))
  const pickNeed = pickedItems.reduce((s: number, p: any) => s + ioweFacts(p).principalLeft, 0)
  const pickFree = pickedItems.reduce((s: number, p: any) => s + ioweFacts(p).monthly, 0)
  const maxPending = items.reduce((m:number,p:any)=>Math.max(m,getEff(p).pending),0)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your I Owe entries." onRetry={() => refetch()} />

  /* Interest-only entries need separate treatment everywhere they are summarised, because their
     principal never moves and their monthly payment never retires it. */
  const facts = (items as any[]).map(p => ({ p, f: ioweFacts(p) }))
  const intOnly = facts.filter(x => x.f.mode === 'interest-only')
  const intOnlyPrincipal = intOnly.reduce((s, x) => s + x.f.principalLeft, 0)
  const intOnlyMonthly   = intOnly.reduce((s, x) => s + x.f.monthly, 0)
  const intOnlyPaidSoFar = intOnly.reduce((s, x) => s + x.f.interestPaid, 0)
  const missingPayback   = intOnly.filter(x => !x.p.paybackDate)

  // Sortable value for a given column — mirrors the exact expressions the row body itself
  // uses to render each cell, so sorting never disagrees with what's on screen.
  const sortValue = (p: any, col: string): string | number | null => {
    const f = ioweFacts(p)
    const eff = getEff(p)
    const isLump = f.mode === 'lump', isIntOnly = f.mode === 'interest-only'
    switch (col) {
      case 'person':  return p.person ?? ''
      case 'amount':  return Number(p.amount ?? 0)
      case 'emi':     return Number(p.emi ?? 0)
      case 'pct': {
        const t = p.tenure ?? (eff.paid + eff.pending)
        return t > 0 ? Math.round(eff.paid / t * 100) : 0
      }
      case 'dueDay':  return p.dueDay ?? Infinity
      case 'endDate': {
        if (p.endDate) return p.endDate
        if (isIntOnly) return p.paybackDate ?? null
        if (eff.pending > 0 && !isLump) {
          const d = new Date(); d.setMonth(d.getMonth() + eff.pending)
          return d.toISOString().slice(0, 10)
        }
        return null
      }
      default: return null
    }
  }

  const displayItems = sortCol
    ? [...(items as any[])].sort((a, b) => {
        const va = sortValue(a, sortCol), vb = sortValue(b, sortCol)
        const aMissing = va === null || va === undefined || va === Infinity
        const bMissing = vb === null || vb === undefined || vb === Infinity
        if (aMissing && bMissing) return 0
        if (aMissing) return 1
        if (bMissing) return -1
        if (typeof va === 'string' && typeof vb === 'string') {
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
        }
        return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
      })
    : (items as any[])

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="I Owe" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty,mode:'emi'})}><Plus size={14}/> Add Entry</button>}/>

      {intOnly.length > 0 && (
        <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{background:'color-mix(in srgb, var(--orange) 7%, transparent)',border:'1px solid color-mix(in srgb, var(--orange) 21%, transparent)'}}>
          <span className="text-lg">🔁</span>
          <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
            <span style={{color:'var(--orange)',fontWeight:700}}>{fmtINR(Math.round(intOnlyMonthly))}/mo is interest only</span>
            {' '}— it services <span className="mono" style={{color:'var(--orange)'}}>{fmtINR(Math.round(intOnlyPrincipal))}</span> of
            principal that is <b>not reducing</b>. {fmtINR(Math.round(intOnlyPaidSoFar))} paid so far has bought no
            reduction in the balance; the full principal still falls due
            {missingPayback.length > 0
              ? <span style={{color:'var(--danger)'}}> — and {missingPayback.map(x=>x.p.person).join(', ')} {missingPayback.length>1?'have':'has'} no payback date set, so there is no deadline recorded.</span>
              : <> on the payback date.</>}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <KpiRow className="grid grid-cols-4 gap-3" keep={[0, 1]}>
          {[
            {label:'Total Owed',    value:fmtINR(totalOwed),  sub:`${items.length} entries`,         accent:'var(--warning)'},
            {label:'Monthly EMI',   value:fmtINR(totalEmi),   sub:'combined monthly payments',       accent:'var(--danger)'},
            /* "Cleared By" only means something for amortising entries. An interest-only entry is
               never cleared by its monthly payment, so projecting a date from `maxPending` told the
               user the debt would end on a date it will not. Interest-only rows are reported by
               their payback date instead, or flagged when they have none. */
            intOnly.length > 0
              ? {label:'Interest Only', value:fmtINR(Math.round(intOnlyPrincipal)), sub:`${intOnly.length} entr${intOnly.length>1?'ies':'y'} · principal not reducing`, accent:'var(--orange)'}
              : {label:'Cleared By',    value:maxPending>0?(()=>{const d=new Date();d.setMonth(d.getMonth()+maxPending);return d.toLocaleDateString('en-IN',{month:'short',year:'numeric'})})():'—', sub:`${maxPending} months`, accent:'var(--purple)'},
            {label:'Entries',       value:String(items.length), sub:`${items.filter((p:any)=>getEff(p).pending>0).length} active`, accent:'var(--cyan)', isCurrency:false},
          ].map(m=>(
            <div key={m.label} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{background:`linear-gradient(180deg, color-mix(in srgb, ${m.accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`,border:`1px solid var(--hairline)`}}>
              <div className="relative">
                <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color: 'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:m.accent}} />{m.label}</div>
                <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{color:m.accent}}>{m.value}</div>
                <div className="text-[11px]" style={{color: 'var(--text-faint)'}}>{m.sub}</div>
              </div>
            </div>
          ))}
        </KpiRow>
      )}

      {/* Smart insight */}
      {(items as any[]).length > 0 && (() => {
        const overdue = (items as any[]).filter((v:any)=>v.dueDate&&new Date(v.dueDate)<new Date())
        if(!overdue.length) return null
        return (
          <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg, color-mix(in srgb, var(--danger) 8%, transparent) 0%, color-mix(in srgb, var(--danger) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--danger) 15%, transparent)'}}>
            <span className="text-lg">🚨</span>
            <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
              <span style={{color:'var(--danger)',fontWeight:700}}>{overdue.length} payment{overdue.length>1?'s':''} overdue</span> — settle these first to maintain trust with friends/family.
            </div>
          </div>
        )
      })()}

      {(() => { const tickable = (items as any[]).filter((p: any) => ioweFacts(p).principalLeft > 0); return (
        <div className="flex justify-end -mb-2">
          <SelectAllLink total={tickable.length} selected={tickable.filter((p: any) => wi.picked.has(String(p.id))).length}
            onSelectAll={() => tickable.forEach((p: any) => { if (!wi.picked.has(String(p.id))) wi.toggle(String(p.id)) })} onClear={wi.clear} />
        </div>
      ) })()}
      <WhatIfBar count={pickedItems.length} need={pickNeed} free={pickFree} billNow={totalEmi} income={monthlyIncomeTotal(incomeRows as any[])} onClear={wi.clear} />
      {items.length === 0 ? <EmptyState icon="🤝" title="Nothing owed" sub="Track money you owe to people" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty,mode:'emi'})}>+ Add entry</button>} /> : (
        <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(85px,1fr) minmax(85px,1fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <SortHeader label="Person" col="person" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="left" />
            <SortHeader label="Amount" col="amount" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="EMI/mo" col="emi" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="%" col="pct" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <SortHeader label="Due Day" col="dueDay" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <SortHeader label="End Date" col="endDate" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <span className="text-center">Action</span>
          </div>

          {displayItems.map((p:any,idx:number)=>{
            /* Three shapes, not two. An entry with a monthly payment AND a principal-return date
               is servicing INTEREST — the principal does not move, so a progress percentage and a
               projected end date are both meaningless for it and are shown as such. */
            const f=ioweFacts(p)
            const eff=getEff(p),isLump=f.mode==='lump',isIntOnly=f.mode==='interest-only'
            const t=p.tenure??(eff.paid+eff.pending),pct=t>0?Math.round(eff.paid/t*100):0
            const dueDay=resolveDueDay(p)
            const paidKey=`personal-${p.id}`,isPaid=isPaidThisMonth(paidKey,dueDay,markedKeys as string[])
            const hasPending=eff.pending>0||isLump,done=!isLump&&eff.pending===0,isExp=expanded===p.id
            return (
              <div key={p.id} style={{borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}>
                <div className="grid items-center px-4 py-3 cursor-pointer transition-colors"
                  style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(85px,1fr) minmax(85px,1fr)',background:isExp?'var(--bg-base)':'transparent'}}
                  onMouseEnter={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                  onMouseLeave={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='transparent'}}
                  onClick={()=>setExpanded(isExp?null:p.id)}>
                  <div className="flex items-start gap-1.5 min-w-0">
                    {f.principalLeft>0 && <PickBox checked={wi.picked.has(String(p.id))} onToggle={()=>wi.toggle(String(p.id))} label={`Add ${p.person} to the what-if`} />}
                    <ChevronDown size={12} className="flex-shrink-0 mt-1" style={{color:'var(--text-faint)',transform:isExp?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s'}}/>
                    <div className="min-w-0">
                      <div className="font-medium text-[13px]">{p.person}</div>
                      <div className="text-[11px] mt-0.5" style={{color:isIntOnly?'var(--orange)':'var(--text-faint)'}}>
                        {isLump ? 'Lump sum'
                          : isIntOnly ? `Interest only · ${p.interestRate ?? (f.impliedRatePct != null ? f.impliedRatePct.toFixed(1) : '?')}% p.a.`
                          : p.interestRate ? `${p.interestRate}% p.a.` : 'EMI'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right"><span className="mono font-semibold" style={{color:'var(--warning)'}}>{fmtINR(p.amount)}</span></div>
                  <div className="text-right">{isLump?<span style={{color:'var(--text-faint)'}}>—</span>:<span className="mono font-semibold">{fmtINR(p.emi)}</span>}</div>
                  <div className="text-center">
                    {isLump ? <span style={{color:'var(--text-faint)'}}>—</span>
                      : isIntOnly ? (
                        /* Servicing interest buys no equity, so there is no progress to report.
                           What matters is how long it has been carried and what that has cost. */
                        <div title="Interest-only: principal is unchanged">
                          <div className="text-[11px] font-semibold" style={{color:'var(--orange)'}}>0%</div>
                          <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{f.monthsServiced}mo carried</div>
                        </div>
                      )
                      :<span className="mono font-medium text-[13px]" style={{color:pct>75?'var(--success)':pct>40?'var(--info)':'var(--text-faint)'}}>{pct}%</span>}
                  </div>
                  <div className="text-center">
                    {(()=>{
                      const b = getDueBadge(dueDay, isPaid)
                      return b
                        ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{background:b.bg,color:b.color}}>{b.label}</span>
                        : dueDay ? <span className="text-[11px]" style={{color:'var(--text-faint)'}}>day {dueDay}</span>
                        : <span style={{color:'var(--text-faint)'}}>—</span>
                    })()}
                  </div>
                  {/* End Date */}
                  <div className="text-center">
                    {p.endDate
                      ? <div className="text-[11px] font-semibold" style={{color:'var(--purple)'}}>{new Date(p.endDate).toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</div>
                      : isIntOnly ? (p.paybackDate
                          ? <div className="text-[11px] font-semibold" style={{color:'var(--orange)'}}>{new Date(p.paybackDate).toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</div>
                          : <span className="text-[11px]" style={{color:'var(--danger)'}}>no payback date</span>)
                      : eff.pending > 0 && !isLump ? (()=>{
                          const d = new Date(); d.setMonth(d.getMonth()+eff.pending)
                          return <div className="text-[11px] font-semibold" style={{color:'var(--purple)'}}>{d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</div>
                        })()
                      : <span style={{color:'var(--text-faint)'}}>—</span>}
                  </div>

                  <div className="flex items-center justify-center gap-1.5" onClick={e=>e.stopPropagation()}>
                    <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setModal({open:true,item:p,mode:isLump?'lump':'emi'})}}><Pencil size={11}/></button>
                    {!isLump&&!done&&(
                      <button title="Mark Paid"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold transition-all"
                      style={{background:'color-mix(in srgb, var(--success) 15%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 30%, transparent)'}}
                      onClick={()=>markMut.mutate(paidKey)}>✓</button>
                    )}
                    {(isLump||done)&&<button title="Settle" className="w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-green-500/20" style={{color:'var(--success)'}} onClick={()=>setConfirmModal({message:'Mark settled?',onConfirm:()=>settleMut.mutate(p.id),label:'Settle'})}><CheckCircle size={11}/></button>}
                    <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${p.person}?`,onConfirm:()=>deleteMut.mutate(p),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                </div>
                {isExp&&(
                  <div className="px-4 pb-3 pt-2 flex items-center gap-2 flex-wrap" style={{background:'var(--bg-base)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                    {!isLump&&t>0&&(
                      <div className="text-[11px] flex gap-4 flex-1" style={{color:'var(--text-faint)'}}>
                        <span>{eff.paid}/{t} paid</span>
                        <span>{eff.pending} left</span>
                        <span style={{color:'var(--warning)'}}>{fmtINR(eff.pending*Number(p.emi??0))} remaining</span>
                      </div>
                    )}
                    {done&&<button className="btn btn-xs" style={{background:'color-mix(in srgb, var(--success) 10%, transparent)',color:'var(--success)'}} onClick={()=>setConfirmModal({message:'Archive to Closed Assets?',onConfirm:()=>deleteMut.mutate(p),label:'Archive'})}><Archive size={11}/> Archive</button>}
                  </div>
                )}
              </div>
            )
          })}

          <div className="grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(85px,1fr) minmax(85px,1fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>{items.length} entries</span>
            <span className="text-right mono" style={{color:'var(--warning)'}}>{fmtINR(totalOwed)}</span>
            <span className="text-right mono" style={{color:'var(--danger)'}}>{fmtINR(totalEmi)}/mo</span>
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
      )}

      {modal.open&&(
        <Modal title={modal.item.id?'Edit Entry':'Add I Owe'} onClose={()=>setModal({open:false,item:empty,mode:'emi'})}
          footer={<><button className="btn-secondary" onClick={()=>setModal({open:false,item:empty,mode:'emi'})}>Cancel</button><button className="btn-primary" onClick={()=>saveMut.mutate(modal.item)}>Save</button></>}>
          <div className="flex gap-2 mb-4">
            <button className={`btn btn-sm flex-1 justify-center ${modal.mode==='emi'?'btn-primary':'btn-secondary'}`} onClick={()=>setModal(m=>({...m,mode:'emi'}))}>Monthly EMI</button>
            <button className={`btn btn-sm flex-1 justify-center ${modal.mode==='lump'?'btn-primary':'btn-secondary'}`} onClick={()=>setModal(m=>({...m,mode:'lump'}))}>Lump Sum</button>
          </div>
          <div className="form-grid">
            <FormField label="Person *" className="form-full"><input className="input" value={modal.item.person||''} onChange={e=>setModal(m=>({...m,item:{...m.item,person:e.target.value}}))}/></FormField>
            <FormField label="Amount (₹) *"><input className="input" type="number" value={modal.item.amount||''} onChange={e=>setModal(m=>({...m,item:{...m.item,amount:+e.target.value}}))}/></FormField>
            {modal.mode==='emi'?<>
              <FormField label="EMI/month (₹)"><input className="input" type="number" value={modal.item.emi||''} onChange={e=>setModal(m=>({...m,item:{...m.item,emi:+e.target.value}}))}/></FormField>
              <FormField label="Tenure (months)"><input className="input" type="number" placeholder="e.g. 12" value={modal.item.tenure||''} onChange={e=>setModal(m=>({...m,item:{...m.item,tenure:+e.target.value}}))}/></FormField>
              <FormField label="Interest Rate % p.a."><input className="input" type="number" step="0.1" value={modal.item.interestRate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,interestRate:+e.target.value}}))}/></FormField>
              <FormField label="Due Day"><input className="input" type="number" min={1} max={31} placeholder="1–31" value={modal.item.dueDay||''} onChange={e=>setModal(m=>({...m,item:{...m.item,dueDay:+e.target.value}}))}/></FormField>
              <FormField label="Start Date"><input className="input" type="date" value={modal.item.startDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,startDate:e.target.value}}))}/></FormField>
            </>:<>
              <FormField label="Payback Date"><input className="input" type="date" value={modal.item.paybackDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,paybackDate:e.target.value}}))}/></FormField>
            </>}
            <FormField label="Notes" className="form-full"><textarea className="input" rows={2} value={modal.item.notes||''} onChange={e=>setModal(m=>({...m,item:{...m.item,notes:e.target.value}}))}/></FormField>
          </div>
        </Modal>
      )}
      {inputModal?.open&&<InputModal title={inputModal.title} message={inputModal.message} placeholder={inputModal.placeholder} onConfirm={inputModal.onConfirm} onClose={()=>setInputModal(null)}/>}
      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
