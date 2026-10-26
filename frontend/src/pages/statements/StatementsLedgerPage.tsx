import SegTabs from '../../components/common/SegTabs'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsApi, statementAccountsApi, dataManagementApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState } from '../../components/common'
import { SectionCard, FilterBar, compact, money } from '../../components/statements/shared'

type Tab = 'loans' | 'people' | 'other'

export default function StatementsLedgerPage() {
  const qc = useQueryClient()
  const { account, profile, period } = useStatementFilterStore()
  const deps = [account, profile, period]
  const [tab, setTab] = useState<Tab>('loans')
  const [open, setOpen] = useState<string | null>(null)

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  const loansQ = useQuery({ queryKey: ['stmt-loans', ...deps], queryFn: () => analyticsApi.loans(account) })
  const peopleQ = useQuery({ queryKey: ['stmt-ledger-upi', ...deps], queryFn: () => analyticsApi.ledger('upi', account) })
  const otherQ = useQuery({ queryKey: ['stmt-ledger-other', ...deps], queryFn: () => analyticsApi.ledger('other', account) })

  // Was only checking loans/people/other for loading and loans alone for error — a failure in
  // accounts or years (both feed FilterBar below) rendered as a silently-broken filter bar instead
  // of the error state.
  if (accountsQ.isLoading || yearsQ.isLoading || loansQ.isLoading || peopleQ.isLoading || otherQ.isLoading) return <LoadingSpinner />
  if (accountsQ.isError || yearsQ.isError || loansQ.isError || peopleQ.isError || otherQ.isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const rows = tab === 'loans'
    ? (loansQ.data || []).map(l => ({ key: 'L' + l.lender, name: l.lender, inA: Number(l.taken || 0), outA: Number(l.paid || 0), n: l.transactions, txns: l.txns || [] }))
    : ((tab === 'people' ? peopleQ.data : otherQ.data) || []).map(x => ({ key: tab + x.name, name: x.name, inA: Number(x.received || 0), outA: Number(x.paid || 0), n: x.transactions, txns: x.txns || [] }))

  const totIn = rows.reduce((s, r) => s + r.inA, 0)
  const totOut = rows.reduce((s, r) => s + r.outA, 0)
  const inWord = tab === 'loans' ? 'Taken' : 'Received'
  const outWord = tab === 'loans' ? 'Paid' : 'Sent'

  const balInfo = (r: typeof rows[number]) => {
    const b = r.inA - r.outA
    if (b > 0.5) return { txt: 'You owe ' + compact(b), col: 'var(--danger)' }
    if (b < -0.5) return { txt: (tab === 'loans' ? 'Paid off · +' + compact(-b) + ' extra' : 'Owed to you ' + compact(-b)), col: 'var(--success)' }
    return { txt: 'Settled', col: 'var(--text-faint)' }
  }

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Lending & loans — Taken vs returned" action={<strong>{rows.length} {tab === 'loans' ? 'lenders' : 'counterparties'}</strong>} />
      <FilterBar years={yearsQ.data || []} accounts={accountsQ.data || []} />

      <SectionCard>
        <div className="mb-3"><SegTabs options={[{id:'loans',label:'Loans'},{id:'people',label:'People'},{id:'other',label:'Other'}] as any} value={tab as any} onChange={(k:any)=>{ setTab(k); setOpen(null) }} /></div>
        <div className="text-[11px] font-bold pb-3 mb-1" style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
          {inWord} <b style={{ color: 'var(--success)' }}>{compact(totIn)}</b> · {outWord} <b style={{ color: 'var(--danger)' }}>{compact(totOut)}</b> · {rows.length} {tab === 'loans' ? 'lenders' : 'counterparties'}
        </div>

        {rows.length ? rows.map(r => {
          const isO = open === r.key
          const bi = balInfo(r)
          return (
            <div key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setOpen(isO ? null : r.key)} className="w-full grid items-center gap-2 py-3 text-left" style={{ gridTemplateColumns: '1fr auto', background: isO ? 'var(--bg-base)' : 'transparent' }}>
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{isO ? '▾ ' : '▸ '}{r.name}</strong>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: bi.col }}>{bi.txt} <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>· {Number(r.n || 0).toLocaleString('en-IN')} txns</span></div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="font-bold text-sm" style={{ color: 'var(--success)' }}>+{compact(r.inA)}</span><br />
                  <span className="font-bold text-sm" style={{ color: 'var(--danger)' }}>−{compact(r.outA)}</span>
                </div>
              </button>
              {isO && (
                <div className="pb-3">
                  {(r.txns || []).map((t, i) => (
                    <div key={t.id || i} className="grid items-center gap-2 py-1.5 text-[11px]" style={{ gridTemplateColumns: '78px 1fr auto', borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-faint)' }}>{t.date || '—'}</span>
                      <span className="truncate" title={t.description}>{t.description || t.merchant || '—'}</span>
                      <b style={{ color: t.direction === 'DEBIT' ? 'var(--danger)' : 'var(--success)' }}>{t.direction === 'DEBIT' ? '−' : '+'}{money(t.amount)}</b>
                    </div>
                  ))}
                  {!(r.txns || []).length && <div className="text-[11px] py-1.5" style={{ color: 'var(--text-faint)' }}>No transaction detail.</div>}
                </div>
              )}
            </div>
          )
        }) : <EmptyState icon="⇄" title={tab === 'loans' ? 'No loans detected for this profile' : 'No two-way counterparties — nothing both received and returned'} />}

        <p className="text-[11px] mt-3" style={{ color: 'var(--text-faint)' }}>
          {tab === 'loans'
            ? 'Taken = disbursements in · Paid = repayments/EMIs out · Balance = Taken − Paid (positive = still owed).'
            : 'Received = money in from them · Sent = money out to them · only two-way counterparties are shown.'}
        </p>
      </SectionCard>
    </div>
  )
}
