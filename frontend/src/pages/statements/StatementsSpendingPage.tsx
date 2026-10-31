import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { analyticsApi, statementAccountsApi, dataManagementApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState } from '../../components/common'
import { CardHead, SectionCard, RankList, CategoryList, FilterBar, compact, money, CHART_COLORS } from '../../components/statements/shared'

export default function StatementsSpendingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { account, profile, period } = useStatementFilterStore()
  const deps = [account, profile, period]
  const [explore, setExplore] = useState(false)
  const [spendMode, setSpendMode] = useState<'spending' | 'all'>('spending')
  const [flow, setFlow] = useState<'out' | 'in'>('out')
  const isIn = flow === 'in'

  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })
  const monthlyQ = useQuery({ queryKey: ['stmt-monthly', ...deps], queryFn: () => analyticsApi.monthly(account) })
  const yearlyQ = useQuery({ queryKey: ['stmt-yearly', ...deps], queryFn: () => analyticsApi.yearly(account) })
  const incMonthlyQ = useQuery({ queryKey: ['stmt-inc-monthly', ...deps], queryFn: () => analyticsApi.incomeMonthly(account) })
  const incYearlyQ = useQuery({ queryKey: ['stmt-inc-yearly', ...deps], queryFn: () => analyticsApi.incomeYearly(account) })
  const catsQ = useQuery({ queryKey: ['stmt-categories', ...deps], queryFn: () => analyticsApi.categories(account) })
  const merchantsQ = useQuery({ queryKey: ['stmt-merchants', ...deps], queryFn: () => analyticsApi.merchants(account) })
  const upiQ = useQuery({ queryKey: ['stmt-upi', ...deps], queryFn: () => analyticsApi.upi(account) })
  const financialQ = useQuery({ queryKey: ['stmt-financial', ...deps], queryFn: () => analyticsApi.financial(account) })
  const outflowsQ = useQuery({ queryKey: ['stmt-outflows', ...deps], queryFn: () => analyticsApi.outflows(account) })
  const incomeQ = useQuery({ queryKey: ['stmt-income', ...deps], queryFn: () => analyticsApi.income(account) })

  // Was only checking 2 of the 12 queries this page renders from — a failure in accounts/years/
  // yearly/income-monthly/income-yearly/income/merchants/upi/financial/outflows rendered as a
  // silently-empty section instead of the error state.
  const isLoading = accountsQ.isLoading || yearsQ.isLoading || monthlyQ.isLoading || yearlyQ.isLoading || incMonthlyQ.isLoading || incYearlyQ.isLoading || catsQ.isLoading || merchantsQ.isLoading || upiQ.isLoading || financialQ.isLoading || outflowsQ.isLoading || incomeQ.isLoading
  const isError = accountsQ.isError || yearsQ.isError || monthlyQ.isError || yearlyQ.isError || incMonthlyQ.isError || incYearlyQ.isError || catsQ.isError || merchantsQ.isError || upiQ.isError || financialQ.isError || outflowsQ.isError || incomeQ.isError

  const goTx = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    navigate(`/statements/transactions${qs ? '?' + qs : ''}`)
  }

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const trend = isIn ? (incMonthlyQ.data || []) : (monthlyQ.data || [])
  const annual = isIn ? (incYearlyQ.data || []) : (yearlyQ.data || [])
  const flowColor = isIn ? '#11a683' : '#f97316'
  const cats = catsQ.data || []

  const norm = (arr: any[] = [], key: string) => arr.map(x => ({ name: x[key], amount: x.amount, transactions: x.transactions }))
  const finNonCard = (financialQ.data || []).filter((x: any) => !x.cardPayment)
  const spendingSpends = [...norm(merchantsQ.data, 'merchant'), ...norm(upiQ.data, 'name'), ...norm(finNonCard, 'name')]
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 20)
  const topSpends = spendMode === 'all' ? norm(outflowsQ.data, 'name') : spendingSpends

  if (explore) {
    return (
      <div className="space-y-4 text-[13px]">
        <button className="text-xs font-semibold" style={{ color: 'var(--info)' }} onClick={() => setExplore(false)}>← Back to Spending</button>
        <PageHeader title="Every spending category" />
        <SectionCard>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[12px] " style={{ color: 'var(--text-muted)' }}>
                <th className="text-left py-2">#</th><th className="text-left">Category</th><th className="text-right">Transactions</th><th className="text-right">Total</th><th></th>
              </tr></thead>
              <tbody>
                {cats.map((x, i) => (
                  <tr key={x.category || i} className="cursor-pointer hover:bg-[var(--bg-hover)]" style={{ borderTop: '1px solid var(--border)' }} onClick={() => goTx({ category: x.category || '', direction: 'DEBIT' })}>
                    <td className="py-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>{String(i + 1).padStart(2, '0')}</td>
                    <td className="font-semibold">{x.category || 'Other'}</td>
                    <td className="text-right">{Number(x.transactions || 0).toLocaleString('en-IN')}</td>
                    <td className="text-right font-bold">{money(x.amount)}</td>
                    <td className="text-right">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Spending analysis" />
      <FilterBar years={yearsQ.data || []} accounts={accountsQ.data || []} />

      <div className="flex justify-end">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button onClick={() => setFlow('out')} className="px-4 py-1.5 text-xs font-bold" style={{ background: !isIn ? '#171c2b' : 'transparent', color: !isIn ? '#fff' : 'var(--text-muted)' }}>Money out</button>
          <button onClick={() => setFlow('in')} className="px-4 py-1.5 text-xs font-bold" style={{ background: isIn ? '#11a683' : 'transparent', color: isIn ? '#fff' : 'var(--text-muted)' }}>Money in</button>
        </div>
      </div>

      <SectionCard>
        <CardHead eyebrow="Monthly" title={isIn ? 'Income trend' : 'Spending trend'}
          action={!isIn && <button className="text-xs font-semibold" style={{ color: 'var(--info)' }} onClick={() => setExplore(true)}>Explore all spending →</button>} />
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={trend} onClick={(e: any) => { if (!isIn && e?.activePayload?.[0]) goTx({ month: e.activePayload[0].payload.period, year: String(e.activePayload[0].payload.period).slice(0, 4), direction: 'DEBIT' }) }}>
              <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Area type="monotone" dataKey="amount" stroke={flowColor} fill={flowColor} fillOpacity={0.09} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-3 [&>*]:min-w-0">
        <SectionCard>
          <CardHead eyebrow="By year" title={isIn ? 'Annual income' : 'Annual spending'} />
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={annual}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="amount" fill={isIn ? '#11a683' : '#171c2b'} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Categories" title="Spending mix" action={<button className="text-xs font-semibold" style={{ color: 'var(--info)' }} onClick={() => setExplore(true)}>Explore all →</button>} />
          <div className="flex gap-3 items-center">
            <div style={{ width: 140, height: 140, flexShrink: 0 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={cats.slice(0, 8)} dataKey="amount" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {cats.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0"><CategoryList data={cats.slice(0, 8)} onClick={cat => goTx({ category: cat, direction: 'DEBIT' })} /></div>
          </div>
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Top spends" title="Where the most money went"
            action={
              <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <button onClick={() => setSpendMode('spending')} className="px-2.5 py-1 text-[11px] font-bold" style={{ background: spendMode === 'spending' ? '#171c2b' : 'transparent', color: spendMode === 'spending' ? '#fff' : 'var(--text-muted)' }}>Actual spending</button>
                <button onClick={() => setSpendMode('all')} className="px-2.5 py-1 text-[11px] font-bold" style={{ background: spendMode === 'all' ? '#171c2b' : 'transparent', color: spendMode === 'all' ? '#fff' : 'var(--text-muted)' }}>All outflows</button>
              </div>
            } />
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-faint)' }}>
            {spendMode === 'all' ? 'Every outflow incl. credit-card payments & transfers.' : 'Consumption only — card payments & transfers excluded.'}
          </p>
          <RankList data={topSpends} nameKey="name" subKey="transactions" onClick={name => goTx({ counterparty: name, direction: 'DEBIT' })} />
        </SectionCard>

        <SectionCard>
          <CardHead eyebrow="Money in" title="Where your money came from" />
          <RankList data={norm(incomeQ.data, 'name')} nameKey="name" subKey="transactions" onClick={name => goTx({ counterparty: name, direction: 'CREDIT' })} />
          {!(incomeQ.data || []).length && <EmptyState icon="💰" title="No income/credits found for this profile" />}
        </SectionCard>
      </div>
    </div>
  )
}
