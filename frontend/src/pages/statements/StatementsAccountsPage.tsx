import { ICON } from '../../components/common/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsApi, statementAccountsApi, dataManagementApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState } from '../../components/common'
import { compact, FilterBar } from '../../components/statements/shared'

export default function StatementsAccountsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile, period, account, setAccount } = useStatementFilterStore()

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  // `period` belongs in the key even though accountSummary() takes no direct params — the shared
  // X-From/X-To headers (see api/statements.ts's interceptor) mean the server response actually
  // does vary with the selected period, but react-query only refetches on a queryKey change. Missing
  // this meant switching period here kept serving the previous period's cached numbers.
  const statsQ = useQuery({ queryKey: ['stmt-account-summary', profile, period], queryFn: analyticsApi.accountSummary })

  // Was missing yearsQ — it feeds FilterBar's period dropdown, so a failed/slow years fetch
  // previously degraded that dropdown silently instead of showing the error state.
  if (accountsQ.isLoading || yearsQ.isLoading || statsQ.isLoading) return <LoadingSpinner />
  if (accountsQ.isError || yearsQ.isError || statsQ.isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const allAccounts = accountsQ.data || []
  // FilterBar's account selector previously changed the shared store but nothing on this page
  // ever read it back — picking an account here had no visible effect. Now it narrows the cards
  // shown to the one selected account (matching how the selector behaves on every other Statements
  // page).
  const accounts = account ? allAccounts.filter(a => a.accountKey === account) : allAccounts
  const statOf = (key: string) => (statsQ.data || []).find(s => s.account === key) || {} as any

  const openAccount = (key: string) => { setAccount(key); navigate('/statements/overview') }

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Accounts & cards" action={<strong>{accounts.length} accounts</strong>} />
      <FilterBar years={yearsQ.data || []} accounts={allAccounts} />

      {!allAccounts.length ? (
        <EmptyState icon={ICON.bank} title="No accounts yet" sub="Import your first statement to create an account" action={<button className="btn-primary" onClick={() => navigate('/statements/data')}>Go to Data &amp; Imports</button>} />
      ) : !accounts.length ? (
        <EmptyState icon={ICON.bank} title="No account matches the selected filter" />
      ) : (
        <div className="grid md:grid-cols-3 gap-3">
          {accounts.map(a => {
            const st = statOf(a.accountKey)
            const isCard = a.accountType === 'CREDIT_CARD'
            return (
              <button key={a.accountKey} onClick={() => openAccount(a.accountKey)}
                className="rounded-2xl p-4 text-left flex items-start gap-3 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
                  style={{ background: isCard ? 'color-mix(in srgb, var(--info) 15%, transparent)' : 'color-mix(in srgb, var(--success) 15%, transparent)', color: isCard ? 'var(--info)' : 'var(--success)' }}>
                  {isCard ? 'CC' : '₹'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{a.bankName}</div>
                  <strong className="block truncate">{a.displayName}</strong>
                  <small style={{ color: 'var(--text-faint)' }}>{isCard ? 'Credit card' : 'Debit / savings account'}</small>
                  <div className="flex gap-3 mt-2 flex-wrap text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    <span>OUT <b style={{ color: 'var(--danger)' }}>{compact(st.spending)}</b></span>
                    <span>IN <b style={{ color: 'var(--success)' }}>{compact(st.credits)}</b></span>
                    <span>{Number(st.transactions || 0).toLocaleString('en-IN')} txns</span>
                  </div>
                </div>
                <b>→</b>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
