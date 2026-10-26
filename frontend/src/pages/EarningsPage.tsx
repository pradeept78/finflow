import { KpiTile } from '../components/common/KpiTile'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader, FromLink } from '../components/common'
import { fmtINR } from '../utils/format'
import api from '../api/axios'
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

const earningsApi = {
  getAll: () => api.get<{ data: any[] }>('/earnings').then(r => r.data.data),
  create: (e: any) => api.post('/earnings', e).then(r => r.data.data),
  update: (id: number, e: any) => api.put(`/earnings/${id}`, e).then(r => r.data.data),
  delete: (id: number) => api.delete(`/earnings/${id}`),
}

const empty = () => ({
  label: '', monthlyAmount: 0,
  fromDate: '', toDate: '', notes: ''
})

function monthsBetween(from: string, to?: string) {
  if (!from) return 0
  const start = new Date(from)
  const end = to ? new Date(to) : new Date()
  return Math.max(0,
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) + 1
  )
}

export default function EarningsPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ['earnings'], queryFn: earningsApi.getAll })
  const [modal, setModal] = useState<{ open: boolean; item: any }>({ open: false, item: empty() })
  const [expandedRow, setExpandedRow] = useState<number|null>(null)
  const [confirmModal, setConfirmModal] = useState<{message:string;onConfirm:()=>void;label?:string}|null>(null)
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const validateEarning = (e: any) => {
    const errs: Record<string,string> = {}
    if (!e.monthlyAmount || e.monthlyAmount <= 0) errs.monthlyAmount = 'Monthly amount must be greater than 0'
    if (e.fromDate && e.toDate && e.toDate < e.fromDate) errs.toDate = 'To date cannot be before from date'
    return errs
  }

  const saveMut = useMutation({
    mutationFn: (e: any) => e.id ? earningsApi.update(e.id, e) : earningsApi.create(e),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['earnings'] }); toast.success('Saved'); setModal({ open: false, item: empty() }); setFormErrors({}) }
  })
  const deleteMut = useMutation({
    mutationFn: earningsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['earnings'] }); toast.success('Deleted') }
  })

  const sorted = [...items].sort((a: any, b: any) => (a.fromDate ?? '').localeCompare(b.fromDate ?? ''))
  const displaySorted = sortCol ? [...sorted].sort((a: any, b: any) => {
    let cmp = 0
    if (sortCol === 'fromDate') {
      cmp = (a.fromDate ?? '').localeCompare(b.fromDate ?? '')
    } else if (sortCol === 'label') {
      cmp = (a.label ?? '').localeCompare(b.label ?? '')
    } else if (sortCol === 'monthlyAmount') {
      cmp = Number(a.monthlyAmount ?? 0) - Number(b.monthlyAmount ?? 0)
    } else if (sortCol === 'months') {
      cmp = monthsBetween(a.fromDate, a.toDate || undefined) - monthsBetween(b.fromDate, b.toDate || undefined)
    } else if (sortCol === 'total') {
      const aTotal = monthsBetween(a.fromDate, a.toDate || undefined) * Number(a.monthlyAmount ?? 0)
      const bTotal = monthsBetween(b.fromDate, b.toDate || undefined) * Number(b.monthlyAmount ?? 0)
      cmp = aTotal - bTotal
    }
    return sortDir === 'asc' ? cmp : -cmp
  }) : sorted
  const totalEarned = sorted.reduce((s: number, e: any) => {
    const months = monthsBetween(e.fromDate, e.toDate || undefined)
    return s + months * Number(e.monthlyAmount ?? 0)
  }, 0)
  const currentMonthly = sorted.filter((e: any) => !e.toDate || new Date(e.toDate) >= new Date())
    .reduce((s: number, e: any) => s + Number(e.monthlyAmount ?? 0), 0)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your earnings history." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader links={<>
        <FromLink to="/dashboard" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--success) 12%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 20%, transparent)'}}>📊 Dashboard →</FromLink>
        <FromLink to="/budget" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--warning) 12%, transparent)',color:'var(--warning)',border:'1px solid color-mix(in srgb, var(--warning) 20%, transparent)'}}>📋 Budget Rules →</FromLink>
      </>} title="Earnings History" action={
        <button className="btn-primary btn-sm" onClick={() => setModal({ open: true, item: empty() })}>
          <Plus size={14} /> Add Period
        </button>
      } />
      <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg, color-mix(in srgb, var(--info) 8%, transparent) 0%, color-mix(in srgb, var(--info) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--info) 15%, transparent)'}}>
        <span className="text-lg">📖</span>
        <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
          <strong style={{color:'var(--text)'}}>Reference log, not linked</strong> — a standalone history of what you've earned over time. It does not update the Income tab; edit income there separately if your monthly income changes.
        </div>
      </div>

      {/* WOW Hero */}
      {sorted.length > 0 && (
        <div className="rounded-2xl p-4 relative overflow-hidden" style={{background:'linear-gradient(180deg, color-mix(in srgb, var(--success) 5%, var(--bg-card)) 0%, var(--bg-card) 75%)',border:'1px solid var(--hairline)'}}>
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color:'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:'var(--success)'}} />💰 Lifetime Earnings</div>
              <div className="text-[34px] leading-none font-semibold tracking-tight tabular-nums" style={{color:'var(--success)'}}>{fmtINR(totalEarned)}</div>
              <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>{sorted.length} salary periods</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-medium mb-1" style={{color:'var(--text-muted)'}}>Current / Month</div>
              {/* Was `sorted.find(...)` — the first active period in chronological order, not the
                  sum of everything currently active. If more than one income period overlaps today
                  (e.g. salary + a side gig), this silently showed only one of them while the
                  "Current Monthly" tile below summed all active periods — same page, two different
                  numbers for "current income". Both now use the same `currentMonthly` total. */}
              <div className="text-[24px] font-semibold tracking-tight tabular-nums" style={{color:'var(--success)'}}>{fmtINR(currentMonthly)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <KpiTile label="Total lifetime earned" accent="var(--success)" value={fmtINR(totalEarned)} sub={`${sorted.length} income periods`} />
        <KpiTile label="Current monthly" accent="var(--info)" value={fmtINR(currentMonthly)} sub="active income" />
        <KpiTile label="Avg monthly (lifetime)" accent="var(--warning)" sub="across all periods" value={(() => {
          // Guard the denominator, not the result: `(x / y) || 1` turns a genuine ₹0 average
          // (0 total earned, or 0/0 when every period spans zero months) into a fake "₹1".
          const totalMonths = sorted.reduce((s: number, e: any) => s + monthsBetween(e.fromDate, e.toDate || undefined), 0)
          return fmtINR(totalMonths > 0 ? Math.round(totalEarned / totalMonths) : 0)
        })()} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="💰" title="No earnings recorded" sub="Add your income periods to track lifetime earnings" action={<button className="btn-primary btn-sm" onClick={() => setModal({ open: true, item: empty() })}>+ Add period</button>} />
      ) : (
        <div className="space-y-4">
          {/* Insight */}
      {sorted.length >= 2 && (() => {
        const first = sorted[0], latest = sorted[sorted.length-1]
        const growth = latest.monthlyAmount - first.monthlyAmount
        const pct = first.monthlyAmount > 0 ? Math.round(growth/first.monthlyAmount*100) : 0
        return Math.abs(pct) > 5 ? (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{background:'linear-gradient(180deg, color-mix(in srgb, var(--success) 5%, var(--bg-card)) 0%, var(--bg-card) 75%)',border:'1px solid var(--hairline)'}}>
            <span className="text-lg">💡</span>
            <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
              Income grew <span style={{color:'var(--success)',fontWeight:700}}>{pct>0?'+':''}{pct}%</span> — from <span style={{color:'white'}}>{fmtINR(first.monthlyAmount)}/mo</span> to <span style={{color:'white'}}>{fmtINR(latest.monthlyAmount)}/mo</span>
            </div>
          </div>
        ) : null
      })()}

      {sorted.length >= 2 && (() => {
            const chartData: {label: string; amount: number}[] = []
            sorted.forEach((e: any) => {
              if (!e.fromDate) return
              const from = new Date(e.fromDate)
              const to = e.toDate ? new Date(e.toDate) : new Date()
              const amt = Math.round(Number(e.monthlyAmount ?? 0))
              const cur = new Date(from.getFullYear(), from.getMonth(), 1)
              while (cur <= to) {
                chartData.push({ label: cur.toLocaleDateString('en-IN', {month:'short', year:'2-digit'}), amount: amt })
                cur.setMonth(cur.getMonth() + 1)
              }
            })
            if (chartData.length < 2) return null
            const peak = Math.max(...chartData.map(d => d.amount))
            const first = chartData[0].amount
            const last = chartData[chartData.length-1].amount
            const growth = first > 0 ? ((last - first) / first * 100).toFixed(1) : null
            return (
              <div className="rounded-2xl p-4" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[13px] font-semibold" style={{color:'var(--text-muted)'}}>Salary Growth</div>
                  <div className="flex gap-4 text-[11px]">
                    <span style={{color:'var(--text-muted)'}}>Peak: <span className="mono text-green-400">{fmtINR(peak)}/mo</span></span>
                    {growth && <span style={{color:'var(--text-muted)'}}>Growth: <span className="mono text-green-400">+{growth}%</span></span>}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{left:0,right:0,top:8,bottom:0}}>
                    <defs>
                      <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--success-strong)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--success-strong)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{fontSize:9}} interval="preserveStartEnd" />
                    <YAxis tick={{fontSize:9}} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{background:'var(--bg-hover)',border:'1px solid var(--hairline)',borderRadius:'8px',fontSize:'12px',boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}} labelStyle={{color:'var(--text-muted)',fontSize:'11px'}} itemStyle={{color:'#e8eaf0'}} cursor={{fill:'color-mix(in srgb, var(--text) 5%, transparent)'}} offset={12} wrapperStyle={{zIndex:100}} formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}/mo`, 'Salary']} />
                    <ReferenceLine y={first} stroke="var(--border)" strokeDasharray="3 3" />
                    <Area type="stepAfter" dataKey="amount" stroke="var(--success-strong)" fill="url(#earningsGrad)" strokeWidth={2} dot={false} activeDot={{r:4}} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        <div className="rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="grid px-4 py-2 text-[12px] font-medium border-b"
            style={{gridTemplateColumns:"minmax(190px,2.4fr) minmax(190px,2.4fr) minmax(110px,1.22fr) minmax(70px,0.78fr) minmax(120px,1.33fr) minmax(80px,0.89fr) minmax(70px,0.78fr)",borderColor:"var(--hairline)",background:"color-mix(in srgb, var(--text) 4%, transparent)",color:"var(--text-faint)"}}>
            <span><SortHeader label="Period" col="fromDate" sortCol={sortCol} sortDir={sortDir} onSort={onSort} /></span>
            <span><SortHeader label="Label" col="label" sortCol={sortCol} sortDir={sortDir} onSort={onSort} /></span>
            <span className="text-right"><SortHeader label="Monthly" col="monthlyAmount" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="Months" col="months" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-right"><SortHeader label="Total Earned" col="total" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></span>
            <span className="text-center">Status</span><span className="text-center">Actions</span>
          </div>
          {displaySorted.map((e: any, idx: number) => {
            const months = monthsBetween(e.fromDate, e.toDate || undefined)
            const total = months * Number(e.monthlyAmount ?? 0)
            const isActive = !e.toDate || new Date(e.toDate) >= new Date()
            return (
              <div key={e.id} className="grid items-center px-4 py-3 transition-colors"
                style={{gridTemplateColumns:"minmax(190px,2.4fr) minmax(190px,2.4fr) minmax(110px,1.22fr) minmax(70px,0.78fr) minmax(120px,1.33fr) minmax(80px,0.89fr) minmax(70px,0.78fr)",borderTop:idx===0?"none":"1px solid color-mix(in srgb, var(--text) 5%, transparent)",background:idx%2===0?"transparent":"color-mix(in srgb, var(--text) 2%, transparent)"}}
                onClick={()=>setExpandedRow(expandedRow===e.id?null:e.id)}
                onMouseEnter={ev=>(ev.currentTarget as HTMLElement).style.background="var(--bg-hover)"}
                onMouseLeave={ev=>(ev.currentTarget as HTMLElement).style.background="transparent"}>
                <div className="text-[13px] font-medium">
                  {e.fromDate ? new Date(e.fromDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                  {' → '}
                  {e.toDate ? new Date(e.toDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : <span style={{color:"var(--success)"}}>Present</span>}
                </div>
                <div>
                  <div className="font-medium text-[13px]">{e.label || '—'}</div>
                  {e.notes && <div className="text-[11px]" style={{color:"var(--text-faint)"}}>{e.notes}</div>}
                </div>
                <div className="text-right mono font-semibold" style={{color:"var(--info)"}}>{fmtINR(e.monthlyAmount)}</div>
                <div className="text-right mono text-[13px]" style={{color:"var(--text-faint)"}}>{months}mo</div>
                <div className="text-right mono font-semibold" style={{color:"var(--success)"}}>{fmtINR(total)}</div>
                <div className="text-center">
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    style={{background:isActive?"color-mix(in srgb, var(--success) 15%, transparent)":"color-mix(in srgb, var(--text) 8%, transparent)",color:isActive?"var(--success)":"var(--text-faint)"}}>
                    {isActive?"Active":"Ended"}
                  </span>
                </div>
                <div className="flex justify-center gap-1">
                  <button className="btn-ghost btn-xs" onClick={() => setModal({ open: true, item: { ...e } })}><Pencil size={11} /></button>
                  <button className="btn-danger btn-xs" onClick={() => setConfirmModal({ message: 'Delete?', onConfirm: () => deleteMut.mutate(e.id), label: 'Delete' })}><Trash2 size={11} /></button>
                </div>
              </div>
            )
          })}
          <div className="grid px-4 py-3 text-[13px] font-bold border-t"
            style={{gridTemplateColumns:"minmax(190px,2.4fr) minmax(190px,2.4fr) minmax(110px,1.22fr) minmax(70px,0.78fr) minmax(120px,1.33fr) minmax(80px,0.89fr) minmax(70px,0.78fr)",borderColor:"var(--hairline)",background:"color-mix(in srgb, var(--text) 4%, transparent)",color:"var(--text-faint)"}}>
            <span>{sorted.length} periods</span><span></span>
            <span></span>
            <span className="text-right mono">{sorted.reduce((s:number,e:any)=>s+monthsBetween(e.fromDate,e.toDate||undefined),0)}mo</span>
            <span className="text-right mono" style={{color:"var(--success)"}}>{fmtINR(totalEarned)}</span>
            <span></span><span></span>
          </div>
        </div>
        </div>
      )}

      {modal.open && (
        <Modal title={modal.item.id ? 'Edit Period' : 'Add Income Period'} onClose={() => { setModal({ open: false, item: empty() }); setFormErrors({}) }}
          footer={<>
            <button className="btn-secondary" onClick={() => { setModal({ open: false, item: empty() }); setFormErrors({}) }}>Cancel</button>
            <button className="btn-primary" disabled={saveMut.isPending || Object.keys(validateEarning(modal.item)).length > 0} onClick={() => { const errs = validateEarning(modal.item); if (Object.keys(errs).length > 0) { setFormErrors(errs); return } saveMut.mutate(modal.item) }}>{saveMut.isPending ? 'Saving...' : 'Save'}</button>
          </>}>
          <div className="form-grid">
            <FormField label="Label" className="form-full">
              <input className="input" placeholder="e.g. Smartenspaces, Freelance..." value={modal.item.label || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, label: e.target.value } }))} />
            </FormField>
            <FormField label="Monthly Amount (₹)">
              <input className={"input" + (formErrors.monthlyAmount ? ' border-red-500' : '')} type="number" placeholder="5000" value={modal.item.monthlyAmount || ''}
                onChange={e => { setModal(m => ({ ...m, item: { ...m.item, monthlyAmount: +e.target.value } })); setFormErrors(er => ({...er, monthlyAmount:''})) }} />
              {formErrors.monthlyAmount && <p className="text-[11px] text-red-400 mt-1">{formErrors.monthlyAmount}</p>}
            </FormField>
            <FormField label="From Date">
              <input className="input" type="date" value={modal.item.fromDate || ''}
                onChange={e => { setModal(m => ({ ...m, item: { ...m.item, fromDate: e.target.value } })); setFormErrors(er => ({...er, toDate:''})) }} />
            </FormField>
            <FormField label="To Date (leave blank if current)">
              <input className={"input" + (formErrors.toDate ? ' border-red-500' : '')} type="date" value={modal.item.toDate || ''}
                onChange={e => { setModal(m => ({ ...m, item: { ...m.item, toDate: e.target.value } })); setFormErrors(er => ({...er, toDate:''})) }} />
              {formErrors.toDate && <p className="text-[11px] text-red-400 mt-1">{formErrors.toDate}</p>}
            </FormField>
            <FormField label="Notes" className="form-full">
              <input className="input" placeholder="Any notes..." value={modal.item.notes || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, notes: e.target.value } }))} />
            </FormField>
          </div>
          {modal.item.monthlyAmount > 0 && modal.item.fromDate && (
            <div className="mt-3 p-3 rounded-lg bg-green-500/10 text-[13px] text-green-400 font-semibold">
              Total: {fmtINR(monthsBetween(modal.item.fromDate, modal.item.toDate || undefined) * modal.item.monthlyAmount)}
              {' '}({monthsBetween(modal.item.fromDate, modal.item.toDate || undefined)} months)
            </div>
          )}
        </Modal>
      )}
      {confirmModal && <ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </div>
  )
}
