import SegTabs from '../components/common/SegTabs'
import { incomePct } from '../utils/incomePct'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHorizonState } from '../utils/horizonStore'
import { advanceAll } from '../utils/projection'
import HorizonBar from '../components/common/HorizonBar'
import IncomeSplitCard from '../components/common/IncomeSplitCard'
import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, savingsApi, insuranceApi, investmentsApi, expensesApi, incomeApi, paidMarksApi } from '../api'
import { masterKeyOf } from '../utils/dueRows'
import { fmtINR, monthlyIncomeTotal } from '../utils/format'
import { calcOutflow, outflowTierLine } from '../utils/calcOutflow'
import { PageHeader, LoadingSpinner, ErrorState, SortHeader } from '../components/common'
import { Download } from 'lucide-react'
import { rateColor } from '../utils/emiFacts'
import { investTotals } from '../utils/investValue'
import FilterMenu from '../components/common/FilterMenu'
import { usePicks, PickBox, WhatIfBar, SelectAllLink } from '../components/common/WhatIf'
import { KindStrip } from '../components/common/KindStrip'
import { masterKind } from '../utils/kinds'
import { buildMasterRows, TYPE_COLOR, isFriendOwed, amountSortVal, fmtMonthYear, type MasterRow } from '../utils/buildMasterRows'

/**
 * Everything you owe or are committed to paying, in one place — renamed back to "All Commitments"
 * (still the same component/route, /master) after it absorbed the old separate All Commitments page,
 * so there's a single source for both "what's my situation" (the flat sortable ledger below) and
 * "what's due when" (the By Due Date view + PDF export).
 *
 * Debt rows (Loans, CC Outstanding, CC EMI, CC Spends, I Owe, Chit Repay) mirror the exact categories
 * and formulas calcDebt.ts's Total Debt is built from (calcLoanSplit, ioweFacts, getEff, the same
 * friend-owed exclusion) so this page's Total Debt tile can't drift from Dashboard/Hub/Finance
 * Overview/Payoff. Non-debt rows (Investments/SIP, still-building Savings/Chit, recurring Expenses,
 * Insurance) are shown for reference — they carry totalPending: 0 and never feed the debt total — and
 * the headline "Committed / month" and "Free / month" tiles come straight from the shared
 * calcOutflow()/monthlyIncomeTotal() calculators, never recomputed by hand, for the same reason.
 *
 * A spend or EMI tagged "for a friend" and not yet settled is dimmed and excluded from every total
 * here, same as it is everywhere else in the app — still listed so it isn't silently invisible.
 *
 * End dates with nothing on record are estimated as today + months-remaining and marked with a
 * trailing ~. Read-only by design: click a row to go edit it on its own page.
 */

// MasterRow, TYPE_COLOR, isFriendOwed, amountSortVal, fmtMonthYear, and the row-building logic
// itself all moved to utils/buildMasterRows.ts (imported above) so the Admin panel's per-user
// commitment ledger can run the identical logic on another user's data. Nothing here changed
// behavior — it's the same code, just callable from more than one page now.

const csvCell = (v: any): string => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const today = new Date().getDate()

// A reference-only row (Investment/SIP, Insurance) with a real end date still has a genuine
// countdown even though it never shows up in the "closing" math above — "reference only" alone
// made that look like it runs forever, when it might actually be 11 months from maturing.
const monthsUntil = (iso: string): number => {
  const d = new Date(iso), now = new Date()
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()))
}

// Compact "Apr '22" — keeps the Term column on one line next to the new money columns.
const fmtMY = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-IN', { month: 'short' })} '${String(d.getFullYear()).slice(2)}` }

/** Type badge — soft tinted pill with a leading dot, same language as the Hub chips. */
function TypeBadge({ type, className = '' }: { type: string; className?: string }) {
  const c = TYPE_COLOR[type] ?? 'var(--text-faint)'
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}
      style={{ background: `color-mix(in srgb, ${c} 13%, transparent)`, color: c }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{type}
    </span>
  )
}

/** Collapsible group header: animated chevron, accent bar, count pill, right-hand figures and an
 *  optional share-of-total bar. Shared by By Due Date / By Type / By Card. */
function GroupHead({ title, tag, count, open, onToggle, accent, right, share }: {
  title: string; tag?: React.ReactNode; count: number; open: boolean; onToggle: () => void; accent: string
  right: React.ReactNode; share?: number
}) {
  return (
    <div className="relative flex items-center justify-between gap-3 pl-5 pr-4 py-2.5 cursor-pointer select-none transition-colors hover:brightness-110"
      style={{ background: `color-mix(in srgb, ${accent} 5%, var(--bg-card))`, borderTop: '1px solid var(--hairline)' }}
      onClick={onToggle} role="button" aria-expanded={open}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent, opacity: open ? 1 : 0.55 }} />
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <span className="inline-block transition-transform text-[11px]" style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--text-faint)' }}>▶</span>
        <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</span>
        <span className="text-[11px] font-medium px-1.5 rounded-full tabular-nums" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: 'var(--text-muted)' }}>{count}</span>
        {tag}
      </span>
      <span className="flex items-center gap-3 flex-shrink-0 text-right max-w-[62%]">
        {share != null && share > 0 && (
          <span className="hidden sm:block w-20 h-1 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }} title={`${Math.round(share * 100)}% of the total`}>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, Math.round(share * 100))}%`, background: accent }} />
          </span>
        )}
        <span className="flex justify-end sm:min-w-[250px]">{right}</span>
      </span>
    </div>
  )
}

