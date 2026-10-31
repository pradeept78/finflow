import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { insuranceApi, cardsApi } from '../api'
import FilterMenu from '../components/common/FilterMenu'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader } from '../components/common'
import { fmtINR, toMonthly, freqMonths, isOneOff } from '../utils/format'
import { Plus, Pencil, Trash2, ChevronDown, RefreshCw } from 'lucide-react'
import { MoreFields } from '../components/common/MoreFields'
import { PhoneRow, freqSuffix } from '../components/common/PhoneRow'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

const TYPE_COLOR: Record<string,string> = {
  Life:'var(--success)', Health:'var(--cyan)', Term:'var(--purple)', Vehicle:'var(--warning)', Other:'var(--text-muted)',
  'Emergency Fund':'#fb923c', 'Death Fund':'#a855f7',
}

const TYPE_ICON: Record<string,string> = {
  Life:'❤️', Health:'🏥', Term:'🛡️', Vehicle:'🚗', Other:'📋',
  'Emergency Fund':'🚨', 'Death Fund':'🕊️',
}

// Type-specific guidance
const TYPE_NOTES: Record<string,string> = {
  Life:    'Death benefit to nominees. Premium paid yearly/monthly.',
  Health:  'Covers hospitalisation. Renews yearly. Family floater covers all.',
  Term:    'Pure life cover. No maturity benefit. Cheapest per ₹ crore.',
  Vehicle: 'Mandatory third-party or comprehensive. Yearly renewal.',
  Other:   'Other policy type.',
  'Emergency Fund': 'Quick-access payout for unexpected costs — job loss, medical emergency, major repair.',
  'Death Fund':      'Payout to family if something happens to you — the "just in case" fund.',
}

const TYPE_LIST = ['Life', 'Health', 'Term', 'Vehicle', 'Emergency Fund', 'Death Fund', 'Other']

// A card EMI runs for a fixed tenure that's often shorter than the policy's own term (a 2yr policy
// might have its first premium split into just 6 months of card EMI) — this is purely a reminder of
// when that tenure ends, so the "isCardEmi" checkbox doesn't silently stay excluded forever. Nothing
// here auto-toggles the checkbox; the user unchecks it themselves once the card EMI is actually done.
const emiEndLabel = (startDate?: string, months?: number): string | null => {
  if (!startDate || !months) return null
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + Number(months))
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

const empty = {
  name:'', insurer:'', policyType:'Life', premium:0,
  frequency:'Yearly', sumAssured:0, startDate:'', endDate:'',
  notes:'', active:true
}

const validateInsurance = (v: any) => {
  const errs: Record<string,string> = {}
  if (!v.name?.trim()) errs.name = 'Policy name is required'
  if (!v.premium || v.premium <= 0) errs.premium = 'Premium must be greater than 0'
  // "Card — EMI" only ever tags an EMI that already exists on the card — Insurance never creates one
  // itself, so there's no separate amount/tenure to validate here, just that something was actually
  // picked.
  if (v.isCardEmi) {
    if (!v.paidByCardId) errs.paidByCardId = 'Pick a card'
    if (!v.linkedEmiId) errs.linkedEmiId = 'Pick which EMI on that card this premium is'
  }
  return errs
}

