import { ICON, Glyph } from '../components/common/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi, insuranceApi, expensesApi, incomeApi, peopleOweApi, closedLoansApi, snapshotApi, paidMarksApi } from '../api'
import api from '../api/axios'
import { fmtINR } from '../utils/format'
import { Download, Upload, FileText, AlertCircle } from 'lucide-react'
import { PageHeader } from '../components/common'
import { useState, useRef } from 'react'
const lastBackupKey = '__finflow_last_backup__'
import toast from 'react-hot-toast'

function toCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0]).filter(k => k !== 'user' && k !== 'emis' && k !== 'spends')
  const header = keys.join(',')
  const lines = rows.map(r => keys.map(k => {
    const v = r[k] ?? ''
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
  }).join(','))
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `finflow_${filename}_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  toast.success(`${filename}.csv downloaded`)
}

function downloadJSON(data: Record<string, any[]>) {
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), version: '3.1', ...data }, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `finflow_backup_${new Date().toISOString().slice(0,10)}.json`
  a.click()
  toast.success('Full backup downloaded')
}

export default function ExportPage() {
  const qc = useQueryClient()
  const qLoans = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const qCards = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const qPersonal = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const qSavings = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const qInvestments = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const qInsurance = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const qExpenses = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const qIncome = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const qPeopleOwe = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApi.getAll })
  const qClosedLoans = useQuery({ queryKey: ['closed-loans'], queryFn: closedLoansApi.getAll })
  const qEarnings = useQuery({ queryKey: ['earnings'], queryFn: () => api.get('/earnings').then(r => r.data.data) })
  const { data: loans = [] } = qLoans
  const { data: cards = [] } = qCards
  const { data: personal = [] } = qPersonal
  const { data: savings = [] } = qSavings
  const { data: investments = [] } = qInvestments
  const { data: insurance = [] } = qInsurance
  const { data: expenses = [] } = qExpenses
  const { data: income = [] } = qIncome
  const { data: peopleOwe = [] } = qPeopleOwe
  const { data: closedLoans = [] } = qClosedLoans
  const { data: earnings = [] } = qEarnings

  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [previewData, setPreviewData] = useState<any>(null)
  const [importLog, setImportLog] = useState<string[]>([])
  const [importDone, setImportDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Snapshots and paid-marks were missing from the "full backup". Snapshots are historical
     net-worth records — they cannot be recomputed from current data, so losing them loses history
     permanently. Paid-marks carry which items were ticked in which month. A backup without them is
     not a backup of the account. */
  const qSnapshots = useQuery({ queryKey: ['snapshots'], queryFn: snapshotApi.getAll })
  const qPaidMarks = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  const { data: snapshots = [] } = qSnapshots
  const { data: paidMarks = [] } = qPaidMarks
  const allData = { loans, cards, personal, savings, investments, insurance, expenses, income, peopleOwe, closedLoans, earnings, snapshots, paidMarks }

  // A backup built while any of the 13 source queries is still loading (or failed outright) would
  // silently write empty/partial arrays into the JSON/CSV — indistinguishable from "you genuinely
  // have zero records" until the user tries to restore it and finds their data gone. Gate the
  // export actions on every query having actually succeeded.
  const allQueries = [qLoans, qCards, qPersonal, qSavings, qInvestments, qInsurance, qExpenses, qIncome, qPeopleOwe, qClosedLoans, qEarnings, qSnapshots, qPaidMarks]
  const anyLoading = allQueries.some(q => q.isLoading)
  const failedQueries = allQueries.filter(q => q.isError)
  const anyError = failedQueries.length > 0
  const exportDisabled = anyLoading || anyError

  const sections = [
    { key: 'loans',      label: 'Loans',           icon: ICON.loan, data: loans,      count: loans.length },
    { key: 'cards',      label: 'Credit cards',     icon: ICON.card, data: cards.map(c => ({ ...c, emis: undefined, spends: undefined })), count: cards.length },
    { key: 'personal',   label: 'I Owe',            icon: ICON.iowe, data: personal,   count: personal.length },
    { key: 'savings',    label: 'Savings / Chit',   icon: ICON.savings, data: savings,    count: savings.length },
    { key: 'investments',label: 'Investments',      icon: ICON.investment, data: investments,count: investments.length },
    { key: 'insurance',  label: 'Insurance',        icon: ICON.insurance, data: insurance,  count: insurance.length },
    { key: 'expenses',   label: 'Expenses',         icon: ICON.bill, data: expenses,   count: expenses.length },
    { key: 'income',     label: 'Income',           icon: ICON.income, data: income,     count: income.length },
    { key: 'peopleOwe',  label: 'People owe me',    icon: ICON.oweMe, data: peopleOwe, count: peopleOwe.length },
    { key: 'closedLoans',label: 'Closed loans',     icon: ICON.closed, data: closedLoans,count: closedLoans.length },
    { key: 'earnings',   label: 'Earnings history',  icon: ICON.earnings, data: earnings,    count: earnings.length },
  ]

  // Minimal shape/type check run before each item is sent to the API. A hand-edited or malformed
  // backup can have the right keys with the wrong type (or be missing them outright) — the backend
  // may accept that silently (garbage record) or reject it with an opaque message, either way the
  // user never learns which record or which field was the problem. Required fields mirror what
  // each entity's own Add-form already treats as mandatory (see e.g. LoansPage's validateLoan,
  // CreditCardsPage's validateCard, InsurancePage's validateInsurance).
  const REQUIRED_FIELDS: Record<string, { field: string; type: 'string' | 'number' }[]> = {
    loans:       [{ field: 'lender', type: 'string' }, { field: 'amount', type: 'number' }],
    income:      [{ field: 'label',  type: 'string' }, { field: 'amount', type: 'number' }],
    expenses:    [{ field: 'label',  type: 'string' }, { field: 'amount', type: 'number' }],
    personal:    [{ field: 'person', type: 'string' }, { field: 'amount', type: 'number' }],
    savings:     [{ field: 'name',   type: 'string' }, { field: 'monthly', type: 'number' }],
    investments: [{ field: 'name',   type: 'string' }, { field: 'monthly', type: 'number' }],
    insurance:   [{ field: 'name',   type: 'string' }, { field: 'premium', type: 'number' }],
    peopleOwe:   [{ field: 'person', type: 'string' }, { field: 'amount', type: 'number' }],
    closedLoans: [{ field: 'lender', type: 'string' }],
    earnings:    [{ field: 'label',  type: 'string' }, { field: 'monthlyAmount', type: 'number' }],
    cards:       [{ field: 'banker', type: 'string' }],
  }
  // Singular, human-readable name for each section, used to point at the exact failing record —
  // "Loan #3: missing 'lender'" instead of a bare "1 failed" that gives no way to find the culprit.
  const ENTITY_LABEL: Record<string, string> = {
    loans: 'Loan', income: 'Income', expenses: 'Expense', personal: 'I Owe',
    savings: 'Saving', investments: 'Investment', insurance: 'Insurance',
    peopleOwe: 'Person Owed', closedLoans: 'Closed Loan', earnings: 'Earning', cards: 'Card',
  }
  const validateRequired = (sectionKey: string, item: any): string | null => {
    const rules = REQUIRED_FIELDS[sectionKey]
    if (!rules) return null
    for (const r of rules) {
      const v = item?.[r.field]
      if (r.type === 'string') {
        if (typeof v !== 'string' || !v.trim()) return `missing '${r.field}'`
      } else {
        if (typeof v !== 'number' || Number.isNaN(v)) return `missing or invalid '${r.field}' (expected a number)`
      }
    }
    return null
  }

  const previewJSON = (file: File) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        setPreviewData({ data, fileName: file.name })
      } catch { toast.error('Invalid JSON file') }
    }
    reader.readAsText(file)
  }

  const importFromJSON = async (file: File) => {
    setImporting(true)
    setImportLog([])
    setImportDone(false)
    const log: string[] = []

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      log.push(`📂 Loaded backup from ${data.exportedAt ?? 'unknown date'}`)
      setImportLog([...log])

      const strip = (obj: any) => {
        const { id, user, createdAt, updatedAt, ...rest } = obj
        // Remove null values for required fields, provide defaults
        const clean: any = {}
        for (const [k, v] of Object.entries(rest)) {
          if (v !== null && v !== undefined) clean[k] = v
        }
        return clean
      }

      // Helper to import a section
      // Fetch existing items to detect duplicates by checking lender/name/label + amount
      const importSection = async (items: any[], label: string, createFn: (item: any) => Promise<any>, sectionKey: string) => {
        if (!items?.length) { log.push(`⏭ ${label}: empty`); setImportLog([...log]); return }
        let ok = 0, skip = 0, fail = 0
        const failDetails: string[] = []
        const entityName = ENTITY_LABEL[sectionKey] ?? label
        let idx = 0
        for (const item of items) {
          idx++
          // Gate: check the item's shape before it ever reaches the API. A missing or
          // wrong-typed required field is skipped here with a specific reason instead of being
          // sent on and either silently rejected or, worse, silently accepted as a garbage record.
          const validationError = validateRequired(sectionKey, item)
          if (validationError) {
            fail++
            failDetails.push(`${entityName} #${idx}: ${validationError}`)
            continue
          }
          try {
            await createFn(strip(item))
            ok++
          } catch (e: any) {
            const msg = e?.response?.data?.message ?? e?.message ?? ''
            if (msg.includes('duplicate') || msg.includes('already exists') || e?.response?.status === 409) skip++
            else fail++
          }
        }
        const parts = [`${ok} imported`]
        if (skip > 0) parts.push(`${skip} duplicate`)
        if (fail > 0) parts.push(`${fail} failed`)
        log.push(`${fail > 0 ? '⚠️' : '✅'} ${label}: ${parts.join(', ')}`)
        failDetails.forEach(d => log.push(`   ⚠ ${d}`))
        setImportLog([...log])
      }

      const totalSections = 13
      let doneSection = 0
      const trackSection = async (fn: () => Promise<void>) => { await fn(); doneSection++; setImportProgress(Math.round(doneSection/totalSections*100)) }

      await trackSection(() => importSection(data.loans,       'Loans',         (i) => loansApi.create(i),       'loans'))
      await trackSection(() => importSection(data.income,      'Income',        (i) => incomeApi.create(i),      'income'))
      await trackSection(() => importSection(data.expenses,    'Expenses',      (i) => expensesApi.create(i),    'expenses'))
      await trackSection(() => importSection(data.personal,    'I Owe',         (i) => personalEmiApi.create(i), 'personal'))
      await trackSection(() => importSection(data.savings,     'Savings',       (i) => savingsApi.create(i),     'savings'))
      await trackSection(() => importSection(data.investments, 'Investments',   (i) => investmentsApi.create(i), 'investments'))
      await trackSection(() => importSection(data.insurance,   'Insurance',     (i) => insuranceApi.create(i),   'insurance'))
      await trackSection(() => importSection(data.peopleOwe,   'People Owe Me', (i) => peopleOweApi.create(i),   'peopleOwe'))
      await trackSection(() => importSection(data.closedLoans, 'Closed Loans',  (i) => closedLoansApi.create(i), 'closedLoans'))
      await trackSection(() => importSection(data.earnings,    'Earnings',      (i) => api.post('/earnings', i).then(r => r.data.data), 'earnings'))

      // Cards with EMIs and spends
      if (data.cards?.length) {
        let ok = 0, fail = 0
        const failDetails: string[] = []
        let idx = 0
        for (const card of data.cards) {
          idx++
          const validationError = validateRequired('cards', card)
          if (validationError) {
            fail++
            failDetails.push(`Card #${idx}: ${validationError}`)
            continue
          }
          try {
            const { emis, spends, ...cardData } = card
            const res = await cardsApi.create(strip(cardData))
            const newCardId = (res as any)?.id ?? (res as any)?.data?.id
            if (newCardId && emis?.length) {
              for (const emi of emis) {
                try { await api.post(`/credit-cards/${newCardId}/emis`, strip(emi)) } catch {}
              }
            }
            if (newCardId && spends?.length) {
              for (const sp of spends) {
                try { await api.post(`/credit-cards/${newCardId}/spends`, strip(sp)) } catch {}
              }
            }
            ok++
          } catch {
            fail++
            failDetails.push(`Card #${idx}: create failed`)
          }
        }
        log.push(`${fail > 0 ? '⚠️' : '✅'} Credit Cards: ${ok} imported (with EMIs & spends)${fail > 0 ? `, ${fail} failed` : ''}`)
        failDetails.forEach(d => log.push(`   ⚠ ${d}`))
        setImportLog([...log])
      }

      // Snapshots — historical net-worth figures. Restored as-is via /snapshots/restore rather than
      // recomputed, since live data has moved on since the month they describe; this was previously
      // silently dropped (backed up but never read back on import).
      await trackSection(async () => {
        if (!data.snapshots?.length) { log.push('⏭ Snapshots: empty'); setImportLog([...log]); return }
        try {
          const count = await snapshotApi.restore(data.snapshots)
          log.push(`✅ Snapshots: ${count} restored`)
        } catch (e: any) {
          log.push(`⚠️ Snapshots: restore failed (${e?.response?.data?.message ?? e?.message ?? 'unknown error'})`)
        }
        setImportLog([...log])
      })

      // Paid marks — /paid-marks only tracks the CURRENT month (see MonthlyPaidMarkService), so a
      // backup can only ever contain this month's checkmarks, not full history — a backend scope
      // limit, not something fixable from here. `toggle` flips state, so only toggle keys that
      // aren't already marked, otherwise re-running an import would un-mark them.
      await trackSection(async () => {
        if (!data.paidMarks?.length) { log.push('⏭ Paid Marks: empty'); setImportLog([...log]); return }
        try {
          const current: string[] = await paidMarksApi.getAll()
          const currentSet = new Set(current)
          let restored = 0
          for (const key of data.paidMarks as string[]) {
            if (!currentSet.has(key)) { await paidMarksApi.toggle(key); restored++ }
          }
          const already = data.paidMarks.length - restored
          log.push(`✅ Paid Marks: ${restored} restored (this month only)${already > 0 ? `, ${already} already set` : ''}`)
        } catch (e: any) {
          log.push(`⚠️ Paid Marks: restore failed (${e?.response?.data?.message ?? e?.message ?? 'unknown error'})`)
        }
        setImportLog([...log])
      })

      log.push('🎉 Import complete! Refresh the page to see your data.')
      setImportLog([...log])
      setImportDone(true)
      qc.invalidateQueries()

    } catch (e: any) {
      log.push(`❌ Error: ${e.message}`)
      setImportLog([...log])
    }
    setImporting(false)
  }

  return (
    <div className="space-y-4 text-[13px]">
      {/* Import Preview Modal */}
      {previewData && (
        <div className="modal-overlay" onClick={() => setPreviewData(null)}>
          <div className="modal-box" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Import preview</div></div>
            <div className="modal-body space-y-2">
              <div className="text-[11px]" style={{color:'var(--text-muted)'}}>File: {previewData.fileName}</div>
              {Object.entries(previewData.data).filter(([k,v])=>Array.isArray(v)&&(v as any[]).length>0).map(([k,v])=>(
                <div key={k} className="flex justify-between text-[13px] px-2 py-1 rounded" style={{background:'color-mix(in srgb, var(--text) 4%, transparent)'}}>
                  <span className="capitalize">{k.replace(/([A-Z])/g,' $1')}</span>
                  <span className="mono text-orange-400">{(v as any[]).length} {(v as any[]).length === 1 ? 'record' : 'records'}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer flex gap-2">
              <button className="btn-secondary flex-1" onClick={()=>setPreviewData(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={()=>{ importFromJSON(new Blob([JSON.stringify(previewData.data)],{type:'application/json'}) as any); setPreviewData(null) }}>
                Import all
              </button>
            </div>
          </div>
        </div>
      )}
      <PageHeader title="Export & backup"/>

      {exportDisabled && (
        <div className="rounded-2xl p-3 flex items-center gap-2 text-[12px]" style={{background:'color-mix(in srgb, var(--danger) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--danger) 30%, transparent)', color:'var(--danger)'}}>
          <AlertCircle size={14} />
          {anyLoading
            ? 'Still loading your data — please wait before backing up, so the backup is not missing anything.'
            : `Failed to load ${failedQueries.length} data type${failedQueries.length > 1 ? 's' : ''} — backup is disabled until this is fixed, to avoid saving an incomplete file. Try refreshing the page.`}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
        <button className="btn-primary flex items-center gap-2" disabled={exportDisabled} onClick={() => {
          downloadJSON(allData)
          // backup tracked locally
        }}>
          <Download size={16} /> Full Backup (JSON)
        </button>
      </div>
      </div>

      {/* Data summary strip */}
      <div className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-x-5 gap-y-2 flex-wrap" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
        <div className="text-[12px] font-semibold" style={{color:'var(--text)'}}>Your data <span className="font-normal" style={{color:'var(--text-faint)'}}>· {sections.reduce((s,x)=>s+x.count,0)} records</span></div>
        {sections.filter(s => s.count > 0).map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
            <Glyph icon={s.icon} size={13} className="inline-block" />
            <span style={{color:'var(--text-muted)'}}>{s.label}</span>
            <span className="mono font-bold text-green-400">{s.count}</span>
          </div>
        ))}
        <div className="ml-auto text-[11px]" style={{color:'var(--text-faint)'}} title="Backup format v3.1 — includes maturity values and current values">backup format v3.1</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export */}
        <div className="rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="px-4 py-3 border-b text-[12px] font-medium " style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Export as CSV
          </div>
          <div className="divide-y" style={{borderColor:"color-mix(in srgb, var(--text) 5%, transparent)"}}>
            {sections.map(s => (
              <div key={s.key} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--text) 7%, transparent)', color: 'var(--text-muted)' }}><Glyph icon={s.icon} size={16} /></span>
                  <div>
                    <div className="font-semibold text-[13px]">{s.label}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.count} {s.count === 1 ? 'record' : 'records'}</div>
                  </div>
                </div>
                <button className="btn-secondary btn-sm flex items-center gap-1.5" disabled={s.count === 0 || exportDisabled}
                  onClick={() => toCSV(s.data as any[], s.key)}>
                  <FileText size={13} /> CSV
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Import / Restore */}
        <div className="space-y-4">
          <div className="rounded-2xl p-5" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
            <div className="font-bold mb-1 flex items-center gap-2"><Upload size={16} /> Restore from JSON Backup</div>
            <p className="text-[13px] mb-4" style={{ color: 'var(--text-muted)' }}>
              Upload a <code>finflow_backup_*.json</code> file to restore all your data into a fresh account.
            </p>
            <input ref={fileRef} type="file" accept=".json" className="hidden"
              onChange={e => { if (e.target.files?.[0]) previewJSON(e.target.files[0]) }} />
            <button className="btn-primary flex items-center gap-2 w-full justify-center"
              onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload size={16} /> {importing ? 'Importing...' : 'Choose Backup File'}
            </button>
            {importing && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] mb-1" style={{color:'var(--text-muted)'}}>
                  <span>Importing...</span><span>{importProgress}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
                  <div className="h-full bg-orange-500 rounded-full transition-all" style={{width:`${importProgress}%`}} />
                </div>
              </div>
            )}
          </div>

          {importLog.length > 0 && (
            <div className="rounded-2xl p-4" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
              <div className="text-[12px] font-medium mb-3" style={{ color: 'var(--text-muted)' }}>Import log</div>
              <div className="space-y-1.5">
                {importLog.map((line, i) => (
                  <div key={i} className="text-[13px] font-mono">{line}</div>
                ))}
              </div>
              {importDone && (
                <button className="btn-primary btn-sm mt-4 w-full" onClick={() => window.location.reload()}>
                  Reload app
                </button>
              )}
            </div>
          )}

          <div className="card p-4 border border-yellow-500/20 bg-yellow-500/5">
            <div className="text-[11px] font-bold text-yellow-400 mb-2 flex items-center gap-2"><AlertCircle size={13} /> How to restore</div>
            <ol className="text-[11px] space-y-1.5" style={{ color: 'var(--text-muted)' }}>
              <li>1. Sign in to the account you want to restore into (a fresh account works best).</li>
              <li>2. Come to Export &amp; Backup and choose your JSON backup file.</li>
              <li>3. Your loans, cards, savings, income and the rest are re-created.</li>
              <li>4. Click Reload App when it finishes.</li>
            </ol>
            <div className="text-[11px] mt-3 text-yellow-400">
              💡 Keep a fresh Full Backup (JSON) somewhere safe after any big change — it is the quickest way back if something goes wrong.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
