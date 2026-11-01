import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsApi, statementAccountsApi, dataManagementApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState } from '../../components/common'
import { CardHead, SectionCard, RankList, FilterBar, compact, money } from '../../components/statements/shared'

type ExploreKind = 'people' | 'merchants' | 'financial'

function CounterpartyExplorer({ kind, back, goTx }: { kind: ExploreKind; back: () => void; goTx: (name: string) => void }) {
  const { account, profile, period } = useStatementFilterStore()
  const config: Record<ExploreKind, { title: string; fetch: () => Promise<any[]>; nameKey: string; desc: string }> = {
    people: { title: 'People & UPI', fetch: () => analyticsApi.allUpi(account), nameKey: 'name', desc: 'Every person-to-person UPI counterparty found in your statements.' },
    merchants: { title: 'Merchants', fetch: () => analyticsApi.allMerchants(account), nameKey: 'merchant', desc: 'Every merchant grouped across your imported statements.' },
    financial: { title: 'Financial counterparties', fetch: () => analyticsApi.allFinancial(account), nameKey: 'name', desc: 'Banks, lenders, EMIs and other financial counterparties.' },
  }
  const cfg = config[kind]
  const [q, setQ] = useState('')
  // Was destructuring only `isLoading` — a failed fetch fell back to `data = []` and rendered
  // "No counterparties match your search", indistinguishable from a genuinely empty result.
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ['stmt-explore', kind, account, profile, period], queryFn: cfg.fetch })
  const filtered = data.filter((x: any) => String(x[cfg.nameKey] || '').toLowerCase().includes(q.toLowerCase()))
  const totalDebit = filtered.reduce((s: number, x: any) => s + Number(x.debitAmount ?? x.amount ?? 0), 0)
  const totalCredit = filtered.reduce((s: number, x: any) => s + Number(x.creditAmount ?? 0), 0)

  return (
    <div className="space-y-4 text-[13px]">
      <button className="text-xs font-semibold" style={{ color: 'var(--info)' }} onClick={back}>← Back to People &amp; Merchants</button>
      <PageHeader title={cfg.title} action={<span className="text-xs" style={{ color: 'var(--text-faint)' }}>{data.length} groups</span>} />
      <input className="input" placeholder="Search a person or merchant..." value={q} onChange={e => setQ(e.target.value)} />
      <SectionCard>
        <div className="text-[11px] mb-2" style={{ color: 'var(--text-faint)' }}>
          {filtered.length} groups · <span style={{ color: 'var(--danger)' }}>{compact(totalDebit)} debit</span> · <span style={{ color: 'var(--success)' }}>{compact(totalCredit)} credit</span>
        </div>
        {isLoading ? <LoadingSpinner /> : isError ? <ErrorState message="Make sure the backend is running." onRetry={() => refetch()} /> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[12px] " style={{ color: 'var(--text-muted)' }}>
                <th className="text-left py-2">#</th><th className="text-left">Counterparty</th><th className="text-right">Txns</th>
                <th className="text-right">Debit</th><th className="text-right">Credit</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map((x: any, i: number) => {
                  const debit = Number(x.debitAmount ?? x.amount ?? 0)
                  const credit = Number(x.creditAmount ?? 0)
                  return (
                    <tr key={x[cfg.nameKey] || i} className="cursor-pointer hover:bg-[var(--bg-hover)]" style={{ borderTop: '1px solid var(--border)' }} onClick={() => goTx(x[cfg.nameKey])}>
                      <td className="py-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>{String(i + 1).padStart(2, '0')}</td>
                      <td className="font-semibold">{x[cfg.nameKey] || 'Unknown'}</td>
                      <td className="text-right">{Number(x.transactions || 0).toLocaleString('en-IN')}</td>
                      <td className="text-right font-bold" style={{ color: 'var(--danger)' }}>{debit ? money(debit) : '—'}</td>
                      <td className="text-right font-bold" style={{ color: 'var(--success)' }}>{credit ? money(credit) : '—'}</td>
                      <td className="text-right">→</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!filtered.length && <EmptyState icon="🔍" title="No counterparties match your search" />}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default function StatementsPeoplePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { account, profile, period } = useStatementFilterStore()
  const deps = [account, profile, period]
  const [explore, setExplore] = useState<ExploreKind | null>(null)
  const [q, setQ] = useState('')

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  const upiQ = useQuery({ queryKey: ['stmt-upi', ...deps], queryFn: () => analyticsApi.upi(account) })
  const merchantsQ = useQuery({ queryKey: ['stmt-merchants', ...deps], queryFn: () => analyticsApi.merchants(account) })
  const financialQ = useQuery({ queryKey: ['stmt-financial', ...deps], queryFn: () => analyticsApi.financial(account) })

  // Was only checking 2 of the 5 queries this page renders from — a failure in accounts/years/
  // financial rendered as a silently-empty section instead of the error state.
  const isLoading = accountsQ.isLoading || yearsQ.isLoading || upiQ.isLoading || merchantsQ.isLoading || financialQ.isLoading
  const isError = accountsQ.isError || yearsQ.isError || upiQ.isError || merchantsQ.isError || financialQ.isError

  const goTx = (name: string) => navigate(`/statements/transactions?${new URLSearchParams({ counterparty: name || '', direction: 'DEBIT' })}`)

  if (explore) return <CounterpartyExplorer kind={explore} back={() => setExplore(null)} goTx={goTx} />
  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const flt = (arr: any[] = [], key: string) => {
    const s = q.trim().toLowerCase()
    return s ? arr.filter(x => String(x[key] || '').toLowerCase().includes(s)) : arr
  }

  const cards: { eyebrow: string; title: string; data: any[]; nameKey: string; empty: string; kind: ExploreKind }[] = [
    { eyebrow: 'People & upi', title: 'Top people', data: flt(upiQ.data, 'name'), nameKey: 'name', empty: 'No person-to-person UPI spending found.', kind: 'people' },
    { eyebrow: 'Merchants', title: 'Top merchants', data: flt(merchantsQ.data, 'merchant'), nameKey: 'merchant', empty: 'No merchant spending found.', kind: 'merchants' },
    { eyebrow: 'Financial', title: 'Banks, cards, loans & EMIs', data: flt(financialQ.data, 'name'), nameKey: 'name', empty: 'No financial counterparties found.', kind: 'financial' },
  ]

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="People & merchants" action={<button className="btn-secondary btn-sm" onClick={() => navigate('/statements/ledger')}>⇄ Lending &amp; loans ledger</button>} />
      <FilterBar years={yearsQ.data || []} accounts={accountsQ.data || []} />
      <input className="input" placeholder="Search people, merchants or banks..." value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 420 }} />

      <div className="grid md:grid-cols-3 gap-3 [&>*]:min-w-0">
        {cards.map(c => (
          <SectionCard key={c.kind}>
            <CardHead eyebrow={c.eyebrow} title={c.title} action={
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-faint)' }}>{compact(c.data.reduce((s, x) => s + Number(x.amount || 0), 0))} · {c.data.length}</span>
                {!!c.data.length && (
                  <button className="text-[11px] font-semibold" style={{ color: 'var(--info)' }} onClick={() => setExplore(c.kind)}>Explore all →</button>
                )}
              </div>
            } />
            <RankList data={c.data.slice(0, 20)} nameKey={c.nameKey} subKey="transactions" onClick={goTx} />
            {!c.data.length && <EmptyState icon="🔍" title={q ? 'No matches for your search' : c.empty} />}
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
