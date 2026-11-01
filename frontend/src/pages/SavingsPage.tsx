import { ICON } from '../components/common/icons'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { savingsApi, closedLoansApi, paidMarksApi } from '../api'
import type { Saving } from '../types'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, InputModal, SortHeader, FromLink } from '../components/common'
import { fmtINR, getEff, dueStatus, isPaidThisMonth, resolveDueDay } from '../utils/format'
import { Plus, Pencil, Trash2, Archive, ChevronDown } from 'lucide-react'
import { PhoneRow, freqSuffix } from '../components/common/PhoneRow'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

const empty: Saving = { name: '', monthly: 0, tenure: 0, mode: 'saving' }
const today = new Date().getDate()

const SAVING_TYPE_CHIPS = ['Chit Fund', 'RD', 'FD', 'Gold', 'Recurring Deposit']

// Due date badge helper. Paid state is gated through the shared `dueStatus()` (same function
// Calendar/Lookup use) instead of a hardcoded `isPaid` check — this page fetched `markedKeys`
// from the API but never read it anywhere, so a saving already marked paid this month still
// showed "Due Today"/"⚠ overdue" as if nothing had been done about it.
const getDueBadge = (dueDay: number | undefined | null, isPaid: boolean) => {
  if (dueStatus(dueDay ?? undefined, !isPaid) === 'none') return null
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

  if (diff === 0)             return { label: '🔴 Due today',      color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff < 0 && diff >= -7) return { label: `⚠ ${Math.abs(diff)}d overdue`, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff > 0 && diff <= 3)  return { label: `🔴 Due in ${diff}d`, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff > 3 && diff <= 7)  return { label: `⚡ Due in ${diff}d`, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 15%, transparent)' }
  if (diff > 7 && diff <= 10) return { label: `Due in ${diff}d`,    color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 10%, transparent)' }
  return null
}

