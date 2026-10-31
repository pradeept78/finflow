import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { expensesApi } from '../api'
import type { Expense } from '../types'
import FilterMenu from '../components/common/FilterMenu'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader } from '../components/common'
import { fmtINR, toMonthly, isOneOff, isDueThisMonth, ordinal } from '../utils/format'
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import { PhoneRow, freqSuffix } from '../components/common/PhoneRow'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

const empty: Expense = { label: '', amount: 0, frequency: 'Monthly', dueDay: 1, active: true }
const CATS = ['Rent','Food','Transport','Utilities','Subscriptions','Healthcare','Education','Family','Other']
const CAT_COLORS: Record<string,string> = { Rent:'var(--danger)',Food:'var(--warning)',Transport:'var(--success)',Utilities:'var(--info)',Subscriptions:'var(--purple)',Healthcare:'var(--pink)',Education:'var(--cyan)',Family:'var(--orange)',Other:'var(--text-muted)' }

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

export default function ExpensesPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const [modal, setModal] = useState<{ open: boolean; item: Expense }>({ open: false, item: empty })
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [filterCat, setFilterCat] = useState<string>('All')
  const [showInactive, setShowInactive] = useState(false)
  const [expanded, setExpanded] = useState<number|null>(null)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const validateExpense = (v: any) => {
    const errs: Record<string,string> = {}
    if (!v.label?.trim()) errs.label = 'Label is required'
    if (!v.amount || v.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (v.dueDay && (v.dueDay < 1 || v.dueDay > 31)) errs.dueDay = 'Due day must be 1–31'
    return errs
  }

  const saveMut   = useMutation({ mutationFn: (d: Expense) => d.id ? expensesApi.update(d.id, d) : expensesApi.create(d), onSuccess: ()=>{qc.invalidateQueries({queryKey:['expenses']});toast.success('Saved');setModal({open:false,item:empty});setFormErrors({})}, onError: (e:any)=>toast.error(e?.response?.data?.message||'Failed to save expense') })
  const deleteMut = useMutation({ mutationFn: expensesApi.delete, onSuccess: ()=>{qc.invalidateQueries({queryKey:['expenses']});toast.success('Deleted')}, onError: (e:any)=>toast.error(e?.response?.data?.message||'Failed to delete expense') })
  const toggleMut = useMutation({ mutationFn: (v: any) => expensesApi.update(v.id, {...v, active: !v.active}), onSuccess: ()=>qc.invalidateQueries({queryKey:['expenses']}), onError: (e:any)=>toast.error(e?.response?.data?.message||'Failed to update expense') })

  // monthlyEq(v): this expense's contribution to a MONTHLY total. For Monthly/unknown frequencies
  // toMonthly is a no-op (freqMonths=1), so nothing here changes for the common case. For a
  // Quarterly/Half-Yearly/Yearly item it converts to the true monthly-equivalent instead of the
  // bug this replaced — summing every frequency's raw stored amount as if it were already a
  // monthly figure, so a Yearly ₹1,20,000 school fee inflated "Monthly Total" by ₹1,20,000 instead
  // of contributing the ~₹10,000/mo it actually costs.
  const monthlyEq = (v: any) => toMonthly(v.amount, v.frequency)

  const active     = (items as any[]).filter(v=>v.active!==false)
  const inactive   = (items as any[]).filter(v=>v.active===false)
  // Recurring-only: a one-off expense isn't a monthly commitment at all and would otherwise be
  // counted every month forever (isOneOff wasn't checked here before).
  const recurring  = active.filter(v=>!isOneOff(v.frequency))
  const total      = recurring.reduce((s:number,v:any)=>s+monthlyEq(v),0)
  // Denominator for the per-row % bars below — includes one-off items (at face value, same as
  // toMonthly's pass-through for a 1-month divisor) so their bar/pct stays meaningful and ≤100%,
  // without pulling them into the "Monthly Total" headline figure itself.
  const listTotal  = active.reduce((s:number,v:any)=>s+monthlyEq(v),0)

  const catMap: Record<string,number> = {}
  recurring.forEach((v:any)=>{ const c=v.category||'Other'; catMap[c]=(catMap[c]||0)+monthlyEq(v) })
  const catData = Object.entries(catMap).sort((a,b)=>b[1]-a[1])

  const filtered = active
    .filter((v:any)=>filterCat==='All'||(v.category||'Other')===filterCat)
    .sort((a:any,b:any)=>Number(b.amount??0)-Number(a.amount??0))

  const displayFiltered = sortCol ? [...filtered].sort((a: any, b: any) => {
    let cmp = 0
    if (sortCol === 'label') cmp = (a.label ?? '').localeCompare(b.label ?? '')
    else if (sortCol === 'amount') cmp = Number(a.amount??0) - Number(b.amount??0)
    else if (sortCol === 'category') cmp = (a.category||'Other').localeCompare(b.category||'Other')
    else if (sortCol === 'frequency') cmp = (a.frequency||'Monthly').localeCompare(b.frequency||'Monthly')
    else if (sortCol === 'dueDay') cmp = (a.dueDay ?? Infinity) - (b.dueDay ?? Infinity)
    return sortDir === 'asc' ? cmp : -cmp
  }) : filtered

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your expenses." onRetry={()=>refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Expenses" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}><Plus size={14}/> Add</button>}/>


      {items.length > 0 && (
        <KpiRow className="grid grid-cols-4 gap-3" keep={[0, 1]}>
          {[
            {label:'Monthly Total',  value:fmtINR(total),              sub:`${recurring.length} recurring expenses`, accent:'var(--danger)'},
            {label:'Annual Cost',    value:fmtINR(Math.round(total*12)),sub:'projected',                    accent:'var(--orange)'},
            {label:'Avg per Item',   value:fmtINR(recurring.length>0?Math.round(total/recurring.length):0), sub:'per recurring expense', accent:'#94a3b8'},
            {label:'Top Category',   value:catData[0]?.[0]||'—',       sub:catData[0]?fmtINR(catData[0][1]):'', accent:CAT_COLORS[catData[0]?.[0]]||'var(--text-muted)', isCurrency:false},
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

      {items.length === 0 ? <EmptyState icon="🧾" title="No expenses" sub="Track your recurring monthly expenses" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}>+ Add expense</button>} /> : (
        <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>

          {/* Category bar + filter */}
          {catData.length > 0 && (
            <div className="px-4 py-3 border-b" style={{borderColor:'color-mix(in srgb, var(--text) 6%, transparent)'}}>
              {/* Stacked bar */}
              <div className="flex h-2 rounded-full overflow-hidden mb-2">
                {catData.map(([cat,amt])=>(
                  <div key={cat} style={{width:`${Math.round(amt/total*100)}%`,background:CAT_COLORS[cat]||'var(--text-muted)',minWidth:3}} title={`${cat}: ${fmtINR(amt)}`}/>
                ))}
              </div>
              {/* Category filter — shared dropdown (was a long row of pills) */}
              <FilterMenu allLabel="All categories" noun="categories" multiple={false} allCount={active.length}
                options={catData.map(([c]) => ({ id: c, color: CAT_COLORS[c] || '#f97316', count: active.filter((v: any) => (v.category || 'Other') === c).length, hint: fmtINR(catMap[c] || 0) }))}
                selected={filterCat === 'All' ? new Set<string>() : new Set([filterCat])}
                onChange={sel => setFilterCat(sel.size ? [...sel][0] : 'All')} />
            </div>
          )}

          {/* Header */}
          <div className="hidden md:grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(55px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(80px,1fr)',borderColor:'color-mix(in srgb, var(--text) 6%, transparent)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <SortHeader label="Expense" col="label" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Amount" col="amount" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Category" col="category" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <SortHeader label="Freq" col="frequency" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <SortHeader label="Day" col="dueDay" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <span className="text-center">Due</span><span className="text-center">Action</span>
          </div>

          {/* Rows */}
          {displayFiltered.map((v:any,idx:number)=>{
            const pct = listTotal > 0 ? Math.round(monthlyEq(v)/listTotal*100) : 0
            const accent = CAT_COLORS[v.category]||'var(--text-muted)'
            return (
              <div key={v.id}>
              {/* Phone row (tablet and desktop: the table row below) */}
              <PhoneRow title={v.label} amount={<>{fmtINR(v.amount)}<span className="text-[11px] font-normal">{freqSuffix(v.frequency)}</span></>}
                left={`${v.category||'Other'}${v.dueDay ? ` · due ${ordinal(v.dueDay)}` : ''}`} right={`${pct}% of total`}
                expanded={expanded===v.id} onToggle={()=>setExpanded(expanded===v.id?null:v.id)}
                actions={[
                  { label: 'Edit', onClick: ()=>setModal({open:true,item:v}) },
                  { label: 'Pause', onClick: ()=>toggleMut.mutate(v) },
                  { label: 'Delete', tone: 'danger' as const, onClick: ()=>setConfirmModal({message:`Delete ${v.label}?`,onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'}) },
                ]} />
              <div className="hidden md:grid items-center px-4 py-2.5 transition-colors cursor-pointer"
                style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(55px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(80px,1fr)',borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                onClick={()=>setExpanded(expanded===v.id?null:v.id)}>
                <div className="flex items-start gap-1.5 min-w-0">
                  <ChevronDown size={12} className="flex-shrink-0 mt-1" style={{color:'var(--text-faint)',transform:expanded===v.id?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s'}}/>
                  <div className="min-w-0">
                    <div className="font-medium text-[13px] truncate">{v.label}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-16 h-0.5 rounded-full overflow-hidden" style={{background:'color-mix(in srgb, var(--text) 10%, transparent)'}}>
                        <div className="h-full rounded-full" style={{width:`${pct}%`,background:accent}}/>
                      </div>
                      <span className="text-[11px]" style={{color:'var(--text-faint)'}}>{pct}%</span>
                    </div>
                  </div>
                </div>
                <div className="text-right"><span className="mono font-semibold" style={{color:'var(--danger)'}}>{fmtINR(v.amount)}</span></div>
                <div className="text-center"><span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{background:`color-mix(in srgb, ${accent} 13%, transparent)`,color:accent}}>{v.category||'Other'}</span></div>
                <div className="text-center text-[11px]" style={{color:'var(--text-faint)'}}>{v.frequency?.slice(0,3)||'Mo'}</div>
                <div className="text-center text-[11px]" style={{color:'var(--text-faint)'}}>{v.dueDay||'—'}</div>
                {/* Due badge */}
                <div className="text-center">
                  {(()=>{
                    const day = v.dueDay || (v.startDate ? new Date(v.startDate).getDate() : null)
                    // Was calling getDueBadge unconditionally for every expense, including
                    // Quarterly/Half-Yearly/Yearly ones — so a Yearly fee that last renewed in
                    // March showed "overdue"/"due in Xd" badges every month of the year, not just
                    // its real renewal month. isDueThisMonth is the same gate Insurance/Lookup/
                    // Calendar already use for exactly this "is a non-monthly item actually due
                    // right now" question.
                    const dueNow = isDueThisMonth(v.startDate, v.frequency)
                    const b = dueNow ? getDueBadge(day, false) : null
                    return b
                      ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{background:b.bg,color:b.color}}>{b.label}</span>
                      : day ? <span className="text-[11px]" style={{color:'var(--text-faint)'}}>day {day}</span>
                      : <span style={{color:'var(--text-faint)'}}>—</span>
                  })()}
                </div>

                <div className="flex items-center justify-center gap-1.5" onClick={e=>e.stopPropagation()}>
                  <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setModal({open:true,item:v})}}><Pencil size={11}/></button>
                  <button title={v.active!==false?'Active — click to pause':'Paused — click to activate'}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                    style={{background:v.active!==false?'color-mix(in srgb, var(--success) 15%, transparent)':'rgba(107,114,128,0.15)',color:v.active!==false?'var(--success)':'var(--text-muted)',border:`1px solid ${v.active!==false?'color-mix(in srgb, var(--success) 30%, transparent)':'rgba(107,114,128,0.3)'}`}}
                    onClick={(e)=>{e.stopPropagation();toggleMut.mutate(v)}}>{v.active!==false?'On':'Off'}</button>
                  <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${v.label}?`,onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'})}}><Trash2 size={11}/></button>
                </div>
              </div>
              {/* Expand detail */}
              {expanded===v.id&&(
                <div className="px-4 pb-3 pt-2 ml-4 flex items-center gap-4 flex-wrap text-[11px]" style={{borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:'var(--bg-base)',color:'var(--text-faint)'}}>
                  {/* True annualized cost, not a blind ×12: for a Yearly item that's just the amount
                      itself (×12 here would double it — ×12 is only correct for Monthly items). A
                      one-time expense doesn't have an "annual" cost at all — show it as one-time. */}
                  {isOneOff(v.frequency)
                    ? <span>One-time: <span className="mono font-bold text-white">{fmtINR(Number(v.amount??0))}</span></span>
                    : <span>Annual: <span className="mono font-bold text-white">{fmtINR(monthlyEq(v)*12)}</span></span>}
                  {v.dueDay&&<span>Due day: <span className="mono text-white">{v.dueDay}</span></span>}
                  {v.notes&&<span>Note: <span className="text-white">{v.notes}</span></span>}
                  <span>Frequency: <span className="text-white">{v.frequency||'Monthly'}</span></span>
                </div>
              )}
              </div>
            )
          })}

          {/* Footer */}
          <div className="hidden md:grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(55px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(80px,1fr)',borderColor:'color-mix(in srgb, var(--text) 6%, transparent)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>{filtered.length}{filterCat!=='All'?` in ${filterCat}`:' expenses'}</span>
            <span className="text-right mono" style={{color:'var(--danger)'}} title="Monthly-equivalent, one-time items excluded">{fmtINR(filtered.filter((v:any)=>!isOneOff(v.frequency)).reduce((s:number,v:any)=>s+monthlyEq(v),0))}</span>
            <span></span><span></span><span></span><span></span>
            <span className="text-center">
              {inactive.length>0&&(
                <span className="cursor-pointer hover:text-white transition-colors" onClick={()=>setShowInactive(s=>!s)}>
                  {showInactive?'hide':'+'}{inactive.length} paused
                </span>
              )}
            </span>
          </div>

          {/* Inactive */}
          {showInactive&&inactive.length>0&&inactive.map((v:any)=>(
            <Fragment key={v.id}>
            <PhoneRow title={<span className="line-through">{v.label}</span>} amount={fmtINR(v.amount)} left="paused" dim
              expanded={expanded===v.id} onToggle={()=>setExpanded(expanded===v.id?null:v.id)}
              actions={[
                { label: 'Turn on', tone: 'success' as const, onClick: ()=>toggleMut.mutate(v) },
                { label: 'Delete', tone: 'danger' as const, onClick: ()=>setConfirmModal({message:`Delete ${v.label}?`,onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'}) },
              ]} />
            <div className="hidden md:grid items-center px-4 py-2 opacity-40"
              style={{gridTemplateColumns:'minmax(200px,1.7fr) minmax(85px,1fr) minmax(80px,1fr) minmax(55px,1fr) minmax(50px,1fr) minmax(80px,1fr) minmax(80px,1fr)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
              <span className="text-[13px] line-through" style={{color:'var(--text-faint)'}}>{v.label}</span>
              <span className="text-right mono text-[13px]" style={{color:'var(--text-faint)'}}>{fmtINR(v.amount)}</span>
  <span></span><span></span><span></span><span></span>
              <div className="flex items-center justify-center gap-1.5">
                <button title="Reactivate" className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold" style={{background:'color-mix(in srgb, var(--success) 15%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 30%, transparent)'}} onClick={()=>toggleMut.mutate(v)}>On</button>
                <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={()=>setConfirmModal({message:`Delete ${v.label}?`,onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'})}><Trash2 size={11}/></button>
              </div>
            </div>
            </Fragment>
          ))}
        </div>
      )}

      {modal.open&&(
        <Modal title={modal.item.id?'Edit Expense':'Add Expense'} onClose={()=>{setModal({open:false,item:empty});setFormErrors({})}}
          footer={<><button className="btn-secondary" onClick={()=>{setModal({open:false,item:empty});setFormErrors({})}}>Cancel</button><button className="btn-primary" disabled={saveMut.isPending} onClick={()=>{const errs=validateExpense(modal.item); if(Object.keys(errs).length>0){setFormErrors(errs);return}; saveMut.mutate(modal.item)}}>{saveMut.isPending?'Saving...':'Save'}</button></>}>
          <div className="form-grid">
            <FormField label="Label *" className="form-full"><input className={"input"+(formErrors.label?' border-red-500':'')} value={modal.item.label} onChange={e=>{setModal(m=>({...m,item:{...m.item,label:e.target.value}}));setFormErrors(er=>({...er,label:''}))}} placeholder="e.g. Rent, Netflix..."/>{formErrors.label&&<p className="text-[11px] text-red-400 mt-1">{formErrors.label}</p>}</FormField>
            <FormField label="Amount (₹) *"><input className={"input"+(formErrors.amount?' border-red-500':'')} type="number" value={modal.item.amount||''} onChange={e=>{setModal(m=>({...m,item:{...m.item,amount:+e.target.value}}));setFormErrors(er=>({...er,amount:''}))}}/>{formErrors.amount&&<p className="text-[11px] text-red-400 mt-1">{formErrors.amount}</p>}</FormField>
            <FormField label="Category"><select className="select" value={modal.item.category||'Other'} onChange={e=>setModal(m=>({...m,item:{...m.item,category:e.target.value}}))}>
              {CATS.map(c=><option key={c}>{c}</option>)}</select></FormField>
            {/* 'Yearly' (not 'Annual') to match the shared FREQ_MONTHS/toMonthly vocabulary used
                everywhere else (ClosedLoansPage, calcOutflow, etc.) — 'Annual' is still recognized
                as an alias for any expense saved under the old label, so existing data still
                converts correctly, but new entries now speak the same frequency language as the
                rest of the app. */}
            <FormField label="Frequency"><select className="select" value={modal.item.frequency||'Monthly'} onChange={e=>setModal(m=>({...m,item:{...m.item,frequency:e.target.value}}))}>
              {['Monthly','Weekly','Quarterly','Half-Yearly','Yearly','One-time'].map(f=><option key={f}>{f}</option>)}</select></FormField>
            <FormField label="Due Day"><input className={"input"+(formErrors.dueDay?' border-red-500':'')} type="number" min={1} max={31} placeholder="1–31" value={modal.item.dueDay||''} onChange={e=>{setModal(m=>({...m,item:{...m.item,dueDay:+e.target.value}}));setFormErrors(er=>({...er,dueDay:''}))}}/>{formErrors.dueDay&&<p className="text-[11px] text-red-400 mt-1">{formErrors.dueDay}</p>}</FormField>
            <FormField label="Notes" className="form-full"><textarea className="input" rows={2} value={modal.item.notes||''} onChange={e=>setModal(m=>({...m,item:{...m.item,notes:e.target.value}}))}/></FormField>
          </div>
        </Modal>
      )}
      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
