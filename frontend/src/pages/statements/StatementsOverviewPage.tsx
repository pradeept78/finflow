import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { analyticsApi, statementAccountsApi, dataManagementApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/common'
import { Kpi, CardHead, SectionCard, RankList, CategoryList, FilterBar, compact, money } from '../../components/statements/shared'

export default function StatementsOverviewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { account, profile, period } = useStatementFilterStore()
  const deps = [account, profile, period]

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  const summaryQ = useQuery({ queryKey: ['stmt-summary', ...deps], queryFn: () => analyticsApi.summary(account) })
  const monthlyQ = useQuery({ queryKey: ['stmt-monthly', ...deps], queryFn: () => analyticsApi.monthly(account) })
  const catsQ = useQuery({ queryKey: ['stmt-categories', ...deps], queryFn: () => analyticsApi.categories(account) })
  const merchantsQ = useQuery({ queryKey: ['stmt-merchants', ...deps], queryFn: () => analyticsApi.merchants(account) })
  const upiQ = useQuery({ queryKey: ['stmt-upi', ...deps], queryFn: () => analyticsApi.upi(account) })
  const insightsQ = useQuery({ queryKey: ['stmt-insights', ...deps], queryFn: () => analyticsApi.insights(account) })

  // Was only checking 3 of the 8 queries this page renders from — a failure in monthly/categories/
  // merchants/upi/insights rendered as a silently-empty section instead of the error state.
  const isLoading = accountsQ.isLoading || yearsQ.isLoading || summaryQ.isLoading || monthlyQ.isLoading || catsQ.isLoading || merchantsQ.isLoading || upiQ.isLoading || insightsQ.isLoading
  const isError = accountsQ.isError || yearsQ.isError || summaryQ.isError || monthlyQ.isError || catsQ.isError || merchantsQ.isError || upiQ.isError || insightsQ.isError

  const goTx = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    navigate(`/statements/transactions${qs ? '?' + qs : ''}`)
  }
  const openInsight = (i: { title: string; value?: string }) => {
    if (i.title === 'Peak month' && i.value) return goTx({ month: i.value, year: i.value.slice(0, 4), direction: 'DEBIT' })
    if (i.title === 'Largest category' && i.value) return goTx({ category: i.value, direction: 'DEBIT' })
    if (i.title === 'Top merchant' && i.value) return goTx({ counterparty: i.value, direction: 'DEBIT' })
    navigate('/statements/transactions')
  }

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const summary = summaryQ.data || {}
  const insights = insightsQ.data || []

  return (
    <div className="space-y-4 text-[13px]">
      {/* No big title: the top bar already says Statements and the tab says Overview — a second heading
          plus the filters used to fill half a phone screen before the first number. */}
      <FilterBar years={yearsQ.data || []} accounts={accountsQ.data || []} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Actual spending" value={compact(summary.totalSpending)} sub="Transfers & card payments excluded" accent />
        <Kpi label="Money in" value={compact(summary.totalCredits)} sub="Real credits / income" />
        <Kpi label="Net cash flow" value={compact(summary.netCashFlow)} sub="Money in minus spending" />
        <Kpi label="Total transactions" value={Number(summary.transactionCount || 0).toLocaleString('en-IN')} sub="Across all imports — view" onClick={() => goTx({})} />
        <Kpi label="Total debited" value={compact(summary.totalDebited)} sub="All money out (incl. transfers) — view" onClick={() => goTx({ direction: 'DEBIT' })} />
        <Kpi label="Total credited" value={compact(summary.totalCredited)} sub="All money in (incl. transfers) — view" onClick={() => goTx({ direction: 'CREDIT' })} />
        <Kpi label="Card payments" value={compact(summary.cardPayments)} sub="Credit-card bills paid — view" onClick={() => goTx({ category: 'Credit Card Payment' })} />
        <Kpi label="EMI / loan" value={compact(summary.emiPayments)} sub="Loan & EMI outflow — view" onClick={() => goTx({ category: 'EMI / Loan' })} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <SectionCard className="md:col-span-2">
          <CardHead eyebrow="Spending trend" title="Your spending, month by month"
            action={<button className="text-xs font-semibold" style={{ color: 'var(--info)' }} onClick={() => navigate('/statements/spending')}>Explore spending →</button>} />
          {(monthlyQ.data || []).length === 0 ? (
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg px-4 py-3" style={{ background: 'var(--bg-hover)', border: '1px dashed var(--border)' }}>
              <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No spending to chart yet — import a bank or card statement and the monthly trend appears here.</div>
              <button className="btn-primary btn-sm" onClick={() => navigate('/statements/data')}>Import statement</button>
            </div>
          ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={monthlyQ.data || []}>
                <defs><linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.25} /><stop offset="100%" stopColor="#f97316" stopOpacity={0.02} /></linearGradient></defs>
                <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Area type="monotone" dataKey="amount" stroke="#f97316" strokeWidth={2} fill="url(#fillSpend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Top categories" title="Where it went" />
          <CategoryList data={(catsQ.data || []).slice(0, 6)} onClick={cat => goTx({ category: cat, direction: 'DEBIT' })} />
          <button className="btn-secondary w-full mt-2" onClick={() => navigate('/statements/spending')}>View full breakdown</button>
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Top merchants" title="Biggest spend" />
          <RankList data={(merchantsQ.data || []).slice(0, 7)} nameKey="merchant" onClick={name => goTx({ counterparty: name, direction: 'DEBIT' })} />
          <button className="btn-secondary w-full mt-2" onClick={() => navigate('/statements/people')}>Explore merchants</button>
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Upi" title="People & UPI" />
          <RankList data={(upiQ.data || []).slice(0, 7)} nameKey="name" onClick={name => goTx({ counterparty: name, direction: 'DEBIT' })} />
          <button className="btn-secondary w-full mt-2" onClick={() => navigate('/statements/people')}>View all people</button>
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Automatic insights" title="Things worth noticing" />
          {insights.length ? (
            <div className="space-y-1">
              {insights.slice(0, 4).map((i, n) => (
                <button key={n} onClick={() => openInsight(i)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors hover:bg-[var(--bg-hover)]">
                  <span>{['↗', '★', '◉', '◌'][n % 4]}</span>
                  <div className="min-w-0 flex-1">
                    <small className="block" style={{ color: 'var(--text-faint)' }}>{i.title}</small>
                    <strong className="block truncate">{i.value}</strong>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                      {i.amount != null && i.title !== 'Recurring detected' ? compact(i.amount) : i.title === 'Recurring detected' ? `${Number(i.amount || 0).toLocaleString('en-IN')} transactions` : ''} · {i.detail}
                    </p>
                  </div>
                  <b>→</b>
                </button>
              ))}
            </div>
          ) : <EmptyState icon="✨" title="Insights will appear after importing statements" />}
        </SectionCard>
      </div>
    </div>
  )
}
