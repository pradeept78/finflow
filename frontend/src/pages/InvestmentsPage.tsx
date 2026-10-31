import { useState } from 'react'
import { investTotals, investInvested, investValue, sipInvestedSoFar } from '../utils/investValue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { investmentsApi, closedLoansApi } from '../api'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader, FromLink } from '../components/common'
import { fmtINR, monthsElapsed } from '../utils/format'
import { Plus, Pencil, Trash2, Archive, ChevronDown } from 'lucide-react'
import { PhoneRow, freqSuffix } from '../components/common/PhoneRow'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

const INV_ICON: Record<string,string> = {
  MF:'📈', SIP:'🔄', FD:'🏦', Gold:'🥇', Stocks:'📊', RD:'💰', PPF:'🏛️', NPS:'🎯', Other:'💼'
}
const INV_TYPES = ['FD','RD','Mutual Fund','Stocks','PPF','NPS','Bonds','Gold','Other']

export default function InvestmentsPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const [modal, setModal] = useState<{ open: boolean; item: any }>({ open: false, item: {} })
  // Tracks whether Total Invested has been hand-edited in the CURRENT modal session. While false,
  // changing Start Date or Monthly SIP recomputes Total Invested = Monthly × months elapsed — once
  // the person types into the field directly, their value is respected and auto-fill stops.
  const [investedTouched, setInvestedTouched] = useState(false)
  // Same pattern as Total Invested: while false, Current Value silently tracks Total Invested
  // (the "no market data recorded yet, assume no change" default) — once hand-edited, it stops.
  const [currentValueTouched, setCurrentValueTouched] = useState(false)
  const openModal = (item: any) => {
    setInvestedTouched(false)
    // The cascade below only fires when Total Invested/Monthly/Start Date CHANGE during the modal
    // session — opening an existing investment that already has Total Invested but no Current Value
    // on record never triggers any of those onChanges, so the field just sat blank with nothing but
    // a hint underneath it. Pre-fill it here too, on open, so "auto" actually shows a number.
    //
    // An item that already carries a REAL Current Value (even one that happens to equal Total
    // Invested) is treated as already-touched from the start — otherwise editing, say, just the
    // Name on an old FD whose Current Value genuinely differs from what was invested would silently
    // overwrite that real figure the next time Monthly or Start Date changed for any reason.
    // A monthly investment has made more instalments since it was last saved: open it already caught up
    // (₹10,000 × 4 months = ₹40,000 even if ₹30,000 is what was stored), and let a value that was only "at cost" follow.
    const auto = sipInvestedSoFar(item)
    const caughtUp = auto != null && auto > Number(item.totalInvested ?? 0)
    const atCost = item.currentValue == null || item.currentValue === '' || Number(item.currentValue) === Number(item.totalInvested ?? 0)
    const hasCurrentValue = item.currentValue != null && item.currentValue !== '' && !(caughtUp && atCost)
    setCurrentValueTouched(hasCurrentValue)
    let initItem = item
    if (caughtUp) initItem = { ...item, totalInvested: auto, ...(atCost ? { currentValue: auto } : {}) }
    else if (!hasCurrentValue && (item.totalInvested||0) > 0) initItem = { ...item, currentValue: item.totalInvested }
    setModal({ open: true, item: initItem })
  }
  // Applied everywhere Total Invested changes (manual edit, auto-calc from Monthly/Start Date, or
  // the reset-to-auto button) so Current Value keeps following it until the person overrides it.
  const withInvested = (item: any, invested: number) => ({ ...item, totalInvested: invested, ...(currentValueTouched ? {} : { currentValue: invested }) })
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filterType, setFilterType] = useState('All')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const saveMut   = useMutation({ mutationFn: (d: any) => d.id ? investmentsApi.update(d.id, d) : investmentsApi.create(d), onSuccess: ()=>{qc.invalidateQueries({queryKey:['investments']});toast.success('Saved');setModal({open:false,item:{}})} })
  const deleteMut = useMutation({ mutationFn: async (v: any) => { try{await closedLoansApi.create({lender:v.name,purpose:v.investType??'Investment',assetType:'Investment / SIP',amount:Number(v.totalInvested??0),totalPaid:Number(v.totalInvested??0),recoveredAmount:Number(v.currentValue??0)||undefined,closedDate:new Date().toISOString().slice(0,10)})}catch{}; return investmentsApi.delete(v.id) }, onSuccess:()=>{qc.invalidateQueries({queryKey:['investments']});qc.invalidateQueries({queryKey:['closed-loans']});toast.success('Deleted')} })

  const active = (items as any[]).filter(v=>v.active!==false)
  const totalInvested  = investTotals(active).invested
  // Was `currentValue ?? maturityValue ?? 0` — an entry with no currentValue AND no maturityValue
  // recorded contributed a flat 0 here, understating Total Value (and, since P&L = value − invested,
  // showing a phantom -100% loss). Falling back to the invested amount itself reads as "no change on
  // record yet" instead, which is what a genuinely blank value actually means.
  const totalValue     = investTotals(active).value
  const totalPnL       = totalValue - totalInvested
  const totalSIP       = active.filter((v:any)=>Number(v.monthly??0)>0).reduce((s:number,v:any)=>s+Number(v.monthly??0),0)
  const now = new Date()

  const filtered = filterType==='All' ? (items as any[]) : (items as any[]).filter((v:any)=>(v.investType||'Other')===filterType)
  const filteredActive = filtered.filter((v:any)=>v.active!==false)
  const filteredInvested = investTotals(filteredActive).invested
  const filteredValue    = investTotals(filteredActive).value
  const filteredSIP      = filteredActive.filter((v:any)=>Number(v.monthly??0)>0).reduce((s:number,v:any)=>s+Number(v.monthly??0),0)

  const getCAGR = (v: any) => {
    const invested = investInvested(v)
    // Falls back to maturityValue like the Value column (line 30/38) does — an FD/RD entered with
    // only a maturity value (the common case: you know maturity up front, not "current value") has
    // a real number in the Value column but previously always showed "—" for CAGR here.
    const usingMaturity = v.currentValue == null || v.currentValue === ''
    const current  = usingMaturity ? Number(v.maturityValue??0) : investValue(v)   // same value the Value column shows, so an at-cost SIP isn't compared against its stale stored figure
    // Was always `months = elapsed since startDate`, even when `current` is actually `maturityValue`
    // (the value the investment reaches at the END of its term, not today). For an FD 2 years into a
    // 5-year term, that compounded the FULL five-year gain over only the 2 years elapsed, inflating
    // the shown CAGR well above the FD's real contracted rate. When there's no real currentValue to
    // anchor "today", the only honest period to compound over is the full start-to-maturity term.
    const months = !usingMaturity
      ? (v.startDate ? Math.max(1, (now.getTime()-new Date(v.startDate).getTime())/(1000*60*60*24*30)) : 12)
      : (v.startDate && v.endDate ? Math.max(1, (new Date(v.endDate).getTime()-new Date(v.startDate).getTime())/(1000*60*60*24*30)) : 12)
    if (!invested || !current || months < 1) return null
    return ((Math.pow(current/invested, 12/months) - 1) * 100).toFixed(1)
  }

  const getDaysToMaturity = (v: any) => {
    if (!v.endDate) return null
    return Math.ceil((new Date(v.endDate).getTime()-now.getTime())/(1000*60*60*24))
  }

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your investments." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader links={<>
        <FromLink to="/dashboard" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--info) 12%, transparent)',color:'var(--info)',border:'1px solid color-mix(in srgb, var(--info) 20%, transparent)'}}>📊 Dashboard →</FromLink>
        <FromLink to="/earnings" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--success) 12%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 20%, transparent)'}}>💰 Earnings History →</FromLink>
      </>} title="Investments" action={<button className="btn-primary btn-sm" onClick={()=>openModal({})}><Plus size={14}/> Add</button>}/>

      {items.length > 0 && (
        <KpiRow className="grid grid-cols-4 gap-3" keep={[1, 2]}>
          {[
            {label:'Total Invested',   value:fmtINR(totalInvested), sub:`${active.length} investments`,     accent:'var(--info)'},
            {label:'Current Value',    value:fmtINR(totalValue),    sub:'market/maturity value · defaults to invested',  accent:totalValue>=totalInvested?'var(--success)':'var(--danger)'},
            {label:'Total P&L',        value:`${totalPnL>=0?'+':''}${fmtINR(totalPnL)}`, sub:totalInvested>0?`${((totalPnL/totalInvested)*100).toFixed(1)}% returns`:'', accent:totalPnL>=0?'var(--success)':'var(--danger)'},
            {label:'SIP / Month',      value:fmtINR(totalSIP),      sub:`${active.filter((v:any)=>Number(v.monthly??0)>0).length} active SIPs`, accent:'var(--pink)'},
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
        // Was its own inline re-implementation of the exact same CAGR math as getCAGR() above —
        // a second copy of one formula in one file is exactly how the two silently drift apart
        // (same lesson as every cross-page calculation in this app). Call the one definition.
        const underFD = active.filter((v:any)=>{
          const cagr = Number(getCAGR(v))
          return !isNaN(cagr) && cagr<6.5
        })
        if(!underFD.length) return null
        return (
          <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg, color-mix(in srgb, var(--danger) 8%, transparent) 0%, color-mix(in srgb, var(--danger) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--danger) 15%, transparent)'}}>
            <span className="text-lg">💡</span>
            <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
              <span style={{color:'var(--warning)',fontWeight:700}}>{underFD.length} investment{underFD.length>1?'s':''}</span> earning less than FD rate (6.5%) — consider moving to higher-yield options.
            </div>
          </div>
        )
      })()}

      {items.length === 0 ? <EmptyState icon="📈" title="No investments" sub="Track FDs, mutual funds, stocks and more" action={<button className="btn-primary btn-sm" onClick={()=>openModal({})}>+ Add investment</button>} /> : (
        <div className="rounded-2xl overflow-hidden text-[13px]" style={{background:'var(--bg-card)',border:'1px solid var(--border)',overflowX:'auto'}}>
          <div className="hidden md:grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(90px,0.93fr) minmax(120px,1.24fr) minmax(130px,1.34fr) minmax(90px,0.93fr) minmax(80px,0.83fr) minmax(70px,0.72fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <SortHeader label="Investment" col="name" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            <span className="text-center">
              <select aria-label="Filter by type" className="select text-[12px] py-0.5 px-1 font-medium text-center" style={{width:'auto',background:'transparent',border:'none',color:'inherit'}} value={filterType} onChange={e=>setFilterType(e.target.value)} onClick={e=>e.stopPropagation()}>
                <option value="All">Type (All)</option>
                {INV_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </span>
            <span className="text-right"><SortHeader label="Invested" col="invested" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="Value / P&L" col="value" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="SIP/mo" col="sip" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-center"><SortHeader label="CAGR" col="cagr" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" /></span>
            <span className="text-center">Action</span>
          </div>

          {(() => {
            const displayItems = [...filtered].sort((a: any, b: any) => {
              if (!sortCol) return 0
              let cmp = 0
              if (sortCol === 'name') cmp = (a.name ?? '').localeCompare(b.name ?? '')
              else if (sortCol === 'invested') cmp = investInvested(a) - investInvested(b)
              else if (sortCol === 'value') cmp = investValue(a) - investValue(b)
              else if (sortCol === 'sip') cmp = Number(a.monthly??0) - Number(b.monthly??0)
              else if (sortCol === 'cagr') { const ca = Number(getCAGR(a)); const cb = Number(getCAGR(b)); cmp = (isNaN(ca)?-Infinity:ca) - (isNaN(cb)?-Infinity:cb) }
              return sortDir === 'asc' ? cmp : -cmp
            })
            return filtered.length===0 ? (
            <div className="px-4 py-8 text-center text-[11px]" style={{color:'var(--text-faint)'}}>No investments match "{filterType}"</div>
          ) : displayItems.map((v:any,idx:number)=>{
            const invested = investInvested(v)
            // Deliberately does NOT feed getCAGR (above) — that still only trusts a real
            // currentValue/maturityValue, so an entry with neither doesn't get mislabeled as
            // "underperforming FD" at a fabricated 0% return. This is purely a display/total figure.
            const value    = investValue(v)
            const pnl      = value - invested
            const pnlPct   = invested>0 ? ((pnl/invested)*100).toFixed(1) : null
            const cagr     = getCAGR(v)
            const dtm      = getDaysToMaturity(v)
            const isExp    = expanded===v.id
            const accent   = pnl>0?'var(--success)':pnl<0?'var(--danger)':'var(--text-faint)'

            return (
              <div key={v.id} style={{borderTop:idx===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)',background:idx%2===0?'transparent':'color-mix(in srgb, var(--text) 2%, transparent)'}}>
                {/* Phone row (tablet and desktop: the table row below) */}
                <PhoneRow title={v.name} amount={fmtINR(value)}
                  left={`${v.investType||'Investment'}${Number(v.monthly??0)>0 ? ` · SIP ${fmtINR(v.monthly)}/mo` : ''}`}
                  right={pnlPct!==null ? `${pnl>=0?'+':''}${fmtINR(pnl)} (${pnlPct}%)` : ''} rightColor={accent}
                  expanded={isExp} onToggle={()=>setExpanded(isExp?null:v.id)} />
                <div className="hidden md:grid items-center px-4 py-3 cursor-pointer transition-colors"
                  style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(90px,0.93fr) minmax(120px,1.24fr) minmax(130px,1.34fr) minmax(90px,0.93fr) minmax(80px,0.83fr) minmax(70px,0.72fr)',background:isExp?'var(--bg-base)':'transparent'}}
                  onMouseEnter={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                  onMouseLeave={e=>{if(!isExp)(e.currentTarget as HTMLElement).style.background='transparent'}}
                  onClick={()=>setExpanded(isExp?null:v.id)}>

                  {/* Chevron + icon sit in a fixed leading column so every sub-line
                      below lines up under the name, whatever width the emoji renders at. */}
                  <div className="flex items-start gap-1.5 min-w-0">
                    <ChevronDown size={12} className="flex-shrink-0 mt-1" style={{color:'var(--text-faint)',transform:isExp?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s'}}/>
                    <span className="flex-shrink-0 leading-none mt-0.5">{INV_ICON[v.investType||"Other"]||"💼"}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-[13px] truncate">{v.name}</div>
                      {v.startDate&&<div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>since {new Date(v.startDate).toLocaleDateString('en-IN',{month:'short',year:'numeric'})}</div>}
                      {dtm!==null&&(
                        <div className="mt-0.5">
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{background:dtm<0?'color-mix(in srgb, var(--success) 15%, transparent)':dtm<30?'color-mix(in srgb, var(--danger) 15%, transparent)':dtm<90?'color-mix(in srgb, var(--warning) 12%, transparent)':'color-mix(in srgb, var(--text) 6%, transparent)',
                                    color:dtm<0?'var(--success)':dtm<30?'var(--danger)':dtm<90?'var(--warning)':'var(--text-faint)'}}>
                            {dtm<0?'✓ Matured':dtm===0?'Matures today!':dtm<30?`${dtm}d ⚠`:`${dtm}d`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{background:'color-mix(in srgb, var(--info) 15%, transparent)',color:'var(--info)'}}>{v.investType||'Other'}</span>
                  </div>

                  <div className="text-right">
                    <div className="mono font-semibold" style={{color:'var(--info)'}}>{invested>0?fmtINR(invested):'—'}</div>
                    {Number(v.monthly??0)>0&&<div className="text-[11px]" style={{color:'var(--text-faint)'}}>{fmtINR(v.monthly)}/mo SIP</div>}
                  </div>

                  <div className="text-right">
                    {value>0?(
                      <>
                        <div className="mono font-semibold" style={{color:value>=invested?'var(--success)':'var(--danger)'}}>{fmtINR(value)}</div>
                        {pnl!==0&&<div className="text-[11px] font-medium" style={{color:accent}}>{pnl>=0?'+':''}{fmtINR(pnl)} ({pnlPct}%)</div>}
                      </>
                    ):<span style={{color:'var(--text-faint)'}}>—</span>}
                  </div>

                  <div className="text-right">
                    {Number(v.monthly??0)>0
                      ?<span className="mono font-semibold" style={{color:'var(--purple)'}}>{fmtINR(v.monthly)}</span>
                      :<span style={{color:'var(--text-faint)'}}>—</span>}
                  </div>

                  <div className="text-center">
                    {cagr ? (
                      <div>
                        <span className="mono font-bold text-[13px]" style={{color:Number(cagr)>8?'var(--success)':Number(cagr)>4?'var(--warning)':'var(--danger)'}}>{cagr}%</span>
                        <div className="text-[11px] mt-0.5" style={{color:Number(cagr)>6.5?'var(--success)':'var(--danger)'}}>
                          {Number(cagr)>6.5?`↑ +${(Number(cagr)-6.5).toFixed(1)}% vs FD`:`↓ ${(6.5-Number(cagr)).toFixed(1)}% below FD`}
                        </div>
                      </div>
                    ):<span style={{color:'var(--text-faint)'}}>—</span>}
                  </div>

                  <div className="flex justify-center gap-1" onClick={e=>e.stopPropagation()}>
                    <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();openModal(v)}}><Pencil size={11}/></button>

                    <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${v.name}?`,onConfirm:()=>deleteMut.mutate(v),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                  
                </div>

                {isExp&&(
                  <div className="px-4 pb-3 pt-2 flex items-center gap-2 flex-wrap text-[11px]" style={{background:'var(--bg-base)',borderTop:'1px solid color-mix(in srgb, var(--text) 5%, transparent)',color:'var(--text-faint)'}}>
                    {v.startDate&&<span>Started: <span className="mono text-white">{v.startDate}</span></span>}
                    {v.endDate&&<span>Matures: <span className="mono text-white">{v.endDate}</span></span>}
                    {v.maturityValue>0&&<span>Maturity: <span className="mono" style={{color:'var(--success)'}}>{fmtINR(v.maturityValue)}</span></span>}
                    <div className="ml-auto flex gap-1.5">
                      <button className="btn-secondary btn-xs" onClick={(e)=>{e.stopPropagation();openModal(v)}}><Pencil size={11}/> Edit</button>
                      <button className="btn-danger btn-xs" onClick={()=>setConfirmModal({message:'Delete?',onConfirm:()=>deleteMut.mutate(v),label:'Delete'})}><Trash2 size={11}/></button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
          })()}

          <div className="hidden md:grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:'minmax(190px,2.4fr) minmax(90px,0.93fr) minmax(120px,1.24fr) minmax(130px,1.34fr) minmax(90px,0.93fr) minmax(80px,0.83fr) minmax(70px,0.72fr)',borderColor:'var(--hairline)',background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>
            <span>{filteredActive.length} investment{filteredActive.length!==1?'s':''}{filterType!=='All'?` (${filterType})`:''}</span>
            <span></span>
            <span className="text-right mono" style={{color:'var(--info)'}}>{fmtINR(filteredInvested)}</span>
            <span className="text-right mono" style={{color:(filteredValue-filteredInvested)>=0?'var(--success)':'var(--danger)'}}>{fmtINR(filteredValue)} ({(filteredValue-filteredInvested)>=0?'+':''}{fmtINR(filteredValue-filteredInvested)})</span>
            <span className="text-right mono" style={{color:'var(--purple)'}}>{filteredSIP>0?fmtINR(filteredSIP):'—'}</span>
            <span></span><span></span>
          </div>
        </div>
      )}

      {modal.open&&(
        <Modal title={modal.item.id?'Edit Investment':'Add Investment'} onClose={()=>setModal({open:false,item:{}})}
          footer={<><button className="btn-secondary" onClick={()=>setModal({open:false,item:{}})}>Cancel</button><button className="btn-primary" onClick={()=>saveMut.mutate(modal.item)}>Save</button></>}>
          <div className="form-grid">
            <FormField label="Name *" className="form-full"><input className="input" value={modal.item.name||''} onChange={e=>setModal(m=>({...m,item:{...m.item,name:e.target.value}}))}/></FormField>
            <FormField label="Type"><select className="select" value={modal.item.investType||'FD'} onChange={e=>setModal(m=>({...m,item:{...m.item,investType:e.target.value}}))}>
              {['FD','RD','Mutual Fund','Stocks','PPF','NPS','Bonds','Gold','Other'].map(t=><option key={t}>{t}</option>)}</select></FormField>
            <FormField label="Total Invested (₹)">
              <input className="input" type="number" value={modal.item.totalInvested||''}
                onChange={e=>{ setInvestedTouched(true); setModal(m=>({...m,item:withInvested(m.item,+e.target.value)})) }}/>
              {!investedTouched && (modal.item.monthly||0)>0 && modal.item.startDate && (
                <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>
                  auto: {fmtINR(modal.item.monthly)} × {monthsElapsed(modal.item.startDate)}mo since start
                </div>
              )}
              {investedTouched && (modal.item.monthly||0)>0 && modal.item.startDate && (
                <button type="button" className="text-[11px] mt-1 underline" style={{color:'var(--info)'}}
                  onClick={()=>{ setInvestedTouched(false); setModal(m=>({...m,item:withInvested(m.item,Math.round(Number(m.item.monthly)*monthsElapsed(m.item.startDate)))})) }}>
                  ↺ reset to auto ({fmtINR(Math.round(Number(modal.item.monthly)*monthsElapsed(modal.item.startDate)))})
                </button>
              )}
            </FormField>
            <FormField label="Current Value (₹)">
              <input className="input" type="number" value={modal.item.currentValue||''}
                onChange={e=>{ setCurrentValueTouched(true); setModal(m=>({...m,item:{...m.item,currentValue:+e.target.value}})) }}/>
              {!currentValueTouched && (modal.item.totalInvested||0)>0 && (
                <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>
                  auto: = Total Invested ({fmtINR(modal.item.totalInvested)})
                </div>
              )}
              {currentValueTouched && (modal.item.totalInvested||0)>0 && (
                <button type="button" className="text-[11px] mt-1 underline" style={{color:'var(--info)'}}
                  onClick={()=>{ setCurrentValueTouched(false); setModal(m=>({...m,item:{...m.item,currentValue:m.item.totalInvested}})) }}>
                  ↺ reset to auto ({fmtINR(modal.item.totalInvested)})
                </button>
              )}
            </FormField>
            <FormField label="Maturity Value (₹)"><input className="input" type="number" value={modal.item.maturityValue||''} onChange={e=>setModal(m=>({...m,item:{...m.item,maturityValue:+e.target.value}}))}/></FormField>
            <FormField label="Monthly SIP (₹)">
              <input className="input" type="number" value={modal.item.monthly||''}
                onChange={e=>{
                  const monthly = +e.target.value
                  setModal(m=>{
                    let item = {...m.item, monthly}
                    if (!investedTouched && m.item.startDate) item = withInvested(item, Math.round(monthly * monthsElapsed(m.item.startDate)))
                    return {...m, item}
                  })
                }}/>
            </FormField>
            <FormField label="Start Date">
              <input className="input" type="date" value={modal.item.startDate||''}
                onChange={e=>{
                  const startDate = e.target.value
                  setModal(m=>{
                    let item = {...m.item, startDate}
                    if (!investedTouched && (m.item.monthly||0)>0) item = withInvested(item, Math.round(Number(m.item.monthly) * monthsElapsed(startDate)))
                    return {...m, item}
                  })
                }}/>
            </FormField>
            <FormField label="Maturity Date"><input className="input" type="date" value={modal.item.endDate||''} onChange={e=>setModal(m=>({...m,item:{...m.item,endDate:e.target.value}}))}/></FormField>
          </div>
        </Modal>
      )}
      {confirmModal&&<ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={()=>setConfirmModal(null)}/>}
    </div>
  )
}
