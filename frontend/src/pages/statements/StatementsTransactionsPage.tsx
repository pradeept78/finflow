import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { transactionsApi, statementAccountsApi, dataManagementApi, type TxFilters } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { STATEMENT_CATEGORIES, STATEMENT_TX_TYPES } from '../../types/statements'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState } from '../../components/common'
import { Kpi, SectionCard, FilterBar, compact, money, formatTxDate, accountDisplay } from '../../components/statements/shared'
import { TransactionDetailModal } from '../../components/statements/TransactionDetailModal'
import toast from 'react-hot-toast'
import type { Transaction } from '../../types/statements'

export default function StatementsTransactionsPage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { account, profile, period } = useStatementFilterStore()

  const [q, setQ] = useState(searchParams.get('q') || '')
  const [year, setYear] = useState(searchParams.get('year') || '')
  const [month, setMonth] = useState(searchParams.get('month') || '')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [direction, setDirection] = useState(searchParams.get('direction') || '')
  const [type, setType] = useState(searchParams.get('transactionType') || '')
  const [counterparty, setCounterparty] = useState(searchParams.get('counterparty') || '')
  const [page, setPage] = useState(0)
  const [debouncedQ, setDebouncedQ] = useState(q)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkVals, setBulkVals] = useState({ category: '', transactionType: '', merchant: '' })

  // The `useState(searchParams.get(...))` initializers above only ever run once, on this
  // component's first mount. Several other pages (Overview, Spending, People, Debt Match) link
  // here with `?category=...`/`?counterparty=...`/etc via `goTx`-style navigation — because this is
  // the same route, React Router reuses the existing component instance rather than remounting it,
  // so a second navigation here with different query params was silently ignored and the filters
  // stayed on whatever they were first mounted (or since manually changed) to. Re-seed every filter
  // from the URL whenever the query string itself actually changes.
  useEffect(() => {
    setQ(searchParams.get('q') || '')
    setYear(searchParams.get('year') || '')
    setMonth(searchParams.get('month') || '')
    setCategory(searchParams.get('category') || '')
    setDirection(searchParams.get('direction') || '')
    setType(searchParams.get('transactionType') || '')
    setCounterparty(searchParams.get('counterparty') || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(0) }, [debouncedQ, year, month, category, direction, type, counterparty, account, profile, period])

  // Typing in the search box (or changing any other filter) only ever updated local state — none
  // of it was reflected back into the URL. So a browser refresh, or just re-mounting this route
  // (e.g. navigating away and back), reset every filter to whatever the URL happened to hold
  // (usually nothing), silently discarding what the user had typed. Mirror the current filters into
  // the URL (debounced on `q` so this doesn't rewrite history on every keystroke) so a reload
  // restores exactly what was there. `replace: true` avoids stacking a back-button entry per filter
  // change. This can't loop with the resync effect above: that one only re-fires when
  // `searchParams.toString()` actually changes, and writing back the same values it just read
  // produces an identical string, so it stays quiet.
  useEffect(() => {
    const params: Record<string, string> = {}
    if (debouncedQ) params.q = debouncedQ
    if (year) params.year = year
    if (month) params.month = month
    if (category) params.category = category
    if (direction) params.direction = direction
    if (type) params.transactionType = type
    if (counterparty) params.counterparty = counterparty
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, year, month, category, direction, type, counterparty])

  const filters: TxFilters = { q: debouncedQ, year: year || undefined, month: month || undefined, category, account, direction, transactionType: type, counterparty }
  const deps = [debouncedQ, year, month, category, direction, type, counterparty, account, profile, period, page]

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  const pageQ = useQuery({ queryKey: ['stmt-tx-page', ...deps], queryFn: () => transactionsApi.page(filters, page, 50) })
  const summaryQ = useQuery({ queryKey: ['stmt-tx-summary', ...deps.slice(0, -1)], queryFn: () => transactionsApi.summary(filters) })

  // Was keyed on `pageQ.data` — a new object reference on *any* refetch, including a background
  // refetch on window focus or the refresh() call after saving/deleting a single transaction, so
  // bulk selection silently vanished mid-workflow even though nothing the user did should have
  // cleared it. Key on the actual filter/page state instead — selection now only resets when the
  // user changes what's being viewed.
  useEffect(() => { setPicked(new Set()); setConfirmBulk(false); setEditMode(false) }, [...deps])

  const refresh = () => { qc.invalidateQueries({ queryKey: ['stmt-tx-page'] }); qc.invalidateQueries({ queryKey: ['stmt-tx-summary'] }) }

  const saveTx = async (id: number, patch: Partial<Transaction>) => { await transactionsApi.update(id, patch); refresh() }
  const deleteTx = async (id: number) => { await transactionsApi.delete(id); refresh(); toast.success('Deleted') }
  const bulkDelete = async () => { await transactionsApi.bulkDelete([...picked]); setPicked(new Set()); setConfirmBulk(false); refresh(); toast.success('Deleted') }
  const bulkUpdate = async () => {
    const patch: any = {}
    if (bulkVals.category) patch.category = bulkVals.category
    if (bulkVals.transactionType) patch.transactionType = bulkVals.transactionType
    if (bulkVals.merchant.trim()) patch.merchant = bulkVals.merchant.trim()
    if (Object.keys(patch).length) await transactionsApi.bulkUpdate([...picked], patch)
    setPicked(new Set()); setEditMode(false); setBulkVals({ category: '', transactionType: '', merchant: '' }); refresh()
  }

  const clearAll = () => { setQ(''); setYear(''); setMonth(''); setCategory(''); setDirection(''); setType(''); setCounterparty('') }
  const hasFilters = !!(q || year || month || category || direction || type || counterparty)

  // Was missing yearsQ (feeds the year dropdown / FilterBar) and summaryQ (feeds the Money out/in/
  // net KPI tiles — the most visible numbers on this page) from both checks. A failure in either
  // rendered those as a silent ₹0 instead of the error state.
  if (accountsQ.isLoading || yearsQ.isLoading || pageQ.isLoading || summaryQ.isLoading) return <LoadingSpinner />
  if (accountsQ.isError || yearsQ.isError || pageQ.isError || summaryQ.isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const tx = pageQ.data || { items: [], total: 0, pages: 0, page: 0 }
  const metrics = summaryQ.data || { out: 0, in: 0, net: 0, count: 0 }
  const pages = Math.max(tx.pages || 0, 1)
  const accounts = accountsQ.data || []
  const pageIds = tx.items.map(t => t.id)
  const allPicked = pageIds.length > 0 && pageIds.every(id => picked.has(id))
  const toggle = (id: number) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setPicked(p => { const n = new Set(p); if (allPicked) pageIds.forEach(id => n.delete(id)); else pageIds.forEach(id => n.add(id)); return n })

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Transaction explorer" action={<button className="btn-secondary btn-sm" onClick={() => transactionsApi.exportCsv(filters)}>↓ Export CSV</button>} />
      <FilterBar years={yearsQ.data || []} accounts={accounts} />

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Money out" value={compact(metrics.out)} sub="Debited in the current view" accent />
        <Kpi label="Money in" value={compact(metrics.in)} sub="Credited in the current view" />
        <Kpi label="Net flow" value={(metrics.net >= 0 ? '+' : '−') + compact(Math.abs(metrics.net))} sub="Money in minus money out" />
      </div>

      <SectionCard>
        <div className="flex items-center gap-2 mb-3">
          <input className="input flex-1 text-[13px] py-1.5" placeholder="Search merchant, UPI name, description..." value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn-secondary" disabled={!hasFilters} onClick={clearAll}>Clear filters</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <label className="flex flex-col gap-0.5 text-[11px]"><span style={{ color: 'var(--text-faint)' }}>YEAR</span>
            <select className="select text-[13px] py-1.5" value={year} onChange={e => setYear(e.target.value)}>
              <option value="">All years</option>
              {[...(yearsQ.data || [])].sort((a, b) => Number(b.year) - Number(a.year)).map(y => <option key={y.year} value={y.year}>{y.year}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]"><span style={{ color: 'var(--text-faint)' }}>MONTH</span>
            <input className="input text-[13px] py-1.5" type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]"><span style={{ color: 'var(--text-faint)' }}>CATEGORY</span>
            <select className="select text-[13px] py-1.5" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">All categories</option>{STATEMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]"><span style={{ color: 'var(--text-faint)' }}>TYPE</span>
            <select className="select text-[13px] py-1.5" value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="">All</option><option value="DEBIT">Debited</option><option value="CREDIT">Credited</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px]"><span style={{ color: 'var(--text-faint)' }}>FLOW</span>
            <select className="select text-[13px] py-1.5" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All</option>{STATEMENT_TX_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        {counterparty && <div className="mt-2"><button className="btn-secondary btn-xs" onClick={() => setCounterparty('')}>Counterparty: {counterparty} ×</button></div>}
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div><h2 className="text-sm font-bold">Transactions</h2><p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{tx.total.toLocaleString('en-IN')} total · 50 per page</p></div>
          <div className="flex items-center gap-2 flex-wrap">
            {picked.size > 0 && !editMode && !confirmBulk && (
              <>
                <button className="btn-secondary btn-xs" onClick={() => setEditMode(true)}>Edit selected ({picked.size})</button>
                <button className="btn-danger btn-xs" onClick={() => setConfirmBulk(true)}>Delete selected ({picked.size})</button>
              </>
            )}
            {picked.size > 0 && confirmBulk && (
              <>
                <span className="text-xs font-bold" style={{ color: 'var(--danger)' }}>Delete {picked.size}?</span>
                <button className="btn-secondary btn-xs" onClick={() => setConfirmBulk(false)}>Cancel</button>
                <button className="btn-danger btn-xs" onClick={bulkDelete}>Delete permanently</button>
              </>
            )}
            {picked.size > 0 && editMode && (
              <>
                <select className="select text-[11px]" value={bulkVals.category} onChange={e => setBulkVals(v => ({ ...v, category: e.target.value }))}>
                  <option value="">Category…</option>{STATEMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="select text-[11px]" value={bulkVals.transactionType} onChange={e => setBulkVals(v => ({ ...v, transactionType: e.target.value }))}>
                  <option value="">Type…</option>{STATEMENT_TX_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
                <input className="input text-[11px]" style={{ width: 160 }} placeholder="Rename merchant (optional)" value={bulkVals.merchant} onChange={e => setBulkVals(v => ({ ...v, merchant: e.target.value }))} />
                <button className="btn-secondary btn-xs" onClick={() => { setEditMode(false); setBulkVals({ category: '', transactionType: '', merchant: '' }) }}>Cancel</button>
                <button className="btn-primary btn-xs" onClick={bulkUpdate}>Apply to {picked.size}</button>
              </>
            )}
            <div className="flex items-center gap-1 text-xs">
              <button className="btn-secondary btn-xs" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>←</button>
              <span>{page + 1} / {pages}</span>
              <button className="btn-secondary btn-xs" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          </div>
        </div>

        {tx.items.length ? (<>
          {/* Phones: one block per transaction. The five-column table needed sideways scrolling there, with
              Category and the amount off-screen. */}
          <ul className="md:hidden -mx-1">
            {tx.items.map(t => (
              <li key={t.id} className="flex items-start gap-2.5 px-1 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <input type="checkbox" className="mt-1" aria-label={`Select transaction ${t.description ?? t.id}`} checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setSelected(t)}>
                  <span className="flex items-baseline justify-between gap-3">
                    <strong className="truncate text-[14px]">{t.merchant || 'Unknown'}</strong>
                    <span className="mono font-semibold tabular-nums flex-shrink-0" style={{ color: t.direction === 'DEBIT' ? 'var(--danger)' : 'var(--success)' }}>
                      {t.direction === 'DEBIT' ? '−' : '+'}{money(t.amount)}
                    </span>
                  </span>
                  <span className="block text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {formatTxDate(t.transactionDate)} · {t.category || 'Other'} · {accountDisplay(t.account, accounts)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[12px] " style={{ color: 'var(--text-muted)' }}>
                <th className="w-7"><input type="checkbox" aria-label="Select all transactions" checked={allPicked} onChange={toggleAll} /></th>
                <th className="text-left py-2">Date</th><th className="text-left">Transaction</th><th className="text-left">Account</th><th className="text-left">Category</th><th className="text-right">Amount</th>
              </tr></thead>
              <tbody>
                {tx.items.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }} className="hover:bg-[var(--bg-hover)]">
                    <td onClick={e => e.stopPropagation()} className="py-1.5"><input type="checkbox" aria-label={`Select transaction ${t.description ?? t.id}`} checked={picked.has(t.id)} onChange={() => toggle(t.id)} /></td>
                    <td className="cursor-pointer" onClick={() => setSelected(t)}>{formatTxDate(t.transactionDate)}</td>
                    <td className="cursor-pointer" onClick={() => setSelected(t)}>
                      <strong className="block truncate max-w-[220px]">{t.merchant || 'Unknown'}</strong>
                      <small className="block truncate max-w-[220px]" style={{ color: 'var(--text-faint)' }}>{t.description}</small>
                    </td>
                    <td className="cursor-pointer" onClick={() => setSelected(t)}>{accountDisplay(t.account, accounts)}</td>
                    <td className="cursor-pointer" onClick={() => setSelected(t)}>
                      {t.category || 'Other'}{t.transactionType && <small className="block" style={{ color: 'var(--text-faint)' }}>{t.transactionType}</small>}
                    </td>
                    <td className="cursor-pointer text-right font-bold" onClick={() => setSelected(t)} style={{ color: t.direction === 'DEBIT' ? 'var(--danger)' : 'var(--success)' }}>
                      {t.direction === 'DEBIT' ? '−' : '+'}{money(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>) : <EmptyState icon="🔍" title="No transactions match your filters" />}
      </SectionCard>

      {selected && <TransactionDetailModal tx={selected} accounts={accounts} onSave={saveTx} onDelete={deleteTx} onClose={() => setSelected(null)} />}
    </div>
  )
}