export default function MasterTablePage() {
  const navigate = useNavigate()
  const { data: loansRaw = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  // Ticks from Lookup / Calendar (due-list keys), mapped onto this page's row keys. A past day is only
  // "overdue" while something on it is still unticked.
  const { data: markedKeys = [] } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  const paidRows = new Set((markedKeys as string[]).map(masterKeyOf))
  const { data: cardsRaw = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: personalRaw = [], isLoading: l3, isError: e3, refetch: r3 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: savingsRaw = [], isLoading: l4, isError: e4, refetch: r4 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: insuranceRaw = [], isLoading: l5, isError: e5, refetch: r5 } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const { data: investmentsRaw = [], isLoading: l6, isError: e6, refetch: r6 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const { data: expensesRaw = [], isLoading: l7, isError: e7, refetch: r7 } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const { data: income = [], isLoading: l8, isError: e8, refetch: r8 } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })

  // Look ahead (shared with the Hub): everything below is computed from the data as it will stand N months from now.
  const hz = useHorizonState()
  const proj = advanceAll({ loans: loansRaw as any[], cards: cardsRaw as any[], personal: personalRaw as any[], savings: savingsRaw as any[], investments: investmentsRaw as any[], expenses: expensesRaw as any[], insurance: insuranceRaw as any[] }, hz.horizon, hz)
  const loans: any[] = proj.loans ?? []
  const cards: any[] = proj.cards ?? []
  const personal: any[] = proj.personal ?? []
  const savings: any[] = proj.savings ?? []
  const investments: any[] = proj.investments ?? []
  const expenses: any[] = proj.expenses ?? []
  const insurance: any[] = proj.insurance ?? []
  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8
  const isError   = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8
  const refetch   = () => { r1(); r2(); r3(); r4(); r5(); r6(); r7(); r8() }

  const [search, setSearch] = useState('')
  // "Closing within N months" — which EMI-bearing commitments (Loans, CC EMIs, I Owe, Chit Repay)
  // will finish by today + N months, and the total still owed on them from today. Empty string =
  // off. A row only qualifies if it actually has both an EMI schedule and a real pending balance —
  // that's exactly what separates "this will finish and stop costing you" (Loan/CC EMI/Chit Repay)
  // from reference-only rows (Investments, Insurance, Expenses) that have no such payoff concept.
  // Remembered between visits (per browser) so the panel opens on whatever was last being looked at.
  // Wrapped in try/catch — storage can be blocked or unavailable, and the page must work without it.
  const CLOSING_LS = 'finflow.master.closing'
  const [savedClosing] = useState(() => { try { return JSON.parse(localStorage.getItem(CLOSING_LS) ?? '{}') as { months?: string; mode?: string; amount?: string } } catch { return {} as { months?: string; mode?: string; amount?: string } } })
  const [closingMonths, setClosingMonths] = useState(typeof savedClosing.months === 'string' ? savedClosing.months : '')
  // "By amount" is the other way to ask the same underlying question: instead of "what finishes in
  // N months", it's "with ₹X in hand today, what can I fully close right now". Separate input and a
  // separate computed plan (closingAmountPlan, below) — the two modes don't share state, since one
  // is time-driven and the other is budget-driven.
  const [closingMode, setClosingMode] = useState<'months' | 'amount'>(savedClosing.mode === 'amount' ? 'amount' : 'months')
  const [closingAmount, setClosingAmount] = useState(typeof savedClosing.amount === 'string' ? savedClosing.amount : '')
  useEffect(() => { try { localStorage.setItem(CLOSING_LS, JSON.stringify({ months: closingMonths, mode: closingMode, amount: closingAmount })) } catch { /* storage unavailable — fine */ } }, [closingMonths, closingMode, closingAmount])
  // The "Remaining after" list is the biggest of the three closing-panel lists (often most of the
  // page), so it starts collapsed — a toggle, not a permanent hide, since the whole point of this
  // message thread was "I can't see what's actually in that bucket".
  // Closing panel navigation (see the tabbed list below): which of the three lists is showing, an
  // optional single-month filter picked from the timeline, a shared search box, and whether the
  // active list is showing its capped preview or the full (internally scrolling) set.
  const [closingTab, setClosingTab] = useState<'closing' | 'running' | 'remaining'>('closing')
  const [closingMonthPick, setClosingMonthPick] = useState<string | null>(null)
  const [panelSearch, setPanelSearch] = useState('')
  const [panelShowAll, setPanelShowAll] = useState(false)
  const [showRecon, setShowRecon] = useState(false)
  // Top-level page tabs: the table ("view") and the closing planner are two different jobs — the
  // planner ignores the Type/search filters and the table has no use for the planner's inputs — so
  // each gets the whole screen instead of stacking one above the other. Last tab is remembered.
  const [pageTab, setPageTab] = useState<'view' | 'closing' | 'others'>(() => { try { return localStorage.getItem('finflow.master.tab') === 'closing' ? 'closing' : 'view' } catch { return 'view' } })
  useEffect(() => { try { localStorage.setItem('finflow.master.tab', pageTab) } catch { /* ignore */ } }, [pageTab])
  const [showAbout, setShowAbout] = useState(false)
  // Pick-and-close: rows ticked in the Closing / Still running lists, for the "what if I close just
  // these" summary bar. Keyed by row key; purely a scratchpad, nothing is saved or changed.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const togglePick = (k: string) => setPicked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  // "By amount" ordering: smallest balance first (closes the most accounts) or most EMI freed per
  // rupee spent (biggest drop in the monthly bill for the money).
  const [amountStrategy, setAmountStrategy] = useState<'smallest' | 'relief'>('smallest')
  // A month picked from the timeline belongs to one specific window — changing the window makes it stale.
  useEffect(() => { setClosingMonthPick(null); setPanelShowAll(false) }, [closingMonths])
  // A what-if selection belongs to the window/amount it was made under — change the months, the amount,
  // the mode or the strategy and the old ticks no longer mean anything, so start clean (no manual "clear").
  useEffect(() => { setPicked(new Set()) }, [closingMonths, closingAmount, closingMode, amountStrategy])
  // Empty set = "All" (no filter applied). Multi-select is off by default: each chip is exclusive —
  // tapping one replaces whatever was selected, tapping the already-active one clears back to "All".
  // Checking the box switches to OR mode, where several chips can be active together.
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const wi = usePicks()   // tick-to-simulate: "what would closing these cost, and how much EMI would it free?"

  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') } }

  const [viewMode, setViewMode] = useState<'list' | 'due' | 'type' | 'card'>('list')
  // Summary tiles take up a full row before the table even starts — collapsible so it can be
  // tucked away once you already know the headline numbers and just want to work the table.
  const [tilesCollapsed, setTilesCollapsed] = useState(false)
  // Groups default to COLLAPSED — a key missing from this map (every group, the first time you see
  // it) reads as collapsed via the `?? true` below, so opening a grouped view shows just the headers
  // instead of every row already expanded. Only an explicit `false` entry (from clicking a header,
  // or Expand all) opens a group.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleGroup = (g: string) => setCollapsed(c => ({ ...c, [g]: !(c[g] ?? true) }))

  // Printing needs every due-date group expanded first — a collapsed group has no rows in the DOM,
  // not just hidden ones. Deferred into an effect so window.print() waits for the expanded rows to
  // actually paint. Same pattern /commitments used to use.
  const [pendingPrint, setPendingPrint] = useState(false)
  useEffect(() => {
    if (!pendingPrint) return
    const raf = requestAnimationFrame(() => { window.print(); setPendingPrint(false) })
    return () => cancelAnimationFrame(raf)
  }, [pendingPrint])
  const handlePrint = () => { setCollapsed(c => ({ ...c, ...Object.fromEntries([...dueGroupList, ...typeGroupKeys, ...cardGroupKeys].map(g => [g, false])) })); setPendingPrint(true) }

  if (isLoading) return <><HorizonBar /><LoadingSpinner /></>
  if (isError) return <ErrorState message="Couldn't load your master table." onRetry={refetch} />

  const rows: MasterRow[] = buildMasterRows(loans as any[], cards as any[], personal as any[], savings as any[], investments as any[], expenses as any[], insurance as any[])

  // Items you carry FOR someone else (a friend's EMI on your card, say) aren't your commitments: they're left out of every
  // total, so they no longer sit dimmed inside the main table either — the count and the sums now agree.
  // They live in a collapsed "For others" section under the table instead, still one click away.
  // Same for an insurance premium that's already being paid as a Credit Card EMI: its cost is inside that card's EMI row,
  // so listing it again (with a monthly figure that isn't summed) is what made the columns look like they don't add up.
  const isUncounted = (r: MasterRow) => isFriendOwed(r) || !!r.isCardEmi
  const ownRows = rows.filter(r => !isUncounted(r))
  const uncountedRows = rows.filter(isUncounted)
  // Last such item settled/removed while its tab was open → back to the main list instead of an empty page.
  if (pageTab === 'others' && uncountedRows.length === 0) setPageTab('view')
  const TYPES = Array.from(new Set(ownRows.map(r => r.type)))
  const filteredAll = rows
    .filter(r => typeFilter.size === 0 || typeFilter.has(r.type))
    .filter(r => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))
  const filtered = filteredAll.filter(r => !isUncounted(r))
  const ownFiltered = filtered
  // This page lists every active commitment regardless of whether it's actually charging this
  // month — a half-yearly premium gets a row year-round. Calendar's "N payments due this month"
  // only counts the ones with a real charge landing in the current month, which is exactly the
  // rows here that are NOT a non-monthly provision sitting between renewals. Surfacing both counts
  // side by side so "35 here vs 31 there" reads as "same data, different question" instead of a bug.
  const chargingThisMonth = filtered.filter(r => r.charging).length

  // ── Closing within N months ── same `rows` (not `filtered`) so the Type/search filters above
  // don't quietly hide something from this count — it answers "what finishes soon", a different
  // question from "what's on screen right now".
  // `allEmiRows` is every currently-open EMI schedule regardless of when it ends — the same test
  // `closingRows` applies, just without the cutoff — so the count can say "30 EMIs now, closing
  // these 9 leaves 21 still running" instead of only ever showing the ones closing soon.
  const allEmiRows = rows.filter(r => r.emi != null && r.endDate && r.totalPending > 0 && !isFriendOwed(r) && !r.isCardEmi)
  // "By amount" plan — smallest balance first (the standard debt-snowball order), fully closing as
  // many as the entered amount covers before moving to the next. Snowball order rather than
  // biggest-EMI-first or highest-interest-first because it maximizes how many accounts actually
  // close for a given budget, which is the question being asked here ("what can I close"), not
  // "what minimizes total interest" (a different, legitimate question this isn't trying to answer).
  const closingAmountNum = Number(closingAmount)
  const closingAmountPlan = closingMode === 'amount' && closingAmountNum > 0 ? (() => {
    const candidates = [...allEmiRows].sort((a, b) => amountStrategy === 'relief'
      ? ((b.emi ?? 0) / Math.max(b.totalPending, 1)) - ((a.emi ?? 0) / Math.max(a.totalPending, 1))
      : a.totalPending - b.totalPending)
    let remaining = closingAmountNum
    const closed: MasterRow[] = []
    for (const r of candidates) {
      if (r.totalPending <= remaining) { closed.push(r); remaining -= r.totalPending }
    }
    const nextUp = candidates.find(r => !closed.includes(r)) ?? null
    return {
      closed, nextUp, leftOver: remaining,
      spent: closingAmountNum - remaining,
      emiFreed: closed.reduce((s, r) => s + (r.emi ?? 0), 0),
    }
  })() : null
  // "Current" originally only counted EMI-schedule rows (19 of 33), which read as a mismatch against
  // the "N items" count the filter bar already shows — that one counts every commitment regardless
  // of type. Matching it here (same `rows`, same no-filter universe) means "Current" and "33 items"
  // never disagree again; "Remaining after" then naturally includes the balance-only/reference rows
  // (CC Outstanding, Investments, Insurance, etc.) that never had a "closes" concept to begin with.
  const totalAllCount = ownRows.length
  const closingMonthsNum = Number(closingMonths)
  const closingCutoff = closingMonthsNum > 0 ? (() => { const d = new Date(); d.setMonth(d.getMonth() + closingMonthsNum); return d })() : null
  const closingRows = !closingCutoff ? [] : allEmiRows
    .filter(r => new Date(r.endDate as string) <= (closingCutoff as Date))
    .sort((a, b) => new Date(a.endDate as string).getTime() - new Date(b.endDate as string).getTime())
  const closingRequired = closingRows.reduce((s, r) => s + r.totalPending, 0)
  const remainingAllCount = totalAllCount - closingRows.length
  // Investment/SIP and Insurance never show up in closingRows above — they're reference-only
  // (totalPending is always 0 for them by design), so the debt-based test `allEmiRows` uses
  // excludes them no matter how close their own end date is. An SIP maturing in 8 months is still
  // "ending soon" in the same sense a loan closing in 8 months is, just with no amount owed on it —
  // shown in the same Closing list below, but kept OUT of every debt figure above (closingRequired,
  // closingMonthlyEmi, the Current/Closing/Remaining counts) since they were never debt to begin with.
  const closingReferenceRows = !closingCutoff ? [] : rows
    .filter(r => (r.type === 'Investment/SIP' || r.type === 'Insurance') && !isFriendOwed(r) && !r.isCardEmi && r.endDate)
    .filter(r => new Date(r.endDate as string) <= (closingCutoff as Date))
    .sort((a, b) => new Date(a.endDate as string).getTime() - new Date(b.endDate as string).getTime())
  // What the Closing list actually renders — debt rows plus these reference rows, together, sorted
  // by end date so a maturing SIP interleaves naturally with a closing loan instead of being tacked
  // on as an afterthought.
  const closingDisplayRows = [...closingRows, ...closingReferenceRows]
    .sort((a, b) => new Date(a.endDate as string).getTime() - new Date(b.endDate as string).getTime())
  // The "Remaining after" bar was just a bare count with nothing behind it — these are the actual
  // 14 (or however many) rows it's counting: everything NOT in closingRows. A mix of three kinds —
  // EMI-schedule rows that keep running past the window (also detailed with a reduction projection
  // further down), balance-only rows with no fixed schedule (CC Outstanding/Spends, I Owe Lump),
  // and reference-only rows that were never debt to begin with (Investments, Expenses, Insurance) —
  // plus any friend-owed row regardless of type. Sorted biggest-pending-first so what still needs
  // clearing surfaces before the purely informational rows.
  const remainingRows = !closingCutoff ? [] : rows
    .filter(r => !isUncounted(r) && !closingRows.some(cr => cr.key === r.key) && !closingReferenceRows.some(cr => cr.key === r.key))
    .sort((a, b) => b.totalPending - a.totalPending)
  // How much the monthly EMI outflow itself drops once these close — a separate figure from
  // closingRequired above (the lump sum needed to close them), since a big one-time payoff and a
  // big recurring monthly saving are two different things to know.
  const totalMonthlyEmi = allEmiRows.reduce((s, r) => s + (r.emi ?? 0), 0)
  const closingMonthlyEmi = closingRows.reduce((s, r) => s + (r.emi ?? 0), 0)
  const remainingMonthlyEmi = totalMonthlyEmi - closingMonthlyEmi
  // The EMI/month figure above only tracks EMI-schedule rows — it says nothing about the other two
  // things that keep costing money regardless of which EMIs close: recurring Expenses/Insurance
  // (never an EMI, never "closes", just keeps recurring every renewal) and any CC Outstanding/CC
  // Spends balance (a running card balance, not on an installment schedule, that sits there until
  // it's actually paid off). Surfaced here so the drop above doesn't read as "my total outflow falls
  // by this much" when it's really just the EMI slice of it.
  // Everything still owed today (own debts only — friend-owed and card-EMI-insurance rows are
  // excluded the same way every other total on this page does). The planner subtracts what would be
  // paid off from this to answer "what is left after closing?".
  const planOwnTotal = rows.filter(r => !isFriendOwed(r) && !r.isCardEmi).reduce((s, r) => s + r.totalPending, 0)
  const EMI_TYPES = new Set(['Loan', 'Gold Loan', 'CC EMI', 'I Owe', 'I Owe (Interest-only)', 'Chit Repay'])
  // ── What-if: tick rows to see what closing them costs and frees ──
  // Only your own debts with something left to pay can be ticked (friends' items and card-EMI insurance aren't yours to close).
  // Closing one costs its whole remaining balance (Total Pending) and stops its monthly EMI — the same sums the closing planner uses.
  const canPick = (r: MasterRow) => !isFriendOwed(r) && !r.isCardEmi && r.totalPending > 0
  const pickedRows = rows.filter(r => wi.picked.has(r.key) && canPick(r))
  const pickNeed = pickedRows.reduce((s, r) => s + r.totalPending, 0)
  const pickFree = pickedRows.reduce((s, r) => s + (EMI_TYPES.has(r.type) ? (r.emi ?? 0) : 0), 0)
  const pickableShown = filtered.filter(canPick)
  // Every EMI leaving the account (same set as the Hub's Monthly EMIs) — the bill the ticked ones are taken out of.
  const pickBill = rows.filter(r => EMI_TYPES.has(r.type) && !isFriendOwed(r) && !r.isCardEmi).reduce((s, r) => s + (r.emi ?? 0), 0)
  const otherMonthlyOutside = rows.filter(r => (r.type === 'Expense' || r.type === 'Insurance') && !isFriendOwed(r) && !r.isCardEmi).reduce((s, r) => s + (r.emi ?? 0), 0)
  const cardBalanceOutside = rows.filter(r => (r.type === 'CC Outstanding' || r.type === 'CC Spends') && !isFriendOwed(r)).reduce((s, r) => s + r.totalPending, 0)
  // Loans that won't fully close in the window, but still get paid down during it — `totalPending`
  // is already built so that pendingEmis * emi ≈ totalPending for every EMI-bearing type here (a
  // standard amortizing schedule's remaining principal+interest equals its remaining installments
  // times the EMI), so N months of payments reduce it by roughly N * emi. This is a projection, not
  // a stored figure — it assumes the EMI itself doesn't change over that stretch.
  const nonClosingReducing: (MasterRow & { reduceAmt: number; afterAmt: number; pctReduced: number })[] = !closingCutoff ? [] : allEmiRows
    .filter(r => !(new Date(r.endDate as string) <= (closingCutoff as Date)))
    // An interest-only I Owe's "emi" only covers interest — the principal (what totalPending is,
    // for that type) never shrinks until the one-time payback, so N months of payments reduce it by
    // ₹0, not N * emi. Projecting a reduction for it would be wrong, not just approximate.
    .filter(r => r.type !== 'I Owe (Interest-only)')
    .map(r => {
      const reduceAmt = Math.min(r.totalPending, (r.emi ?? 0) * closingMonthsNum)
      return { ...r, reduceAmt, afterAmt: r.totalPending - reduceAmt, pctReduced: r.totalPending > 0 ? reduceAmt / r.totalPending : 0 }
    })
    .filter(r => r.reduceAmt > 0)
    // Sorted by what's STILL LEFT after the window, biggest first — "this one barely moves, that one
    // clears most of the way" is the more useful ranking than "which one pays down the most in
    // absolute rupees", since a huge loan can pay down a lot and still have the most left over.
    .sort((a, b) => b.afterAmt - a.afterAmt)
  const totalReduceAmt = nonClosingReducing.reduce((s, r) => s + r.reduceAmt, 0)
  // Keyed lookup so the Remaining list below can show the same progress bar for a row that's also
  // in nonClosingReducing, instead of recomputing it or showing a second, differently-shaped figure
  // for the same item.
  const nonClosingReducingByKey = new Map(nonClosingReducing.map(r => [r.key, r]))

  // ── Month-by-month chart (lifted out of the list panel so it can sit beside the summary tiles) ──
  // One column per month something actually ends (empty months skipped): bar = monthly EMI bill AFTER
  // that month's closures, green label = how much it fell, red chip = how many items end. Tapping a
  // column filters the Closing list below to that month.
  const mkey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  const mlabel = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-IN', { month: 'short' })} '${String(d.getFullYear()).slice(2)}` }
  const timeline = new Map<string, { label: string; rows: MasterRow[] }>()
  closingDisplayRows.forEach(r => {
    const k = mkey(r.endDate as string)
    if (!timeline.has(k)) timeline.set(k, { label: mlabel(r.endDate as string), rows: [] })
    timeline.get(k)!.rows.push(r)
  })
  const timelineList = [...timeline.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const monthChart = timelineList.length === 0 ? null : (() => {
    const compact = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`
    let bill = totalMonthlyEmi
    const cols = timelineList.map(([k, b]) => {
      const drop = b.rows.reduce((s, r) => s + (r.totalPending > 0 ? (r.emi ?? 0) : 0), 0)
      bill -= drop
      return { k, label: b.label, count: b.rows.length, drop, bill }
    })
    const maxBill = Math.max(totalMonthlyEmi, 1)
    const BAR_H = 32
    return (
      <div className="rounded-lg p-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', maxWidth: '100%', minWidth: 0 }}>
        <div className="flex items-center justify-between gap-3 text-[11px] mb-1" style={{ color: 'var(--text-faint)' }}>
          <span><b style={{ color: 'var(--text)' }}>Month by month</b> · tap to filter</span>
          {closingMonthPick && <button onClick={() => { setClosingMonthPick(null); setPanelShowAll(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 10 }}>clear ✕</button>}
        </div>
        <div className="flex items-end gap-1 overflow-x-auto">
          {[{ k: '', label: 'Now', count: 0, drop: 0, bill: totalMonthlyEmi }, ...cols].map(c => {
            const isNow = c.k === ''
            const on = !isNow && closingMonthPick === c.k
            return (
              <button key={c.k || 'now'} disabled={isNow}
                title={isNow ? `Now: ${fmtINR(Math.round(c.bill))}/mo` : `${c.label}: ${c.count} ending${c.drop > 0 ? `, bill drops ${fmtINR(Math.round(c.drop))} to ${fmtINR(Math.round(c.bill))}/mo` : ' (no EMI drop)'}`}
                onClick={() => { setClosingMonthPick(on ? null : c.k); setClosingTab('closing'); setPanelShowAll(false) }}
                className="flex flex-col items-center flex-shrink-0"
                style={{ width: 52, background: on ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'none', border: 'none', borderRadius: 6, padding: '1px 0', cursor: isNow ? 'default' : 'pointer', opacity: closingMonthPick && !on && !isNow ? 0.45 : 1 }}>
                <span className="text-[11px] mono font-bold" style={{ color: 'var(--success)', minHeight: 11 }}>{c.drop > 0 ? `−${compact(c.drop)}` : ''}</span>
                <span className="flex items-end" style={{ height: BAR_H }}>
                  <span className="block rounded-t" style={{ width: 26, height: Math.max(5, (c.bill / maxBill) * BAR_H), background: c.drop > 0 ? 'var(--success)' : 'color-mix(in srgb, var(--warning) 55%, transparent)' }} />
                </span>
                <span className="text-[11px] mono" style={{ color: 'var(--text)' }}>{compact(c.bill)}</span>
                <span className="text-[11px] whitespace-nowrap" style={{ color: on ? 'var(--text)' : 'var(--text-faint)', fontWeight: on ? 700 : 400 }}>{c.label}{c.count > 0 ? ` · ${c.count}` : ''}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  })()
  // ── Reconciling with the Hub's "Monthly EMIs" ──
  // Hub adds up EVERY recurring EMI leaving the account (all loans + all card EMIs + I Owe incl.
  // interest-only servicing + chit repayment). The planner's bill is narrower on purpose: only EMIs
  // that belong to you AND have an end date, because those are the ones that can "close". What's left
  // out is listed here so the two figures visibly add up instead of looking like a mistake.
  const outsideBill = rows.filter(r => EMI_TYPES.has(r.type) && (r.emi ?? 0) > 0 && !allEmiRows.some(a => a.key === r.key))
  const outFriend = outsideBill.filter(r => isFriendOwed(r))
  const outInterestOnly = outsideBill.filter(r => !isFriendOwed(r) && r.type === 'I Owe (Interest-only)')
  const outOther = outsideBill.filter(r => !isFriendOwed(r) && r.type !== 'I Owe (Interest-only)')
  const sumRowEmi = (xs: MasterRow[]) => xs.reduce((a, r) => a + (r.emi ?? 0), 0)
  const reconParts = [
    outInterestOnly.length > 0 ? { label: 'interest-only I Owe (no end date)', amt: sumRowEmi(outInterestOnly), who: outInterestOnly.map(r => r.name) } : null,
    outOther.length > 0 ? { label: 'EMIs with no end date', amt: sumRowEmi(outOther), who: outOther.map(r => r.name) } : null,
  ].filter(Boolean) as { label: string; amt: number; who: string[] }[]
  // One quiet line that opens into a small ledger, instead of two paragraphs of running text that
  // the eye had to parse as arithmetic. Collapsed: the headline equation. Open: one row per part.
  const reconExtra = reconParts.reduce((a, x) => a + x.amt, 0)
  const reconLine = (reconParts.length === 0 && outFriend.length === 0 && otherMonthlyOutside <= 0 && cardBalanceOutside <= 0) ? null : (
    <div className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
      <button onClick={() => setShowRecon(v => !v)} className="flex items-center gap-1.5 flex-wrap text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0, font: 'inherit' }} aria-expanded={showRecon}>
        <span style={{ color: 'var(--accent)' }}>{showRecon ? '▾' : '▸'}</span>
        <span>How this adds up</span>
        {reconParts.length > 0 && <span className="mono">· Hub's all-in EMIs <b style={{ color: 'var(--text)' }}>{fmtINR(Math.round(totalMonthlyEmi + reconExtra))}</b> = this bill <b style={{ color: 'var(--text)' }}>{fmtINR(Math.round(totalMonthlyEmi))}</b> + <b style={{ color: 'var(--text)' }}>{fmtINR(Math.round(reconExtra))}</b> that can't close</span>}
      </button>
      {showRecon && (
        <div className="mt-1.5 rounded-md px-3 py-2 mono" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', maxWidth: 560 }}>
          {[
            { k: 'bill', label: 'Bill the planner tracks (EMIs that can close)', amt: totalMonthlyEmi, who: '', strong: false, sign: '' },
            ...reconParts.map(x => ({ k: x.label, label: x.label, amt: x.amt, who: x.who.length <= 2 ? x.who.join(', ') : `${x.who.length} items`, strong: false, sign: '+' })),
          ].map(r => (
            <div key={r.k} className="flex items-baseline justify-between gap-4 py-0.5">
              <span className="min-w-0"><span style={{ color: 'var(--text-faint)' }}>{r.sign}</span> {r.label}{r.who && <span style={{ opacity: .7 }}> · {r.who}</span>}</span>
              <span style={{ color: 'var(--text)' }}>{fmtINR(Math.round(r.amt))}</span>
            </div>
          ))}
          {reconParts.length > 0 && (
            <div className="flex items-baseline justify-between gap-4 py-0.5 mt-0.5" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text)' }}>= All-in monthly EMIs (what Hub shows)</span>
              <b style={{ color: 'var(--text)' }}>{fmtINR(Math.round(totalMonthlyEmi + reconExtra))}</b>
            </div>
          )}
          {(otherMonthlyOutside > 0 || cardBalanceOutside > 0 || outFriend.length > 0) && (
            <div className="mt-1.5 pt-1.5" style={{ borderTop: '1px dashed var(--border)' }}>
              <div className="text-[12px] mb-0.5">Also leaving, not EMIs</div>
              {otherMonthlyOutside > 0 && <div className="flex items-baseline justify-between gap-4 py-0.5"><span>Expenses + insurance that keep recurring</span><span style={{ color: 'var(--text)' }}>{fmtINR(Math.round(otherMonthlyOutside))}/mo</span></div>}
              {outFriend.length > 0 && <div className="flex items-baseline justify-between gap-4 py-0.5"><span title={outFriend.map(r => r.name).join(', ')}>EMIs carried for friends · in no total ({outFriend.length})</span><span style={{ color: 'var(--text)' }}>{fmtINR(Math.round(sumRowEmi(outFriend)))}/mo</span></div>}
              {cardBalanceOutside > 0 && <div className="flex items-baseline justify-between gap-4 py-0.5"><span>Card balance, until paid</span><span style={{ color: 'var(--text)' }}>{fmtINR(cardBalanceOutside)}</span></div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0
    let cmp = 0
    if (sortCol === 'due') cmp = (a.due ?? 999) - (b.due ?? 999)
    else if (sortCol === 'type') cmp = a.type.localeCompare(b.type)
    else if (sortCol === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortCol === 'amount') cmp = amountSortVal(a) - amountSortVal(b)
    else if (sortCol === 'emi') cmp = (a.emi ?? 0) - (b.emi ?? 0)
    else if (sortCol === 'paid') cmp = (a.paidAmount ?? -1) - (b.paidAmount ?? -1)
    else if (sortCol === 'rate') cmp = (a.rate ?? -1) - (b.rate ?? -1)
    else if (sortCol === 'extra') cmp = (a.extraPayable ?? -1) - (b.extraPayable ?? -1)
    else if (sortCol === 'totalPending') cmp = a.totalPending - b.totalPending
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Totals footer — friend-owed rows are listed (dimmed) but excluded here, same as everywhere else.
  const sumLoanAmount   = ownFiltered.reduce((s, r) => s + (r.loanAmount ?? 0), 0)
  // A card's limit is repeated on each of its rows (Outstanding, every EMI, Spends) — it is ONE
  // limit for the whole card, so count it once per card, not once per row.
  const sumTotalLimit   = (() => {
    const perCard = new Map<string, number>()
    ownFiltered.forEach(r => { if (r.totalLimit != null) perCard.set(r.cardGroup ?? r.key, Number(r.totalLimit)) })
    return [...perCard.values()].reduce((a, b) => a + b, 0)
  })()
  const sumCCOut        = ownFiltered.reduce((s, r) => s + (r.ccOutstanding ?? 0), 0)
  const sumEmi          = ownFiltered.reduce((s, r) => s + (r.isCardEmi ? 0 : (r.emi ?? 0)), 0)
  const sumTotalPending = ownFiltered.reduce((s, r) => s + r.totalPending, 0)
  const sumPaidAmount   = ownFiltered.reduce((s, r) => s + (r.paidAmount ?? 0), 0)
  const sumExtra        = ownFiltered.reduce((s, r) => s + (r.extraPayable ?? 0), 0)

  // Headline tiles — pulled straight from the shared calculators (never recomputed by hand), so
  // they can't disagree with Dashboard/Hub/Finance Overview even though this page shows far more.
  const shared = calcOutflow(loans as any[], cards as any[], personal as any[], savings as any[], investments as any[], expenses as any[], insurance as any[])
  const monthlyIncome = monthlyIncomeTotal(income as any[])
  const freeAfterCommitments = monthlyIncome - shared.locked
  // Investments shown as a single summary tile (current worth), to match Total Debt's role on the
  // liability side — the table below still lists each investment as its own row.
  const totalCurrentValue = investTotals(investments as any[]).value

  // ── Due-date grouping (the "By Due Date" view) — keyed by day-of-month, wrapping so already-past
  // days this month sort after upcoming ones, same convention Quick Lookup/Calendar/old /commitments used.
  // A premium already paid off as a Credit Card EMI is listed here for visibility but must not add
  // to Funds Needed / By Due Date totals — its cost already shows up under that card's own CC EMI row.
  // (A one-time/"Single" premium needs no such tag: it's never pushed into this due-amount logic as a
  // recurring row in the first place, since it isn't a provision and has no recurring `emi`.)
  const dueAmount = (r: MasterRow) => (r.isCardEmi || r.paidThisCycle) ? 0 : (r.isProvision ? (r.dueThisMonth ? (r.fullAmount ?? 0) : 0) : (r.emi ?? r.totalPending ?? 0))
  const dueBuckets = new Map<number, MasterRow[]>()
  filtered.forEach(r => { const d = r.due ?? 0; if (!dueBuckets.has(d)) dueBuckets.set(d, []); dueBuckets.get(d)!.push(r) })
  const dueDays = [...dueBuckets.keys()].sort((a, b) => {
    if (a === 0) return 1; if (b === 0) return -1
    return a - b
  })
  const dueGroupKey = (d: number) => d === 0 ? 'No fixed date' : `Day ${d}`
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const daysAwayFor = (d: number) => d >= today ? d - today : (daysInMonth - today + d)
  const runningByDay = new Map<number, number>()
  ;(() => {
    let running = 0
    dueDays.filter(d => d !== 0).forEach(d => {
      running += dueBuckets.get(d)!.filter(r => !isFriendOwed(r)).reduce((a, r) => a + dueAmount(r), 0)
      runningByDay.set(d, running)
    })
  })()
  const dueGroupList = dueDays.map(dueGroupKey)

  // ── By Type / By Card groupings — same flat `filtered` list, clustered a different way. Sorted by
  // each group's own pending total (falling back to its monthly commitment for reference-only rows
  // like Investments/Insurance, which carry totalPending: 0) so the biggest groups surface first.
  const groupSort = (buckets: Map<string, MasterRow[]>) => (a: string, b: string) => {
    const val = (k: string) => {
      const own = (buckets.get(k) ?? []).filter(r => !isFriendOwed(r))
      const pending = own.reduce((s, r) => s + r.totalPending, 0)
      return pending > 0 ? pending : own.reduce((s, r) => s + (r.isCardEmi ? 0 : (r.emi ?? 0)), 0)
    }
    return val(b) - val(a)
  }
  const typeBuckets = new Map<string, MasterRow[]>()
  filtered.forEach(r => { const k = r.category ?? r.type; if (!typeBuckets.has(k)) typeBuckets.set(k, []); typeBuckets.get(k)!.push(r) })
  const typeGroupKeys = [...typeBuckets.keys()].sort(groupSort(typeBuckets))

  const cardBuckets = new Map<string, MasterRow[]>()
  filtered.forEach(r => { const k = r.cardGroup ?? r.type; if (!cardBuckets.has(k)) cardBuckets.set(k, []); cardBuckets.get(k)!.push(r) })
  const cardGroupKeys = [...cardBuckets.keys()].sort(groupSort(cardBuckets))

  const groupListFor = (mode: 'due' | 'type' | 'card') => mode === 'due' ? dueGroupList : mode === 'type' ? typeGroupKeys : cardGroupKeys
  const expandAllGroups = () => setCollapsed(c => ({ ...c, ...Object.fromEntries(groupListFor(viewMode as 'due' | 'type' | 'card').map(g => [g, false])) }))
  const collapseAllGroups = () => setCollapsed(c => ({ ...c, ...Object.fromEntries(groupListFor(viewMode as 'due' | 'type' | 'card').map(g => [g, true])) }))

  /** Shared renderer for the "By Type" and "By Card" views — same group-header/row layout as
   *  By Due Date, minus the due-specific TODAY/OVERDUE/running-total bits which don't apply here. */
  const renderGroupedByKey = (groupKeys: string[], buckets: Map<string, MasterRow[]>, showTypeBadge: boolean) => {
    const grandPending = groupKeys.reduce((t, k) => t + (buckets.get(k) ?? []).filter(r => !isFriendOwed(r)).reduce((x, r) => x + r.totalPending, 0), 0)
    return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {groupKeys.length === 0 ? (
        <div className="p-8 text-center" style={{ color: 'var(--text-faint)' }}>No items match "{search}"</div>
      ) : groupKeys.map(g => {
        const groupRows = buckets.get(g) ?? []
        if (!groupRows.length) return null
        const isCollapsed = collapsed[g] ?? true
        const ownGroupRows = groupRows.filter(r => !isFriendOwed(r))
        const groupPending = ownGroupRows.reduce((s, r) => s + r.totalPending, 0)
        const groupMonthly = ownGroupRows.reduce((s, r) => s + (r.isCardEmi ? 0 : (r.emi ?? 0)), 0)
        return (
          <div key={g}>
            <GroupHead title={g} count={groupRows.length} open={!isCollapsed} onToggle={() => toggleGroup(g)}
              accent={groupPending > 0 ? 'var(--danger)' : groupMonthly > 0 ? 'var(--warning)' : 'var(--text-faint)'}
              share={grandPending > 0 ? groupPending / grandPending : undefined}
              right={
                <span className="flex flex-col items-end sm:flex-row sm:items-center gap-1 sm:gap-1.5 text-[12px] tabular-nums">
                  {/* A group mixing EMI-bearing rows with balance-only rows shows both figures. */}
                  {groupMonthly > 0 && <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)' }}>{fmtINR(groupMonthly)}/mo</span>}
                  {groupPending > 0 && <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>pending {fmtINR(groupPending)}</span>}
                  {groupPending <= 0 && groupMonthly <= 0 && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </span>
              } />
            {!isCollapsed && groupRows.map(r => {
              const friendOwed = isFriendOwed(r)
              const dimmed = friendOwed || r.isCardEmi
              return (
                <div key={r.key} className="flex items-center gap-3 px-4 py-2 cursor-pointer" style={{ borderTop: '1px solid var(--border)', opacity: dimmed ? 0.55 : 1 }} onClick={() => navigate(r.route, { state: { from: 'master' } })}>
                  {canPick(r) ? <PickBox checked={wi.picked.has(r.key)} onToggle={() => wi.toggle(r.key)} label={`Add ${r.name} to the what-if`} /> : <span className="w-[13px] flex-shrink-0" />}
                  {showTypeBadge && (
                    <TypeBadge type={r.type} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{r.name}</div>
                    {(r.sub || friendOwed) && (
                      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {friendOwed ? `for ${r.owedBy} · excluded from totals` : r.sub}
                      </div>
                    )}
                    {r.paidAmount != null && (
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] tabular-nums">
                        {(() => {
                          const chip = (label: string, val: string, color: string) => (
                            <span key={label} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)', color: 'var(--text-faint)' }}>
                              {label} <b className="font-semibold" style={{ color }}>{val}</b>
                            </span>
                          )
                          return [
                            r.loanAmount != null && chip('borrowed', fmtINR(r.loanAmount), 'var(--text-muted)'),
                            chip('paid', fmtINR(r.paidAmount as number), 'var(--success)'),
                            r.rate != null && chip('rate', r.rate > 0 ? `${r.rate}%${r.rateEstimated ? ' ~' : ''}` : '0%', rateColor(r.rate)),
                            r.extraPayable != null && chip('extra', `${fmtINR(r.extraPayable)}${r.interestLeft != null && r.extraPayable > 0 && Math.round(r.interestLeft) !== Math.round(r.extraPayable) ? ` (${fmtINR(r.interestLeft)} left)` : ''}`, 'var(--orange, var(--warning))'),
                          ]
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {/* EMI/mo was missing here — a group used to show only Total Pending, so a Loan
                        or CC EMI row's actual monthly payment never appeared in By Type/By Card, only
                        what's left to pay off. Now EMI leads (same figure the Full List table's own
                        EMI column shows), with Total Pending underneath as the smaller secondary
                        figure when it applies — same two-value pattern the Full List table already
                        uses for Amount/limit. Rows with only one of the two (Investments/Insurance
                        have just an EMI; CC Outstanding/I Owe Lump have just a pending balance) show
                        whichever one they actually have. */}
                    {r.emi != null && <div className="mono font-bold" style={{ color: 'var(--warning)' }}>{fmtINR(r.emi)}/mo</div>}
                    {r.totalPending > 0 && <div className={r.emi != null ? 'text-[11px] mono' : 'mono font-bold'} style={{ color: r.emi != null ? 'var(--text-faint)' : 'var(--warning)' }}>{r.emi != null ? `pending ${fmtINR(r.totalPending)}` : fmtINR(r.totalPending)}</div>}
                    {r.emi == null && r.totalPending <= 0 && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
    )
  }

  const downloadCsv = () => {
    const headers = ['Sl No', 'Due', 'Type', 'Name', 'Loan Amount', 'Total Limit', 'CC Outstanding', 'EMI', 'Pending EMIs', 'Paid EMIs', 'Total EMIs', 'Total Pending', 'Paid So Far', 'Interest Rate %', 'Extra Payable (total interest)', 'Interest Left', 'Start Date', 'End Date', 'Owed By']
    const lines = [headers.join(',')]
    sorted.forEach((r, idx) => {
      lines.push([
        idx + 1, r.due ?? '', r.type, r.name, r.loanAmount ?? '', r.totalLimit ?? '', r.ccOutstanding ?? '',
        r.emi ?? '', r.pendingEmis ?? '', r.paidEmis ?? '', r.totalEmis ?? '', r.totalPending,
        r.paidAmount ?? '', r.rate != null ? `${r.rate}${r.rateEstimated ? ' (est.)' : ''}` : '', r.extraPayable ?? '', r.interestLeft ?? '',
        r.startDate ?? '', r.endDate ? `${fmtMonthYear(r.endDate)}${r.endDateEstimated ? ' (est.)' : ''}` : '',
        isFriendOwed(r) ? r.owedBy : '',
      ].map(csvCell).join(','))
    })
    lines.push(['', '', '', 'TOTAL', sumLoanAmount, sumTotalLimit, sumCCOut, sumEmi, '', '', '', sumTotalPending, sumPaidAmount, '', sumExtra, '', '', '', ''].map(csvCell).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `all-commitments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Planner export — whatever the planner is currently showing, as CSV: in month mode every list
  // (closing / still running with the projected balance / remaining), in amount mode the items the
  // entered amount closes.
  const exportPlan = () => {
    const lines = [['Section', 'Type', 'Name', 'Ends', 'EMIs left', 'EMI/mo', 'Pending', 'Pending after window'].join(',')]
    const add = (section: string, r: MasterRow, after?: number) => lines.push([
      section, r.type, r.name, r.endDate ? `${fmtMonthYear(r.endDate)}${r.endDateEstimated ? ' (est.)' : ''}` : '',
      r.pendingEmis ?? '', r.emi ?? '', r.totalPending, after ?? '',
    ].map(csvCell).join(','))
    if (closingMode === 'months' && closingCutoff) {
      closingDisplayRows.forEach(r => add(`Closing within ${closingMonthsNum}mo`, r))
      nonClosingReducing.forEach(r => add('Still running', r, Math.round(r.afterAmt)))
      remainingRows.forEach(r => add('Remaining', r))
    } else if (closingAmountPlan) {
      closingAmountPlan.closed.forEach(r => add(`Closed with ${fmtINR(closingAmountNum)}`, r))
    } else return
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `closing-plan-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3 text-[13px]">
      {/* Print-only heading — the on-screen header/toggles below are print:hidden since a printed
          page can't be clicked. */}
      <div className="hidden print:block mb-2">
        <div className="text-xl font-bold">All Commitments</div>
        <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {viewMode === 'list' ? 'Full ledger' : viewMode === 'due' ? 'Grouped by due date' : viewMode === 'type' ? 'Grouped by type' : 'Grouped by card'} · exported {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>

      <HorizonBar />

      <div className="flex items-center gap-1 print:hidden" style={{ borderBottom: '1px solid var(--border)' }}>
        {([
          { id: 'view' as const, label: '📋', full: 'All items', short: 'All', badge: String(ownRows.length) },
          { id: 'closing' as const, label: '🎯', full: 'Closing planner', short: 'Planner',
            badge: closingMode === 'months' && closingCutoff ? `${closingRows.length} closing` : closingMode === 'amount' && closingAmountPlan ? `${closingAmountPlan.closed.length} closable` : '' },
          ...(uncountedRows.length > 0 ? [{ id: 'others' as const, label: '🚫', full: 'Not counted', short: 'Not counted', badge: String(uncountedRows.length) }] : []),
        ]).map(t => {
          const on = pageTab === t.id
          return (
            <button key={t.id} onClick={() => setPageTab(t.id)} className="text-[12px] font-semibold px-3 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${on ? '#f97316' : 'transparent'}`, marginBottom: -1, color: on ? 'var(--text)' : 'var(--text-faint)', cursor: 'pointer' }}>
              {t.label}<span className="hidden sm:inline">{t.full}</span><span className="sm:hidden">{t.short}</span>
              {t.badge && <span className="mono text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: on ? 'color-mix(in srgb, #f97316 10%, transparent)' : 'var(--bg-hover)', color: on ? 'var(--orange)' : 'var(--text-faint)' }}>{t.badge}</span>}
            </button>
          )
        })}
        {pageTab === 'view' && (
          <button onClick={() => setTilesCollapsed(c => !c)} className="text-[11px] ml-auto mr-3" title="Show or hide the summary tiles" style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>
            {tilesCollapsed ? '▸' : '▾'}<span className="hidden sm:inline"> Summary</span>
          </button>
        )}
        <button onClick={() => setShowAbout(a => !a)} className={`text-[11px] ${pageTab === 'view' ? '' : 'ml-auto'}`} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>{showAbout ? '✕' : <>ⓘ<span className="hidden sm:inline"> About this page</span></>}</button>
      </div>
      {showAbout && (
        <div className="text-[11px] print:hidden rounded-lg p-3" style={{ color: 'var(--text-faint)', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          Every loan, credit card balance, I Owe, chit, SIP, bill, and insurance premium in one place. Debt figures (Loan/CC/I Owe/Chit) are the same categories Total Debt is built from everywhere else; Investments, still-building Savings, Expenses and Insurance are shown for reference and don't count toward it. End dates with no date on record are estimated, marked with ~. Click a row to edit it on its own page.
        </div>
      )}

      {/* Headline tiles — straight from the shared calculators. Collapsible: a toggle row instead of
          the tiles just vanishing, so it's obvious they're tucked away rather than missing. The
          filter bar below is deliberately OUTSIDE this toggle — it stays visible and usable even
          with the tiles tucked away, instead of being hidden along with them. */}
      {pageTab === 'view' && (
      <>
      {!tilesCollapsed && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 print:hidden">
        {[
          // Was its own "Outstanding + Spend" tile between Total Debt and Investments — folded into
          // Funds Needed's sub-line instead (per request), since that's the figure it's actually a
          // component of (the card bill is one tier of calcOutflow's total),
          // rather than a seventh tile competing for the same row.
          // The caption names what the figure actually covers: all four debt groups when nothing is filtered,
          // otherwise only the groups left in the filtered rows, plus the unfiltered total for context.
          (() => {
            const groupOf = (t: string) => /^(CC |Credit)/i.test(t) ? 'Cards' : /chit/i.test(t) ? 'Chit' : /I Owe/i.test(t) ? 'I Owe' : /loan/i.test(t) ? 'Loans' : null
            const ORDER = ['Loans', 'Cards', 'I Owe', 'Chit']
            const inFilter = new Set(ownFiltered.filter(r => r.totalPending > 0).map(r => groupOf(r.type)).filter(Boolean) as string[])
            const isFiltered = typeFilter.size > 0 || search.trim() !== ''
            const allDebt = ownRows.reduce((a, r) => a + r.totalPending, 0)
            const names = ORDER.filter(g => inFilter.has(g))
            return {
              label: isFiltered ? 'Debt · filtered' : 'Total Debt',
              value: fmtINR(sumTotalPending),
              sub: !isFiltered ? 'Loans, Cards, I Owe, Chit' : `${names.length ? names.join(', ') : 'No debt in this filter'} · of ${fmtINR(allDebt)} total`,
              hint: isFiltered ? 'Only the rows matching your type chips / search. Clear the filter to see total debt across Loans, Cards, I Owe and Chit.' : undefined,
              accent: 'var(--danger)',
            }
          })(),
          { label: 'Investments', value: fmtINR(totalCurrentValue), sub: shared.sipInvest > 0 ? `${fmtINR(shared.sipInvest)}/mo SIP` : 'current value', accent: 'var(--info)' },
          // One tile instead of "Committed / month" + "Funds Needed": the second already contains the first
          // (committed + this month's card bill), so showing both side by side read as two separate costs.
          // The breakdown is in the sub-line; any remainder that isn't committed or card bill is shown, not hidden.
          (() => {
            // Straight from the shared calculator (locked + card + renewals due now), so this tile and
            // Lookup / Dashboard / Calendar / Hub / Budget show the same figure to the rupee. It used to
            // add up this page's own rows, which counted a future I Owe lump sum and skipped loans with no due day.
            return {
              label: 'Cash needed this month', value: fmtINR(shared.total), accent: 'var(--danger)',
              sub: outflowTierLine(shared),
              hint: `Committed ${fmtINR(shared.locked)}/mo (real cash leaving every month) + credit-card outstanding ${fmtINR(shared.ccOutstanding)} + card spends ${fmtINR(shared.ccSpends)}${shared.dueNow > 0 ? ` + ${fmtINR(shared.dueNow)} of quarterly/yearly bills, premiums and one-off payments that fall due this month at full amount` : ''}${shared.setAside > 0 ? `. Not included: ${fmtINR(shared.setAside)}/mo set aside for renewals.` : ''}`,
            }
          })(),
          { label: 'Free / month', value: `${freeAfterCommitments >= 0 ? '+' : '−'}${fmtINR(Math.abs(freeAfterCommitments))}${incomePct(freeAfterCommitments, monthlyIncome)}`, sub: monthlyIncome > 0 ? `of ${fmtINR(monthlyIncome)} income · before card bill` : 'add income to see this', accent: freeAfterCommitments >= 0 ? 'var(--success)' : 'var(--danger)' },
        ].map(m => (
          <div key={m.label} title={(m as any).hint} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${m.accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`, border: `1px solid var(--hairline)` }}>
            <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              {m.label}{(m as any).hint && <span className="ml-1" style={{ opacity: 0.7 }}>ⓘ</span>}
            </div>
            <div className="text-[18px] font-semibold tracking-tight tabular-nums break-words">
              <span style={{ color: m.accent }}>{m.value}</span>
            </div>
            <div className="text-[11px] leading-snug line-clamp-2" title={String(m.sub)} style={{ color: 'var(--text-faint)' }}>{m.sub}</div>
          </div>
        ))}
      </div>
      )}
      {!tilesCollapsed && <div className="print:hidden"><IncomeSplitCard o={shared} income={monthlyIncome} /></div>}
      </>
      )}

      {/* Filter bar — always visible regardless of the Summary toggle above. Its own bordered panel
          (same visual language as the tiles/table) instead of controls floating loose on the page
          background. Split into two rows on purpose: search/multi-select/count (few items, rarely
          wraps) on top, Type chips below in their own horizontally-scrolling strip — with ~13
          possible types that row was wrapping into a ragged second line mixed in with the other
          controls, which read as a layout glitch rather than a deliberate row. Scrolling sideways
          keeps it one tidy line regardless of how many types are active, same pattern as a tab bar.
          Colors all come from theme tokens, not hardcoded white overlays, so this still looks right
          if the app is ever switched to light mode. */}
      {pageTab === 'view' && (
      <div className="print:hidden rounded-2xl px-3.5 py-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {/* Top row carries both the filter controls AND the view/export controls that used to sit
            up in the page header — one toolbar instead of two stacked rows saves a full row of
            vertical space. Wraps onto a second line on narrow widths same as it always did. */}
        <div className="flex gap-2.5 flex-wrap items-center">
          <input className="input text-[12px]" style={{ maxWidth: 220 }} placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)} />
          {/* Type filter: the shared dropdown (same control as Loans / Insurance / Expenses) */}
          <FilterMenu allLabel="All types" noun="types" allCount={ownRows.length} options={TYPES.map(t => ({ id: t, color: TYPE_COLOR[t], count: ownRows.filter(r => r.type === t).length }))} selected={typeFilter} onChange={setTypeFilter} />
          <div className="flex p-0.5 rounded-xl flex-shrink-0 gap-0.5" style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)' }} role="tablist" aria-label="Layout">
            {([['list', 'Full list'], ['due', 'By due date'], ['type', 'By type'], ['card', 'By card']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={viewMode === id} className="text-[12px] px-3 py-1 rounded-[10px] font-medium transition-all"
                style={{ background: viewMode === id ? 'var(--bg-card)' : 'transparent', color: viewMode === id ? 'var(--text)' : 'var(--text-muted)', boxShadow: viewMode === id ? '0 1px 2px rgba(0,0,0,.25), inset 0 0 0 1px color-mix(in srgb, #f97316 45%, transparent)' : 'none' }}
                onClick={() => setViewMode(id)}>{label}</button>
            ))}
          </div>
          <SelectAllLink total={pickableShown.length} selected={pickableShown.filter(r => wi.picked.has(r.key)).length}
            onSelectAll={() => pickableShown.forEach(r => { if (!wi.picked.has(r.key)) wi.toggle(r.key) })} onClear={wi.clear} />
          {(viewMode === 'due' || viewMode === 'type' || viewMode === 'card') && (
            <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
              <button className="text-[11px] px-2.5 py-1.5 font-medium hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} onClick={expandAllGroups}>Expand all</button>
              <button className="text-[11px] px-2.5 py-1.5 font-medium hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border)' }} onClick={collapseAllGroups}>Collapse all</button>
            </div>
          )}
          <button className="text-[11px] px-3 py-1.5 rounded-lg font-medium flex-shrink-0 hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }} onClick={handlePrint}>
            Print / PDF
          </button>
          <button className="btn-primary btn-sm flex-shrink-0" onClick={downloadCsv}><Download size={14} /> CSV</button>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-faint)' }} title="This page lists every active commitment year-round. Calendar's 'payments due' count only includes the ones actually charging this month — a non-monthly premium/bill between renewals is listed here but not there.">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}{chargingThisMonth !== filtered.length ? ` · ${chargingThisMonth} charging this month` : ''}
          </span>
        </div>
        {/* Same breakdown strip as Calendar / Lookup (shared <KindStrip>), driven by the Type filter above —
            one source of truth: a pill toggles its type in the filter, so pills and dropdown always agree. */}
        {TYPES.length > 1 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <KindStrip
              chips={TYPES.map(t => ({ id: t, kind: masterKind(t), count: ownRows.filter(r => r.type === t).length }))}
              selected={typeFilter}
              onChange={setTypeFilter}
              trail={(() => { const k = ownRows.filter(r => !r.charging).length; return k > 0 ? <span title="Listed here but with no payment landing this month (a yearly / quarterly premium or bill between renewals, a lump sum not yet due, a switched-off entry) — Calendar and Lookup leave these out of their count.">{k} reference, not charging this month</span> : null })()} />
          </div>
        )}
      </div>
      )}

      {pageTab === 'closing' && (
        <div className="print:hidden rounded-2xl p-3.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SegTabs options={[{ id: 'months', label: 'By month' }, { id: 'amount', label: 'By amount' }]} value={closingMode as any} onChange={(id: any) => setClosingMode(id)} />
            {closingMode === 'months' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>What closes within</span>
                <input type="number" min="0" step="1" inputMode="numeric" className="input text-[13px] text-center" style={{ width: 64, background: 'var(--bg-hover)', borderColor: 'var(--hairline)' }} placeholder="6" value={closingMonths} onChange={e => setClosingMonths(e.target.value)} />
                <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>months</span>
                {[3, 6, 12, 24].map(n => (
                  <button key={n} onClick={() => setClosingMonths(closingMonths === String(n) ? '' : String(n))}
                    className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: closingMonths === String(n) ? '#c2410c' : 'transparent', color: closingMonths === String(n) ? 'white' : 'var(--text-muted)', border: '1px solid var(--hairline)', cursor: 'pointer' }}>{n}</button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>I have ₹</span>
                <input type="number" min="0" step="1000" inputMode="numeric" className="input text-[13px] text-center" style={{ width: 110, background: 'var(--bg-hover)', borderColor: 'var(--hairline)' }} placeholder="50000" value={closingAmount} onChange={e => setClosingAmount(e.target.value)} />
                {[25000, 50000, 100000, 500000].map(n => (
                  <button key={n} onClick={() => setClosingAmount(closingAmount === String(n) ? '' : String(n))}
                    className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: closingAmount === String(n) ? '#c2410c' : 'transparent', color: closingAmount === String(n) ? 'white' : 'var(--text-muted)', border: '1px solid var(--hairline)', cursor: 'pointer' }}>{fmtINR(n)}</button>
                ))}
                <SegTabs className="ml-1" options={[{ id: 'smallest', label: 'Smallest balance first' }, { id: 'relief', label: 'Most EMI freed per ₹' }]} value={amountStrategy as any} onChange={(id: any) => setAmountStrategy(id)} />
              </div>
            )}
            <button onClick={exportPlan} disabled={!((closingMode === 'months' && closingCutoff) || closingAmountPlan)} className="ml-auto text-[11px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', opacity: ((closingMode === 'months' && closingCutoff) || closingAmountPlan) ? 1 : 0.4 }}><Download size={13} /> Export plan</button>
          </div>
          {/* Nothing entered yet — say what to do instead of showing an empty page. */}
          {((closingMode === 'months' && !closingCutoff) || (closingMode === 'amount' && !(closingAmountNum > 0))) && (
            <div className="text-[12px] mt-3 text-center py-8 rounded-xl" style={{ border: '1px dashed var(--hairline)', color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
              <div className="text-2xl mb-1.5">🎯</div>
              {closingMode === 'months'
                ? 'Pick a window above (or type any number of months) to see which EMIs close by then, what it costs, and how your monthly bill drops.'
                : 'Enter what you have today to see which commitments it can fully close — pick the order with the toggle above.'}
              <div className="text-[11px] mt-1">This planner always looks at everything on the books — it isn't affected by the filters on the other tab.</div>
            </div>
          )}
        </div>
      )}

      {pageTab === 'closing' && (
      <>
      {/* "Closing within N months" callout — which EMIs finish by then, and what's still owed on
          them from today. Separate from the filter bar's Type/search filters: this always looks at
          every commitment, not just whatever's currently filtered into view, so a Type filter
          doesn't quietly change what "closing soon" means. */}
      {closingMode === 'months' && closingCutoff && (
        <div className="rounded-2xl p-3 print:hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[12px]">
            {closingDisplayRows.length === 0 ? (
              <>Nothing closes in the next <b>{closingMonthsNum}</b> month{closingMonthsNum !== 1 ? 's' : ''} (by {fmtMonthYear(closingCutoff.toISOString())}). <b>{totalAllCount}</b> item{totalAllCount !== 1 ? 's' : ''} on the books.</>
            ) : closingRows.length === 0 ? (
              <>No debt EMIs close within <b>{closingMonthsNum}</b> month{closingMonthsNum !== 1 ? 's' : ''} (by {fmtMonthYear(closingCutoff.toISOString())}), but <b>{closingReferenceRows.length}</b> non-debt item{closingReferenceRows.length !== 1 ? 's' : ''} (Investment/SIP, Insurance) end{closingReferenceRows.length === 1 ? 's' : ''} in that window — see below.</>
            ) : (
              // Was three lines of running text (what closes / how the bill drops / what's not
              // included). Same facts as four scannable tiles — each one a single number you can read
              // at a glance, with the detail underneath it.
              <><div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-2 items-stretch"><div className="grid grid-cols-2 gap-2 content-start">
                {[
                  { label: `Closing by ${fmtMonthYear(closingCutoff.toISOString())}`, value: `${closingRows.length} EMI${closingRows.length !== 1 ? 's' : ''}`, sub: `${totalAllCount} now → ${remainingAllCount} remaining${closingReferenceRows.length > 0 ? ` · +${closingReferenceRows.length} SIP/ins.` : ''}`, accent: 'var(--danger)' },
                  { label: 'Needed to close', value: fmtINR(closingRequired), sub: `from today, for ${closingRows.length === 1 ? 'this EMI' : `all ${closingRows.length}`}`, accent: 'var(--success)' },
                  // What the user asked for: after closing these, how much do I still owe in total?
                  { label: 'Total left after closing', value: fmtINR(Math.max(0, planOwnTotal - closingRequired)), sub: `of ${fmtINR(planOwnTotal)} owed now · ${fmtINR(Math.max(0, planOwnTotal - closingRequired - totalReduceAmt))} by ${fmtMonthYear(closingCutoff.toISOString())} if the rest keep paying their EMIs`, accent: 'var(--info)' },
                  // The lump sum (tile above) is what it costs to close them; this is the separate,
                  // ongoing effect — the monthly EMI bill itself drops once those installments stop.
                  { label: 'Monthly EMI bill', value: `−${fmtINR(Math.round(closingMonthlyEmi))}/mo`, sub: `${fmtINR(Math.round(totalMonthlyEmi))} → ${fmtINR(Math.round(remainingMonthlyEmi))} per month${monthlyIncome > 0 ? ` · ${Math.round(totalMonthlyEmi / monthlyIncome * 100)}% → ${Math.round(remainingMonthlyEmi / monthlyIncome * 100)}% of income` : ''}`, accent: 'var(--warning)' },
                ].map(m => (
                  <div key={m.label} className="rounded-lg px-2.5 py-1.5" style={{ background: `color-mix(in srgb, ${m.accent} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${m.accent} 22%, transparent)` }}>
                    <div className="text-[12px] truncate" style={{ color: 'var(--text-faint)' }}>{m.label}</div>
                    <div className="text-[15px] font-semibold tracking-tight mono truncate leading-tight" style={{ color: m.accent === 'var(--text-faint)' ? 'var(--text)' : m.accent }}>{m.value}</div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }} title={m.sub}>{m.sub}</div>
                  </div>
                ))}
              </div>{monthChart}</div>{reconLine}
</>
            )}
          </div>
          {/* Closing / Still running / Remaining used to be three unbounded lists stacked one under the
              other — with a big book that meant scrolling past hundreds of rows to get from one to the
              next. Now: a month-by-month timeline to jump straight to a window, one segmented tab
              control (one list on screen at a time), a search box, and each list capped at LIMIT rows
              with "Show all N" opening an internal scroll area (so even "all" never grows the page). */}
          {(closingDisplayRows.length > 0 || nonClosingReducing.length > 0 || remainingRows.length > 0) && (() => {
            const LIMIT = 6
            const q = panelSearch.trim().toLowerCase()
            const matches = (r: MasterRow) => !q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)
            function cap<T>(arr: T[]): T[] { return panelShowAll ? arr : arr.slice(0, LIMIT) }
            const closingList = closingDisplayRows.filter(r => matches(r) && (!closingMonthPick || mkey(r.endDate as string) === closingMonthPick))
            const runningList = nonClosingReducing.filter(matches)
            const remainingList = remainingRows.filter(matches)
            const tabs: { id: 'closing' | 'running' | 'remaining'; label: string; count: number; total: number; color: string }[] = [
              { id: 'closing', label: 'Closing', count: closingList.length, total: closingDisplayRows.length, color: 'var(--danger)' },
              { id: 'running', label: 'Still running', count: runningList.length, total: nonClosingReducing.length, color: 'var(--warning)' },
              { id: 'remaining', label: 'Remaining', count: remainingList.length, total: remainingRows.length, color: 'var(--text-faint)' },
            ]
            const active = tabs.find(t => t.id === closingTab) ?? tabs[0]
            const typePill = (r: MasterRow) => (
              <TypeBadge type={r.type} />
            )
            // Tick-box for the pick-and-close summary — only on rows that actually have a balance to
            // close; reference-only rows get a same-width spacer so names still line up.
            const pickBox = (r: MasterRow) => r.totalPending > 0
              ? <input type="checkbox" className="flex-shrink-0" checked={picked.has(r.key)} onClick={e => e.stopPropagation()} onChange={() => togglePick(r.key)} title="Add to the what-if summary" />
              : <span className="flex-shrink-0" style={{ width: 13 }} />
            const go = (r: MasterRow) => navigate(r.route, { state: { from: 'master' } })
            return (
              <div className="mt-3">
                {closingRows.length === 0 && monthChart}
                {/* Needs-attention strip — the two things worth a look that the lists bury: insurance
                    renewals that look overdue, and EMIs that barely move over this window. Each jumps
                    straight to the right list. */}
                {(() => {
                  const behindIns = rows.filter(r => {
                    if (isUncounted(r) || !r.lastDueDate) return false
                    const paid = r.lastPaidDate ? new Date(r.lastPaidDate) : null
                    return !paid || paid < new Date(r.lastDueDate)
                  }).length
                  const slow = nonClosingReducing.filter(r => r.pctReduced < 0.15).length
                  if (!behindIns && !slow) return null
                  const chip = (color: string): React.CSSProperties => ({ background: `color-mix(in srgb, ${color} 12%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`, cursor: 'pointer' })
                  return (
                    <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
                      {behindIns > 0 && <button className="px-2.5 py-1 rounded-full font-semibold" style={chip('var(--danger)')} onClick={() => { setClosingTab('remaining'); setPanelSearch('insurance'); setPanelShowAll(false) }}>⚠ {behindIns} insurance renewal{behindIns !== 1 ? 's' : ''} {behindIns === 1 ? 'looks' : 'look'} overdue</button>}
                      {slow > 0 && <button className="px-2.5 py-1 rounded-full font-semibold" style={chip('var(--warning)')} onClick={() => { setClosingTab('running'); setPanelSearch(''); setPanelShowAll(false) }}>⏳ {slow} EMI{slow !== 1 ? 's' : ''} under 15% cleared in this window</button>}
                    </div>
                  )
                })()}
                {/* What-if summary — appears once something is ticked. Closing a loan fully costs its
                    whole pending balance and stops its EMI, so both figures are plain sums. */}
                {picked.size > 0 && (() => {
                  const sel = allEmiRows.filter(r => picked.has(r.key))
                  if (sel.length === 0) return null
                  const need = sel.reduce((sum, r) => sum + r.totalPending, 0)
                  const free = sel.reduce((sum, r) => sum + (r.emi ?? 0), 0)
                  return (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ background: 'color-mix(in srgb, #f97316 10%, transparent)', border: '1px solid color-mix(in srgb, #f97316 30%, transparent)' }}>
                      <b>✓ {sel.length} selected</b>
                      <span>needs <b className="mono" style={{ color: 'var(--danger)' }}>{fmtINR(need)}</b> to close</span>
                      <span>frees <b className="mono" style={{ color: 'var(--success)' }}>{fmtINR(Math.round(free))}/mo</b></span>
                      <span className="mono" style={{ color: 'var(--text-faint)' }}>bill {fmtINR(Math.round(totalMonthlyEmi))} → {fmtINR(Math.round(totalMonthlyEmi - free))}{monthlyIncome > 0 ? ` · ${Math.round((totalMonthlyEmi - free) / monthlyIncome * 100)}% of income` : ''}</span>
                      <button onClick={() => setPicked(new Set())} className="ml-auto" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11 }}>clear ✕</button>
                    </div>
                  )
                })()}
                {/* Segmented tabs + search */}
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <SegTabs options={tabs.map(t => ({ id: t.id, label: t.label, badge: t.total, color: t.color }))} value={active.id as any} onChange={(id: any) => { setClosingTab(id); setPanelShowAll(false) }} />
                  <input value={panelSearch} onChange={e => { setPanelSearch(e.target.value); setPanelShowAll(false) }} placeholder="Search these lists…"
                    className="text-[11px] px-2 py-1 rounded-lg flex-1 min-w-[120px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
                </div>
                {/* One-line caption per tab so the list isn't unlabeled */}
                <div className="text-[11px] mb-1.5" style={{ color: 'var(--text-faint)' }}>
                  {active.id === 'closing' && <>Ending by <b style={{ color: 'var(--text)' }}>{fmtMonthYear(closingCutoff.toISOString())}</b>{closingMonthPick && <> · filtered to <b style={{ color: 'var(--text)' }}>{timeline.get(closingMonthPick)?.label}</b></>}{closingList.some(r => r.endDateEstimated) && <> · <b style={{ color: 'var(--text-muted)' }}>~</b> = end date estimated from EMIs left</>}</>}
                  {active.id === 'running' && <>Keep running past {fmtMonthYear(closingCutoff.toISOString())}, but reduce by <b style={{ color: 'var(--warning)' }}>~{fmtINR(Math.round(totalReduceAmt))}</b> over {closingMonthsNum} month{closingMonthsNum !== 1 ? 's' : ''} · biggest balance left first</>}
                  {active.id === 'remaining' && <>Everything not closing — still-running EMIs, balance-only rows, and reference-only rows (Investments, Expenses, Insurance)</>}
                </div>
                {(active.id === 'closing' || active.id === 'running') && active.count > 0 && (
                  <div className="text-[11px] mb-1">
                    {(() => {
                      const list = (active.id === 'closing' ? closingList : runningList).filter(r => r.totalPending > 0)
                      const allOn = list.length > 0 && list.every(r => picked.has(r.key))
                      return (
                        <button onClick={() => setPicked(prev => { const n = new Set(prev); list.forEach(r => allOn ? n.delete(r.key) : n.add(r.key)); return n })}
                          style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                          {allOn ? `☐ Deselect all ${list.length}` : `☑ Select all ${list.length} for a what-if`}
                        </button>
                      )
                    })()}
                  </div>
                )}
                {active.count === 0 ? (
                  <div className="rounded-lg p-4 text-center text-[11px]" style={{ border: '1px dashed var(--border)', color: 'var(--text-faint)' }}>
                    {q || closingMonthPick ? 'No matches — clear the search or month filter.' : 'Nothing in this bucket.'}
                  </div>
                ) : (
                  <div className="rounded-lg" style={{ border: '1px solid var(--border)', maxHeight: panelShowAll ? '60vh' : undefined, overflowY: panelShowAll ? 'auto' : 'hidden' }}>
                    {active.id === 'closing' && cap(closingList).map((r, idx) => {
                      const isReference = r.totalPending <= 0
                      return (
                        <div key={r.key} className="flex items-center gap-3 px-3 py-1.5 cursor-pointer" style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }} onClick={() => go(r)}>
                          {pickBox(r)}{typePill(r)}
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{r.name}</div>
                            <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                              {isReference
                                ? `matures ${fmtMonthYear(r.endDate as string)}${r.endDateEstimated ? ' ~' : ''}`
                                : <>closes {fmtMonthYear(r.endDate as string)}{r.endDateEstimated && ' ~'}{r.pendingEmis != null && typeof r.pendingEmis === 'number' ? ` · ${r.pendingEmis} EMI${r.pendingEmis === 1 ? '' : 's'} left` : ''}</>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="mono font-bold text-[12px]" style={{ color: 'var(--warning)' }}>{fmtINR(r.emi ?? 0)}/mo</div>
                            {isReference
                              ? <div className="text-[11px] mono" style={{ color: 'var(--text-faint)' }}>reference only</div>
                              : <div className="text-[11px] mono" style={{ color: 'var(--text-faint)' }}>pending {fmtINR(r.totalPending)}</div>}
                          </div>
                        </div>
                      )
                    })}
                    {active.id === 'running' && cap(runningList).map((r, idx) => {
                      const longWayToGo = r.pctReduced < 0.15
                      return (
                        <div key={r.key} className="px-3 py-1.5 cursor-pointer" style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }} onClick={() => go(r)}>
                          <div className="flex items-center gap-3">
                            {pickBox(r)}{typePill(r)}
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                                {r.name}
                                {longWayToGo && <span className="text-[11px] font-bold px-1 py-0.5 rounded flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)' }}>⚠ long way to go</span>}
                              </div>
                              <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>still running past {fmtMonthYear(r.endDate as string)}{r.endDateEstimated && ' ~'}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="mono font-bold text-[12px]" style={{ color: 'var(--text-faint)' }}>{fmtINR(r.totalPending)} → <span style={{ color: 'var(--success)' }}>{fmtINR(Math.round(r.afterAmt))}</span></div>
                              <div className="text-[11px] mono" style={{ color: 'var(--warning)' }}>−{fmtINR(Math.round(r.reduceAmt))} ~ ({Math.round(r.pctReduced * 100)}%)</div>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: 'var(--border)' }}>
                            <div className="h-full" style={{ width: `${r.pctReduced * 100}%`, background: longWayToGo ? 'var(--danger)' : 'var(--success)' }} />
                          </div>
                        </div>
                      )
                    })}
                    {active.id === 'remaining' && cap(remainingList).map((r, idx) => {
                      const friendOwed = isFriendOwed(r)
                      const reducing = nonClosingReducingByKey.get(r.key)
                      return (
                        <div key={r.key} className="flex items-center gap-3 px-3 py-1.5 cursor-pointer" style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)', opacity: friendOwed || r.isCardEmi ? 0.55 : 1 }} onClick={() => go(r)}>
                          {typePill(r)}
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{r.name}</div>
                            <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                              {friendOwed ? `for ${r.owedBy} · excluded from totals`
                                : reducing ? `still running past ${fmtMonthYear(r.endDate as string)}${r.endDateEstimated ? ' ~' : ''}`
                                : r.endDate ? `runs past ${fmtMonthYear(r.endDate)}${r.endDateEstimated ? ' ~' : ''}`
                                : r.sub || 'no fixed schedule'}
                              {(r.lastPaidDate || r.lastDueDate) && (() => {
                                const due = r.lastDueDate ? new Date(r.lastDueDate) : null
                                const paid = r.lastPaidDate ? new Date(r.lastPaidDate) : null
                                const behind = due && (!paid || paid < due)
                                return behind ? (
                                  <> · <span style={{ color: 'var(--danger)' }}>
                                    ⚠ renewal due {fmtMonthYear(r.lastDueDate as string)}{paid ? `, last paid ${fmtMonthYear(r.lastPaidDate as string)}` : ' (no payment recorded)'}
                                  </span></>
                                ) : (
                                  <> · last paid {fmtMonthYear((r.lastPaidDate ?? r.lastDueDate) as string)}</>
                                )
                              })()}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {reducing ? (
                              <>
                                <div className="mono font-bold text-[12px]" style={{ color: 'var(--text-faint)' }}>{fmtINR(reducing.totalPending)} → <span style={{ color: 'var(--success)' }}>{fmtINR(Math.round(reducing.afterAmt))}</span></div>
                                <div className="text-[11px] mono" style={{ color: 'var(--warning)' }}>−{fmtINR(Math.round(reducing.reduceAmt))} ~</div>
                              </>
                            ) : r.totalPending > 0 ? (
                              <div className="mono font-bold text-[12px]" style={{ color: 'var(--warning)' }}>pending {fmtINR(r.totalPending)}</div>
                            ) : r.emi != null ? (
                              <>
                                <div className="mono text-[11px]" style={{ color: 'var(--text-faint)' }}>{fmtINR(r.emi)}/mo</div>
                                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                                  {r.endDate ? `${monthsUntil(r.endDate)}mo left · payments continue${r.endDateEstimated ? ' ~' : ''}` : 'reference only'}
                                </div>
                              </>
                            ) : (
                              <span style={{ color: 'var(--text-faint)' }}>—</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {active.count > LIMIT && (
                  <button onClick={() => setPanelShowAll(s => !s)} className="w-full mt-1.5 py-1 text-[11px] font-semibold rounded-lg"
                    style={{ background: 'color-mix(in srgb, var(--text-faint) 10%, transparent)', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}>
                    {panelShowAll ? `▲ Show top ${LIMIT} only` : `▼ Show all ${active.count} (scrolls inside the box)`}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* "By amount" — the budget-driven version of the panel above: instead of a time window,
          enter what you actually have today and see what it can fully close right now. */}
      {closingMode === 'amount' && closingAmountNum > 0 && closingAmountPlan && (
        <div className="rounded-2xl p-3 print:hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[12px]">
            {closingAmountPlan.closed.length === 0 ? (
              closingAmountPlan.nextUp ? (
                <>
                  <b>{fmtINR(closingAmountNum)}</b> isn't enough to fully close anything yet. The next in line is <b>{closingAmountPlan.nextUp.name}</b> at <b style={{ color: 'var(--warning)' }}>{fmtINR(closingAmountPlan.nextUp.totalPending)}</b> — <b>{fmtINR(closingAmountPlan.nextUp.totalPending - closingAmountNum)}</b> more would close it.
                </>
              ) : (
                <>No open EMIs to close — nothing to spend this on.</>
              )
            ) : (
              <>
                <b>{fmtINR(closingAmountNum)}</b> fully closes <b>{closingAmountPlan.closed.length}</b> item{closingAmountPlan.closed.length !== 1 ? 's' : ''}, freeing <b style={{ color: 'var(--warning)' }}>{fmtINR(Math.round(closingAmountPlan.emiFreed))}/mo</b> — {fmtINR(closingAmountPlan.leftOver)} left over
                {closingAmountPlan.nextUp && <>, {fmtINR(closingAmountPlan.nextUp.totalPending - closingAmountPlan.leftOver)} short of also closing <b>{closingAmountPlan.nextUp.name}</b></>}.
                <div className="mt-1">Total debt left after: <b className="mono" style={{ color: 'var(--info)' }}>{fmtINR(Math.max(0, planOwnTotal - closingAmountPlan.spent))}</b> <span style={{ color: 'var(--text-faint)' }}>(of {fmtINR(planOwnTotal)} now)</span> · monthly EMI bill {fmtINR(Math.round(totalMonthlyEmi))} → <b className="mono">{fmtINR(Math.round(totalMonthlyEmi - closingAmountPlan.emiFreed))}</b></div>
              </>
            )}
          </div>
          {closingAmountPlan.closed.length > 0 && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {closingAmountPlan.closed.map((r, idx) => (
                <div key={r.key} className="flex items-center gap-3 px-3 py-1.5 cursor-pointer" style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }} onClick={() => navigate(r.route, { state: { from: 'master' } })}>
                  <TypeBadge type={r.type} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{r.name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>fully closes · {r.emi != null ? `${fmtINR(r.emi)}/mo freed` : ''}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="mono font-bold text-[12px]" style={{ color: 'var(--danger)' }}>{fmtINR(r.totalPending)}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                <span className="text-[11px] font-semibold">Spent {fmtINR(closingAmountPlan.spent)} of {fmtINR(closingAmountNum)}</span>
                <span className="mono font-bold text-[12px]" style={{ color: 'var(--success)' }}>{fmtINR(closingAmountPlan.leftOver)} left over</span>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {pageTab === 'view' && (
        <WhatIfBar count={pickedRows.length} need={pickNeed} free={pickFree} billNow={pickBill} income={monthlyIncomeTotal(income as any[])} onClear={wi.clear} />
      )}
      {pageTab === 'view' && (rows.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-5xl mb-3">🎉</div>
          <div className="font-bold text-xl text-green-400">Nothing on the books!</div>
        </div>
      ) : viewMode === 'type' ? (
        renderGroupedByKey(typeGroupKeys, typeBuckets, true)
      ) : viewMode === 'card' ? (
        renderGroupedByKey(cardGroupKeys, cardBuckets, true)
      ) : viewMode === 'list' ? (
        <div className="rounded-2xl overflow-x-auto text-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 1020 }}>
            <thead>
              <tr className="text-[11px] font-medium" style={{ background: 'color-mix(in srgb, var(--text) 4%, var(--bg-card))', color: 'var(--text-faint)', borderBottom: '1px solid var(--hairline)' }}>
                <th className="px-2 py-2.5 w-6" title="Tick to see what closing would cost and free"><span className="sr-only">Select</span></th>
                <th className="text-center px-2 py-2.5"><SortHeader label="Due" col="due" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="center" /></th>
                <th className="text-left px-2 py-2.5"><SortHeader label="Type" col="type" sortCol={sortCol} sortDir={sortDir} onSort={onSort} /></th>
                <th className="text-left px-2 py-2.5"><SortHeader label="Name" col="name" sortCol={sortCol} sortDir={sortDir} onSort={onSort} /></th>
                <th className="text-right px-2 py-2.5"><SortHeader label="Borrowed / bal." col="amount" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></th>
                <th className="text-right px-2 py-2.5"><SortHeader label="Rate" col="rate" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></th>
                <th className="text-right px-2 py-2.5"><SortHeader label="Extra payable" col="extra" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></th>
                <th className="text-right px-2 py-2.5"><SortHeader label="EMI" col="emi" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></th>
                <th className="text-center px-2 py-2.5">Progress</th>
                <th className="text-right px-2 py-2.5"><SortHeader label="Paid so far" col="paid" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></th>
                <th className="text-right px-2 py-2.5"><SortHeader label="Total pending" col="totalPending" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" /></th>
                <th className="text-center px-2 py-2.5">Ends</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const friendOwed = isFriendOwed(r)
                const dimmed = friendOwed || r.isCardEmi
                // Amount: the primary figure (what's actually owed/insured/invested on this row) in
                // bold, with the card limit — the one value that can legitimately sit alongside it —
                // as a small muted second line. Every other row type only ever has one of these three
                // fields set at all, so there's nothing to stack for them.
                const amountPrimary = r.ccOutstanding ?? r.loanAmount ?? null
                return (
                  <tr key={r.key} className="cursor-pointer transition-colors" style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)', opacity: dimmed ? 0.55 : 1 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    onClick={() => navigate(r.route, { state: { from: 'master' } })}>
                    <td className="px-2 py-2.5 w-6">{canPick(r) && <PickBox checked={wi.picked.has(r.key)} onToggle={() => wi.toggle(r.key)} label={`Add ${r.name} to the what-if`} />}</td>
                    <td className="text-center px-2 py-2.5" style={{ color: 'var(--text-faint)' }}>{r.due ?? '—'}</td>
                    <td className="px-2 py-2.5">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-2 py-2.5 font-medium" style={{ minWidth: 150 }}>
                      {r.name}
                      {r.sub && <div className="text-[11px] font-normal" style={{ color: 'var(--text-faint)' }}>{r.sub}</div>}
                      {friendOwed && (
                        <div className="mt-0.5">
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--info) 12%, transparent)', color: 'var(--info)', border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)' }}>
                            for {r.owedBy} · excluded from totals
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="text-right px-2 py-2.5">
                      {amountPrimary != null && <div className="mono font-semibold" style={{ color: r.ccOutstanding != null ? 'var(--danger)' : undefined }}>{fmtINR(amountPrimary)}</div>}
                      {r.totalLimit != null && <div className="text-[11px] mono" style={{ color: 'var(--text-faint)' }} title="Limit of the whole card — shared by all of its EMIs and spends, not this item's own amount">card limit {fmtINR(r.totalLimit)}</div>}
                      {r.type === 'CC EMI' && amountPrimary == null && <div className="text-[11px]" style={{ color: 'var(--text-faint)' }} title="Add the amount borrowed when editing this EMI on the Cards page">borrowed: not entered</div>}
                      {amountPrimary == null && r.totalLimit == null && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                    <td className="text-right px-2 py-2.5 mono whitespace-nowrap" title={r.rateEstimated ? `Worked out from the EMI, amount and tenure (same as the Loans page)${r.enteredRate != null && Math.abs(r.enteredRate - (r.rate ?? 0)) > 0.5 ? ` — the rate saved on the record is ${r.enteredRate}%, which does not match the EMIs` : ''}` : 'Rate you entered'}>
                      {r.rate != null && r.rate > 0 ? <span className="font-semibold" style={{ color: rateColor(r.rate) }}>{r.rate}%{r.rateEstimated && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> ~</span>}</span> : r.rate === 0 ? <span style={{ color: 'var(--success)' }}>0% (no-cost)</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                    <td className="text-right px-2 py-2.5">
                      {r.extraPayable != null ? (<>
                        <div className="mono font-semibold" style={{ color: r.extraPayable > 0 ? 'var(--orange, var(--warning))' : 'var(--text-faint)' }}>{fmtINR(r.extraPayable)}</div>
                        {r.interestLeft != null && r.extraPayable > 0 && Math.round(r.interestLeft) !== Math.round(r.extraPayable) && <div className="text-[11px] mono" style={{ color: 'var(--text-faint)' }}>{fmtINR(r.interestLeft)} left</div>}
                      </>) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                    <td className="text-right px-2 py-2.5 mono font-semibold">{r.emi != null ? fmtINR(r.emi) : '—'}</td>
                    <td className="text-center px-2 py-2.5">
                      {r.totalEmis != null ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[11px] font-semibold mono">{r.paidEmis ?? 0}/{r.totalEmis}</span>
                          <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                            <div className="h-full rounded-full" style={{ width: `${r.totalEmis > 0 ? Math.min(100, ((r.paidEmis ?? 0) / r.totalEmis) * 100) : 0}%`, background: 'var(--success)' }} />
                          </div>
                        </div>
                      ) : r.paidEmis != null ? (
                        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{r.paidEmis} paid</span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>—</span>
                      )}
                    </td>
                    <td className="text-right px-2 py-2.5 mono" style={{ color: r.paidAmount != null ? 'var(--success)' : 'var(--text-faint)' }}>{r.paidAmount != null ? fmtINR(r.paidAmount) : '—'}</td>
                    <td className="text-right px-2 py-2.5 mono font-bold" style={{ color: 'var(--warning)' }}>{r.totalPending > 0 ? fmtINR(r.totalPending) : '—'}</td>
                    <td className="text-center px-2 py-2.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
                      {!r.endDate ? '—' : (
                        <span title={`${r.startDate ? fmtMY(r.startDate) + ' → ' : 'Ends '}${fmtMY(r.endDate)}${r.endDateEstimated ? ' (estimated from months remaining — no end date on record)' : ''}`}>{fmtMY(r.endDate)}{r.endDateEstimated && <span style={{ opacity: 0.7 }}> ~</span>}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold text-[12px]" style={{ background: 'var(--bg-hover)', borderTop: '1px solid var(--border-2)' }}>
                <td className="px-2 py-2.5" colSpan={4}>Total ({filtered.length})</td>
                <td className="text-right px-2 py-2.5">
                  <div className="mono">{fmtINR(sumLoanAmount + sumCCOut)}</div>
                  {sumTotalLimit > 0 && <div className="text-[11px] mono font-normal" style={{ color: 'var(--text-faint)' }} title="Each card's limit counted once">card limits {fmtINR(sumTotalLimit)}</div>}
                </td>
                <td></td>
                <td className="text-right px-2 py-2.5 mono" style={{ color: 'var(--orange, var(--warning))' }}>{fmtINR(sumExtra)}</td>
                <td className="text-right px-2 py-2.5 mono">{fmtINR(sumEmi)}</td>
                <td></td>
                <td className="text-right px-2 py-2.5 mono" style={{ color: 'var(--success)' }}>{fmtINR(sumPaidAmount)}</td>
                <td className="text-right px-2 py-2.5 mono" style={{ color: 'var(--warning)' }}>{fmtINR(sumTotalPending)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {dueGroupList.every(g => (dueBuckets.get(g === 'No fixed date' ? 0 : Number(g.replace('Day ', ''))) ?? []).length === 0) ? (
            <div className="p-8 text-center" style={{ color: 'var(--text-faint)' }}>No items match "{search}"</div>
          ) : dueDays.map(d => {
            const g = dueGroupKey(d)
            const groupRows = (dueBuckets.get(d) ?? []).sort((a, b) => dueAmount(b) - dueAmount(a))
            if (!groupRows.length) return null
            const isCollapsed = collapsed[g] ?? true
            const ownGroupRows = groupRows.filter(r => !isFriendOwed(r))
            const groupDueAmount = ownGroupRows.reduce((s, r) => s + dueAmount(r), 0)
            const isTodayGroup = d === today
            const groupPaid = ownGroupRows.some(r => dueAmount(r) > 0) && ownGroupRows.filter(r => dueAmount(r) > 0).every(r => paidRows.has(r.key))
            const isOverdueGroup = d > 0 && d < today && !groupPaid
            const daysAway = d > 0 ? daysAwayFor(d) : null
            const running = d > 0 ? runningByDay.get(d) : null
            return (
              <div key={g}>
                <GroupHead
                  title={g} count={groupRows.length} open={!isCollapsed} onToggle={() => toggleGroup(g)}
                  accent={g === 'No fixed date' ? 'var(--text-faint)' : isTodayGroup ? 'var(--warning)' : isOverdueGroup ? 'var(--danger)' : groupPaid && d < today ? 'var(--success)' : 'var(--info)'}
                  tag={isTodayGroup
                    ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--warning) 16%, transparent)', color: 'var(--warning)' }}>Today</span>
                    : groupPaid && d > 0 && d < today
                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 14%, transparent)', color: 'var(--success)' }}>✓ Paid</span>
                    : isOverdueGroup
                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger)' }}>{today - d}d overdue</span>
                      : daysAway !== null ? <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>in {daysAway}d</span> : null}
                  right={g === 'No fixed date'
                    ? <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>no set date</span>
                    : (
                      <span className="flex flex-col items-end leading-tight tabular-nums">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{fmtINR(groupDueAmount)}</span>
                        {running != null && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{fmtINR(running)} cumulative</span>}
                      </span>
                    )} />
                {!isCollapsed && groupRows.map(r => {
                  const friendOwed = isFriendOwed(r)
                  const dimmed = friendOwed || r.isCardEmi
                  return (
                    <div key={r.key} className="flex items-center gap-3 px-4 py-2 cursor-pointer" style={{ borderTop: '1px solid var(--border)', opacity: dimmed ? 0.55 : 1 }} onClick={() => navigate(r.route, { state: { from: 'master' } })}>
                      {canPick(r) ? <PickBox checked={wi.picked.has(r.key)} onToggle={() => wi.toggle(r.key)} label={`Add ${r.name} to the what-if`} /> : <span className="w-[13px] flex-shrink-0" />}
                      <TypeBadge type={r.type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{r.name}</div>
                        {(r.sub || friendOwed) && (
                          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                            {friendOwed ? `for ${r.owedBy} · excluded from totals` : r.sub}
                          </div>
                        )}
                      </div>
                      <div className="text-right mono font-bold flex-shrink-0" style={{ color: r.isProvision && !r.dueThisMonth ? 'var(--text-faint)' : 'var(--warning)' }}>
                        {r.paidThisCycle ? <span style={{ color: 'var(--success)' }} title={`${fmtINR(r.fullAmount ?? 0)} premium already paid this month`}>✓ paid</span> : r.isProvision && !r.dueThisMonth ? `${fmtINR(dueAmount(r) || r.emi || 0)}/mo set aside` : fmtINR(dueAmount(r))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}

      {/* Rows left out of every total — carried for someone else, or an insurance premium already inside a card EMI.
          Their own tab (not mixed into the main list) so the list's count and sums agree, but nothing is hidden. */}
      {pageTab === 'others' && uncountedRows.length > 0 && (
        <div className="rounded-2xl overflow-hidden print:hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 text-[12px]" style={{ background: 'color-mix(in srgb, var(--info) 6%, var(--bg-card))', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
            Left out of your totals, tiles and closing planner — either <b style={{ color: 'var(--text)' }}>carried for someone else</b>, or <b style={{ color: 'var(--text)' }}>already counted inside a Credit Card EMI</b>.
          </div>
          {uncountedRows.map((r, i) => {
            const friend = isFriendOwed(r)
            return (
              <div key={r.key} onClick={() => navigate(r.route, { state: { from: 'master' } })} className="flex items-center gap-3 px-4 py-2.5 text-[12px] cursor-pointer hover:bg-[var(--bg-hover)]" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <TypeBadge type={r.type} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-[11px]" style={{ color: friend ? 'var(--info)' : 'var(--text-faint)' }}>{friend ? `for ${r.owedBy}` : 'already a Card EMI — its cost is in that card’s EMI row'}</div>
                </div>
                {r.emi != null && <span className="mono flex-shrink-0">{fmtINR(r.emi)}/mo</span>}
                <span className="mono flex-shrink-0 font-semibold" style={{ color: 'var(--warning)', minWidth: 90, textAlign: 'right' }}>{r.totalPending > 0 ? fmtINR(r.totalPending) : ''}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
