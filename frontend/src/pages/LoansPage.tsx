import { ICON } from '../components/common/icons'
import { usePicks, PickBox, WhatIfBar, SelectAllLink } from '../components/common/WhatIf'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loansApi, paidMarksApi, closedLoansApi, incomeApi } from '../api'
import FilterMenu from '../components/common/FilterMenu'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, AlertModal, InputModal, SortHeader } from '../components/common'
import { fmtINR, getEff, resolveDueDay, isPaidThisMonth, monthlyIncomeTotal, ordinal } from '../utils/format'
import { calcLoanSplit } from '../utils/loanCalc'
import { emiFacts } from '../utils/emiFacts'
import { Plus, Pencil, Trash2, Archive, ChevronDown } from 'lucide-react'
import NextMonthHeadsUp from '../components/common/NextMonthHeadsUp'
import { startsAfterThisMonth } from '../utils/nextMonth'
import { MoreFields } from '../components/common/MoreFields'
import toast from 'react-hot-toast'
import { KpiRow } from '../components/common/KpiTile'

export default function LoansPage() {
  const qc = useQueryClient()
  const wi = usePicks()
  const { data: incomeRows = [] } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const { data: loans = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: markedKeys = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  // Was only tracking the `loans` query — `paid-marks` feeds the paid/due-badge state below.
  const isLoading = l1 || l2
  const isError = e1 || e2
  const refetch = () => { r1(); r2() }
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showAllRates, setShowAllRates] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [modal, setModal] = useState<{ open: boolean; loan: any }>({ open: false, loan: {} })
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [filterLoanType, setFilterLoanType] = useState('All')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
  
  const validateLoan = (l: any) => {
    const errs: Record<string,string> = {}
    if (!l.lender?.trim()) errs.lender = 'Lender name is required'
    if (!l.amount || l.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!l.emi || l.emi <= 0) errs.emi = 'EMI must be greater than 0'
    if (l.emi > l.amount) errs.emi = 'EMI cannot exceed loan amount'
    if (!l.tenure || l.tenure <= 0) errs.tenure = 'Tenure must be greater than 0'
    if (!l.startDate) errs.startDate = 'Start date is required'
    if (l.dueDay && (l.dueDay < 1 || l.dueDay > 31)) errs.dueDay = 'Due day must be 1–31'
    return errs
  }
  const [pendingForecloseSale, setPendingForecloseSale] = useState<any>(null)
  const [calcModal, setCalcModal] = useState<any>({ type: null, loan: null, result: null })
  const [inputModal, setInputModal] = useState<any>(null)

  const saveMut = useMutation({ 
    mutationFn: (l: any) => l.id ? loansApi.update(l.id, l) : loansApi.create(l), 
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); toast.success('Saved'); setModal({ open: false, loan: {} }); setFormErrors({}); setFormErrors({}) },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save loan')
  })
  const deleteMut = useMutation({
    mutationFn: async (l: any) => {
      const e = getEff(l), t = l.tenure ?? (e.paid + e.pending)
      const sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined)
      try { await closedLoansApi.create({ lender: l.lender, purpose: l.loanType ?? 'Loan', assetType: 'Loan', amount: l.amount ?? 0, totalPaid: (l.emi ?? 0) * e.paid, interestPaid: Math.round(sp.intPaid), principalPaid: Math.round(sp.principalPaid ?? sp.princLeft), originalValue: l.amount ?? 0, closedMonths: e.paid, closedDate: new Date().toISOString().slice(0, 10) }) } catch {}
      return loansApi.delete(l.id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); qc.invalidateQueries({ queryKey: ['closed-loans'] }); toast.success('Deleted') }
  })
  const markMut = useMutation({ mutationFn: paidMarksApi.toggle, onSuccess: () => qc.invalidateQueries({ queryKey: ['paid-marks'] }) })
  const missedMut = useMutation({
    mutationFn: ({ id, missed }: any) => { const loan = loans.find((l: any) => l.id === id); return loansApi.update(id, { ...loan, missedMonths: missed }) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); toast.success('Updated') }
  })
  const doCloseLoanMut = useMutation({
    mutationFn: async ({ l, salePrice }: any) => {
      const e = getEff(l), sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, l.tenure ?? 0, e.paid, l.principalPaid)
      await closedLoansApi.create({ lender: l.lender, purpose: l.loanType, assetType: 'Loan', amount: l.amount, totalPaid: (l.emi ?? 0) * e.paid, recoveredAmount: salePrice || null, interestPaid: Math.round(sp.intPaid), principalPaid: Math.round(sp.principalPaid ?? sp.princLeft), originalValue: l.amount, closedMonths: e.paid, closedDate: new Date().toISOString().slice(0, 10) })
      await loansApi.delete(l.id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); qc.invalidateQueries({ queryKey: ['closed-loans'] }); toast.success('Closed!') }
  })

  const today = new Date().getDate()
  const activeLoans = loans.filter((l: any) => getEff(l).pending > 0)
  // what-if: ticked loans — closing one costs its whole remaining balance (the "To clear" column) and drops its EMI
  const pickedLoans = activeLoans.filter((l: any) => wi.picked.has(String(l.id)))
  const pickNeed = pickedLoans.reduce((s: number, l: any) => s + getEff(l).pending * Number(l.emi ?? 0), 0)
  const pickFree = pickedLoans.reduce((s: number, l: any) => s + Number(l.emi ?? 0), 0)
  // EMIs paid this month: a loan whose first EMI is after this month isn't one yet (utils/nextMonth) — same
  // rule as every total; its EMI shows as "+₹X from Nov" instead.
  const notStarted = activeLoans.filter((l: any) => startsAfterThisMonth(l))
  const totalEmi = activeLoans.filter((l: any) => !startsAfterThisMonth(l)).reduce((s: number, l: any) => s + Number(l.emi ?? 0), 0)
  const startingEmi = notStarted.reduce((s: number, l: any) => s + Number(l.emi ?? 0), 0)
  const nextMonthName = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-IN', { month: 'short' })
  const totalPending = loans.reduce((s: number, l: any) => { const e = getEff(l), t = l.tenure ?? (e.paid + e.pending); return s + calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined).princLeft }, 0)
  const totalIntLeft = loans.reduce((s: number, l: any) => { const e = getEff(l), t = l.tenure ?? (e.paid + e.pending); return s + calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined).intLeft }, 0)
  const totalIntPaid = loans.reduce((s: number, l: any) => { const e = getEff(l), t = l.tenure ?? (e.paid + e.pending); return s + calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined).intPaid }, 0)
  const totalPaidSoFar = loans.reduce((s: number, l: any) => { const e = getEff(l); return s + Number(l.emi ?? 0) * e.paid }, 0)
  const maxPending = loans.reduce((m: number, l: any) => Math.max(m, getEff(l).pending), 0)
  const assetVal = loans.reduce((s: number, l: any) => s + Number(l.currentValue ?? 0), 0)
  // Was `pending * emi` — that's EMIs-left times instalment, which includes future interest not
  // yet accrued, so it overstated what's actually still owed on the principal. The expanded row
  // for the same loan (below) already gets this right via calcLoanSplit's `princLeft`; this tile
  // was silently disagreeing with it. Sum the same `princLeft` figure `totalPending` above uses,
  // restricted to asset-backed loans, so "Asset Equity" can't contradict the per-loan equity shown
  // one click away.
  const netAsset = assetVal - loans.filter((l: any) => (l.currentValue ?? 0) > 0).reduce((s: number, l: any) => { const e = getEff(l), t = l.tenure ?? (e.paid + e.pending); return s + calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined).princLeft }, 0)
  const totalLoanAmount = loans.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0)
  const totalWithInterest = totalLoanAmount + totalIntPaid + totalIntLeft

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }
  // Was gating on raw `l.dueDay` — a loan with no explicit due day but an inferable one (via
  // resolveDueDay's startDate fallback, same as the row-level due badge further down) never
  // appeared in this banner at all, even though it does show up as due on the row itself.
  const upcomingDebits = loans
    .filter((l: any) => getEff(l).pending > 0 && resolveDueDay(l))
    .map((l: any) => {
      const now = new Date(), t = now.getDate()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const dd = resolveDueDay(l)!
      let diff = dd - t
      if (diff < -7) diff = (daysInMonth - t) + dd
      return { ...l, diff, resolvedDueDay: dd }
    })
    .filter((l: any) => l.diff >= 0 && l.diff <= 7)
    .sort((a: any, b: any) => a.diff - b.diff)

  const sorted = [...loans]
    .filter((l: any) => filterLoanType === 'All' || (l.loanType || 'Personal Loan') === filterLoanType)
    .sort((a: any, b: any) => {
    if (!sortCol) return 0
    const ea = getEff(a), eb = getEff(b)
    const ta = a.tenure ?? (ea.paid + ea.pending), tb = b.tenure ?? (eb.paid + eb.pending)
    const spa = calcLoanSplit(a.amount ?? 0, a.emi ?? 0, ta, ea.paid, a.principalPaid ?? undefined)
    const spb = calcLoanSplit(b.amount ?? 0, b.emi ?? 0, tb, eb.paid, b.principalPaid ?? undefined)
    const pctA = ta > 0 ? ea.paid / ta * 100 : 0
    const pctB = tb > 0 ? eb.paid / tb * 100 : 0
    let cmp = 0
    if (sortCol === 'lender') cmp = (a.lender ?? '').localeCompare(b.lender ?? '')
    else if (sortCol === 'debited') cmp = (a.debitAccount || a.lender || '').localeCompare(b.debitAccount || b.lender || '')
    else if (sortCol === 'emi') cmp = (a.emi ?? 0) - (b.emi ?? 0)
    else if (sortCol === 'tenure') cmp = ea.pending - eb.pending
    else if (sortCol === 'toclear') cmp = (spa.princLeft + spa.intLeft) - (spb.princLeft + spb.intLeft)
    else if (sortCol === 'paidpct') cmp = pctA - pctB
    else if (sortCol === 'due') cmp = (resolveDueDay(a) ?? 999) - (resolveDueDay(b) ?? 999)
    return sortDir === 'asc' ? cmp : -cmp
    })

  // "Debited From" is an optional field — when no loan has one filled in, the column is a wall of
  // dashes, so drop it (header, rows and footer share these templates) until at least one loan uses it.
  const showDebit = sorted.some((l: any) => !!l.debitAccount)
  const COLS_MAIN = showDebit
    ? 'minmax(220px,2.6fr) minmax(90px,1fr) minmax(110px,1.3fr) minmax(110px,1.2fr) minmax(130px,1.5fr) minmax(55px,0.7fr) minmax(80px,1fr) minmax(80px,0.95fr)'
    : 'minmax(220px,2.6fr) minmax(110px,1.3fr) minmax(110px,1.2fr) minmax(130px,1.5fr) minmax(55px,0.7fr) minmax(80px,1fr) minmax(80px,0.95fr)'

  // Footer sums scoped to the type filter above, same formulas as the unfiltered totals.
  const filteredActiveLoans = sorted.filter((l: any) => getEff(l).pending > 0)
  const filteredTotalEmi = filteredActiveLoans.filter((l: any) => !startsAfterThisMonth(l)).reduce((s: number, l: any) => s + Number(l.emi ?? 0), 0)
  const filteredTotalPending = sorted.reduce((s: number, l: any) => { const e = getEff(l), t = l.tenure ?? (e.paid + e.pending); return s + calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined).princLeft }, 0)
  const filteredTotalIntLeft = sorted.reduce((s: number, l: any) => { const e = getEff(l), t = l.tenure ?? (e.paid + e.pending); return s + calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, e.paid, l.principalPaid ?? undefined).intLeft }, 0)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your loans." onRetry={() => refetch()} />

  const debtFreeDate = (() => { const d = new Date(); d.setMonth(d.getMonth() + maxPending); return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) })()

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Loans" action={
        <button className="btn-primary btn-sm" onClick={() => setModal({ open: true, loan: { loanType: 'Personal Loan' } })}>
          <Plus size={14} /> Add loan
        </button>
      } />

      {loans.length === 0 ? <EmptyState icon={ICON.loan} title="No loans" sub="Add your first loan to track EMIs and payoff date" action={<button className="btn-primary btn-sm" onClick={() => setModal({ open: true, loan: { loanType: 'Personal Loan' } })}>+ Add loan</button>} /> : (<>

        {/* ── SUMMARY ROW ── */}
        <KpiRow className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 [&>*]:min-w-0" keep={[0, 2]}>
          {[
            { label: 'Monthly EMI',     value: fmtINR(totalEmi),                    sub: `${activeLoans.length - notStarted.length} paying now${startingEmi > 0 ? ` · +${fmtINR(startingEmi)} from ${notStarted.some((l: any) => { const d = new Date(l.startDate); const n = new Date(); return d.getFullYear() * 12 + d.getMonth() === n.getFullYear() * 12 + n.getMonth() + 1 }) ? nextMonthName : 'later'}` : ''}`, accent: '#f97316' },
            { label: 'Total loan',      value: fmtINR(totalLoanAmount),             sub: `${fmtINR(totalWithInterest)} with interest`,  accent: '#2dd4bf' },
            { label: 'Total to clear',  value: fmtINR(totalPending + totalIntLeft), sub: `principal ${fmtINR(totalPending)} + interest ${fmtINR(totalIntLeft)}`, accent: 'var(--warning)' },
            { label: 'Paid so far',     value: fmtINR(totalPaidSoFar),              sub: `${fmtINR(totalIntPaid)} was interest`,        accent: 'var(--cyan)' },
            assetVal > 0
              ? { label: 'Asset equity',  value: fmtINR(Math.abs(netAsset)), sub: netAsset >= 0 ? 'net positive' : 'underwater', accent: netAsset >= 0 ? 'var(--success)' : 'var(--danger)' }
              : { label: 'Last loan ends', value: debtFreeDate,              sub: `${maxPending} months away`,                    accent: 'var(--purple)' },
          ].map((m: any) => (
            <div key={m.label} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${m.accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`, border: `1px solid var(--hairline)` }}>
              <div className="relative">
                <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:m.accent}} />{m.label}</div>
                <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{ color: m.accent }}>{m.value}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{m.sub}</div>
              </div>
            </div>
          ))}
        </KpiRow>

        {/* Insights row: upcoming debits + high rate tip, side by side */}
        {(() => {
          // Rate = the same real (reducing-balance) annual rate the Rate column shows, not a flat-rate guess: the old test
          // (total interest ÷ amount ÷ years) read a 12% flat loan — about 21% a year — as exactly "12". Only loans with
          // real time left are worth prepaying (a loan about to end has almost no interest left to save), highest rate first.
          const highRate = sorted.map((l:any)=>{
            const eff = getEff(l)
            const t = l.tenure ?? (eff.paid + eff.pending)
            const ef = emiFacts({ amount: l.amount, emi: l.emi, tenure: t, paid: eff.paid, rate: l.interestRate, principalRemaining: l.principalPaid })
            return { l, rate: ef.rate ?? 0, left: eff.pending }
          }).filter(x => x.rate >= 15 && x.left > 3).sort((a, b) => b.rate - a.rate)
          if (!upcomingDebits.length && !highRate.length) return null
          // Two one-line rows (it had grown to ~180px on a phone): the next EMIs as a count and total that opens
          // into the list (each loan named; the rows below already show due days), and the prepay hint as text.
          const nextTotal = upcomingDebits.reduce((sum: number, l: any) => sum + Number(l.emi ?? 0), 0)
          const rateTxt = (showAllRates ? highRate : highRate.slice(0, 2))
          return (
            <div className="rounded-lg text-[12px] divide-y divide-[color:var(--hairline)]" style={{background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text-faint)'}}>
              {upcomingDebits.length > 0 && (
                <div>
                  <button type="button" className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left" aria-expanded={showNext} onClick={() => setShowNext(v => !v)}>
                    <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>🏦 Next 7 days</span>
                    <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {upcomingDebits.length} EMI{upcomingDebits.length > 1 ? 's' : ''} · <span className="mono font-semibold" style={{ color: 'var(--text)' }}>{fmtINR(nextTotal)}</span> {showNext ? '▴' : '▾'}
                    </span>
                  </button>
                  {showNext && (
                    <ul className="px-3 pb-2 space-y-0.5">
                      {upcomingDebits.map((l: any) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate">
                            <span style={{ color: 'var(--text-muted)' }}>{ordinal(l.resolvedDueDay)}</span> · <span style={{ color: 'var(--text)' }}>{l.lender}</span>{l.debitAccount && <> · from {l.debitAccount}</>}
                          </span>
                          <span className="mono tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{fmtINR(l.emi)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {highRate.length > 0 && (
                <div className="flex items-baseline gap-2 px-3 py-2 min-w-0" title="Highest interest rates first: paying these off early saves the most">
                  <span className="font-semibold flex-shrink-0" style={{ color: 'var(--text-muted)' }}>💡 Prepay first</span>
                  <span className={`min-w-0 ${showAllRates ? '' : 'truncate'}`}>
                    {rateTxt.map((x, i) => {
                      const clr = x.rate >= 24 ? 'var(--danger)' : x.rate >= 18 ? 'var(--orange, var(--warning))' : 'var(--warning)'
                      return (
                        <span key={x.l.id ?? i}>{i > 0 && ' · '}<span style={{ color: 'var(--text)' }}>{x.l.lender}</span> <span className="mono font-semibold" style={{ color: clr }}>{x.rate}%</span></span>
                      )
                    })}
                    {highRate.length > 2 && (
                      <button type="button" onClick={() => setShowAllRates(v => !v)} className="ml-1.5 underline" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-faint)', cursor: 'pointer', font: 'inherit' }}>
                        {showAllRates ? 'less' : `+${highRate.length - 2}`}
                      </button>
                    )}
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        <NextMonthHeadsUp scope="loans" className="w-fit" />
        {/* ── TABLE ── */}
        <WhatIfBar count={pickedLoans.length} need={pickNeed} free={pickFree} billNow={totalEmi} income={monthlyIncomeTotal(incomeRows as any[])} onClear={wi.clear} />
        <div className="rounded-2xl overflow-hidden text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflowX: 'auto' }}>

          {/* Filter bar — sorting now lives on the column headers below (click a header, arrow shows direction) */}
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-base)' }}>
            <span className="text-[11px] hidden sm:inline" style={{ color: 'var(--text-faint)' }}>Click a column header to sort</span>
            <div className="flex items-center gap-2 flex-wrap ml-auto">
<FilterMenu allLabel="All types" noun="types" multiple={false} allCount={(loans as any[]).length}
                options={['Personal Loan','Home Loan','Car Loan','Bike Loan','Gold Loan','Education Loan','Business Loan'].filter(t => (loans as any[]).some((l: any) => (l.loanType || 'Personal Loan') === t)).map(t => ({ id: t, count: (loans as any[]).filter((l: any) => (l.loanType || 'Personal Loan') === t).length }))}
                selected={filterLoanType === 'All' ? new Set<string>() : new Set([filterLoanType])}
                onChange={sel => { setFilterLoanType(sel.size ? [...sel][0] : 'All'); wi.clear() }} />
              {(() => { const tickable = sorted.filter((l: any) => getEff(l).pending > 0); return (
                <SelectAllLink total={tickable.length} selected={tickable.filter((l: any) => wi.picked.has(String(l.id))).length}
                  onSelectAll={() => tickable.forEach((l: any) => { if (!wi.picked.has(String(l.id))) wi.toggle(String(l.id)) })} onClear={wi.clear} />
              ) })()}
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sorted.length} loan{sorted.length!==1?'s':''}</span>
            </div>
          </div>

          {/* Column headers — phones show card rows instead, so no headers there */}
          <div className="hidden md:grid px-4 py-2 text-[12px] font-medium border-b"
            style={{ gridTemplateColumns: COLS_MAIN, borderColor: 'var(--border)', color: 'var(--text-faint)' }}>
            <SortHeader label="Lender" col="lender" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            {showDebit && <SortHeader label="Debited from" col="debited" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />}
            <SortHeader label="EMI / month" col="emi" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Tenure" col="tenure" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <SortHeader label="To clear" col="toclear" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Paid %" col="paidpct" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <SortHeader label="Due" col="due" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" />
            <span className="text-center">Action</span>
          </div>

          {/* Rows */}
          {sorted.map((l: any, idx: number) => {
            const eff = getEff(l)
            const t = l.tenure ?? (eff.paid + eff.pending)
            const pct = t > 0 ? Math.round(eff.paid / t * 100) : 0
            const sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, eff.paid, l.principalPaid ?? undefined)
            const calcRate = (p: number, emi: number, n: number): number => {
              if (!p || !emi || !n) return 0
              let r = 0.01
              for (let i = 0; i < 1000; i++) {
                const f = p * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1) - emi
                const df = p * (Math.pow(1+r,n)*(1+n*r)-1) / Math.pow(Math.pow(1+r,n)-1,2) / (1+r)
                if (Math.abs(df) < 1e-15) break
                r = r - f/df
                if (Math.abs(f) < 0.01) break
              }
              return Math.round(r * 12 * 100 * 10) / 10
            }
            const rate = l.amount > 0 && l.emi > 0 && t > 0 ? calcRate(Number(l.amount), Number(l.emi), t) : Number(l.interestRate ?? 0)
            const paidKey = `loan-${l.id}`
            // Same shared paid rule (ticked = paid) every other page uses.
            const isPaid = isPaidThisMonth(paidKey, resolveDueDay(l), markedKeys as string[])
            const done = eff.pending === 0
            const missed = l.missedMonths ?? 0
            const isExp = expanded === l.id

            return (
              <div key={l.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                {/* Phone row: one card per loan — name and EMI, then type, due day and EMIs left, and a progress
                    bar. Tap opens the same details and actions as the table row below (which phones don't show). */}
                <button type="button" className={`md:hidden w-full text-left px-4 py-3 ${done ? 'opacity-50' : ''}`}
                  style={{ background: isExp ? 'var(--bg-base)' : 'transparent' }}
                  aria-expanded={isExp} onClick={() => setExpanded(isExp ? null : l.id)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-[14px] truncate">{l.lender}</span>
                    <span className="mono font-semibold text-[14px] tabular-nums flex-shrink-0" style={{ color: 'var(--danger)' }}>{fmtINR(l.emi ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">
                      {(l.loanType || 'Loan').replace(/ Loan$/, '')}{resolveDueDay(l) ? ` · due ${ordinal(resolveDueDay(l)!)}` : ''}
                      {missed > 0 && <span style={{ color: 'var(--danger)' }}> · {missed} missed</span>}
                    </span>
                    <span className="flex-shrink-0 tabular-nums">{done ? '✓ closed' : isPaid ? '✓ paid this month' : `${eff.pending} left`}</span>
                  </div>
                  {!done && t > 0 && (
                    <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--success)' }} />
                    </div>
                  )}
                </button>

                {/* Main row (tablet and desktop) */}
                <div
                  className="hidden md:grid items-center px-4 py-3 cursor-pointer transition-colors"
                  style={{ gridTemplateColumns: COLS_MAIN, background: isExp ? 'var(--bg-base)' : 'transparent' }}
                  onMouseEnter={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : l.id)}>

                  {/* Lender */}
                  <div className={`flex items-start gap-1.5 min-w-0 ${done ? 'opacity-40' : ''}`}>
                    {!done && <PickBox checked={wi.picked.has(String(l.id))} onToggle={() => wi.toggle(String(l.id))} label={`Add ${l.lender} to the what-if`} />}
                    <ChevronDown size={12} className="flex-shrink-0 mt-1" style={{color:'var(--text-faint)',transform:isExp?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s'}}/>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[13px]">{l.lender}</span>
                        {missed > 0 && <span className="text-[11px] text-red-400">⚠ {missed} missed</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px]" style={{color:'var(--text-faint)'}}>{l.loanType}{l.amount ? ' · ' + fmtINR(l.amount) : ''}</span>
                        {rate > 0 && (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{background:rate>12?'color-mix(in srgb, var(--danger) 15%, transparent)':rate>8?'color-mix(in srgb, var(--warning) 15%, transparent)':'color-mix(in srgb, var(--success) 15%, transparent)',
                                    color:rate>12?'var(--danger)':rate>8?'var(--warning)':'var(--success)'}}>
                            {isNaN(rate)||!isFinite(rate)?'—':rate.toFixed(1)+'%'} {rate>12?'⚠ HIGH':rate>8?'MED':'✓ LOW'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Debited From */}
                  {showDebit && <div className="text-center">
                    {l.debitAccount
                      ? <span className="text-[11px] font-medium">{l.debitAccount}</span>
                      : <span className="text-[11px]" style={{color:'var(--text-faint)'}}>—</span>}
                  </div>}

                  {/* EMI */}
                  <div className="text-right">
                    <div className="font-semibold mono" style={{ color: 'var(--danger)' }}>{fmtINR(l.emi)}</div>
                  </div>

                  {/* Tenure — total months, how many paid vs remaining, and a progress indicator all
                      in one place. Was squeezed into a small sub-line under EMI ("{paid}/{t} paid")
                      with no remaining-months figure anywhere but the "To clear" date; pulled into
                      its own column since total/paid/remaining is a distinct question from the money
                      columns either side of it. */}
                  <div className="text-center">
                    <div className="font-semibold mono text-[12px]">{eff.paid}/{t} <span style={{color:'var(--text-faint)', fontWeight:400}}>mo</span></div>
                    <div className="text-[11px] mt-0.5 font-semibold" style={{ color: eff.pending === 0 ? 'var(--success)' : 'var(--text-faint)' }}>
                      {eff.pending === 0 ? '✓ done' : `${eff.pending} left`}
                    </div>
                    <div style={{width:36,height:3,background:'color-mix(in srgb, var(--text) 10%, transparent)',borderRadius:2,margin:'3px auto 0'}}>
                      <div style={{width:`${pct}%`,height:3,borderRadius:2,background: pct > 75 ? 'var(--success)' : pct > 40 ? 'var(--info)' : 'var(--danger)'}}/>
                    </div>
                  </div>

                  {/* To clear */}
                  <div className="text-right">
                    <div className="font-semibold mono" style={{ color: 'var(--warning)' }}>{fmtINR(sp.princLeft + sp.intLeft)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      {eff.pending > 0 ? (() => {
                        const d = new Date()
                        d.setMonth(d.getMonth() + eff.pending)
                        return `Clears ${d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}`
                      })() : '✓ Done'}
                    </div>
                    {l.currentValue > 0 && (() => {
                      const equity = l.currentValue - sp.princLeft
                      return equity > 0
                        ? <div className="text-[11px] mt-0.5" style={{color:'var(--success)'}}>↑ {fmtINR(equity)} equity</div>
                        : <div className="text-[11px] mt-0.5" style={{color:'var(--danger)'}}>↓ {fmtINR(Math.abs(equity))} underwater</div>
                    })()}
                  </div>

                  {/* % done */}
                  <div className="text-center">
                    <span className="text-[13px] font-bold mono" style={{ color: pct > 75 ? 'var(--success)' : pct > 40 ? 'var(--info)' : 'var(--danger)' }}>
                      {pct}%
                    </span>
                    <div style={{width:36,height:3,background:'color-mix(in srgb, var(--text) 10%, transparent)',borderRadius:2,margin:'3px auto 0'}}>
                      <div style={{width:`${pct}%`,height:3,borderRadius:2,background: pct > 75 ? 'var(--success)' : pct > 40 ? 'var(--info)' : 'var(--danger)'}}/>
                    </div>
                  </div>

                  {/* Due date */}
                  <div className="text-center">
                    {(()=>{
                      const day = l.dueDay || (l.startDate ? new Date(l.startDate).getDate() : null)
                      if (!day) return <span style={{color:'var(--text-faint)'}}>—</span>
                      const now2 = new Date()
                      const today2 = now2.getDate()
                      let diff2 = day - today2
                      if (diff2 < -7) diff2 = (new Date(now2.getFullYear(), now2.getMonth()+1, 0).getDate() - today2) + day
                      const color2 = isPaid ? 'var(--success)' : diff2 <= 0 ? 'var(--danger)' : diff2 <= 3 ? 'var(--danger)' : diff2 <= 7 ? 'var(--warning)' : 'var(--text-faint)'
                      return isPaid
                        ? <span style={{color:'var(--success)',fontSize:11}}>✓ Paid</span>
                        : diff2 <= 0
                          ? <span style={{color:'var(--danger)',fontSize:11,fontWeight:600}}>Overdue</span>
                          : <span style={{color:color2,fontSize:11,fontWeight: diff2<=3?600:400}}>{diff2}d left</span>
                    })()}
                  </div>

                  {/* Action */}
                  <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                    <button title="Edit" className="w-7 h-7 rounded flex items-center justify-center transition-all hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setModal({open:true,loan:l})}}><Pencil size={11}/></button>
                    {!done && (
                      <button title={isPaid?'Mark Unpaid':'Mark Paid'}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] transition-all font-bold"
                        style={{background:isPaid?'color-mix(in srgb, var(--success) 20%, transparent)':'color-mix(in srgb, var(--text) 8%, transparent)',color:isPaid?'var(--success)':'var(--text-faint)',border:`1px solid ${isPaid?'color-mix(in srgb, var(--success) 40%, transparent)':'color-mix(in srgb, var(--text) 13%, transparent)'}`}}
                        onClick={()=>markMut.mutate(paidKey)}>
                        {isPaid?'✓':'○'}
                      </button>
                    )}



                    <button title="Delete" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${l.lender}?`,onConfirm:()=>deleteMut.mutate(l),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                </div>

                {/* Expanded */}
                {isExp && (
                  <div className="px-4 pb-4 pt-1" style={{ background: 'var(--bg-base)', borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                    {/* Split row */}
                    {(() => {
                      const principalPaid = sp.principalPaid ?? 0
                      const totalInterest = sp.intPaid + sp.intLeft
                      const barTotal = principalPaid + sp.intPaid + sp.princLeft + sp.intLeft
                      const segPct = (v: number) => barTotal > 0 ? (v / barTotal) * 100 : 0
                      const totalInterestPct = (l.amount ?? 0) > 0 ? (totalInterest / l.amount) * 100 : 0
                      const totalPayable = barTotal
                      const totalCostInclFee = totalPayable + (l.processingFee ?? 0)
                      return (
                        <div className="mb-3">
                          {/* Total payable / total interest badges */}
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Total Payable (Principal + Interest)</span>
                            <span className="text-[13px] font-bold mono">{fmtINR(totalPayable)}</span>
                          </div>
                          {(l.processingFee ?? 0) > 0 && (
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Total Cost (incl. processing fee)</span>
                              <span className="text-[13px] font-bold mono">{fmtINR(totalCostInclFee)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Total Interest (paid + left)</span>
                            <span className="text-[13px] font-bold mono" style={{ color: 'var(--purple)' }}>
                              {fmtINR(totalInterest)}{' '}
                              <span className="text-[11px] font-normal" style={{ color: 'var(--text-faint)' }}>
                                ({isFinite(totalInterestPct) ? totalInterestPct.toFixed(1) : '—'}% of loan)
                              </span>
                            </span>
                          </div>

                          {/* Proportion bar: principal paid | interest paid | principal left | interest left */}
                          <div className="flex w-full rounded-full overflow-hidden mb-3" style={{ height: 8, background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
                            <div style={{ width: `${segPct(principalPaid)}%`, background: 'var(--info)' }} />
                            <div style={{ width: `${segPct(sp.intPaid)}%`, background: '#94a3b8' }} />
                            <div style={{ width: `${segPct(sp.princLeft)}%`, background: 'var(--warning)' }} />
                            <div style={{ width: `${segPct(sp.intLeft)}%`, background: 'var(--danger)' }} />
                          </div>

                          {/* 2x2 grid: Paid row / Left row */}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Principal paid', val: principalPaid, color: 'var(--info)' },
                              { label: 'Interest paid', val: sp.intPaid, color: '#94a3b8' },
                              { label: 'Principal left', val: sp.princLeft, color: 'var(--warning)' },
                              { label: 'Interest left', val: sp.intLeft, color: 'var(--danger)' },
                            ].map(m => (
                              <div key={m.label} className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-card)' }}>
                                <div className="text-[12px] mb-1" style={{ color: 'var(--text-faint)' }}>{m.label}</div>
                                <div className="mono font-semibold" style={{ color: m.color }}>{fmtINR(m.val)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Statement input */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      <span>Principal remaining (from bank statement):</span>
                      <input className="input w-36 text-[13px] py-1" type="number" placeholder="e.g. 3,45,000"
                        defaultValue={l.principalPaid || ''}
                        onBlur={e => { const val = +e.target.value; if (val !== (l.principalPaid ?? 0)) loansApi.update(l.id!, { ...l, principalPaid: val }).then(() => qc.invalidateQueries({ queryKey: ['loans'] })) }} />
                      {!sp.fromStatement && <span className="text-yellow-400">enter for accurate split</span>}
                      {sp.capped && <span className="text-yellow-400" title="A loan can't have more principal left than its remaining instalments repay, so the EMI total is used instead of the statement figure.">⚠ statement says {fmtINR(sp.statementPrincipal ?? 0)}, but {eff.pending} EMIs × {fmtINR(l.emi ?? 0)} = {fmtINR(sp.princLeft)} — using that</span>}
                    </div>

                    {/* Extra details: processing fee / notes (debit account now shown in main row) */}
                    {(l.processingFee || l.notes) && (
                      <div className="rounded-lg px-3 py-2.5 mb-3 flex flex-col gap-1.5" style={{ background: 'var(--bg-card)' }}>
                        {l.processingFee > 0 && (
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Processing fee:</span>
                            <span className="font-medium mono">{fmtINR(l.processingFee)}</span>
                          </div>
                        )}
                        {l.notes && (
                          <div className="flex items-start gap-2 text-[11px]">
                            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-faint)' }}>Notes:</span>
                            <span className="whitespace-pre-wrap">{l.notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button className="btn-secondary btn-sm" onClick={() => setModal({ open: true, loan: l })}><Pencil size={12} /> Edit</button>
                      <button className="btn btn-sm text-blue-400" style={{ background: 'color-mix(in srgb, var(--info) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 20%, transparent)' }}
                        onClick={() => setInputModal({ open: true, title: `Prepay — ${l.lender}`, message: `Principal: ${fmtINR(sp.princLeft)}\nEMI: ${fmtINR(l.emi ?? 0)}/mo · ${eff.pending} months left\n\nEnter prepayment amount:`, onConfirm: (v: string) => { const amt = Math.min(+v, sp.princLeft), saved = Math.floor(amt / (l.emi ?? 1)), intSaved = Math.round(saved * (sp.intLeft / eff.pending)); setInputModal(null); setCalcModal({ type: 'prepay', loan: l, result: { sp, amount: amt, monthsSaved: saved, intSaved, newPrincipalRemaining: Math.round(sp.princLeft - amt), eff } }) } })}>
                        Prepay
                      </button>
                      <button className="btn btn-sm text-purple-400" style={{ background: 'color-mix(in srgb, var(--purple) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--purple) 20%, transparent)' }}
                        onClick={() => setInputModal({ open: true, title: `Foreclose — ${l.lender}`, message: `Principal: ${fmtINR(sp.princLeft)}\nInterest saved: ${fmtINR(sp.intLeft)}\n\nBank penalty %:`, placeholder: '2', type: 'number', onConfirm: (p: string) => { const pct2 = +p || 0, penalty = Math.round(sp.princLeft * pct2 / 100); setCalcModal({ type: 'foreclose', loan: l, result: { sp, penaltyPct: pct2, penalty, totalToClose: Math.round(sp.princLeft + penalty), intSaved: Math.round(sp.intLeft), netBenefit: Math.round(sp.intLeft - penalty) } }); setInputModal(null) } })}>
                        Foreclose
                      </button>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                          Missed:
                          <button className="btn btn-xs bg-red-500/10 text-red-400" onClick={() => missedMut.mutate({ id: l.id!, missed: Math.max(0, l.missedMonths - 1) })}>−</button>
                          <span className={`mono font-bold ${l.missedMonths > 0 ? 'text-red-400' : ''}`}>{l.missedMonths ?? 0}</span>
                          <button className="btn btn-xs bg-red-500/10 text-red-400" onClick={() => missedMut.mutate({ id: l.id!, missed: (l.missedMonths ?? 0) + 1 })}>+</button>
                        </span>
                        <button className="btn-danger btn-xs" onClick={() => setConfirmModal({ message: 'Delete loan?', onConfirm: () => deleteMut.mutate(l), label: 'Delete' })}><Trash2 size={11} /></button>
                        {done && <button className="btn btn-xs text-green-400" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)' }} onClick={() => setConfirmModal({ message: 'Archive to Closed?', onConfirm: () => setPendingForecloseSale(l), label: 'Archive' })}><Archive size={11} /></button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer */}
          <div className="hidden md:grid px-4 py-3 text-[13px] font-bold border-t"
            style={{ gridTemplateColumns: COLS_MAIN, borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-faint)' }}>
            {/* Same column template as the header and rows (it had its own, one column short, so the totals
                drifted up to 73px off their columns): one cell per column, blanks where nothing adds up. */}
            <span>{filteredActiveLoans.length} active{filterLoanType!=='All'?` (${filterLoanType})`:''}</span>
            {showDebit && <span></span>}
            <span className="text-right mono" style={{ color: 'var(--danger)' }}>{fmtINR(filteredTotalEmi)}/mo</span>
            <span></span>
            <span className="text-right mono" style={{ color: 'var(--warning)' }}>{fmtINR(filteredTotalPending + filteredTotalIntLeft)}</span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </>)}

      {/* MODALS */}
      {modal.open && (
        <Modal title={modal.loan.id ? 'Edit Loan' : 'Add Loan'} onClose={() => { setModal({ open: false, loan: {} }); setFormErrors({}) }}
          footer={<><button className="btn-secondary" onClick={() => { setModal({ open: false, loan: {} }); setFormErrors({}) }}>Cancel</button><button className="btn-primary" disabled={saveMut.isPending || Object.keys(validateLoan(modal.loan)).length > 0} onClick={() => { const errs = validateLoan(modal.loan); if (Object.keys(errs).length > 0) { setFormErrors(errs); return; } saveMut.mutate(modal.loan) }}>{saveMut.isPending ? 'Saving...' : 'Save'}</button></>}>
          <div className="form-grid">
            <FormField label="Lender *"><input className={"input" + (formErrors.lender ? ' border-red-500' : '')} value={modal.loan.lender || ''} onChange={e => { setModal(m => ({ ...m, loan: { ...m.loan, lender: e.target.value } })); setFormErrors(er => ({...er, lender:''})) }} />{formErrors.lender && <p className="text-[11px] text-red-400 mt-1">{formErrors.lender}</p>}</FormField>
            <FormField label="Loan type"><select className="select" value={modal.loan.loanType || 'Personal Loan'} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, loanType: e.target.value } }))}>
              <option>Personal Loan</option><option>Home Loan</option><option>Car Loan</option><option>Bike Loan</option><option>Gold Loan</option><option>Education Loan</option><option>Business Loan</option>
            </select></FormField>
            <FormField label="Loan Amount / Received (₹) *"><input className={"input" + (formErrors.amount ? ' border-red-500' : '')} type="number" value={modal.loan.amount || ''} onChange={e => { setModal(m => ({ ...m, loan: { ...m.loan, amount: +e.target.value } })); setFormErrors(er => ({...er, amount:'', emi:''})) }} />{formErrors.amount && <p className="text-[11px] text-red-400 mt-1">{formErrors.amount}</p>}</FormField>
            <FormField label="EMI/month (₹) *"><input className={"input" + (formErrors.emi ? ' border-red-500' : '')} type="number" value={modal.loan.emi || ''} onChange={e => { setModal(m => ({ ...m, loan: { ...m.loan, emi: +e.target.value } })); setFormErrors(er => ({...er, emi:''})) }} />{formErrors.emi && <p className="text-[11px] text-red-400 mt-1">{formErrors.emi}</p>}</FormField>
            <FormField label="Tenure (months) *"><input className={"input" + (formErrors.tenure ? ' border-red-500' : '')} type="number" value={modal.loan.tenure || ''} onChange={e => { setModal(m => ({ ...m, loan: { ...m.loan, tenure: +e.target.value } })); setFormErrors(er => ({...er, tenure:''})) }} />{formErrors.tenure && <p className="text-[11px] text-red-400 mt-1">{formErrors.tenure}</p>}</FormField>
            <FormField label="Start Date *"><input className={"input" + (formErrors.startDate ? ' border-red-500' : '')} type="date" value={modal.loan.startDate || ''} onChange={e => { setModal(m => ({ ...m, loan: { ...m.loan, startDate: e.target.value } })); setFormErrors(er => ({...er, startDate:''})) }} />{formErrors.startDate && <p className="text-[11px] text-red-400 mt-1">{formErrors.startDate}</p>}</FormField>
            <FormField label="Due day"><input className="input" type="number" min={1} max={31} placeholder="1–31" value={modal.loan.dueDay || ''} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, dueDay: +e.target.value } }))} /></FormField>
            <MoreFields>
            <FormField label="Asset Current Value (₹)"><input className="input" type="number" placeholder="e.g. car current value" value={modal.loan.currentValue || ''} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, currentValue: +e.target.value || undefined } }))} /></FormField>
            <FormField label="EMI debited from (bank/account)"><input className="input" placeholder="e.g. HDFC ••1234" value={modal.loan.debitAccount || ''} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, debitAccount: e.target.value } }))} /></FormField>
            <FormField label="Loan account last 4 digits"><input className="input mono" inputMode="numeric" maxLength={4} placeholder="e.g. 1234" value={modal.loan.last4 || ''} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, last4: e.target.value.replace(/\D/g, '').slice(0, 4) || null } }))} /></FormField>
            <FormField label="Processing fee (₹)"><input className="input" type="number" value={modal.loan.processingFee || ''} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, processingFee: +e.target.value || undefined } }))} /></FormField>
            <FormField label="Notes" className="form-full"><textarea className="input" rows={2} value={modal.loan.notes || ''} onChange={e => setModal(m => ({ ...m, loan: { ...m.loan, notes: e.target.value } }))} /></FormField>
            </MoreFields>
          </div>
        </Modal>
      )}
      {inputModal?.open && <InputModal title={inputModal.title} message={inputModal.message} placeholder={inputModal.placeholder || 'Enter amount'} type={inputModal.type} onConfirm={inputModal.onConfirm} onClose={() => setInputModal(null)} />}
      {calcModal.type === 'prepay' && calcModal.result && (
        <AlertModal title={`Prepayment — ${calcModal.loan?.lender}`}
          lines={[
            { label: 'Prepay amount', value: fmtINR(calcModal.result.amount), bold: true },
            { label: 'Months saved', value: `${calcModal.result.monthsSaved}`, color: 'text-green-400', bold: true },
            { label: 'Interest saved', value: fmtINR(calcModal.result.intSaved), color: 'text-green-400' },
            { label: 'New principal', value: fmtINR(calcModal.result.newPrincipalRemaining), color: 'text-green-400' },
          ]}
          onClose={() => setCalcModal({ type: null, loan: null, result: null })}
          actions={[{ label: 'Update principal', onClick: () => { saveMut.mutate({ ...calcModal.loan, principalPaid: calcModal.result.newPrincipalRemaining }); setCalcModal({ type: null, loan: null, result: null }); toast.success('Updated!') } }]}
        />
      )}
      {calcModal.type === 'foreclose' && calcModal.result && (
        <AlertModal title={`Foreclose — ${calcModal.loan?.lender}`}
          lines={[
            { label: 'Principal', value: fmtINR(calcModal.result.sp.princLeft) },
            { label: `Penalty ${calcModal.result.penaltyPct}%`, value: fmtINR(calcModal.result.penalty), color: 'text-red-400' },
            { label: 'Total to close', value: fmtINR(calcModal.result.totalToClose), bold: true, color: 'text-red-400' },
            { label: 'Interest saved', value: fmtINR(calcModal.result.intSaved), color: 'text-green-400' },
            { label: 'Net benefit', value: `${calcModal.result.netBenefit > 0 ? '+' : ''}${fmtINR(calcModal.result.netBenefit)}`, color: calcModal.result.netBenefit > 0 ? 'text-green-400' : 'text-red-400', bold: true },
          ]}
          onClose={() => setCalcModal({ type: null, loan: null, result: null })}
        />
      )}
      {pendingForecloseSale && (
        <InputModal title={`Close — ${pendingForecloseSale.lender}`} message="Recovery amount (0 = none)" placeholder="0" type="number"
          onConfirm={v => { doCloseLoanMut.mutate({ l: pendingForecloseSale, salePrice: +v }); setPendingForecloseSale(null) }}
          onClose={() => setPendingForecloseSale(null)}
        />
      )}
      {confirmModal && <ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </div>
  )
}
