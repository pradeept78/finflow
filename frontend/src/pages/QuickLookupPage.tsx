import BankMessagesBanner from '../components/common/BankMessagesBanner'
import { useNavigateFrom } from '../hooks/useNavigateFrom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, expensesApi, savingsApi, investmentsApi, insuranceApi, incomeApi, paidMarksApi, closedLoansApi, peopleOweApi } from '../api'
import { fmtINR, getEff, toMonthly, resolveDueDay, isPaidThisMonth, isDueThisMonth, freqMonths, monthlyIncomeTotal, isOneOff } from '../utils/format'
import { cardCycle, fmtDueDate } from '../utils/cardCycle'
import { calcOutflow, outflowTierLine, outflowRows as outflowRowsOf, outflowSubLine, freeFigures } from '../utils/calcOutflow'
import { ioweFacts } from '../utils/iowe'
import { calcLoanSplit } from '../utils/loanCalc'
import { LoadingSpinner, PageHeader, ErrorState } from '../components/common'
import { KindStrip } from '../components/common/KindStrip'
import { MONEY_GROUPS, type MoneyGroup } from '../utils/kinds'
import { buildDueRows, type DueRow } from '../utils/dueRows'
import { cardLimitUse } from '../utils/cardLimit'
import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import NextMonthHeadsUp from '../components/common/NextMonthHeadsUp'