export default function InsurancePage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey:['insurance'], queryFn:insuranceApi.getAll })
  // Reference only — "which card does this premium go on" so it's easy to remember/check, same as
  // the chip picker elsewhere on this page. Does NOT create a card spend or touch CC totals; Cards
  // and Insurance each keep their own independent outflow line, same as every other page in the app.
  const { data: cards = [] } = useQuery({ queryKey:['cards'], queryFn:cardsApi.getAll })
  const cardById = (id: any) => (cards as any[]).find(c => c.id === id)
  const [modal, setModal] = useState<{open:boolean,item:any}>({open:false,item:empty})
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [expanded, setExpanded] = useState<number|null>(null)
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  // Multi-select: empty set = "All" (no filter applied). Was a single-value dropdown; chips let you
  // tick more than one type at once, e.g. Health + Emergency Fund together.
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const saveMut   = useMutation({ mutationFn:(d:any)=>d.id?insuranceApi.update(d.id,d):insuranceApi.create(d), onSuccess:()=>{qc.invalidateQueries({queryKey:['insurance']});toast.success('Saved');setModal({open:false,item:empty});setFormErrors({})} })
  const deleteMut = useMutation({ mutationFn:(id:number)=>insuranceApi.delete(id), onSuccess:()=>{qc.invalidateQueries({queryKey:['insurance']});toast.success('Deleted')} })
  const toggleMut = useMutation({ mutationFn:(v:any)=>insuranceApi.update(v.id,{...v,active:!v.active}), onSuccess:()=>qc.invalidateQueries({queryKey:['insurance']}) })
  // Renew: archives the current cycle (active:false, kept for history — same convention the "Off"
  // toggle already uses, so a renewed-away policy still shows in the list, dimmed) and opens a draft
  // for the new cycle pre-filled from it, so only the premium/dates that actually changed need retyping.
  const renewMut = useMutation({
    mutationFn: (v:any) => insuranceApi.update(v.id, { ...v, active:false, notes: v.notes ? `${v.notes} · renewed` : 'renewed' }),
    onSuccess: (_data, v:any) => {
      qc.invalidateQueries({queryKey:['insurance']})
      toast.success(`${v.name} archived — fill in the new premium`)
      setModal({ open:true, item: { ...v, id: undefined, active:true, startDate: v.endDate || v.startDate || '', endDate: '', notes: '' } })
    }
  })

  const active   = (items as any[]).filter((v:any)=>v.active!==false)
  const now      = Date.now()

  // Monthly cash outflow = only Monthly-frequency policies (not bank EMIs, just paid every month).
  // Excludes `isCardEmi` policies — that premium is already a credit card EMI, counted on the Cards
  // page, so it must not also show up here (same exclusion calcOutflow.ts makes for every other page).
  // Shared, spelling-tolerant frequency rules (same as calcOutflow): "monthly" vs "Monthly", "One-time" vs "Single".
  const isMonthlyPlan = (v:any) => !isOneOff(v.frequency) && freqMonths(v.frequency) <= 1
  const isLumpPlan    = (v:any) => !isOneOff(v.frequency) && freqMonths(v.frequency) > 1
  const emiMo    = active.filter((v:any)=>isMonthlyPlan(v)&&!v.isCardEmi).reduce((s:number,v:any)=>s+Number(v.premium??0),0)
  // Annual cost of all non-monthly policies (amortised per year)
  const annualCost = active.filter((v:any)=>isLumpPlan(v)&&!v.isCardEmi).reduce((s:number,v:any)=>s+toMonthly(v.premium,v.frequency)*12,0)
  const totalCover = active.reduce((s:number,v:any)=>s+Number(v.sumAssured??0),0)
  const filtered = filterTypes.size===0 ? (items as any[]) : (items as any[]).filter((v:any)=>filterTypes.has(v.policyType||'Other'))
  const displayItems = [...filtered].sort((a:any, b:any) => {
    if (!sortCol) return 0
    let cmp = 0
    if (sortCol === 'name') cmp = (a.name ?? '').localeCompare(b.name ?? '')
    else if (sortCol === 'premium') cmp = Number(a.premium??0) - Number(b.premium??0)
    else if (sortCol === 'coverage') cmp = Number(a.sumAssured??0) - Number(b.sumAssured??0)
    else if (sortCol === 'renewal') { const da = a.endDate ? Math.ceil((new Date(a.endDate).getTime()-now)/(1000*60*60*24)) : Infinity; const db = b.endDate ? Math.ceil((new Date(b.endDate).getTime()-now)/(1000*60*60*24)) : Infinity; cmp = da - db }
    return sortDir === 'asc' ? cmp : -cmp
  })
  const filteredActive = filtered.filter((v:any)=>v.active!==false)
  const filteredEmiMo = filteredActive.filter((v:any)=>isMonthlyPlan(v)&&!v.isCardEmi).reduce((s:number,v:any)=>s+Number(v.premium??0),0)
  const filteredCover = filteredActive.reduce((s:number,v:any)=>s+Number(v.sumAssured??0),0)
  const upcoming   = active.filter((v:any)=>{
    if(!v.endDate) return false
    const d=Math.ceil((new Date(v.endDate).getTime()-now)/(1000*60*60*24))
    return d>=0&&d<=30
  })

  if (isLoading) return <LoadingSpinner/>
  if (isError) return <ErrorState message="Failed to load insurance policies." onRetry={()=>refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Insurance" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}><Plus size={14}/> Add</button>}/>

      {items.length > 0 && (
        <KpiRow className="grid grid-cols-2 lg:grid-cols-4 gap-3" keep={[0, 1]}>
          {[
            {label:'Monthly premiums', value:fmtINR(Math.round(emiMo)),     sub:(()=>{const n=active.filter(isMonthlyPlan).length;return n>0?`${n} billed monthly · not a bank EMI`:'none billed monthly — see Annual Cost'})(), accent:'var(--cyan)'},
            {label:'Annual cost',   value:fmtINR(Math.round(annualCost)),   sub:`${active.filter(isLumpPlan).length} lump-sum policies`, accent:'var(--warning)'},
            {label:'Total coverage',value:fmtINR(totalCover),               sub:'sum assured across all policies', accent:'var(--success)'},
            {label:'Renewing soon', value:String(upcoming.length),          sub:'policies renewing within 30 days', accent:upcoming.length>0?'var(--danger)':'var(--purple)', noFormat:true},
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
      {upcoming.length > 0 && (
        <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg,color-mix(in srgb, var(--warning) 8%, transparent) 0%,color-mix(in srgb, var(--warning) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--warning) 15%, transparent)'}}>
          <span className="text-lg">⚠️</span>
          <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
            <span style={{color:'var(--warning)',fontWeight:700}}>{upcoming.length} polic{upcoming.length>1?'ies':'y'}</span> renewing within 30 days — {upcoming.map((v:any)=>v.name).join(', ')}. Renew on time to avoid lapse.
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <FilterMenu allLabel="All types" noun="types" allCount={(items as any[]).length} options={TYPE_LIST.filter(t => (items as any[]).some((v: any) => (v.policyType || 'Other') === t)).map(t => ({ id: t, label: `${TYPE_ICON[t] ?? ''} ${t}`.trim(), color: TYPE_COLOR[t], count: (items as any[]).filter((v: any) => (v.policyType || 'Other') === t).length }))} selected={filterTypes} onChange={setFilterTypes} />
          {filterTypes.size > 0 && <span className="text-[11px]" style={{color:'var(--text-faint)'}}>{filtered.length} match{filtered.length!==1?'es':''}</span>}
        </div>
      )}

      {items.length === 0 ? <EmptyState icon="🛡️" title="No policies" sub="Track your insurance policies" action={<button className="btn-primary btn-sm" onClick={()=>setModal({open:true,item:empty})}>+ Add policy</button>} /> : (
        <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
          <div className="hidden md:grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(80px,0.8fr) minmax(130px,1.3fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(80px,0.8fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 5%, transparent)',color:'var(--text-faint)'}}>
            <SortHeader label="Policy" col="name" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="left" />
            <span className="text-center">Type</span>
            <SortHeader label="Premium" col="premium" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Coverage" col="coverage" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Renewal" col="renewal" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <span className="text-center">Actions</span>
          </div>

          {filtered.length===0 ? (
            <div className="px-4 py-8 text-center text-[11px]" style={{color:'var(--text-faint)'}}>No policies match {Array.from(filterTypes).join(', ')}</div>
          ) : displayItems.map((v:any,idx:number)=>{
            const accent = TYPE_COLOR[v.policyType||'Other'] || 'var(--text-muted)'
            const isInactive = v.active===false
            const daysLeft = v.endDate ? Math.ceil((new Date(v.endDate).getTime()-now)/(1000*60*60*24)) : null
            const isExp = expanded===v.id
            const annualPrem = v.frequency==='Single' ? 0 : toMonthly(v.premium,v.frequency)*12

            return (
              <div key={v.id} style={{borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}>
                {/* Phone row (tablet and desktop: the table row below) */}
                <PhoneRow title={v.name} amount={<>{fmtINR(v.premium)}<span className="text-[11px] font-normal">{freqSuffix(v.frequency)}</span></>}
                  left={`${v.policyType||'Other'}${v.sumAssured ? ` · cover ${fmtINR(v.sumAssured)}` : ''}${v.isCardEmi ? ' · on card EMI' : ''}`}
                  right={isInactive ? 'inactive' : daysLeft!==null ? (daysLeft<0 ? 'ended' : daysLeft<=30 ? `renews in ${daysLeft}d` : '') : ''}
                  rightColor={daysLeft!==null && daysLeft>=0 && daysLeft<=30 ? 'var(--warning)' : undefined}
                  dim={isInactive} expanded={isExp} onToggle={()=>setExpanded(isExp?null:v.id)} />
                <div className="hidden md:grid items-center px-4 py-2 cursor-pointer transition-colors"
                  style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(80px,0.8fr) minmax(130px,1.3fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(80px,0.8fr)',opacity:isInactive?0.5:1}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent'}}
                  onClick={()=>setExpanded(isExp?null:v.id)}>

                  <div className="min-w-0">
                    {/* One line: icon, name, then the insurer (muted) and the card-EMI tag inline — they used to stack under the name and in the premium cell. */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="flex-shrink-0">{TYPE_ICON[v.policyType||'Other']}</span>
                      <span className={`font-medium text-[13px] truncate ${isInactive?'line-through':''}`} title={v.name}>{v.name}</span>
                      {v.insurer&&<span className="text-[11px] truncate flex-shrink-1" style={{color:'var(--text-faint)'}} title={v.insurer}>· {v.insurer}</span>}
                      {v.isCardEmi&&<span className="text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap" style={{background:'color-mix(in srgb, var(--info) 12%, transparent)',color:'var(--info)'}} title="Paid as a Credit Card EMI — counted in that card, excluded here">💳 card EMI</span>}
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{background:`color-mix(in srgb, ${accent} 13%, transparent)`,color:accent}}>
                      {v.policyType||'Other'}
                    </span>
                  </div>

                  <div className="text-right whitespace-nowrap" title={v.frequency==='Single'?'One-time premium — paid once, no renewal and not part of monthly commitments':`${v.frequency}${v.frequency==='Yearly'?'':` · ${fmtINR(Math.round(annualPrem))}/yr`}`}>
                    <span className="mono font-semibold text-[13px]" style={{color:v.isCardEmi?'var(--text-faint)':'var(--warning)'}}>{fmtINR(v.premium)}</span>
                    <span className="text-[11px] ml-1" style={{color:v.frequency==='Monthly'?'var(--cyan)':v.frequency==='Single'?'var(--purple)':'var(--text-faint)'}}>
                      {v.frequency==='Monthly'?'/mo':v.frequency==='Single'?'one-time':v.frequency==='Yearly'?'/yr':v.frequency==='Half-Yearly'?'/6 mo':v.frequency==='Quarterly'?'/qtr':`· ${v.frequency}`}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="mono text-[13px]" style={{color:'var(--success)'}} title={v.policyType==='Life'&&Number(v.sumAssured??0)>0?'Death benefit':undefined}>{Number(v.sumAssured??0)>0?fmtINR(v.sumAssured):'—'}</span>
                  </div>

                  <div className="text-center">
                    {v.frequency==='Single'?(() => {
                      // A single premium has no renewal cycle, so the renewal badge (days left, "Expired")
                      // would be misleading. Say what it actually is: when it was / will be paid.
                      const sd = v.startDate ? new Date(v.startDate) : null
                      const ok = !!sd && !isNaN(sd.getTime())
                      const n = new Date()
                      const upcoming = ok && (sd!.getFullYear()*12+sd!.getMonth()) >= (n.getFullYear()*12+n.getMonth())
                      const when = ok ? sd!.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}) : ''
                      return <span className="text-[11px] whitespace-nowrap" style={{color:upcoming?'var(--warning)':'var(--text-faint)'}} title={`One-time premium${v.endDate?` · cover until ${v.endDate}`:''}`}>{ok?(upcoming?`due ${when}`:`✓ paid ${when}`):'paid once'}</span>
                    })():daysLeft!==null?(
                      <div className="whitespace-nowrap" title={`Renews ${v.endDate}`}>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{background:daysLeft<0?'rgba(100,100,100,0.15)':daysLeft<30?'color-mix(in srgb, var(--danger) 15%, transparent)':daysLeft<90?'color-mix(in srgb, var(--warning) 12%, transparent)':'color-mix(in srgb, var(--success) 10%, transparent)',
                                  color:daysLeft<0?'var(--text-faint)':daysLeft<30?'var(--danger)':daysLeft<90?'var(--warning)':'var(--success)'}}>
                          {daysLeft<0?'Expired':daysLeft===0?'Today!':daysLeft<30?`${daysLeft}d ⚠`:`${daysLeft}d`}
                        </span>
                        <span className="text-[11px] ml-1.5" style={{color:'var(--text-faint)'}}>{new Date(v.endDate).toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</span>
                      </div>
                    ):<span style={{color:'var(--text-faint)'}}>—</span>}
                  </div>

                  <div className="flex justify-center items-center gap-1" onClick={e=>e.stopPropagation()}>
                    <button className={`btn btn-xs ${isInactive?'bg-gray-500/15 text-gray-400':'bg-green-500/15 text-green-400'}`} onClick={()=>toggleMut.mutate(v)}>{isInactive?'Off':'On'}</button>
                    <button title="Renew — archive this and start the next premium cycle" className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10" style={{color:'var(--info)'}} onClick={(e)=>{e.stopPropagation();renewMut.mutate(v)}}><RefreshCw size={11}/></button>
                    <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setModal({open:true,item:v})}}><Pencil size={11}/></button>
                    <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${v.name}?`,onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                  
                </div>

                {isExp&&(
                  <div className="px-4 pb-3 pt-2 space-y-2" style={{background:'color-mix(in srgb, var(--text) 3%, transparent)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                    {/* Type-specific info */}
                    <div className="text-[11px] px-3 py-2 rounded-lg" style={{background:`color-mix(in srgb, ${accent} 7%, transparent)`,color:`color-mix(in srgb, ${accent} 80%, transparent)`}}>
                      {TYPE_NOTES[v.policyType||'Other']}
                    </div>
                    {/* Details grid */}
                    <div className="flex flex-wrap gap-3 text-[11px]" style={{color:'var(--text-faint)'}}>
                      {v.startDate&&<span>Start: <span className="mono text-white">{v.startDate}</span></span>}
                      {v.endDate&&<span>Renewal: <span className="mono text-white">{v.endDate}</span></span>}
                      {v.paidByCardId&&cardById(v.paidByCardId)&&<span>💳 Paid via: <span className="text-white">{cardById(v.paidByCardId).banker}</span>{v.isCardEmi&&(()=>{
                        const linkedEmi=(cardById(v.paidByCardId)?.emis??[]).find((e:any)=>e.id===v.linkedEmiId)
                        const end=linkedEmi?emiEndLabel(linkedEmi.startDate,linkedEmi.tenure):null
                        return <span style={{color:'var(--info)'}}> · counted there, not here{end?` · ends ~${end}`:''}</span>
                      })()}</span>}
                      {v.notes&&<span className="text-white">{v.notes}</span>}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button className="btn-secondary btn-xs" onClick={(e)=>{e.stopPropagation();setModal({open:true,item:v})}}><Pencil size={11}/> Edit</button>
                      <button className="btn-secondary btn-xs" onClick={(e)=>{e.stopPropagation();renewMut.mutate(v)}}><RefreshCw size={11}/> Renew</button>
                      <button className="btn-danger btn-xs ml-auto" onClick={()=>setConfirmModal({message:`Delete ${v.name}?`,onConfirm:()=>deleteMut.mutate(v.id),label:'Delete'})}><Trash2 size={11}/></button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="hidden md:grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(80px,0.8fr) minmax(130px,1.3fr) minmax(110px,1.1fr) minmax(100px,1.0fr) minmax(80px,0.8fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 5%, transparent)',color:'var(--text-faint)'}}>
            <span>{filteredActive.length} active{filterTypes.size>0?` (${Array.from(filterTypes).join(', ')})`:''}</span><span></span>
            <span className="text-right mono" style={{color:'var(--cyan)'}}>{filteredEmiMo>0?`${fmtINR(filteredEmiMo)}/mo`:''}</span>
            <span className="text-right mono" style={{color:'var(--success)'}}>{fmtINR(filteredCover)}</span>
            <span></span><span></span>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open&&(
        <Modal title={modal.item.id?`Edit — ${modal.item.name}`:'Add Insurance Policy'} onClose={()=>{setModal({open:false,item:empty});setFormErrors({})}}
          footer={<><button className="btn-secondary" onClick={()=>{setModal({open:false,item:empty});setFormErrors({})}}>Cancel</button><button className="btn-primary" disabled={saveMut.isPending || Object.keys(validateInsurance(modal.item)).length > 0} onClick={()=>{const errs=validateInsurance(modal.item); if(Object.keys(errs).length>0){setFormErrors(errs);return}; saveMut.mutate(modal.item)}}>{saveMut.isPending?'Saving...':'Save'}</button></>}>
          <div className="form-grid">
            <FormField label="Policy Name *">
              <input className={"input" + (formErrors.name ? ' border-red-500' : '')} placeholder="e.g. Jeevan Anand" value={modal.item.name||''} onChange={e=>{setModal(m=>({...m,item:{...m.item,name:e.target.value}}));setFormErrors(er=>({...er,name:''}))}}/>
              {formErrors.name && <p className="text-[11px] text-red-400 mt-1">{formErrors.name}</p>}
            </FormField>

            <FormField label="Insurer / provider">
              <input className="input" placeholder="e.g. LIC, HDFC Ergo" value={modal.item.insurer||''} onChange={e=>setModal(m=>({...m,item:{...m.item,insurer:e.target.value}}))}/>
            </FormField>

            <FormField label="Policy type" className="form-full">
              <div className="flex flex-wrap gap-1.5">
                {TYPE_LIST.map(t => {
                  const on = (modal.item.policyType || 'Life') === t
                  const c = TYPE_COLOR[t] ?? 'var(--text-faint)'
                  return (
                    <button key={t} type="button" onClick={()=>setModal(m=>({...m,item:{...m.item,policyType:t}}))}
                      className="text-[12px] font-medium px-2.5 py-1.5 rounded-full transition-colors"
                      style={{background: on ? `color-mix(in srgb, ${c} 20%, transparent)` : 'color-mix(in srgb, var(--text) 6%, transparent)', color: on ? c : 'var(--text-faint)', border: `1px solid ${on ? `color-mix(in srgb, ${c} 40%, transparent)` : 'color-mix(in srgb, var(--text) 10%, transparent)'}`}}>
                      {TYPE_ICON[t]} {t}
                    </button>
                  )
                })}
              </div>
            </FormField>


            <FormField label="Premium Amount (₹) *">
              <input className={"input" + (formErrors.premium ? ' border-red-500' : '')} type="number" placeholder="Amount per payment" value={modal.item.premium||''} onChange={e=>{setModal(m=>({...m,item:{...m.item,premium:+e.target.value}}));setFormErrors(er=>({...er,premium:''}))}}/>
              {formErrors.premium && <p className="text-[11px] text-red-400 mt-1">{formErrors.premium}</p>}
            </FormField>

            <FormField label="Payment frequency">
              <select className="select" value={modal.item.frequency||'Yearly'} onChange={e=>setModal(m=>({...m,item:{...m.item,frequency:e.target.value}}))}>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly (every 3mo)</option>
                <option value="Half-Yearly">Half-Yearly (every 6mo)</option>
                <option value="Yearly">Yearly (annual)</option>
                <option value="2-Year">Every 2 Years</option>
                <option value="3-Year">Every 3 Years</option>
                <option value="5-Year">Every 5 Years</option>
                <option value="Single">Single Premium (one-time)</option>
              </select>
            </FormField>

            <MoreFields>
            <FormField label="Sum Assured / Coverage (₹)">
              <input className="input" type="number" placeholder="e.g. 5000000 for ₹50L" value={modal.item.sumAssured||''} onChange={e=>setModal(m=>({...m,item:{...m.item,sumAssured:+e.target.value}}))}/>
            </FormField>

            <FormField label="Paid via card (optional)">
              <select className="select" value={modal.item.paidByCardId||''} onChange={e=>setModal(m=>({...m,item:{...m.item,paidByCardId:e.target.value?+e.target.value:null,...(e.target.value?{}:{isCardEmi:false,linkedEmiId:null})}}))}>
                <option value="">— not tracked —</option>
                {(cards as any[]).map(c=><option key={c.id} value={c.id}>{c.banker}</option>)}
              </select>
            </FormField>

            {/* Picking "Card — EMI" pulls the premium OUT of every Insurance outflow total (here and on
                Dashboard/Hub/Master Table/Calendar/Budget/Lookup — all of them read it from the shared
                calcOutflow calculator) because that money is already counted once, as a CC EMI, on the
                Cards page. Coverage (sum assured) still counts it — the policy stays active, only its
                premium bookkeeping moved. Switching back to "Card — paid in full" undoes this. */}
            {modal.item.paidByCardId && (
              <FormField label="Payment mode" className="form-full">
                <select className="select" value={modal.item.isCardEmi?'emi':'card'}
                  onChange={e=>{
                    const emi = e.target.value==='emi'
                    setModal(m=>({...m,item:{...m.item, isCardEmi:emi, ...(emi?{}:{linkedEmiId:null})}}))
                    setFormErrors(er=>({...er,linkedEmiId:'',paidByCardId:''}))
                  }}>
                  <option value="card">Card — paid in full</option>
                  <option value="emi">Card — EMI</option>
                </select>
              </FormField>
            )}

            {/* Tags an EMI that already exists on that card — Insurance never creates or edits the EMI
                itself, so there's only ever one place an EMI record comes from (the Credit Cards page)
                and no risk of two slightly-different copies of the same real payment existing at once. */}
            {modal.item.paidByCardId && modal.item.isCardEmi && (() => {
              const cardEmis = (cardById(modal.item.paidByCardId)?.emis ?? []) as any[]
              const linkedEmi = cardEmis.find(e => e.id === modal.item.linkedEmiId)
              const end = linkedEmi ? emiEndLabel(linkedEmi.startDate, linkedEmi.tenure) : null
              return (
                <FormField label="Which EMI on this card?" className="form-full">
                  <select className={"select" + (formErrors.linkedEmiId ? ' border-red-500' : '')} value={modal.item.linkedEmiId ?? ''}
                    onChange={e=>{setModal(m=>({...m,item:{...m.item,linkedEmiId:e.target.value?+e.target.value:null}}));setFormErrors(er=>({...er,linkedEmiId:''}))}}>
                    <option value="">— select EMI —</option>
                    {cardEmis.map(e=><option key={e.id} value={e.id}>{e.label} — {fmtINR(e.emi)}/mo{e.tenure?` · ${e.tenure}mo`:''}</option>)}
                  </select>
                  {formErrors.linkedEmiId && <p className="text-[11px] text-red-400 mt-1">{formErrors.linkedEmiId}</p>}
                  {cardEmis.length===0 && (
                    <p className="text-[11px] mt-1" style={{color:'var(--warning)'}}>No EMIs on this card yet — add it on the Credit Cards page first, then come back and pick it here.</p>
                  )}
                  {linkedEmi && (
                    <div className="text-[11px] mt-1.5" style={{color:'var(--info)'}}>
                      ⏰ {fmtINR(linkedEmi.emi)}/mo{linkedEmi.tenure?` for ${linkedEmi.tenure} months`:''}{end?` · ends ~${end}`:''} — switch Payment Mode back to "Card — paid in full" once it's done, or it'll keep being excluded.
                    </div>
                  )}
                </FormField>
              )
            })()}
            </MoreFields>

            <FormField label="Policy start date">
              <input className="input" type="date" value={modal.item.startDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,startDate:e.target.value}}))}/>
            </FormField>

            {/* Drives the "Xd left / Expired" reminder on the list and the Renew button — the
                field this whole section exists for. Labelled the same for every policy type (used to
                say "Policy End Date" except for Vehicle) since it's always the renewal reminder date,
                not just for Vehicle policies. */}
            <FormField label="Renewal / end date">
              <input className="input" type="date" value={modal.item.endDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,endDate:e.target.value}}))}/>
            </FormField>


            <FormField label="Notes" className="form-full">
              <input className="input" placeholder="Policy number, agent, nominee..." value={modal.item.notes||''} onChange={e=>setModal(m=>({...m,item:{...m.item,notes:e.target.value}}))}/>
            </FormField>
          </div>
        </Modal>
      )}
      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
