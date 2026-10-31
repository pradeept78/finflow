import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { peopleOweApi, closedLoansApi } from '../api'
import type { PeopleOwe } from '../types'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, InputModal, ErrorState, SortHeader } from '../components/common'
import { fmtINR } from '../utils/format'
import { Plus, Pencil, Trash2, CheckCircle, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

const empty: PeopleOwe = { person: '', amount: 0, status: 'Pending' }

export default function PeopleOwePage() {
  const qc = useQueryClient()
  // Was a module-level `const today = new Date()` — computed once when this file first loaded and
  // then frozen for the app's entire lifetime in memory, while the "Smart insight" banner further
  // down independently computed a fresh `new Date()`. A tab left open across a day boundary (or a
  // component that remounts on navigation hours later) would show this page's "Overdue" stat and
  // each row's day-count using yesterday's date while the banner used today's — two different
  // overdue counts on identical data. Recomputed per render instead.
  const today = new Date()
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApi.getAll })
  const [inputModal, setInputModal] = useState<any>(null)
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [modal, setModal] = useState<{ open: boolean; item: PeopleOwe }>({ open: false, item: empty })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const saveMut   = useMutation({ mutationFn: (d: PeopleOwe) => d.id ? peopleOweApi.update(d.id, d) : peopleOweApi.create(d), onSuccess: ()=>{qc.invalidateQueries({queryKey:['people-owes']});toast.success('Saved');setModal({open:false,item:empty})} })
  const deleteMut = useMutation({ mutationFn: async (v: any) => { try{await closedLoansApi.create({lender:v.person,purpose:'People Owe Me',assetType:'Other',amount:Number(v.amount??0),totalPaid:Number(v.amount??0),recoveredAmount:Number(v.paidAmount??0)||undefined,closedDate:new Date().toISOString().slice(0,10)})}catch{}; return peopleOweApi.delete(v.id) }, onSuccess:()=>{qc.invalidateQueries({queryKey:['people-owes']});qc.invalidateQueries({queryKey:['closed-loans']});toast.success('Deleted')} })
  // The InputModal opened here only ever resolved via onConfirm — dismissing it (X / backdrop)
  // left this mutation's awaited Promise pending forever, so settleMut.isPending stuck `true`
  // and the "Collect" button never recovered. onClose now rejects the promise (with a sentinel
  // "CANCELLED" error the onError below swallows silently, so no error toast on a plain dismiss).
  const settleMut = useMutation({ mutationFn: async (v: any) => { const recovered = await new Promise<string>((resolve, reject) => setInputModal({title:'Mark Collected',message:`${v.person} — ${fmtINR(v.amount)}\nAmount actually collected:`,placeholder:String(v.amount),defaultValue:String(v.amount),onConfirm:(x:string)=>{setInputModal(null);resolve(x)},onClose:()=>{setInputModal(null);reject(new Error('CANCELLED'))}})); await closedLoansApi.create({lender:v.person,purpose:'People Owe Me',assetType:'Other',amount:Number(v.amount??0),totalPaid:Number(v.amount??0),recoveredAmount:+recovered||Number(v.amount??0),closedDate:new Date().toISOString().slice(0,10)}); return peopleOweApi.delete(v.id) }, onSuccess:()=>{qc.invalidateQueries({queryKey:['people-owes']});qc.invalidateQueries({queryKey:['closed-loans']});toast.success('Collected!')}, onError:(e:any)=>{ if (e?.message !== 'CANCELLED') toast.error('Failed to mark collected') } })
  const partialMut = useMutation({ mutationFn: ({id,paid,total}:any)=>peopleOweApi.update(id,{paidAmount:paid,status:paid>=total?'Paid':'Partial'}), onSuccess:()=>{qc.invalidateQueries({queryKey:['people-owes']});toast.success('Updated')} })

  const pending  = (items as any[]).filter(v=>v.status!=='Paid'&&v.status!=='Settled')
  const paid     = (items as any[]).filter(v=>v.status==='Paid'||v.status==='Settled')
  const totalPending = pending.reduce((s:number,v:any)=>s+Number(v.amount??0)-Number(v.paidAmount??0),0)
  const totalPaid    = (items as any[]).reduce((s:number,v:any)=>s+Number(v.paidAmount??0),0)
  const overdue  = pending.filter((v:any)=>v.expectedDate&&new Date(v.expectedDate)<today)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Failed to load entries." onRetry={()=>refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="People Owe Me" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}><Plus size={14}/> Add</button>}/>

      {items.length > 0 && (
        <KpiRow className="grid grid-cols-4 gap-3" keep={[0, 2]}>
          {[
            {label:'Pending Recovery', value:fmtINR(totalPending), sub:`${pending.length} pending`,        accent:'var(--success)'},
            {label:'Collected So Far', value:fmtINR(totalPaid),    sub:`${paid.length} settled`,           accent:'var(--cyan)'},
            // Must be a literal color value (a hex or a var(--token) reference — not a bare
            // Tailwind class). The card below builds its gradient, border and label colour
            // by color-mixing this value, and `var(--text-faint)20` is not a
            // colour — so whenever nothing was overdue (the normal, healthy case) this entire
            // card rendered with no background, no border and unreadable label text.
            {label:'Overdue',          value:String(overdue.length),sub:'past expected date',              accent:overdue.length>0?'var(--danger)':'#94a3b8', isCurrency:false},
            {label:'Total Lent',       value:fmtINR((items as any[]).reduce((s:number,v:any)=>s+Number(v.amount??0),0)), sub:`${items.length} total entries`, accent:'var(--warning)'},
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
        const overdue = (items as any[]).filter((p:any)=>p.expectedDate&&new Date(p.expectedDate)<new Date()&&p.status!=='Paid'&&p.status!=='Settled')
        const total = (items as any[]).filter((p:any)=>p.status!=='Paid'&&p.status!=='Settled').reduce((s:number,p:any)=>s+Number(p.amount??0)-Number(p.paidAmount??0),0)
        if(!total) return null
        return (
          <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:overdue.length?'linear-gradient(135deg, color-mix(in srgb, var(--danger) 8%, transparent) 0%, color-mix(in srgb, var(--danger) 2%, transparent) 100%)':'linear-gradient(135deg, color-mix(in srgb, var(--success) 8%, transparent) 0%, color-mix(in srgb, var(--success) 2%, transparent) 100%)',border:overdue.length?'1px solid color-mix(in srgb, var(--danger) 15%, transparent)':'1px solid color-mix(in srgb, var(--success) 15%, transparent)'}}>
            <span className="text-lg">{overdue.length?'⚠️':'💡'}</span>
            <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
              {overdue.length?<><span style={{color:'var(--danger)',fontWeight:700}}>{overdue.length} overdue</span> — follow up with {overdue.map((p:any)=>p.person).join(', ')}.</>
              :<><span style={{color:'var(--success)',fontWeight:700}}>{fmtINR(total)}</span> receivable — send reminders as dates approach.</>}
            </div>
          </div>
        )
      })()}

      {items.length === 0 ? <EmptyState icon="💸" title="No entries" sub="Track money people owe you" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}>+ Add entry</button>} /> : (() => {
        const displayItems = sortCol ? [...(items as any[])].sort((a: any, b: any) => {
          let av: any, bv: any
          if (sortCol === 'person') { av = a.person ?? ''; bv = b.person ?? '' }
          else if (sortCol === 'amount') { av = Number(a.amount ?? 0); bv = Number(b.amount ?? 0) }
          else if (sortCol === 'collected') { av = Number(a.paidAmount ?? 0); bv = Number(b.paidAmount ?? 0) }
          else if (sortCol === 'expected') { av = Number(a.amount ?? 0) - Number(a.paidAmount ?? 0); bv = Number(b.amount ?? 0) - Number(b.paidAmount ?? 0) }
          else { av = 0; bv = 0 }
          if (typeof av === 'string' || typeof bv === 'string') {
            const cmp = String(av).localeCompare(String(bv))
            return sortDir === 'asc' ? cmp : -cmp
          }
          return sortDir === 'asc' ? av - bv : bv - av
        }) : (items as any[])
        return (
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(90px,0.9fr) minmax(80px,0.8fr) minmax(170px,1.3fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <SortHeader label="Person" col="person" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="left" />
            <SortHeader label="Amount" col="amount" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Collected" col="collected" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Expected" col="expected" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <span className="text-center">Status</span><span className="text-center">Action</span>
          </div>

          {displayItems.map((v:any,idx:number)=>{
            const pending2 = Number(v.amount??0)-Number(v.paidAmount??0)
            const isDone = v.status==='Paid'||v.status==='Settled'
            const isExp = expanded===v.id
            const daysLeft = v.expectedDate ? Math.ceil((new Date(v.expectedDate).getTime()-today.getTime())/(1000*60*60*24)) : null
            const isOverdue = daysLeft!==null&&daysLeft<0&&!isDone
            return (
              <div key={v.id} style={{borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',opacity:isDone?0.5:1}}>
                <div className="grid items-center px-4 py-3 cursor-pointer transition-colors"
                  style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(90px,0.9fr) minmax(80px,0.8fr) minmax(170px,1.3fr)',background:isExp?'var(--bg-base)':'transparent'}}
                  onMouseEnter={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                  onMouseLeave={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='transparent'}}
                  onClick={()=>setExpanded(isExp?null:v.id)}>
                  <div>
                    <div className="flex items-center gap-1.5"><ChevronDown size={12} style={{color:'var(--text-faint)',transform:isExp?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s',flexShrink:0}}/><span className="font-medium text-[13px]">{v.person}</span></div>
                    {v.purpose&&<div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{v.purpose}</div>}
                  </div>
                  <div className="text-right"><span className="mono font-semibold" style={{color:'var(--success)'}}>{fmtINR(v.amount)}</span></div>
                  <div className="text-right"><span className="mono text-[13px]" style={{color:Number(v.paidAmount??0)>0?'var(--info)':'var(--text-faint)'}}>{Number(v.paidAmount??0)>0?fmtINR(v.paidAmount):'—'}</span></div>
                  <div className="text-center">
                    {daysLeft===null?<span style={{color:'var(--text-faint)'}}>—</span>:(
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{background:isOverdue?'color-mix(in srgb, var(--danger) 15%, transparent)':daysLeft<7?'color-mix(in srgb, var(--warning) 12%, transparent)':'color-mix(in srgb, var(--success) 10%, transparent)',
                                color:isOverdue?'var(--danger)':daysLeft<7?'var(--warning)':'var(--success)'}}>
                        {isOverdue?`⚠ ${Math.abs(daysLeft)}d late`:`${daysLeft}d`}
                      </span>
                    )}
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{background:isDone?'color-mix(in srgb, var(--success) 15%, transparent)':isOverdue?'color-mix(in srgb, var(--danger) 15%, transparent)':'color-mix(in srgb, var(--warning) 15%, transparent)',color:isDone?'var(--success)':isOverdue?'var(--danger)':'var(--warning)'}}>
                      {isDone?'✓ Done':isOverdue?'Overdue':v.status==='Partial'?'Partial':'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5" onClick={e=>e.stopPropagation()}>
                    {!isDone&&<button className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors hover:brightness-125 disabled:opacity-50" disabled={settleMut.isPending} style={{background:'color-mix(in srgb, var(--success) 14%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 35%, transparent)'}} onClick={()=>settleMut.mutate(v)}><CheckCircle size={11}/> Collect</button>}
                    <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setModal({open:true,item:v})}}><Pencil size={11}/></button>


                    <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${v.person}?`,onConfirm:()=>deleteMut.mutate(v),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                  
                </div>
                {isExp&&(
                  <div className="px-4 pb-3 pt-2 flex items-center gap-2 flex-wrap" style={{background:'var(--bg-base)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                    {/* Label stays faint, the amount carries the accent — a duplicate `color`
                        key was applying the accent to the label and leaving the amount unstyled. */}
                    {!isDone&&pending2>0&&<span className="text-[11px]" style={{color:'var(--text-faint)'}}>Pending: <span className="mono font-bold" style={{color:'var(--success)'}}>{fmtINR(pending2)}</span></span>}
                    {!isDone&&<button className="text-[11px] px-2.5 py-1 rounded font-medium" style={{background:'color-mix(in srgb, var(--info) 10%, transparent)',color:'var(--info)',border:'1px solid color-mix(in srgb, var(--info) 20%, transparent)'}}
                      onClick={()=>setInputModal({title:`Partial — ${v.person}`,message:`Amount collected so far:`,placeholder:String(v.paidAmount||0),defaultValue:v.paidAmount?String(v.paidAmount):undefined,onConfirm:(x:string)=>{const paid=+x; if(isNaN(paid)||paid<=0){toast.error('Enter a valid amount greater than 0');return}; partialMut.mutate({id:v.id,paid,total:Number(v.amount??0)});setInputModal(null)}})}>
                      Record Partial
                    </button>}
                    <button className="btn-secondary btn-xs" onClick={(e)=>{e.stopPropagation();setModal({open:true,item:v})}}><Pencil size={11}/> Edit</button>
                    <button className="btn-danger btn-xs" onClick={()=>setConfirmModal({message:'Delete?',onConfirm:()=>deleteMut.mutate(v),label:'Delete'})}><Trash2 size={11}/></button>
                  </div>
                )}
              </div>
            )
          })}

          <div className="grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(90px,0.9fr) minmax(80px,0.8fr) minmax(170px,1.3fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>{pending.length} pending</span>
            <span className="text-right mono" style={{color:'var(--success)'}}>{fmtINR(totalPending)}</span>
            <span className="text-right mono" style={{color:'var(--info)'}}>{totalPaid>0?fmtINR(totalPaid):'—'}</span>
            <span></span><span></span><span></span>
          </div>
        </div>
        )
      })()}

      {modal.open&&(
        <Modal title={modal.item.id?'Edit Entry':'Add Entry'} onClose={()=>setModal({open:false,item:empty})}
          footer={<><button className="btn-secondary" onClick={()=>setModal({open:false,item:empty})}>Cancel</button><button className="btn-primary" onClick={()=>saveMut.mutate(modal.item)}>Save</button></>}>
          <div className="form-grid">
            <FormField label="Person *" className="form-full"><input className="input" value={modal.item.person||''} onChange={e=>setModal(m=>({...m,item:{...m.item,person:e.target.value}}))}/></FormField>
            <FormField label="Amount (₹)"><input className="input" type="number" value={modal.item.amount||''} onChange={e=>setModal(m=>({...m,item:{...m.item,amount:+e.target.value}}))}/></FormField>
            <FormField label="Expected Date"><input className="input" type="date" value={modal.item.expectedDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,expectedDate:e.target.value}}))}/></FormField>
            {/* The Purpose field was removed: the PeopleOwe entity has no `purpose` column, so
                anything typed here was silently discarded on save while the toast said "Saved".
                Use Notes instead, or add a `purpose` column to the entity to bring it back. */}
            <FormField label="Notes" className="form-full"><textarea className="input" rows={2} value={modal.item.notes||''} onChange={e=>setModal(m=>({...m,item:{...m.item,notes:e.target.value}}))}/></FormField>
          </div>
        </Modal>
      )}
      {inputModal&&<InputModal title={inputModal.title} message={inputModal.message} placeholder={inputModal.placeholder} defaultValue={inputModal.defaultValue} onConfirm={inputModal.onConfirm} onClose={inputModal.onClose ?? (()=>setInputModal(null))}/>}
      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