export default function QuickLookupPage() {
  const navigate = useNavigateFrom()
  const qc = useQueryClient()
  const { data: loans = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: cards = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: personal = [], isLoading: l3, isError: e3, refetch: r3 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: expenses = [], isLoading: l4, isError: e4, refetch: r4 } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const { data: savings = [], isLoading: l5, isError: e5, refetch: r5 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: investments = [], isLoading: l6, isError: e6, refetch: r6 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const { data: insurance = [], isLoading: l7, isError: e7, refetch: r7 } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const { data: peopleOwe = [], isLoading: l8, isError: e8, refetch: r8 } = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApi.getAll })
  // This page never queried income, so it was the only one of the five that could not show
  // free cash. Normalised through the shared frequency map so a non-monthly source is not
  // counted at face value.
  const { data: income = [], isLoading: l9, isError: e9, refetch: r9 } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const { data: markedKeys = [], isLoading: l10, isError: e10, refetch: r10 } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })

  // Was only ever tracking the `loans` query — a failure in any of the other 9 queries this page
  // depends on rendered silently with partial/zeroed data instead of the error state.
  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8||l9||l10
  const isError = e1||e2||e3||e4||e5||e6||e7||e8||e9||e10
  const refetch = () => { r1();r2();r3();r4();r5();r6();r7();r8();r9();r10() }

  const toggleMut = useMutation({ mutationFn: paidMarksApi.toggle, onSuccess: () => qc.invalidateQueries({ queryKey: ['paid-marks'] }) })
  const [expanded, setExpanded] = useState<string | null>(null)
  /* Days that are fully paid took a full-height row each — on real data that was 218px of the
     page spent restating things already handled, and it pushed the still-pending days off screen.
     They collapse into one line now, openable when wanted. */
  const [showDone, setShowDone] = useState(false)
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const today = new Date().getDate()
  const monthYear = new Date().toISOString().slice(0, 7)
  // Paid = ticked. Nothing is assumed paid just because its day has passed.
  const isMarked = (key: string, dueDay?: number) => isPaidThisMonth(key, dueDay, markedKeys as string[])
  // Overdue = day has passed and it isn't ticked
  const isOverdue = (key: string, dueDay?: number) => !!dueDay && dueDay > 0 && dueDay < today && !isMarked(key, dueDay)
  // Upcoming = dueDay in future or today
  const isUpcoming = (key: string, dueDay?: number) => !!dueDay && dueDay > 0 && dueDay >= today && !markedKeys.includes(key)
  const toggle = (key: string) => toggleMut.mutate(key)
  // "Due soon": card bills already generated but due next month. Ticked for the month they're due, so the
  // tick is still there when that month starts and the bill moves into its normal day.
  const nextYM = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7) })()
  const { data: nextMarks = [] } = useQuery({ queryKey: ['paid-marks', nextYM], queryFn: () => paidMarksApi.getFor(nextYM) })
  const toggleNextMut = useMutation({ mutationFn: ({ key, month }: { key: string; month: string }) => paidMarksApi.toggleFor(key, month), onSuccess: () => qc.invalidateQueries({ queryKey: ['paid-marks'] }) })

  // resolveDueDay and isPaidThisMonth now live in utils/format so Calendar shares them.
  /* ── Calculations ──────────────────────────────────────────────────────────────────────────
     All figures come from utils/calcOutflow, the shared calculator. This page previously
     hand-rolled its own, and its insurance rule was unique in the app: non-monthly premiums were
     counted only if the renewal fell within 30 days, so a half-yearly policy contributed nothing
     for five months and then the whole premium in the sixth. Budget and Calendar normalised the
     same policy to a monthly share, so the three pages could never agree. */
  const o = calcOutflow(loans, cards, personal, savings, investments, expenses, insurance)
  // Was `toMonthly` over every active income entry with no one-off exclusion — the exact bug
  // `monthlyIncomeTotal` exists to prevent, reintroduced here: a One-time bonus would inflate
  // "Free / month" forever instead of counting only in the month it actually landed.
  const monthlyIncome = monthlyIncomeTotal(income as any[])

  const totalCC       = o.ccOutstanding
  const ccSpends      = o.ccSpends
  const totalSpends   = o.ccSpends
  const totalLoanEmi  = o.loanEmi
  const ccEmi         = o.ccEmi
  const persEmi       = o.iOweEmi
  const savMo         = o.savings
  const withdrewOwing = o.chitRepay
  const insMo         = o.insuranceEmi
  const sipMo         = o.sipInvest
  const expMo         = o.expenses
  const lockedMonthly = o.locked
  const cardThisMonth = o.card
  const totalMonthly  = o.total

  const ccEmiPendingTotal = cards.reduce((s, c) => s + (c.emis ?? []).filter(e => getEff(e).pending > 0).reduce((a, e) => a + (e.emi ?? 0) * getEff(e).pending, 0), 0)

  // Bar segments coloured and ordered by money group (utils/kinds MONEY_GROUPS), the same as the chips
  // under it and Overview's "Where your income goes".
  const GROUP_OF: Record<string, MoneyGroup> = {
    'Loan EMIs': 'emi', 'CC EMIs': 'emi', 'I Owe': 'emi', 'Chit repayment': 'emi',
    'Bills': 'bill', 'Insurance': 'insurance', 'Savings': 'saving', 'SIP': 'saving',
    'CC outstanding': 'card', 'CC spends': 'card', 'Renewals & one-offs': 'oneoff',
  }
  const outflowRows = outflowRowsOf(o)
    .map(r => { const g = MONEY_GROUPS[GROUP_OF[r.label] ?? 'oneoff']; return { ...r, color: g.color, order: g.order } })
    .sort((x, y) => x.order - y.order)

  // ── Due items ──
  // Which payments exist this month (and which are "not counted") is decided once, in utils/dueRows —
  // the same list Calendar's current month uses. This page only decides how each row is drawn.
  const { rows: dueRows, notCounted, upcoming } = buildDueRows({ loans, cards, personal, expenses, savings, investments, insurance })
  const ICONS: Record<string, string> = { loan: '🏦', 'card-emi': '💳', 'card-out': '💳', 'card-spend': '💳', iowe: '🤝', 'iowe-lump': '🤝', bill: '🔄', 'one-time': '🔄', savings: '🪙', 'chit-repay': '⚠️', insurance: '🛡️', sip: '📈' }
  const detailOf = (r: DueRow): React.ReactNode => {
    const x = r.ref
    switch (r.kind) {
      case 'loan': {
        const eff = getEff(x); const t = x.tenure ?? (eff.paid + eff.pending)
        const pct = t > 0 ? Math.round((eff.paid / t) * 100) : 0
        const sp = calcLoanSplit(x.amount ?? 0, x.emi ?? 0, x.tenure ?? 0, eff.paid, x.principalPaid ?? undefined)
        return (
          <div className="space-y-2 mt-2">
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div><div className="">Principal left</div><div className="mono text-red-400 font-semibold">{fmtINR(sp.princLeft)}</div></div>
              <div><div className="">EMIs Left</div><div className="font-semibold">{eff.pending}</div></div>
              <div><div className="">Progress</div><div className="font-semibold">{pct}%</div></div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 10%, transparent)' }}>
              <div className="h-full rounded-full" style={{ width: `${t > 0 ? Math.min(100, Math.round(eff.paid / t * 100)) : 0}%`, background: 'var(--info)' }} />
            </div>
          </div>
        )
      }
      case 'card-emi': {
        const eff = getEff(x)
        return (
          <div className="space-y-1 mt-2 text-[11px]">
            <div className="flex justify-between"><span>Instalment</span><span className="mono text-yellow-400">{fmtINR(x.emi)}/mo</span></div>
            <div className="flex justify-between"><span>Remaining</span><span className="mono">{eff.pending} of {x.tenure ?? eff.paid + eff.pending}</span></div>
            <div className="flex justify-between"><span>Still to pay</span><span className="mono text-red-400">{fmtINR((x.emi ?? 0) * eff.pending)}</span></div>
          </div>
        )
      }
      case 'card-out':
        return (
          <div className="space-y-1 mt-2 text-[11px]">
            <div className="flex justify-between"><span>Statement balance</span><span className="mono text-red-400">{fmtINR(x.outstanding)}</span></div>
            {Number(x.cardLimit ?? 0) > 0 && (() => { const u = cardLimitUse(x); return (
              <div className="flex justify-between"><span>Limit used</span><span className="mono" title="Outstanding + spends + unpaid EMIs">{Math.round(u.rawPct)}% · {fmtINR(u.used)} of {fmtINR(x.cardLimit)}</span></div>
            ) })()}
          </div>
        )
      case 'card-spend':
        return (
          <div className="space-y-1 mt-2 text-[11px]">
            {(x.spends ?? []).map((sp: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="">{sp.spendDate} · {sp.purpose}</span>
                <span className="mono text-pink-400">{fmtINR(Number(sp.amount))}</span>
              </div>
            ))}
          </div>
        )
      case 'iowe': {
        const isOpen = ioweFacts(x).mode !== 'amortising'
        return (
          <div className="text-[11px] mt-2">
            <div className="flex justify-between"><span className="">Total owed</span><span className="mono text-yellow-400">{fmtINR(ioweFacts(x).principalLeft)}</span></div>
            {isOpen && <div className=" mt-1">Open-ended interest only</div>}
          </div>
        )
      }
      case 'iowe-lump': return <div className="text-[11px] mt-2">Lump sum {fmtINR(x.amount)} falls due this month</div>
      case 'bill': return <div className="text-[11px]  mt-2">{x.frequency} expense</div>
      case 'one-time':
        return <div className="text-[11px] mt-2">One-time {r.sub.includes('premium') ? `premium ${fmtINR(x.premium)}` : 'expense'} — paid once, not part of monthly commitments</div>
      case 'savings': return <div className="text-[11px]  mt-2">{Math.max(0, (x.tenure ?? 0) - (x.paidMonths ?? 0))} months remaining</div>
      case 'chit-repay': return <div className="text-[11px] text-red-400 mt-2">{r.pending} months × {fmtINR(x.monthly ?? 0)} = {fmtINR((r.pending ?? 0) * (x.monthly ?? 0))} still to pay</div>
      case 'insurance':
        return (
          <div className="text-[11px] mt-2">Premium {fmtINR(x.premium)} {x.frequency}
            {freqMonths(x.frequency) > 1 && <> · sets aside {fmtINR(Math.round(toMonthly(x.premium, x.frequency)))}/mo</>}
          </div>
        )
      case 'sip': return <div className="text-[11px]  mt-2">Monthly SIP</div>
      default: return null
    }
  }
  const items: Array<{ key: string; kind: string; label: string; sub: string; amount: number; dueDay?: number; icon: string; detail: React.ReactNode }> = dueRows
    .map(r => ({ key: r.key, kind: r.kind, label: r.label, sub: r.sub, amount: r.amount, dueDay: r.dueDay, icon: ICONS[r.kind] ?? '•', detail: detailOf(r) }))
    .sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99))

  // Only the DISPLAYED list is filtered by kind; counts, totals, paid and overdue stay on every item.
  const visibleItems = kindFilter.size > 0 ? items.filter(it => kindFilter.has(it.kind)) : items
  const byDay = new Map<number, typeof items>()
  visibleItems.forEach(item => { const d = item.dueDay ?? 0; if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(item) })
  // Day 0 = no due day set: listed last as "Any day this month", never overdue.
  const days = [...byDay.keys()].sort((a, b) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b))
  // totalDue: outstanding already inside items (card chips show outstanding as amount)
  const totalDue = items.filter(x => !isMarked(x.key, x.dueDay)).reduce((s, x) => s + x.amount, 0)

  // Items due today or overdue (not yet marked)
  const dueToday = items.filter(item => {
    if (isMarked(item.key, item.dueDay)) return false
    const d = item.dueDay ?? 0
    return d === today
  })
  const overdue = items.filter(item => {
    if (isMarked(item.key, item.dueDay)) return false
    const d = item.dueDay ?? 0
    return d > 0 && d < today
  })

  // Hero numbers
  const dueTodayAmt = items.filter(i => (i.dueDay ?? 0) === today && !isMarked(i.key, i.dueDay)).reduce((s, i) => s + i.amount, 0)
  const overdueAmt = items.filter(i => isOverdue(i.key, i.dueDay)).reduce((s, i) => s + i.amount, 0)
  const paidAmt = items.filter(i => isMarked(i.key, i.dueDay)).reduce((s, i) => s + i.amount, 0)
  const totalDueMonth = items.reduce((s, i) => s + i.amount, 0)

  // Breakdown donut data
  const donutData = [
    { name: 'Loans', value: Math.round(totalLoanEmi), color: '#3b82f6' },
    { name: 'CC', value: Math.round(ccEmi + ccSpends), color: '#f59e0b' },
    { name: 'Savings', value: Math.round(savMo), color: 'var(--success-strong)' },
    { name: 'Insurance', value: Math.round(insMo), color: '#ec4899' },
    { name: 'Expenses', value: Math.round(expMo), color: '#8b5cf6' },
    { name: 'I Owe', value: Math.round(persEmi), color: '#f97316' },
  ].filter(d => d.value > 0)

  const paidCount = items.filter(i => isMarked(i.key, i.dueDay)).length
  const overdueItems = items.filter(i => isOverdue(i.key, i.dueDay))
  const totalItems = items.length
  const progressPct = totalItems > 0 ? Math.round(paidCount / totalItems * 100) : 0

  // Hoisted out of the JSX: this was sorted twice per render, and `Array.from` was only
  // incidentally protecting the source array from an in-place sort.
  const biggest = [...items].sort((a: any, b: any) => b.amount - a.amount)[0]

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your loans." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">

      <PageHeader title="Quick lookup"/>
      <BankMessagesBanner />

      {totalMonthly > 0 && (
        /* Compact header: the old one was 5rem of padding and a 4xl figure that pushed the due list
           below the fold, and the number it shouted was locked + card together — the scariest of
           the three and rarely the question being asked. Locked leads, card sits beside it as a
           separate one-month figure, combined total is the quiet third value. The itemisation comes
           from the shared calculator so it matches Hub, Dashboard, Budget and Calendar exactly. */
        <div className="space-y-3">
          {(() => {
            const free = freeFigures(o, monthlyIncome).free
            const Tile = ({ accent, label, children, className = '' }: any) => (
              <div className={`rounded-2xl px-4 sm:px-5 py-4 min-w-0 ${className}`} style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 5%, var(--bg-card)) 0%, var(--bg-card) 75%)`, border: '1px solid var(--hairline)' }}>
                <div className="text-[12px] font-medium flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-muted)' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />{label}</div>
                {children}
              </div>
            )
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Tile accent="var(--danger)" label="Total due this month" className="col-span-2 md:col-span-1">
                  <div className="text-[28px] font-semibold tracking-tight tabular-nums leading-tight" style={{ color: 'var(--danger)' }}>{fmtINR(Math.round(totalMonthly))}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{outflowTierLine(o)}</div>
                </Tile>
                {monthlyIncome > 0 && (
                  <Tile accent={free >= 0 ? 'var(--success)' : 'var(--danger)'} label="Free / month">
                    <div className="text-[22px] sm:text-[28px] font-semibold tracking-tight tabular-nums leading-tight" style={{ color: free >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {free >= 0 ? '+' : '−'}{fmtINR(Math.abs(Math.round(free)))}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: free >= 0 ? 'var(--text-faint)' : 'var(--danger)' }}>{free >= 0 ? 'before card bills' : '⚠ over income · before card bills'}</div>
                  </Tile>
                )}
                {biggest && (
                  <Tile accent="var(--warning)" label="Biggest this month">
                    <div className="text-[14px] sm:text-[17px] font-semibold leading-snug line-clamp-2" title={biggest.label} style={{ color: 'var(--warning)' }}>{biggest.label}</div>
                    <div className="mono text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtINR(biggest.amount)}</div>
                  </Tile>
                )}
              </div>
            )
          })()}
          <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)' }}>
          {/* Lookup keeps the itemisation: this is the page the other four link to for detail,
              and its Monthly Outflow panel further down repeats it with percentages. */}
          {/* Was a single grey run listing ten components — the same list the right-hand panel
              showed verbatim, and unreadable at 10px across the full width. Now a proportional
              strip: each segment sized by its share, labelled, and clicking through to its page. */}
          <div>
            <div className="text-[13px] font-semibold mb-2">Where this month's money goes</div>
            <div className="flex gap-px h-2.5 rounded-full overflow-hidden">
              {outflowRows.map(r => (
                <div key={r.label}
                     title={`${r.label} ${fmtINR(Math.round(r.val))} · ${Math.round(r.val / totalMonthly * 100)}%`}
                     style={{ width: `${r.val / totalMonthly * 100}%`, minWidth: 2, background: r.color }} />
              ))}
            </div>
            {/* One row instead of two: the old legend (₹ + % per category) and the count strip listed the same
                nine categories twice. Each pill now carries count, name, amount and share; a click filters the
                list below, same as Calendar and Master. */}
            {items.length > 0 && (
              <KindStrip className="mt-2"
                lead={<>
                  <b style={{ color: 'var(--text)' }}>{items.length} payments this month</b>
                  {notCounted.length > 0 && <button type="button" className="ml-1.5 hover:underline" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                    title="Left out of the count and every total — click to see which"
                    onClick={() => { const el = document.getElementById('ql-not-counted') as HTMLDetailsElement | null; if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } }}>(🚫 {notCounted.length} not counted)</button>}
                  {o.setAside > 0 && <span className="ml-3" style={{ color: 'var(--purple)' }} title="Monthly share of every quarterly / yearly bill and premium — worth setting aside; only the ones renewing this month are in the total">set aside for renewals <span className="mono">{fmtINR(Math.round(o.setAside))}</span>/mo</span>}
                </>}
                chips={(() => {
                  const LABEL_KIND: Record<string, string> = { 'Loan EMIs': 'loan', 'CC EMIs': 'card-emi', 'I Owe': 'iowe', 'Bills': 'bill', 'Insurance': 'insurance', 'Savings': 'savings', 'Chit repayment': 'chit-repay', 'SIP': 'sip', 'CC outstanding': 'card-out', 'CC spends': 'card-spend' }
                  const monthly = new Map<string, number>()
                  outflowRows.forEach(r => { const k = LABEL_KIND[r.label]; if (k) monthly.set(k, (monthly.get(k) ?? 0) + r.val) })
                  const cnt = new Map<string, number>(); const sum = new Map<string, number>()
                  items.forEach(it => { const k = it.kind; cnt.set(k, (cnt.get(k) ?? 0) + 1); sum.set(k, (sum.get(k) ?? 0) + it.amount) })
                  return [...cnt.entries()].map(([k, n]) => {
                    const v = (k === 'bill' || k === 'insurance' ? sum.get(k) : monthly.get(k)) ?? sum.get(k) ?? 0
                    return { id: k, kind: k, count: n, sub: `${fmtINR(Math.round(v))}${monthly.has(k) && totalMonthly > 0 ? ` · ${Math.round(v / totalMonthly * 100)}%` : ''}` }
                  })
                })()}
                selected={kindFilter}
                onChange={setKindFilter} />
            )}
          </div>
          </div>
        </div>
      )}

      {/* CC Spends auto-clear prompt — show if due day passed and card has spends.
          Was checking raw `c.dueDay` while the due-items list above (line 129) already falls back
          to `c.billingDay` via `resolveDueDay` — a card set up with only a billing day (no explicit
          due day) showed up correctly in the due list but this nudge never fired for it. */}
      {cards.filter((c: any) => {
        // Only spends on a bill that fell due THIS month and has passed (cardCycle) — not the ongoing cycle's.
        const cy = cardCycle(c)
        return cy.spendsThisMonth > 0 && !!cy.billDue && cy.billDue.getDate() < today
      }).map((c: any) => {
        const cy = cardCycle(c)
        const cardSpends = cy.spendsThisMonth
        const dueDay = cy.billDue?.getDate() ?? resolveDueDay(c, c.billingDay)
        const paidKey = `spend-cleared-${c.id}`
        if (isMarked(paidKey, dueDay)) return null   // was `item.dueDay` — `item` is not in scope here
        return (
          <div key={c.id} className="card border border-pink-500/30 bg-pink-500/5 p-3 mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">💳 {c.banker} — Did you pay your bill?</div>
              <div className="text-[11px]  mt-0.5">
                Spends of <span className="mono text-pink-400">{fmtINR(cardSpends)}</span> were due on Day {dueDay}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button className="btn btn-xs bg-green-500/15 text-green-400 hover:bg-green-500/25"
                onClick={() => toggle(paidKey)}>
                ✓ Yes, paid
              </button>
            </div>
          </div>
        )
      })}

      {/* Single full-width column. The outflow breakdown moved into the header, so the right
          panel would have been a verbatim second copy of it — and squeezing the day list into
          two thirds of the width was what made chips wrap in the first place. */}
      <div className="space-y-3">
          {(() => {
            const all = days.flatMap(dd => byDay.get(dd)!)
            const paidN = all.filter(x => isMarked(x.key, x.dueDay)).length
            const paidAmt = all.filter(x => isMarked(x.key, x.dueDay)).reduce((a, x) => a + x.amount, 0)
            const totAmt = all.reduce((a, x) => a + x.amount, 0)
            const pctPaid = totAmt > 0 ? Math.round(paidAmt / totAmt * 100) : 0
            return (
              <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)' }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[15px] font-semibold">Due this month</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Tick a payment when you've paid it — the total below updates.</div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <input aria-label="Search payments" className="input text-[12px] py-1.5 w-44" placeholder="Search payments…" value={search} onChange={e => setSearch(e.target.value)} />
                    <div className="text-right">
                      <div className="mono text-[16px] font-semibold tabular-nums" style={{ color: 'var(--danger)' }}>{fmtINR(totalDue)}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>remaining</div>
                    </div>
                  </div>
                </div>
                {all.length > 0 && (
                  <div className="mt-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }} role="progressbar" aria-valuenow={pctPaid} aria-valuemin={0} aria-valuemax={100} aria-label="Share of this month's payments already paid">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pctPaid}%`, background: 'var(--success)' }} />
                    </div>
                    <div className="mt-1.5 text-[11px] flex justify-between" style={{ color: 'var(--text-faint)' }}>
                      <span><b style={{ color: 'var(--success)' }}>{paidN}</b> of {all.length} paid · {fmtINR(Math.round(paidAmt))}</span>
                      <span>{pctPaid}% of {fmtINR(Math.round(totAmt))}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          {days.length === 0 ? (
            <div className="rounded-2xl p-8 text-center " style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}><CheckCircle2 size={32} className="mx-auto mb-2 text-green-400" /><div>No dues this month 🎉</div></div>
          ) : <>
          {(() => {
            const doneDays = days.filter(dd => {
              const it = byDay.get(dd)!
              return it.length > 0 && it.every(x => isMarked(x.key, x.dueDay))
            })
            if (!doneDays.length || showDone) return null
            const paidSum = doneDays.flatMap(dd => byDay.get(dd)!).reduce((sum, x) => sum + x.amount, 0)
            const cnt = doneDays.flatMap(dd => byDay.get(dd)!).length
            return (
              <div className="card border-l-2 border-l-green-500 px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                   onClick={() => setShowDone(true)} title="Show the days already paid">
                <span className="text-[12px] font-medium text-green-400 min-w-[110px]">✓ {doneDays.length} days done</span>
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {cnt} payments · day {doneDays.join(', ')} — <span className="mono text-green-400">{fmtINR(paidSum)}</span> settled
                </span>
                <span className="ml-auto text-[11px]" style={{ color: 'var(--text-faint)' }}>show ›</span>
              </div>
            )
          })()}
          {showDone && days.some(dd => { const it = byDay.get(dd)!; return it.length > 0 && it.every(x => isMarked(x.key, x.dueDay)) }) && (
            <div className="px-1 -mb-1 text-[11px] cursor-pointer" style={{ color: 'var(--text-faint)' }} onClick={() => setShowDone(false)}>
              ▲ collapse the {days.filter(dd => { const it = byDay.get(dd)!; return it.length > 0 && it.every(x => isMarked(x.key, x.dueDay)) }).length} completed days
            </div>
          )}
          {days.filter(day => {
            const it = byDay.get(day)!
            const allDone = it.length > 0 && it.every(x => isMarked(x.key, x.dueDay))
            return showDone || !allDone
          }).map(day => {
            const dayItems = (search.trim() ? byDay.get(day)!.filter(i => i.label.toLowerCase().includes(search.toLowerCase()) || i.sub.toLowerCase().includes(search.toLowerCase())) : byDay.get(day)!)
            const allPaid = dayItems.every(x => isMarked(x.key, x.dueDay))
            const dayUnpaid = dayItems.filter(x => !isMarked(x.key, x.dueDay)).reduce((s, x) => s + x.amount, 0)
            const isOv = day > 0 && day < today && !allPaid
            const isTd = day === today
            const isSn = day > today && day - today <= 3
            const lc = isOv ? 'text-red-400' : isTd ? 'text-orange-400' : isSn ? 'text-yellow-400' : allPaid ? 'text-green-400' : ''
            const bl = isOv ? 'border-l-red-500' : isTd ? 'border-l-orange-500' : isSn ? 'border-l-yellow-500' : allPaid ? 'border-l-green-500' : 'border-l-[var(--border)]'
            const accent = isOv ? 'var(--danger)' : isTd ? 'var(--orange)' : isSn ? 'var(--warning)' : allPaid ? 'var(--success)' : 'var(--text-faint)'
            const when = day === 0 ? 'any day' : isTd ? 'today' : isOv ? 'overdue' : day > today ? `in ${day - today} day${day - today === 1 ? '' : 's'}` : 'earlier'
            return (
              <div key={day} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)', borderLeft: `3px solid ${accent}` }}>
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-28 flex-shrink-0 flex sm:flex-col items-baseline sm:items-start justify-between sm:justify-center gap-1 px-4 py-3 sm:border-r" style={{ borderColor: 'var(--hairline)', background: `color-mix(in srgb, ${accent} 6%, transparent)` }}>
                    <div className="flex items-baseline gap-1.5 sm:flex-col sm:gap-0">
                      <span className="text-[24px] font-semibold tabular-nums leading-none" style={{ color: day === 0 ? 'var(--text-muted)' : accent === 'var(--text-faint)' ? 'var(--text)' : accent }}>{day === 0 ? '—' : day}</span>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{day === 0 ? 'Any day this month' : when}</span>
                    </div>
                    {!allPaid ? <span className="mono text-[12px] font-semibold tabular-nums" style={{ color: accent === 'var(--text-faint)' ? 'var(--text)' : accent }}>{fmtINR(dayUnpaid)}</span> : <span className="text-[11px] font-semibold" style={{ color: 'var(--success)' }}>✓ done</span>}
                  </div>
                  <div className="flex-1 min-w-0 p-2.5 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2">
                    {dayItems.map(item => {
                      const paid = isMarked(item.key, item.dueDay)
                      const ov = isOverdue(item.key, item.dueDay)
                      const up = isUpcoming(item.key, item.dueDay)
                      const tone = paid ? 'var(--success)' : ov ? 'var(--danger)' : 'var(--text-faint)'
                      return (
                        <div key={item.key} className="flex items-center gap-2.5 rounded-xl pl-2.5 pr-1.5 py-2 min-w-0 transition-colors" style={{ border: `1px solid ${paid ? 'color-mix(in srgb, var(--success) 30%, transparent)' : ov ? 'color-mix(in srgb, var(--danger) 35%, transparent)' : 'var(--hairline)'}`, background: paid ? 'color-mix(in srgb, var(--success) 7%, transparent)' : ov ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : 'transparent' }}>
                          <button type="button" role="checkbox" aria-checked={paid} aria-label={`${paid ? 'Unmark' : 'Mark'} ${item.label} as paid`} title={paid ? 'Paid — click to unmark' : 'Click to mark as paid this month'} onClick={() => toggle(item.key)}
                            className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold transition-colors"
                            style={{ border: `1.5px solid ${tone}`, background: paid ? 'var(--success)' : 'transparent', color: '#fff', cursor: 'pointer' }}>{paid ? '✓' : ''}</button>
                          <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setExpanded(expanded === item.key ? null : item.key)} aria-expanded={expanded === item.key} aria-label={`Details for ${item.label}`}>
                            <div className="text-[13px] font-medium truncate" style={{ color: paid ? 'var(--text-muted)' : 'var(--text)', textDecoration: paid ? 'line-through' : 'none' }}><span className="mr-1">{item.icon}</span>{item.label}</div>
                            <div className="text-[11px] truncate" style={{ color: ov && !paid ? 'var(--danger)' : 'var(--text-faint)' }}>{ov && !paid ? 'Overdue · ' : ''}{item.sub}</div>
                          </button>
                          <span className="mono text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: paid ? 'var(--success)' : ov ? 'var(--danger)' : 'var(--text)' }}>{paid ? 'paid' : fmtINR(item.amount)}</span>
                          <button type="button" aria-label="Open details" className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-faint)' }} onClick={() => setExpanded(expanded === item.key ? null : item.key)}>
                            {expanded === item.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {dayItems.filter(x => expanded === x.key).map(item => (
                  <div key={item.key} className="px-4 py-3 border-t" style={{ background: 'var(--bg-base)', borderColor: 'var(--hairline)' }}>
                    <div className="text-[13px] font-semibold">{item.icon} {item.label} <span className="font-normal text-[11px]" style={{ color: 'var(--text-faint)' }}>{item.sub}</span></div>
                    {item.detail}
                  </div>
                ))}
              </div>
            )
          })}
          </>}
          <NextMonthHeadsUp className="w-fit" />
          {upcoming.length > 0 && (() => {
            const startOfToday = new Date(new Date().toDateString()).getTime()
            const left = upcoming.filter(u => !(nextMarks as string[]).includes(u.key)).reduce((a, u) => a + u.amount, 0)
            return (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--warning)' }}>
                <div className="flex items-start justify-between gap-3 px-4 pt-3">
                  <div>
                    <div className="text-[14px] font-semibold">Due soon · next month</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Card bills already generated. They count in next month's total, not this month's.</div>
                  </div>
                  <span className="mono text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: left > 0 ? 'var(--warning)' : 'var(--success)' }}>{left > 0 ? fmtINR(left) : '✓ all paid'}</span>
                </div>
                <div className="p-2.5 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2">
                  {upcoming.map(u => {
                    const paid = (nextMarks as string[]).includes(u.key)
                    const inDays = Math.round((u.dueDate!.getTime() - startOfToday) / 86400000)
                    return (
                      <div key={u.key} className="flex items-center gap-2.5 rounded-xl pl-2.5 pr-3 py-2 min-w-0" style={{ border: `1px solid ${paid ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'var(--hairline)'}` }}>
                        <button type="button" role="checkbox" aria-checked={paid} aria-label={`${paid ? 'Unmark' : 'Mark'} ${u.label} as paid`} title={paid ? 'Paid — click to unmark' : 'Mark this bill as paid'}
                          onClick={() => toggleNextMut.mutate({ key: u.key, month: u.monthYear! })}
                          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                          style={{ border: `1.5px solid ${paid ? 'var(--success)' : 'var(--warning)'}`, background: paid ? 'var(--success)' : 'transparent', color: '#fff', cursor: 'pointer' }}>{paid ? '✓' : ''}</button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate" style={{ color: paid ? 'var(--text-muted)' : 'var(--text)', textDecoration: paid ? 'line-through' : 'none' }}><span className="mr-1">{ICONS[u.kind] ?? '💳'}</span>{u.label}</div>
                          <div className="text-[11px] truncate" style={{ color: inDays <= 3 && !paid ? 'var(--warning)' : 'var(--text-faint)' }}>due {fmtDueDate(u.dueDate)} · {inDays <= 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`}</div>
                        </div>
                        <span className="mono text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: paid ? 'var(--success)' : 'var(--text)' }}>{paid ? 'paid' : fmtINR(u.amount)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          {notCounted.length > 0 && (
            <details id="ql-not-counted" className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
              <summary className="cursor-pointer select-none">🚫 {notCounted.length} not counted · {fmtINR(Math.round(notCounted.reduce((a, x) => a + x.amount, 0)))}/mo <span style={{color:'var(--text-faint)'}}>— left out of the count and every total</span></summary>
              <div className="space-y-1 mt-1">
                {notCounted.map((x, k) => (
                  <div key={k} className="flex items-center gap-3 px-2 py-1 rounded-lg" style={{ background: 'color-mix(in srgb, var(--text) 3%, transparent)' }}>
                    {x.dueDay ? <span className="mono whitespace-nowrap">Day {x.dueDay}</span> : null}
                    <span className="flex-1 min-w-0"><b>{x.label}</b> <span className="text-[11px]">({x.sub} · {x.why})</span></span>
                    <span className="mono">{fmtINR(x.amount)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
  )
}