export default function SavingsPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: markedKeys = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  // Was only tracking the `savings` query — `paid-marks` feeds the paid/due state below.
  const isLoading = l1 || l2
  const isError = e1 || e2
  const refetch = () => { r1(); r2() }
  const [modal, setModal] = useState<{ open: boolean; item: Saving }>({ open: false, item: empty })
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [inputModal, setInputModal] = useState<any>(null)
  const [pendingClose, setPendingClose] = useState<any>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filterStatus, setFilterStatus] = useState('All')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const saveMut    = useMutation({ mutationFn: (d: Saving) => d.id ? savingsApi.update(d.id, d) : savingsApi.create(d), onSuccess: ()=>{qc.invalidateQueries({queryKey:['savings']});toast.success('Saved');setModal({open:false,item:empty})} })
  const deleteMut  = useMutation({ mutationFn: async (v: any) => { const e=getEff(v),tp=e.paid*Number(v.monthly??0); if(tp>0){try{await closedLoansApi.create({lender:v.name,purpose:v.savingType??'Savings',assetType:'Savings / Chit',amount:tp,totalPaid:tp,closedMonths:e.paid,closedDate:new Date().toISOString().slice(0,10)})}catch{}}; return savingsApi.delete(v.id) }, onSuccess:()=>{qc.invalidateQueries({queryKey:['savings']});qc.invalidateQueries({queryKey:['closed-loans']});toast.success('Deleted')} })
  const doCloseMut = useMutation({ mutationFn: async ({v,maturity}:{v:any;maturity:number|null})=>{ const tp=(v.paidMonths??0)*(v.monthly??0); await closedLoansApi.create({lender:v.name,purpose:v.savingType??'Savings',assetType:'Savings / Chit',amount:tp,totalPaid:tp,recoveredAmount:maturity??tp,closedMonths:v.paidMonths??0,closedDate:new Date().toISOString().slice(0,10)}); await savingsApi.delete(v.id) }, onSuccess:()=>{qc.invalidateQueries({queryKey:['savings']});qc.invalidateQueries({queryKey:['closed-loans']});toast.success('Closed!')} })
  const doublesMut = useMutation({ mutationFn: ({id,doubles,missed}:{id:number;doubles:number;missed:number})=>{ const item=items.find(v=>v.id===id); return savingsApi.update(id,{...item,doublePayments:doubles,missedMonths:missed}) }, onSuccess:()=>{qc.invalidateQueries({queryKey:['savings']});toast.success('Updated')} })
  const markMut    = useMutation({ mutationFn: paidMarksApi.toggle, onSuccess:()=>qc.invalidateQueries({queryKey:['paid-marks']}) })

  const building   = (items as any[]).filter(v=>v.mode!=='withdrew'&&!v.prizeTaken&&getEff(v).pending>0)
  const repaying   = (items as any[]).filter(v=>(v.mode==='withdrew'||v.prizeTaken)&&getEff(v).pending>0)
  const done       = (items as any[]).filter(v=>getEff(v).pending===0&&getEff(v).paid>0)
  const buildCorpus = building.reduce((s:number,v:any)=>s+getEff(v).paid*Number(v.monthly??0),0)
  const repayLeft  = repaying.reduce((s:number,v:any)=>s+getEff(v).pending*Number(v.monthly??0),0)
  const totalMo    = building.reduce((s:number,v:any)=>s+Number(v.monthly??0),0) + repaying.reduce((s:number,v:any)=>s+Number(v.monthly??0),0)

  // Same classification used per-row below (doneItem/isW), so the filter matches what the Status badge shows.
  const statusOf = (v: any) => {
    const eff = getEff(v)
    const isW = v.mode === 'withdrew' || v.prizeTaken
    const doneItem = eff.pending === 0 && eff.paid > 0
    return doneItem ? 'Done' : isW ? 'Repaying' : 'Building'
  }
  const filtered = filterStatus === 'All' ? (items as any[]) : (items as any[]).filter((v: any) => statusOf(v) === filterStatus)
  // Footer totals must reflect the active filter, not the whole table — mirrors the convention
  // Investments/Insurance/Loans/Income already use. Was previously sourced from the unfiltered
  // `building`/`repaying` arrays, so filtering to e.g. "Done" only changed which rows rendered
  // while the Monthly/Corpus/Repay-Left totals below kept summing every saving.
  const filteredBuilding = filtered.filter((v: any) => v.mode !== 'withdrew' && !v.prizeTaken && getEff(v).pending > 0)
  const filteredRepaying = filtered.filter((v: any) => (v.mode === 'withdrew' || v.prizeTaken) && getEff(v).pending > 0)
  const filteredTotalMo = filteredBuilding.reduce((s: number, v: any) => s + Number(v.monthly ?? 0), 0) + filteredRepaying.reduce((s: number, v: any) => s + Number(v.monthly ?? 0), 0)
  const filteredBuildCorpus = filteredBuilding.reduce((s: number, v: any) => s + getEff(v).paid * Number(v.monthly ?? 0), 0)
  const filteredRepayLeft = filteredRepaying.reduce((s: number, v: any) => s + getEff(v).pending * Number(v.monthly ?? 0), 0)

  // Mirrors the per-row computation below so the comparator and the rendered row never diverge.
  const sortMetrics = (v: any) => {
    const eff = getEff({ ...v, doublePayments: v.doublePayments ?? 0, missedMonths: v.missedMonths ?? 0 })
    const t = v.tenure ?? 0
    const pct = t > 0 ? Math.round(eff.paid / t * 100) : 0
    const corpus = eff.paid * Number(v.monthly ?? 0)
    const repayRemaining = eff.pending * Number(v.monthly ?? 0)
    return { eff, t, pct, corpus, repayRemaining }
  }
  const displayItems = sortCol ? [...filtered].sort((a: any, b: any) => {
    let av: number | string, bv: number | string
    switch (sortCol) {
      case 'name': av = a.name ?? ''; bv = b.name ?? ''; break
      case 'monthly': av = Number(a.monthly ?? 0); bv = Number(b.monthly ?? 0); break
      case 'corpus': av = sortMetrics(a).corpus; bv = sortMetrics(b).corpus; break
      case 'repayLeft': av = sortMetrics(a).repayRemaining; bv = sortMetrics(b).repayRemaining; break
      case 'pct': av = sortMetrics(a).pct; bv = sortMetrics(b).pct; break
      // Was raw `a.dueDay`/`b.dueDay` — a chit with no explicit dueDay but an inferable one (via
      // resolveDueDay's startDate fallback, same as the Due-day column below) sorted as if it had
      // no due date at all, landing at the bottom regardless of when it's actually due.
      case 'due': av = resolveDueDay(a) ?? Infinity; bv = resolveDueDay(b) ?? Infinity; break
      default: av = 0; bv = 0
    }
    if (typeof av === 'string' || typeof bv === 'string') {
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    }
    const cmp = (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  }) : filtered

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your savings." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader links={<>
        <FromLink to="/break-savings" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--success) 12%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 20%, transparent)'}}>💡 Break analysis →</FromLink>
        <FromLink to="/payoff" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--purple) 12%, transparent)',color:'var(--purple)',border:'1px solid color-mix(in srgb, var(--purple) 20%, transparent)'}}>🎯 Payoff plan →</FromLink>
      </>} title="Savings & chit funds" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}><Plus size={14}/> Add</button>}/>

      {items.length > 0 && (
        <KpiRow className="grid grid-cols-4 gap-3" keep={[0, 1]}>
          {[
            {label:'Building corpus',  value:fmtINR(buildCorpus),  sub:`${building.length} active · ${fmtINR(totalMo)}/mo`,       accent:'var(--success)'},
            {label:'Chit repayment',   value:fmtINR(repayLeft),    sub:`${repaying.length} repaying · ${fmtINR(repaying.reduce((s:number,v:any)=>s+Number(v.monthly??0),0))}/mo`, accent:'var(--danger)'},
            {label:'FD equivalent',    value:fmtINR(Math.round(buildCorpus*0.065)), sub:'@ 6.5% p.a. on corpus',                  accent:'var(--cyan)'},
            {label:'Completed',        value:String(done.length),  sub:`${fmtINR(done.reduce((s:number,v:any)=>s+getEff(v).paid*Number(v.monthly??0),0))} total paid`, accent:'var(--purple)', isCurrency:false},
          ].map((m:any)=>(
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
      {building.length > 0 && (() => {
        const fdYield = Math.round(buildCorpus * 0.065)
        return (
          <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg, color-mix(in srgb, var(--success) 8%, transparent) 0%, color-mix(in srgb, var(--success) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--success) 15%, transparent)'}}>
            <span className="text-lg">💡</span>
            <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
              Your <span style={{color:'var(--success)',fontWeight:600}}>{fmtINR(buildCorpus)}</span> corpus would earn <span style={{color:'var(--cyan)',fontWeight:600}}>{fmtINR(fdYield)}/yr</span> at 6.5% FD rate — chit returns must beat this to be worth it.
            </div>
          </div>
        )
      })()}

      {items.length === 0 ? <EmptyState icon={ICON.savings} title="No savings" sub="Track chit funds and savings schemes" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}>+ Add saving</button>} /> : (
        <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="hidden md:grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(180px,2.4fr) minmax(75px,0.95fr) minmax(85px,1.05fr) minmax(100px,1.2fr) minmax(80px,1fr) minmax(45px,0.6fr) minmax(75px,0.95fr) minmax(70px,0.9fr) minmax(80px,1fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span><SortHeader label="Name" col="name" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="left" /></span>
            <span className="text-center">
              <select aria-label="Filter by status" className="select text-[12px] py-0.5 px-1 font-medium text-center" style={{width:'auto',background:'transparent',border:'none',color:'inherit'}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} onClick={e=>e.stopPropagation()}>
                <option value="All">Status (All)</option>
                <option value="Building">Building</option>
                <option value="Repaying">Repaying</option>
                <option value="Done">Done</option>
              </select>
            </span>
            <span className="text-right"><SortHeader label="Monthly" col="monthly" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="Paid / corpus" col="corpus" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="Repay left" col="repayLeft" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-center"><SortHeader label="%" col="pct" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" /></span>
            <span className="text-center"><SortHeader label="Due" col="due" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" /></span>
            <span className="text-center">End</span><span className="text-center">Action</span>
          </div>

          {filtered.length===0 ? (
            <div className="px-4 py-8 text-center text-[11px]" style={{color:'var(--text-faint)'}}>No savings match "{filterStatus}"</div>
          ) : displayItems.map((v:any,idx:number)=>{
            const doubles=v.doublePayments??0, missed=v.missedMonths??0
            const eff=getEff({...v,doublePayments:doubles,missedMonths:missed})
            const t=v.tenure??0, pct=t>0?Math.round(eff.paid/t*100):0
            const isW=v.mode==='withdrew'||v.prizeTaken
            const cashPaid=eff.elapsed*Number(v.monthly??0)
            const corpus=eff.paid*Number(v.monthly??0)
            const repayRemaining=eff.pending*Number(v.monthly??0)
            const paidKey=`sav-${v.id}`
            const isExp=expanded===v.id
            const doneItem=eff.pending===0&&eff.paid>0

            return (
              <div key={v.id} style={{borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                {/* Phone row (tablet and desktop: the table row below) */}
                <PhoneRow title={v.name} amount={<>{fmtINR(v.monthly)}<span className="text-[11px] font-normal">/mo</span></>} amountColor={isW ? 'var(--danger)' : 'var(--success)'}
                  left={`${v.savingType||'Savings'}${isW ? ' · repaying' : ''}${missed ? ` · ${missed} missed` : ''}`}
                  right={doneItem ? '✓ done' : `${eff.pending} left`} pct={t>0 ? pct : undefined} barColor={isW ? 'var(--danger)' : 'var(--success)'}
                  expanded={isExp} onToggle={()=>setExpanded(isExp?null:v.id)}
                  actions={[
                    { label: 'Edit', onClick: ()=>setModal({open:true,item:v}) },
                    ...(!doneItem ? [{ label: 'Mark paid', tone: 'success' as const, onClick: ()=>markMut.mutate(paidKey) }] : []),
                    { label: 'Delete', tone: 'danger' as const, onClick: ()=>setConfirmModal({message:`Delete ${v.name}?`,onConfirm:()=>deleteMut.mutate(v),label:'Delete'}) },
                  ]} />
                <div className="hidden md:grid items-center px-4 py-3 cursor-pointer transition-colors"
                  style={{gridTemplateColumns:'minmax(180px,2.4fr) minmax(75px,0.95fr) minmax(85px,1.05fr) minmax(100px,1.2fr) minmax(80px,1fr) minmax(45px,0.6fr) minmax(75px,0.95fr) minmax(70px,0.9fr) minmax(80px,1fr)',background:isExp?'var(--bg-base)':'transparent'}}
                  onMouseEnter={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                  onMouseLeave={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='transparent'}}
                  onClick={()=>setExpanded(isExp?null:v.id)}>

                  {/* Chevron in a fixed leading column so the type sub-line lines up under the name */}
                  <div className="flex items-start gap-1.5 min-w-0">
                    <ChevronDown size={12} className="flex-shrink-0 mt-1" style={{color:'var(--text-faint)',transform:isExp?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s'}}/>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-medium text-[13px]">{v.name}</span>
                        {doubles>0&&<span className="text-[11px] px-1 rounded" style={{color:'var(--info)',background:'color-mix(in srgb, var(--info) 10%, transparent)'}}>{doubles} free</span>}
                        {missed>0&&<span className="text-[11px] px-1 rounded" style={{color:'var(--danger)',background:'color-mix(in srgb, var(--danger) 10%, transparent)'}}>{missed} missed</span>}
                      </div>
                      {v.savingType&&<div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{v.savingType}</div>}
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                      style={{background:doneItem?'color-mix(in srgb, var(--purple) 15%, transparent)':isW?'color-mix(in srgb, var(--danger) 15%, transparent)':'color-mix(in srgb, var(--success) 15%, transparent)',color:doneItem?'var(--purple)':isW?'var(--danger)':'var(--success)'}}>
                      {doneItem?'✓ Done':isW?'Repaying':'Building'}
                    </span>
                    {!doneItem&&!isW&&eff.pending>0&&(
                      <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{eff.pending}mo left</div>
                    )}
                  </div>

                  <div className="text-right"><span className="mono font-semibold" style={{color:'var(--text-muted)'}}>{fmtINR(v.monthly)}/mo</span></div>

                  <div className="text-right">
                    <div className="mono font-semibold" style={{color:isW?'var(--danger)':'var(--success)'}}>{fmtINR(isW?cashPaid:corpus)}</div>
                    <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{eff.paid}/{t} months</div>
                  </div>

                  <div className="text-right">
                    {repayRemaining>0
                      ?<span className="mono font-semibold" style={{color:'var(--warning)'}}>{fmtINR(repayRemaining)}</span>
                      :<span style={{color:'var(--text-faint)'}}>—</span>}
                  </div>

                  <div className="text-center">
                    <span className="mono font-medium text-[13px]" style={{color:pct>75?'var(--success)':pct>40?'var(--info)':'var(--text-faint)'}}>{pct}%</span>
                  </div>

                  {/* Due day */}
                  <div className="text-center">
                    {(()=>{
                      // Was deriving the due day only from `startDate`'s day-of-month, ignoring the
                      // record's own explicit `dueDay` field entirely — a chit due on the 20th but
                      // started on the 3rd showed (and could be marked paid/overdue) against day 3
                      // here, while Calendar (which uses resolveDueDay) correctly used day 20.
                      const day = resolveDueDay(v) ?? null
                      const isPaidDay = isPaidThisMonth(paidKey, day ?? undefined, markedKeys as string[])
                      const b = getDueBadge(day, isPaidDay)
                      return b
                        ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{background:b.bg,color:b.color}}>{b.label}</span>
                        : day ? <span className="text-[11px]" style={{color:'var(--text-faint)'}}>day {day}</span>
                        : <span style={{color:'var(--text-faint)'}}>—</span>
                    })()}
                  </div>

                  {/* End month */}
                  <div className="text-center">
                    {eff.pending > 0 ? (()=>{
                      const d = new Date(); d.setMonth(d.getMonth()+eff.pending)
                      return <div className="text-[11px] font-semibold" style={{color:'var(--purple)'}}>{d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</div>
                    })() : <span className="text-[11px]" style={{color:'var(--success)'}}>✓ Done</span>}
                  </div>

                  <div className="flex items-center justify-center gap-1.5" onClick={e=>e.stopPropagation()}>
                    <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setModal({open:true,item:v})}}><Pencil size={11}/></button>
                    {eff.pending>0&&(
                      <button title="Pay" className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold" style={{background:'color-mix(in srgb, var(--success) 15%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 30%, transparent)'}} onClick={()=>markMut.mutate(paidKey)}>✓</button>
                    )}
                    <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${v.name}?`,onConfirm:()=>deleteMut.mutate(v),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                </div>

                {isExp&&(
                  <div className="px-4 pb-3 pt-2 space-y-2" style={{background:'var(--bg-base)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                    {/* Chit pot won */}
                    {Number(v.chitValue??0)>0&&!isW&&(
                      <div className="flex items-center gap-3 text-[11px]">
                        <span style={{color:'var(--text-faint)'}}>Chit value: <span className="mono text-white">{fmtINR(v.chitValue)}</span></span>
                        <button className={`text-[11px] px-2.5 py-1 rounded font-medium ${v.prizeTaken?'bg-yellow-500/15 text-yellow-400':'bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--text-muted)]'}`}
                          onClick={()=>{ if(!v.prizeTaken){setInputModal({open:true,title:'🏆 Chit Pot Won!',message:`${v.name} — Chit: ${fmtINR(v.chitValue)}\nActual received:`,placeholder:String(v.chitValue),onConfirm:(amt:string)=>{saveMut.mutate({...v,prizeTaken:true,actualReceived:+amt||null});setInputModal(null)}})} else {saveMut.mutate({...v,prizeTaken:false,actualReceived:null})}}}>
                          {v.prizeTaken?`🏆 ${fmtINR(v.actualReceived)} received`:'🏆 Won pot?'}
                        </button>
                      </div>
                    )}

                    {/* Doubles / Missed */}
                    <div className="flex items-center gap-4 text-[11px] flex-wrap">
                      <div className="flex items-center gap-1" style={{color:'var(--text-faint)'}}>
                        Free months:
                        <button className="btn btn-xs bg-blue-500/10 text-blue-400" onClick={()=>doublesMut.mutate({id:v.id!,doubles:Math.max(0,doubles-1),missed})}>−</button>
                        <span className="mono font-bold text-blue-400">{doubles}</span>
                        <button className="btn btn-xs bg-blue-500/10 text-blue-400" onClick={()=>doublesMut.mutate({id:v.id!,doubles:doubles+1,missed})}>+</button>
                      </div>
                      <div className="flex items-center gap-1" style={{color:'var(--text-faint)'}}>
                        Missed:
                        <button className="btn btn-xs bg-red-500/10 text-red-400" onClick={()=>doublesMut.mutate({id:v.id!,doubles,missed:Math.max(0,missed-1)})}>−</button>
                        <span className="mono font-bold text-red-400">{missed}</span>
                        <button className="btn btn-xs bg-red-500/10 text-red-400" onClick={()=>doublesMut.mutate({id:v.id!,doubles,missed:missed+1})}>+</button>
                      </div>
                    </div>

                    {/* P&L for withdrew */}
                    {isW&&Number(v.actualReceived??0)>0&&(()=>{
                      const got=Number(v.actualReceived??0),paid2=cashPaid+repayRemaining,pnl=got-paid2
                      return (
                        <div className="flex gap-4 text-[11px] flex-wrap">
                          <span style={{color:'var(--text-faint)'}}>Got: <span className="mono font-bold" style={{color:'var(--success)'}}>{fmtINR(got)}</span></span>
                          <span style={{color:'var(--text-faint)'}}>Total cost: <span className="mono font-bold" style={{color:'var(--danger)'}}>{fmtINR(paid2)}</span></span>
                          <span style={{color:'var(--text-faint)'}}>P&L: <span className="mono font-bold" style={{color:pnl>=0?'var(--success)':'var(--danger)'}}>{pnl>=0?'+':''}{fmtINR(pnl)}</span></span>
                        </div>
                      )
                    })()}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {!isW&&eff.pending>0&&<button className="btn btn-xs bg-green-500/10 text-green-400" onClick={()=>setInputModal({open:true,title:`Withdrew — ${v.name}`,message:'Amount actually received:',placeholder:String(v.chitValue??0),onConfirm:(amt:string)=>{saveMut.mutate({...v,mode:'withdrew',actualReceived:+amt});setInputModal(null)}})}>💰 Withdrew</button>}
                      {doneItem&&<button className="btn btn-xs bg-purple-500/10 text-purple-400" onClick={()=>setPendingClose(v)}><Archive size={11}/> Close</button>}
                      {eff.pending>0&&<button className="btn btn-xs bg-yellow-500/10 text-yellow-400" onClick={()=>setConfirmModal({message:'Archive early?',onConfirm:()=>setPendingClose(v),label:'Archive'})}><Archive size={11}/> Archive early</button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div className="hidden md:grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(180px,2.4fr) minmax(75px,0.95fr) minmax(85px,1.05fr) minmax(100px,1.2fr) minmax(80px,1fr) minmax(45px,0.6fr) minmax(75px,0.95fr) minmax(70px,0.9fr) minmax(80px,1fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>{filtered.length} entr{filtered.length!==1?'ies':'y'}{filterStatus!=='All'?` (${filterStatus})`:''}</span>
            <span></span>
            <span className="text-right mono" style={{color:'var(--text-muted)'}}>{fmtINR(filteredTotalMo)}/mo</span>
            <span className="text-right mono" style={{color:'var(--success)'}}>{fmtINR(filteredBuildCorpus)}</span>
            <span className="text-right mono" style={{color:'var(--danger)'}}>{filteredRepayLeft>0?fmtINR(filteredRepayLeft):'—'}</span>
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
      )}

      {modal.open&&(
        <Modal title={modal.item.id?'Edit':'Add Saving'} onClose={()=>setModal({open:false,item:empty})}
          footer={<><button className="btn-secondary" onClick={()=>setModal({open:false,item:empty})}>Cancel</button><button className="btn-primary" onClick={()=>saveMut.mutate(modal.item)}>Save</button></>}>
          <div className="form-grid">
            <FormField label="Name *" className="form-full"><input className="input" value={modal.item.name||''} onChange={e=>setModal(m=>({...m,item:{...m.item,name:e.target.value}}))}/></FormField>
            <FormField label="Mode"><select className="select" value={modal.item.mode||'saving'} onChange={e=>setModal(m=>({...m,item:{...m.item,mode:e.target.value}}))}>
              <option value="saving">Building</option><option value="withdrew">Withdrew</option></select></FormField>
            <FormField label="Type" className="form-full">
              {/* Chips for the common cases — Gold accumulation schemes (building toward buying gold,
                  distinct from a Gold Loan on /loans) now have a one-click tag — plus a free-text
                  fallback via "Other" so any custom label (including ones already saved) keeps working. */}
              <div className="flex flex-wrap gap-1.5">
                {SAVING_TYPE_CHIPS.map(t => {
                  const on = modal.item.savingType === t
                  return (
                    <button key={t} type="button" onClick={()=>setModal(m=>({...m,item:{...m.item,savingType:t}}))}
                      className="text-[12px] font-medium px-2.5 py-1.5 rounded-full transition-colors"
                      style={{background: on ? 'rgba(56,189,248,0.18)' : 'color-mix(in srgb, var(--text) 6%, transparent)', color: on ? 'var(--cyan, #38bdf8)' : 'var(--text-faint)', border: `1px solid ${on ? 'rgba(56,189,248,0.4)' : 'color-mix(in srgb, var(--text) 10%, transparent)'}`}}>
                      {t}
                    </button>
                  )
                })}
                {(() => {
                  const isOther = !!modal.item.savingType && !SAVING_TYPE_CHIPS.includes(modal.item.savingType)
                  return (
                    <button type="button"
                      onClick={()=>setModal(m=>({...m,item:{...m.item,savingType: SAVING_TYPE_CHIPS.includes(m.item.savingType||'') ? '' : m.item.savingType}}))}
                      className="text-[12px] font-medium px-2.5 py-1.5 rounded-full transition-colors"
                      style={{background: isOther ? 'rgba(56,189,248,0.18)' : 'color-mix(in srgb, var(--text) 6%, transparent)', color: isOther ? 'var(--cyan, #38bdf8)' : 'var(--text-faint)', border: `1px solid ${isOther ? 'rgba(56,189,248,0.4)' : 'color-mix(in srgb, var(--text) 10%, transparent)'}`}}>
                      Other
                    </button>
                  )
                })()}
              </div>
              {(!modal.item.savingType || !SAVING_TYPE_CHIPS.includes(modal.item.savingType)) && (
                <input className="input mt-1.5" placeholder="Custom type..." value={modal.item.savingType||''} onChange={e=>setModal(m=>({...m,item:{...m.item,savingType:e.target.value}}))}/>
              )}
            </FormField>
            <FormField label="Monthly (₹)"><input className="input" type="number" placeholder="e.g. 5000" value={modal.item.monthly||''} onChange={e=>setModal(m=>({...m,item:{...m.item,monthly:+e.target.value}}))}/></FormField>
            <FormField label="Tenure (months)"><input className="input" type="number" placeholder="e.g. 12" value={modal.item.tenure||''} onChange={e=>setModal(m=>({...m,item:{...m.item,tenure:+e.target.value}}))}/></FormField>
            <FormField label="Chit Value (₹)"><input className="input" type="number" placeholder="e.g. 100000" value={modal.item.chitValue||''} onChange={e=>setModal(m=>({...m,item:{...m.item,chitValue:+e.target.value}}))}/></FormField>
            <FormField label="Start date"><input className="input" type="date" value={modal.item.startDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,startDate:e.target.value}}))}/></FormField>
            {modal.item.mode==='withdrew'&&<FormField label="Actual Received (₹)"><input className="input" type="number" value={modal.item.actualReceived||''} onChange={e=>setModal(m=>({...m,item:{...m.item,actualReceived:+e.target.value}}))}/></FormField>}
          </div>
        </Modal>
      )}
      {inputModal?.open&&<InputModal title={inputModal.title} message={inputModal.message} placeholder={inputModal.placeholder} type={inputModal.type} onConfirm={inputModal.onConfirm} onClose={()=>setInputModal(null)}/>}
      {/* onClose fires on backdrop click and the × button — a dismiss gesture, not a confirm. It
          used to also call doCloseMut.mutate(...) (with maturity:null), so there was no way to
          actually back out of "Close": every dismissal path deleted the saving and archived it
          with a null recovered amount, same as confirming. Now it's a true no-op, matching the
          onClose usage at line ~282 above (setInputModal(null) with no mutation). */}
      {pendingClose&&<InputModal title={`Close — ${pendingClose.name}`} message={`Deposited: ${fmtINR((pendingClose.paidMonths??0)*(pendingClose.monthly??0))}\nMaturity value received:`} placeholder="0" type="number" onConfirm={v=>{doCloseMut.mutate({v:pendingClose,maturity:+v});setPendingClose(null)}} onClose={()=>setPendingClose(null)}/>}
      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
