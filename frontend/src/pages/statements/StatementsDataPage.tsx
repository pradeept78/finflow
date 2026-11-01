import { ICON } from '../../components/common/icons'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { statementsApi, dataManagementApi, statementAccountsApi, type ImportOverride, type ColumnMapping } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState, ConfirmModal } from '../../components/common'
import { CardHead, SectionCard, FilterBar, compact, money, formatTxDate } from '../../components/statements/shared'
import { ImportModal, type QueueItem } from '../../components/statements/ImportModal'
import toast from 'react-hot-toast'
import type { YearReview } from '../../types/statements'

export default function StatementsDataPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { account, profile, period } = useStatementFilterStore()
  const fileInput = useRef<HTMLInputElement>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [override, setOverride] = useState<ImportOverride>({ bank: 'HDFC Bank', type: 'DEBIT', number: '' })
  const [pwd, setPwd] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockErr, setUnlockErr] = useState('')
  const [colMap, setColMap] = useState<ColumnMapping>({})
  const [busy, setBusy] = useState(false)
  const [reclassMsg, setReclassMsg] = useState('')
  const [reviewYear, setReviewYear] = useState<number | null>(null)
  const [review, setReview] = useState<YearReview | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'year'; year: number } | { type: 'statement'; sourceFile: string; account?: string } | null>(null)

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  const statementsQ = useQuery({ queryKey: ['stmt-statement-rows', profile], queryFn: dataManagementApi.statements })

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['stmt-years'] })
    qc.invalidateQueries({ queryKey: ['stmt-statement-rows'] })
    qc.invalidateQueries({ queryKey: ['stmt-accounts'] })
    qc.invalidateQueries({ queryKey: ['stmt-summary'] })
  }

  const applyDetected = (x?: QueueItem['x']) => { if (x?.account) setOverride({ bank: x.account.bankName, type: x.account.accountType, number: x.account.maskedNumber }) }

  const inspectFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setPwd(''); setUnlockErr(''); setColMap({})
    const results: QueueItem[] = []
    for (const file of Array.from(files)) {
      try { const x = await statementsApi.inspect(file); results.push({ file, x }) }
      catch { toast.error(`${file.name}: inspection failed`) }
    }
    setQueue(results)
    applyDetected(results[0]?.x)
    setColMap(results[0]?.x?.mapping || {})
    setBusy(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const next = (remaining: QueueItem[]) => { setQueue(remaining); setPwd(''); setUnlockErr(''); applyDetected(remaining[0]?.x); setColMap(remaining[0]?.x?.mapping || {}) }

  const remap = async (newMap: ColumnMapping) => {
    setColMap(newMap)
    const cur = queue[0]
    if (!cur) return
    try {
      const x = await statementsApi.inspect(cur.file, pwd ? { password: pwd } : undefined, newMap)
      const upd = { ...cur, x }
      setQueue(q => q.map((it, i) => (i === 0 ? upd : it)))
    } catch (e: any) { toast.error('Re-parse failed: ' + e.message) }
  }

  const unlock = async () => {
    const cur = queue[0]
    if (!cur || !pwd) return
    setUnlocking(true); setUnlockErr('')
    try {
      const x = await statementsApi.inspect(cur.file, { password: pwd })
      if (x.encrypted) setUnlockErr(x.wrongPassword ? 'That password did not unlock the PDF. Try again.' : 'This PDF is still locked.')
      else { setQueue(q => q.map((it, i) => (i === 0 ? { ...cur, x } : it))); applyDetected(x) }
    } catch (e: any) { setUnlockErr('Could not unlock: ' + e.message) } finally { setUnlocking(false) }
  }

  const confirmImport = async () => {
    const cur = queue[0]
    if (!cur) return
    setBusy(true)
    try {
      const out = await statementsApi.upload(cur.file, { ...override, password: pwd || undefined }, colMap)
      toast.success(out.encrypted ? `${cur.file.name} · locked — password needed` : `${cur.file.name} · ${out.added || 0} added · ${out.duplicates || 0} duplicates · ${out.parsed || 0} parsed`)
      const rest = queue.slice(1)
      next(rest)
      if (!rest.length) refreshAll()
    } catch (e: any) { toast.error('Import failed: ' + e.message) } finally { setBusy(false) }
  }

  const recompute = async () => {
    setBusy(true); setReclassMsg('')
    try {
      const out = await dataManagementApi.reclassify()
      setReclassMsg(`Recomputed ${Number(out.total || 0).toLocaleString('en-IN')} transactions · ${Number(out.updated || 0).toLocaleString('en-IN')} updated.`)
      refreshAll()
    } catch { setReclassMsg('Recompute failed. Is the backend running?') } finally { setBusy(false) }
  }

  const openYear = async (year: number) => {
    setBusy(true)
    try { setReview(await dataManagementApi.year(year, account)); setReviewYear(year) } finally { setBusy(false) }
  }

  const doDeleteYear = async (year: number) => {
    setBusy(true)
    try { await dataManagementApi.deleteYear(year, account); setDeleteTarget(null); setReview(null); setReviewYear(null); refreshAll(); toast.success(`Deleted ${year}`) } finally { setBusy(false) }
  }
  const doDeleteStatement = async (sourceFile: string, acc?: string) => {
    setBusy(true)
    try { await dataManagementApi.deleteStatement(sourceFile, acc); setDeleteTarget(null); refreshAll(); toast.success('Statement deleted') } finally { setBusy(false) }
  }

  // Was missing accountsQ entirely (used by FilterBar below) and never checked statementsQ.isError
  // — a failed statements fetch rendered as an empty "Uploaded statements will appear here" state,
  // indistinguishable from genuinely having nothing imported yet.
  if (accountsQ.isLoading || yearsQ.isLoading || statementsQ.isLoading) return <LoadingSpinner />
  if (accountsQ.isError || yearsQ.isError || statementsQ.isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const years = yearsQ.data || []
  const statements = statementsQ.data || []

  if (reviewYear && review) {
    return (
      <div className="space-y-4 text-[13px]">
        <button className="text-xs font-semibold" style={{ color: 'var(--info)' }} onClick={() => { setReview(null); setReviewYear(null) }}>← Back to data</button>
        <PageHeader title={`Year review — ${reviewYear}`} action={<button className="btn-danger btn-sm" onClick={() => setDeleteTarget({ type: 'year', year: reviewYear })}>Delete {reviewYear}</button>} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SectionCard><div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Actual spending</div><div className="text-lg font-semibold tracking-tight">{compact(review.spending)}</div></SectionCard>
          <SectionCard><div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Money in</div><div className="text-lg font-semibold tracking-tight">{compact(review.income)}</div></SectionCard>
          <SectionCard><div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Net cash flow</div><div className="text-lg font-semibold tracking-tight">{compact(review.netCashFlow)}</div></SectionCard>
          <SectionCard><div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Transactions</div><div className="text-lg font-semibold tracking-tight">{Number(review.transactions || 0).toLocaleString('en-IN')}</div><div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{review.accounts?.length || 0} account(s)</div></SectionCard>
        </div>
        <SectionCard>
          <CardHead eyebrow="Year activity" title={`${reviewYear} overview`} action={<button className="btn-secondary btn-sm" onClick={() => navigate('/statements/transactions?' + new URLSearchParams({ year: String(reviewYear) }))}>Open explorer →</button>} />
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Open the explorer to investigate every transaction from this year.</p>
        </SectionCard>
        {deleteTarget && (
          <ConfirmModal message={`Delete all transactions from ${reviewYear}? Other years, accounts and statements stay untouched.`}
            confirmLabel="Delete permanently" onConfirm={() => doDeleteYear(reviewYear)} onClose={() => setDeleteTarget(null)} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Data & imports" action={
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" disabled={busy} onClick={recompute}>{busy ? 'Recomputing…' : '↻ Recompute categories'}</button>
          <label className="btn-primary btn-sm cursor-pointer">
            + Import statements
            <input ref={fileInput} type="file" multiple accept=".pdf,.csv,.xlsx,.xls" className="hidden" onChange={e => inspectFiles(e.target.files)} />
          </label>
        </div>
      } />
      <FilterBar years={years} accounts={accountsQ.data || []} />

      {reclassMsg && <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'rgba(17,166,131,.12)', color: 'var(--success)' }}>{reclassMsg}</div>}

      <SectionCard>
        <CardHead eyebrow="Year by year" title="Imported history" />
        {years.length ? (
          <div className="space-y-1">
            {[...years].reverse().map(y => (
              <div key={y.year} className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
                <div><strong>{y.year}</strong><div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{Number(y.transactions || 0).toLocaleString('en-IN')} transactions · {Array.isArray(y.accounts) ? y.accounts.length : Number(y.accounts || 0)} accounts</div></div>
                <div className="text-right"><b>{money(y.spending)}</b><div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>spent · {money(y.income)} in</div></div>
                <div className="flex gap-1.5">
                  <button className="btn-secondary btn-xs" onClick={() => openYear(y.year)}>Review</button>
                  <button className="btn-danger btn-xs" onClick={() => setDeleteTarget({ type: 'year', year: y.year })}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={ICON.calendar} title="No imported years yet" />}
      </SectionCard>

      <SectionCard>
        <CardHead eyebrow="Statements" title="Uploaded files" />
        {statements.length ? (
          <div className="space-y-1">
            {statements.map(st => (
              <div key={(st.sourceFile || '') + (st.account || '')} className="flex items-center justify-between py-2 gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="min-w-0 flex-1"><strong className="block truncate" title={st.sourceFile}>{st.sourceFile}</strong><small style={{ color: 'var(--text-faint)' }}>{formatTxDate(st.from)} → {formatTxDate(st.to)} · {Number(st.transactions || 0).toLocaleString('en-IN')} transactions</small></div>
                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{st.account || '—'}</div>
                <button className="btn-danger btn-xs" onClick={() => setDeleteTarget({ type: 'statement', sourceFile: st.sourceFile, account: st.account })}>Delete</button>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={ICON.file} title="Uploaded statements will appear here" />}
      </SectionCard>

      {queue[0] && (
        <ImportModal item={queue[0]} override={override} setOverride={setOverride} onSkip={() => next(queue.slice(1))} onConfirm={confirmImport}
          pwd={pwd} setPwd={setPwd} onUnlock={unlock} unlocking={unlocking} unlockErr={unlockErr} colMap={colMap} onRemap={remap} />
      )}

      {deleteTarget && deleteTarget.type === 'year' && (
        <ConfirmModal message={`Delete all transactions from ${deleteTarget.year}? Other years, accounts and statements stay untouched.`}
          confirmLabel="Delete permanently" onConfirm={() => doDeleteYear(deleteTarget.year)} onClose={() => setDeleteTarget(null)} />
      )}
      {deleteTarget && deleteTarget.type === 'statement' && (
        <ConfirmModal message={`Delete the statement "${deleteTarget.sourceFile}"? Other statements stay untouched.`}
          confirmLabel="Delete permanently" onConfirm={() => doDeleteStatement(deleteTarget.sourceFile, deleteTarget.account)} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
