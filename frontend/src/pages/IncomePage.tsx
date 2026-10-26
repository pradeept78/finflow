import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { incomeApi } from '../api'
import type { IncomeEntry } from '../types'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader } from '../components/common'
import { fmtINR, toMonthly, isOneOff, monthlyIncomeTotal } from '../utils/format'
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

const empty: IncomeEntry = { label: '', amount: 0, frequency: 'Monthly', active: true }

export default function IncomePage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const [expanded, setExpanded] = useState<number|null>(null)
  const [modal, setModal] = useState<{ open: boolean; item: IncomeEntry }>({ open: false, item: empty })
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [filterFreq, setFilterFreq] = useState('All')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const validateIncome = (v: IncomeEntry) => {
    const errs: Record<string,string> = {}
    if (!v.label?.trim()) errs.label = 'Income source is required'
    if (!v.amount || v.amount <= 0) errs.amount = 'Amount must be greater than 0'
    return errs
  }

  const saveMut   = useMutation({ mutationFn: (d: IncomeEntry) => d.id ? incomeApi.update(d.id, d) : incomeApi.create(d), onSuccess: ()=>{qc.invalidateQueries({queryKey:['income']});toast.success('Saved');setModal({open:false,item:empty});setFormErrors({})} })
  const deleteMut = useMutation({ mutationFn: incomeApi.delete, onSuccess: ()=>{qc.invalidateQueries({queryKey:['income']});toast.success('Deleted')} })
  const toggleMut = useMutation({ mutationFn: (v: any) => incomeApi.update(v.id, {...v, active: !v.active}), onSuccess: ()=>qc.invalidateQueries({queryKey:['income']}) })

  const active   = (items as any[]).filter(v=>v.active!==false)
  const inactive = (items as any[]).filter(v=>v.active===false)
  const total    = active.reduce((s:number,v:any)=>s+Number(v.amount??0),0)
  // Monthly-equivalent total, excluding inactive and one-off ('One-time'/'Single') sources —
  // a one-time bonus should not be folded into the recurring "Monthly Income" figure forever.
  const monthly  = monthlyIncomeTotal(active)

  const filtered = filterFreq==='All' ? (items as any[]) : (items as any[]).filter((v:any)=>(v.frequency||'Monthly')===filterFreq)
  const filteredActive = filtered.filter((v:any)=>v.active!==false)
  const filteredTotal = filteredActive.reduce((s:number,v:any)=>s+Number(v.amount??0),0)
  const filteredMonthly = monthlyIncomeTotal(filteredActive)

  const displayItems = [...filtered].sort((a: any, b: any) => {
    if (!sortCol) return 0
    let cmp = 0
    if (sortCol === 'label') cmp = (a.label ?? '').localeCompare(b.label ?? '')
    else if (sortCol === 'amount') cmp = Number(a.amount ?? 0) - Number(b.amount ?? 0)
    else if (sortCol === 'monthly') cmp = toMonthly(a.amount, a.frequency) - toMonthly(b.amount, b.frequency)
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Failed to load income data." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Income" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}><Plus size={14}/> Add</button>}/>

      {items.length > 0 && (
  <div className="grid grid-cols-4 gap-3">
          {[
            {label:'Monthly Income',  value:fmtINR(Math.round(monthly)), sub:`${active.length} active sources`,   accent:'var(--success)'},
            {label:'Annual Income',   value:fmtINR(Math.round(monthly*12)), sub:'projected annual',              accent:'var(--cyan)'},
            {label:'Sources',         value:String(active.length),        sub:inactive.length>0?`${inactive.length} inactive`:'all active', accent:'var(--purple)', isCurrency:false},
            // This read `.source`, but the table renders `v.label` and the form writes `label` —
            // nothing ever populates `source`, so the largest source's name always showed '—'.
            // Also sorting a copy now rather than in place.
            {label:'Largest Source',  value:fmtINR(active.length>0?Math.max(...active.map((v:any)=>Number(v.amount??0))):0), sub:[...active].sort((a:any,b:any)=>Number(b.amount??0)-Number(a.amount??0))[0]?.label||'—', accent:'var(--warning)'},
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

      {items.length === 0 ? <EmptyState icon="💰" title="No income sources" sub="Add your salary and other income sources" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}>+ Add income source</button>} /> : (
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(120px,1.26fr) minmax(100px,1.05fr) minmax(80px,0.84fr) minmax(80px,0.84fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span><SortHeader label="Source" col="label" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="left" /></span>
            <span className="text-right"><SortHeader label="Amount" col="amount" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="Monthly" col="monthly" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-center">
              <select aria-label="Filter by frequency" className="select text-[12px] py-0.5 px-1 font-medium text-center" style={{width:'auto',background:'transparent',border:'none',color:'inherit'}} value={filterFreq} onChange={e=>setFilterFreq(e.target.value)} onClick={e=>e.stopPropagation()}>
                <option value="All">Freq (All)</option>
                {['Monthly','Quarterly','Half-Yearly','Yearly','One-time'].map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </span>
            <span className="text-center">Actions</span>
          </div>

          {filtered.length===0 ? (
            <div className="px-4 py-8 text-center text-[11px]" style={{color:'var(--text-faint)'}}>No income sources match "{filterFreq}"</div>
          ) : displayItems.map((v:any,idx:number)=>{
            const oneOff = isOneOff(v.frequency)
            const mo = toMonthly(v.amount, v.frequency)
            const isInactive = v.active===false
            return (
              <div key={v.id}
                className="grid items-center px-4 py-3 transition-colors"
                style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(120px,1.26fr) minmax(100px,1.05fr) minmax(80px,0.84fr) minmax(80px,0.84fr)',borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',opacity:isInactive?0.5:1,background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <ChevronDown size={12} style={{color:'var(--text-faint)',transform:expanded===v.id?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s',flexShrink:0,cursor:'pointer'}} onClick={()=>setExpanded(expanded===v.id?null:v.id)}/>
                  <div className="min-w-0">
                    <span className={`font-medium text-[13px] ${isInactive?'line-through':''}`}>{v.label}</span>
                    {v.notes&&<div className="text-[11px] mt-0.5 truncate" style={{color:'var(--text-faint)'}}>{v.notes}</div>}
                  </div>
                </div>
                {/* The amount is the headline figure and must stay green — a duplicate `color`
                    key was overriding it to faint grey, and the frequency line below lost its own. */}
                <div className="text-right"><span className="mono font-semibold" style={{color:'var(--success)'}}>{fmtINR(v.amount)}</span></div>
                <div className="text-right">
                  {oneOff
                    ? <span className="mono text-[13px]" style={{color:'var(--text-faint)'}} title="One-time income isn't counted towards the recurring monthly total">—</span>
                    : <span className="mono text-[13px]" style={{color:v.frequency==='Monthly'?'var(--text-faint)':' var(--info)'}}>{fmtINR(Math.round(mo))}/mo</span>}
                </div>
                <div className="text-center"><span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>{v.frequency||'Monthly'}</span></div>
                <div className="flex justify-center gap-1">
                  <button className="btn-ghost btn-xs" aria-label="Edit income source" title="Edit" onClick={()=>setModal({open:true,item:v})}><Pencil size={11}/></button>
                  <button className={`btn btn-xs ${isInactive?'bg-gray-500/15 text-gray-400':'bg-green-500/15 text-green-400'}`} onClick={()=>toggleMut.mutate(v)}>{isInactive?'Off':'On'}</button>
                  <button className="btn-danger btn-xs" aria-label="Delete income source" title="Delete" onClick={()=>setConfirmModal({message:'Delete?',onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'})}><Trash2 size={11}/></button>
                </div>
              </div>
            )
          })}

          <div className="grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(120px,1.26fr) minmax(100px,1.05fr) minmax(80px,0.84fr) minmax(80px,0.84fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>{filteredActive.length} active{filterFreq!=='All'?` (${filterFreq})`:''}</span>
            <span className="text-right mono" style={{color:'var(--success)'}}>{fmtINR(filteredTotal)}</span>
            <span className="text-right mono" style={{color:'var(--success)'}}>{fmtINR(Math.round(filteredMonthly))}/mo</span>
            <span></span><span></span>
          </div>
        </div>
      )}

      {modal.open&&(
        <Modal title={modal.item.id?'Edit Income':'Add Income'} onClose={()=>{setModal({open:false,item:empty});setFormErrors({})}}
          footer={<><button className="btn-secondary" onClick={()=>{setModal({open:false,item:empty});setFormErrors({})}}>Cancel</button><button className="btn-primary" disabled={saveMut.isPending} onClick={()=>{ const errs = validateIncome(modal.item); if (Object.keys(errs).length > 0) { setFormErrors(errs); return; } saveMut.mutate(modal.item) }}>{saveMut.isPending?'Saving...':'Save'}</button></>}>
          <div className="form-grid">
            <FormField label="Income Source *" className="form-full"><input className={"input" + (formErrors.label ? ' border-red-500' : '')} placeholder="Salary, Freelance..." value={modal.item.label||''} onChange={e=>{setModal(m=>({...m,item:{...m.item,label:e.target.value}}));setFormErrors(er=>({...er,label:''}))}}/>{formErrors.label && <p className="text-[11px] text-red-400 mt-1">{formErrors.label}</p>}</FormField>
            <FormField label="Amount (₹)"><input className={"input" + (formErrors.amount ? ' border-red-500' : '')} type="number" value={modal.item.amount||''} onChange={e=>{setModal(m=>({...m,item:{...m.item,amount:+e.target.value}}));setFormErrors(er=>({...er,amount:''}))}}/>{formErrors.amount && <p className="text-[11px] text-red-400 mt-1">{formErrors.amount}</p>}</FormField>
            <FormField label="Frequency"><select className="select" value={modal.item.frequency||'Monthly'} onChange={e=>setModal(m=>({...m,item:{...m.item,frequency:e.target.value}}))}>
              {['Monthly','Quarterly','Half-Yearly','Yearly','One-time'].map(f=><option key={f}>{f}</option>)}</select></FormField>
            <FormField label="Notes" className="form-full"><input className="input" value={modal.item.notes||''} onChange={e=>setModal(m=>({...m,item:{...m.item,notes:e.target.value}}))}/></FormField>
          </div>
        </Modal>
      )}
      {(items as any[]).length <= 1 && (
        <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg,color-mix(in srgb, var(--success) 8%, transparent) 0%,color-mix(in srgb, var(--success) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--success) 15%, transparent)'}}>
          <span className="text-lg">💡</span>
          <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
            Add salary hikes, freelance income, rental income to track all sources. Multiple sources = better free cash visibility.
          </div>
        </div>
      )}

      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
