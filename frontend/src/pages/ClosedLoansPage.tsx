import { ICON } from '../components/common/icons'
import SegTabs from '../components/common/SegTabs'
import { debtFreeMonths as calcDebtFreeMonths } from '../utils/debtFree'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { closedLoansApi, expensesApi, insuranceApi, loansApi, cardsApi, savingsApi, personalEmiApi } from '../api'
import FilterMenu from '../components/common/FilterMenu'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader } from '../components/common'
import { fmtINR, getEff, toMonthly, isOneOff } from '../utils/format'
import { ioweFacts } from '../utils/iowe'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { calcLoanSplit } from '../utils/loanCalc'
import { calcDebt } from '../utils/calcDebt'
import axiosApi from '../api/axios'
const earningsApi = { getAll: () => axiosApi.get<{ data: any[] }>('/earnings').then(r => r.data.data) }
const peopleOweApiLocal = { getAll: () => axiosApi.get<{ data: any[] }>('/people-owes').then(r => r.data.data) }
const investmentsApiLocal = { getAll: () => axiosApi.get<{ data: any[] }>('/investments').then(r => r.data.data) }
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown, Info } from 'lucide-react'
import toast from 'react-hot-toast'

const ASSET_TYPES = ['Loan', 'Savings / Chit', 'Investment / SIP', 'Insurance', 'CC EMI', 'Mobile / Device', 'I Lended', 'Travel', 'Funded', 'Other']

const emptyForm = () => ({
  lender: '', purpose: '', assetType: 'Loan',
  amount: 0, totalPaid: 0, recoveredAmount: 0, currentValue: 0,
  interestPaid: 0, principalPaid: 0, originalValue: 0, closedMonths: 0,
  closedDate: new Date().toISOString().slice(0, 10), notes: '', fundedBy: '', fundedAmt: 0
})

// Depreciation: vehicle/electronics lose value over time
const DEPRECIATION_RATES: Record<string, number> = {
  'bike': 15, 'motorcycle': 15, 'car': 20, 'vehicle': 20,
  'laptop': 25, 'phone': 30, 'mobile': 30, 'electronics': 25,
  'furniture': 10, 'tv': 20, 'appliance': 15
}

function getDepreciationRate(purpose?: string): number {
  if (!purpose) return 0
  const p = purpose.toLowerCase()
  for (const [key, rate] of Object.entries(DEPRECIATION_RATES)) {
    if (p.includes(key)) return rate
  }
  return 0
}

function currentDepreciatedValue(originalValue: number, closedDate: string, depRate: number): number {
  if (!depRate || !originalValue || !closedDate) return 0
  const years = (new Date().getTime() - new Date(closedDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
  return Math.round(originalValue * Math.pow(1 - depRate / 100, years))
}

function annualizedReturn(invested: number, received: number, months: number): number {
  if (!invested || !received || !months) return 0
  const years = months / 12
  return Math.round((Math.pow(received / invested, 1 / years) - 1) * 100 * 10) / 10
}

function verdict(item: any): { text: string; color: string; detail: string } {
  const type = item.assetType
  const recovered = Number(item.recoveredAmount ?? 0)
  const totalPaid = Number(item.totalPaid ?? 0)
  const princPaid = Number(item.principalPaid ?? 0)
  const origVal = Number(item.originalValue ?? 0)
  const months = Number(item.closedMonths ?? 0)
  // Auto-derive interest: explicit → totalPaid-principal → emi×months-principal
  const _stored = Number(item.interestPaid ?? 0)
  const _emi = Number((item as any).emi ?? 0)
  const intPaid = _stored > 0 ? _stored
    : (princPaid > 0 && totalPaid > princPaid) ? totalPaid - princPaid
    : (_emi > 0 && months > 0 && origVal > 0) ? Math.max(0, _emi * months - origVal)
    : (origVal > 0 && totalPaid > origVal) ? totalPaid - origVal
    : 0

  if (type === 'Savings / Chit' || type === 'Investment / SIP') {
    if (!recovered) return { text: 'No data', color: 'text-gray-400', detail: 'Enter recovered amount' }
    const roi = annualizedReturn(totalPaid, recovered, months)
    if (roi > 12) return { text: '✅ Excellent', color: 'text-green-400', detail: `${roi}% annualized — beats most loans` }
    if (roi > 6) return { text: '✅ Good', color: 'text-green-400', detail: `${roi}% annualized return` }
    if (roi > 0) return { text: '⚠️ Marginal', color: 'text-yellow-400', detail: `${roi}% annualized — consider better options` }
    return { text: '❌ Loss', color: 'text-red-400', detail: `Lost ${fmtINR(totalPaid - recovered)}` }
  }

  if (type === 'Loan') {
    if (intPaid === 0) return { text: '', color: '', detail: '' }
    if (recovered > 0) {
      // Asset sold
      const netGain = recovered - totalPaid
      if (netGain > 0) return { text: '✅ Profit', color: 'text-green-400', detail: `+${fmtINR(netGain)} (sold ${fmtINR(recovered)} − paid ${fmtINR(totalPaid)})` }
      if (netGain === 0) return { text: '↔ Break even', color: 'text-gray-400', detail: `recovered exactly what you paid` }
      return { text: '❌ Loss', color: 'text-red-400', detail: `Lost ${fmtINR(Math.abs(netGain))} (sold ${fmtINR(recovered)} − paid ${fmtINR(totalPaid)})` }
    }
    // Still own — show current value vs cost
    const cv = Number((item as any).currentValue ?? 0)
    if (cv > 0) {
      const gain = cv - totalPaid
      return gain >= 0
        ? { text: '📦 +' + fmtINR(gain), color: 'text-green-400', detail: `Worth ${fmtINR(cv)} today, paid ${fmtINR(totalPaid)}` }
        : { text: '📦 ' + fmtINR(gain), color: 'text-red-400', detail: `Worth ${fmtINR(cv)} today, paid ${fmtINR(totalPaid)}` }
    }
    // No sale — interest is just the cost of borrowing
    return { text: '💸 Interest cost', color: 'text-orange-400', detail: `Paid ${fmtINR(intPaid)} in interest to borrow — pay off early to save on this` }
  }

  if (type === 'CC EMI') {
    if (intPaid > 0) return { text: '💸 EMI cost', color: 'text-orange-400', detail: `Paid ${fmtINR(intPaid)} extra vs buying upfront` }
  }

  if (type === 'I Lended') {
    if (!recovered) return { text: '⏳ Pending', color: 'text-yellow-400', detail: `Lent ${fmtINR(totalPaid)} — nothing recovered yet` }
    const netLoss = totalPaid - recovered  // totalPaid = lent + interest you paid
    const pending = Number((item as any).originalValue ?? totalPaid) - recovered
    if (netLoss <= 0) return { text: '✅ Fully recovered', color: 'text-green-400', detail: `Got back full amount + interest covered` }
    if (intPaid > 0) return { text: '❌ Loss', color: 'text-red-400', detail: `Lent ${fmtINR(totalPaid - intPaid)} + paid ${fmtINR(intPaid)} interest, got back ${fmtINR(recovered)} — net loss ${fmtINR(netLoss)}` }
    return { text: '❌ Loss', color: 'text-red-400', detail: `Lent ${fmtINR(totalPaid)}, got back ${fmtINR(recovered)} — ${fmtINR(netLoss)} not recovered` }
  }

  if (type === 'Funded') {
    if (!recovered) return { text: '🎁 Given', color: 'text-blue-400', detail: `Funded ${fmtINR(totalPaid)} — no return expected` }
    return { text: '↩ Returned', color: 'text-green-400', detail: `${fmtINR(recovered)} returned of ${fmtINR(totalPaid)} funded` }
  }

  const pnl = recovered - totalPaid
  if (pnl > 0) return { text: '✅ Profit', color: 'text-green-400', detail: `+${fmtINR(pnl)}` }
  if (pnl < 0) return { text: '❌ Loss', color: 'text-red-400', detail: `${fmtINR(Math.abs(pnl))}` }
  return { text: '↔ Break even', color: 'text-gray-400', detail: '' }
}

/** Chart values are in thousands of rupees: show ₹K / ₹L / ₹Cr instead of ₹-12000K. */
const fmtK = (v: number) => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; return a >= 10000 ? `${sg}₹${(a / 10000).toFixed(a >= 100000 ? 0 : 1)}Cr` : a >= 100 ? `${sg}₹${(a / 100).toFixed(a >= 1000 ? 0 : 1)}L` : `${sg}₹${a}K` }

export default function ClosedAssetsPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading: q0, isError: r0, refetch: f0 } = useQuery({ queryKey: ['closed-loans'], queryFn: closedLoansApi.getAll })
  const { data: expenses = [], isLoading: q1, isError: r1, refetch: f1 } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const { data: insurance = [], isLoading: q2, isError: r2, refetch: f2 } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const [modal, setModal] = useState<{ open: boolean; item: any }>({ open: false, item: emptyForm() })
  const [confirmModal, setConfirmModal] = useState<{message:string;onConfirm:()=>void;label?:string}|null>(null)
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
  const [actualHave, setActualHave] = useState<string>('')
  const [showLedger, setShowLedger] = useState(false)
  const [showSH, setShowSH] = useState(false)
  const [showSummary, setShowSummary] = useState(true)
  // Interest and Owned-assets blocks start tucked away: their headline totals stay on the header line, the detail opens on click.
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set())
  const toggleBlock = (k: string) => setOpenBlocks(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [recurSortCol, setRecurSortCol] = useState<string | null>(null)
  const [recurSortDir, setRecurSortDir] = useState<'asc' | 'desc'>('desc')
  const onRecurSort = (col: string) => {
    if (recurSortCol === col) setRecurSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setRecurSortCol(col); setRecurSortDir('desc') }
  }
  const PAGE_SIZE = 10

  const saveMut = useMutation({
    mutationFn: (item: any) => { const { id, ...data } = item; return (id && id !== "undefined" && !isNaN(Number(id))) ? closedLoansApi.update(Number(id), data) : closedLoansApi.create(data); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['closed-loans'] }); toast.success('Saved'); setModal({ open: false, item: emptyForm() }) }
  })
  const deleteMut = useMutation({
    mutationFn: closedLoansApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['closed-loans'] }); toast.success('Deleted') }
  })

  const filtered = (filter === 'All' ? items : items.filter((i: any) => i.assetType === filter))
    .sort((a: any, b: any) => (b.closedDate ?? '').localeCompare(a.closedDate ?? ''))

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // Summary calculations
  // Derive interest same way as per-row: explicit OR totalPaid - principalPaid
  const deriveInt = (i: any) => {
    const stored = Number(i.interestPaid ?? 0)
    if (stored > 0) return stored
    const spent = Number(i.totalPaid ?? 0)
    const princ = Number(i.principalPaid ?? 0)
    if (princ > 0 && spent > princ) return spent - princ
    // Fallback: EMI × closedMonths - principalPaid (if amount = principal)
    const emi = Number(i.emi ?? 0)
    const months = Number(i.closedMonths ?? 0)
    const origVal = Number(i.originalValue ?? i.amount ?? 0)
    if (emi > 0 && months > 0 && origVal > 0) return Math.max(0, emi * months - origVal)
    return 0
  }
  const totalInterestWasted = items.reduce((s: number, i: any) => s + deriveInt(i), 0)
  const totalPrincipalPaid = items.reduce((s: number, i: any) => {
    const intD = deriveInt(i)
    const spent = Number(i.totalPaid ?? 0)
    if (intD > 0) return s + Math.max(0, spent - intD)
    if (i.assetType === 'Loan' || i.assetType === 'CC EMI') return s + Number(i.principalPaid ?? spent)
    return s
  }, 0)
  const totalPaid = items.filter((i:any) => !(i.assetType === 'Funded' && (Number(i.totalPaid??0) === 0))).reduce((s: number, i: any) => s + Number(i.totalPaid ?? 0), 0)
  const totalRecovered = items.reduce((s: number, i: any) => s + Number(i.recoveredAmount ?? 0), 0)
  // Net got back = recovered minus interest paid (true return after borrowing cost)
  const totalIntPaidOnSold = items
    .filter((i:any) => Number(i.recoveredAmount??0) > 0)
    .reduce((s:number,i:any) => {
      // Use intPaid field if available, otherwise estimate from totalPaid - principal
      const intPaid = Number(i.intPaid ?? i.interestPaid ?? 0)
      if (intPaid > 0) return s + intPaid
      const paid = Number(i.totalPaid??0)
      const principal = Number(i.amount??0)
      // Only count interest if principal is set and > 0
      if (principal > 0 && paid > principal) return s + (paid - principal)
      return s
    }, 0)
  // Separate recurring vs closed (loans/emi = closed debt, others = recurring investments)
  const closedDebtItems = items.filter((i: any) => ['Loan','CC EMI','Other'].includes(i.assetType ?? ''))
  const recurringItems = items.filter((i: any) => ['Savings / Chit','Investment / SIP','Insurance'].includes(i.assetType ?? ''))
  const totalClosedDebtPaid = closedDebtItems.reduce((s: number, i: any) => s + Number(i.totalPaid ?? 0), 0)
  const totalRecurringPaid = recurringItems.reduce((s: number, i: any) => s + Number(i.totalPaid ?? 0), 0)
  const totalRecurringRecovered = recurringItems.reduce((s: number, i: any) => s + Number(i.recoveredAmount ?? 0), 0)
  // P&L = recovered - principal (interest is cost of borrowing, shown separately)
  // P&L only for items with recovery (sold assets)
  // Cost basis = totalPaid for those items
  const netPnL = items
    .filter((i: any) => Number(i.recoveredAmount ?? 0) > 0)
    .reduce((s: number, i: any) => s + Number(i.recoveredAmount ?? 0) - Number(i.totalPaid ?? 0), 0)
  // Unrealised gain from items still owned (currentValue > totalPaid)
  const unrealisedGain = items
    .filter((i:any) => Number(i.currentValue??0) > 0 && Number(i.recoveredAmount??0) === 0)
    .reduce((s:number,i:any) => s + Number(i.currentValue??0) - Number(i.totalPaid??0), 0)

  // Recurring history
  const monthsBetween = (s: string, e?: string) => {
    if (!s) return 0
    const start = new Date(s), end = e ? new Date(e) : new Date()
    return Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1)
  }
  const recurringRows = [
    // Both Expense and InsurancePolicy carry a `frequency` (Monthly/Quarterly/Half-Yearly/Yearly).
    // This used to take the raw stored amount as if it were already a monthly figure — a Quarterly
    // ₹1,20,000 school fee or a Yearly ₹48,000 premium rendered as "₹1,20,000/mo" or "₹48,000/mo"
    // in the table, then got multiplied by months-elapsed for the total: a Yearly premium paid for
    // 8 years (96 months) came out as ₹48,000 × 96 = ₹46,08,000 instead of the ₹3,84,000 actually
    // paid. toMonthly() converts to the real monthly-equivalent first, which is exactly right here
    // because monthly-equivalent × months-elapsed reconstructs the true lifetime total, same as it
    // does in calcOutflow.
    // isOneOff also matters here: a one-time premium or expense isn't recurring at all, so
    // "monthly-equivalent × months-since-start" would compound it as if it repeated every month
    // since it was entered — the same trap calcOutflow already guards against.
    ...(expenses as any[]).filter(e => Number(e.amount) > 0 && e.startDate && e.active !== false && !isOneOff(e.frequency))
      .map(e => ({ label: e.label, category: 'Expense', monthly: toMonthly(e.amount, e.frequency), months: monthsBetween(e.startDate, e.endDate), startDate: e.startDate, endDate: e.endDate, isEnded: !!e.endDate && new Date(e.endDate) < new Date() })),
    // The expense filter above checks `active !== false`; this one didn't, and `isEnded` was
    // hardcoded to false — so a policy you closed years ago kept accruing months against today's
    // date forever, with no "Ended" tag ever shown. `lastPaidDate` exists on InsurancePolicy
    // precisely for a lapsed policy with no explicit endDate; fall back to it before falling back
    // to "still running", and use `i.name` (the field the form actually saves) rather than the
    // nonexistent `i.insurer`, which always fell through to the less specific `policyType`.
    ...(insurance as any[]).filter(i => Number(i.premium) > 0 && i.startDate && i.active !== false && !isOneOff(i.frequency))
      .map(i => {
        const effectiveEnd = i.endDate ?? i.lastPaidDate
        return {
          label: i.name ?? i.policyType ?? 'Insurance', category: 'Insurance',
          monthly: toMonthly(i.premium, i.frequency),
          months: monthsBetween(i.startDate, effectiveEnd),
          startDate: i.startDate, endDate: i.endDate,
          isEnded: !!effectiveEnd && new Date(effectiveEnd) < new Date(),
        }
      }),
  ].filter(r => r.months > 0).sort((a, b) => b.monthly * b.months - a.monthly * a.months)
  const totalRecurringSpent = recurringRows.reduce((s, r) => s + r.monthly * r.months, 0)

  const { data: earningsRaw = [], isLoading: q3, isError: r3, refetch: f3 } = useQuery({ queryKey: ['earnings'], queryFn: earningsApi.getAll })
  const { data: activeLoans = [], isLoading: q4, isError: r4, refetch: f4 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: activeCards = [], isLoading: q5, isError: r5, refetch: f5 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: activeSavings = [], isLoading: q6, isError: r6, refetch: f6 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: activePersonal = [], isLoading: q7, isError: r7, refetch: f7 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: peopleOweMe = [], isLoading: q8, isError: r8, refetch: f8 } = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApiLocal.getAll })
  const { data: investments = [], isLoading: q9, isError: r9, refetch: f9 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApiLocal.getAll })
  // Was only ever tracking the `closed-loans` query — 9 other queries feed this page's summary
  // math directly (expenses/insurance/earnings/loans/cards/savings/personal/peopleOwe/investments)
  // and had no loading/error coverage at all.
  const isLoading = q0||q1||q2||q3||q4||q5||q6||q7||q8||q9
  const isError = r0||r1||r2||r3||r4||r5||r6||r7||r8||r9
  const refetch = () => { f0();f1();f2();f3();f4();f5();f6();f7();f8();f9() }
  // Active loan EMI paid so far (principal portion going out)
  // EMI × paid months = total cash paid including interest
  // Single source of truth for "what's still owed" — same calcDebt() used by Hub/Payoff/Break
  // Savings. This page used to recompute loan/CC/I-Owe/chit remaining balances by hand in five
  // separate reduce() loops (plus a bespoke compounding-interest simulation for I Owe), which
  // disagreed with Hub/Payoff/Dashboard on the same underlying data. Only the "still owed" side
  // is replaced here — the "paid so far" figures below (activeLoanEmiPaid, activeLoanPaid,
  // activePersonalPaid, activePersonalIntPaid) have no equivalent in calcDebt and stay as is.
  const dShared = calcDebt(activeLoans as any[], activeCards as any[], activePersonal as any[], activeSavings as any[])
  const activeLoanEmiPaid = (activeLoans as any[]).reduce((s: number, l: any) => s + getEff(l).paid * Number(l.emi ?? 0), 0)
  // Principal + remaining interest on active loans — same definition as Hub/Payoff's "loanTotal".
  const activeLoanEmiLeft = dShared.loanTotal
  const activeLoanPaid = (activeLoans as any[]).reduce((s: number, l: any) => {
    const eff = getEff(l)
    const t = l.tenure ?? (eff.paid + eff.pending)
    const sp = calcLoanSplit(l.amount ?? 0, l.emi ?? 0, t, eff.paid, l.principalPaid ?? undefined)
    return s + (Number(l.amount ?? 0) - sp.princLeft)
  }, 0)
  // activeLoanLeft = EMI × pending months (inclusive of interest = true cash to pay)
  const activeLoanLeft = activeLoanEmiLeft
  // Interest remaining on active loans (same as Dashboard)
  // Owned assets = current value of active loans + closed assets
  const ownedAssetsFromLoans = (activeLoans as any[]).reduce((s:number,l:any)=>s+Number(l.currentValue??0),0)
  const ownedAssetsFromClosed = items.reduce((s:number,i:any)=>s+Number(i.currentValue??0),0)
  const totalOwnedAssetsAll = ownedAssetsFromLoans + ownedAssetsFromClosed
  const activeLoanIntLeft = dShared.interestLeft
  const activeCardDebt = dShared.ccOutstanding
  const activeCCEmiLeft = dShared.ccEmiPrincipal
  // Building savings = your asset (money you put in, still growing)
  const activeSavingsCorpus = (activeSavings as any[])
    .filter((v: any) => v.mode !== 'withdrew' && !v.prizeTaken)
    .reduce((s: number, v: any) => s + getEff(v).paid * Number(v.monthly ?? 0), 0)
  // Won chit amount received = profit/income (you got the pot)
  const wonChitReceived = (activeSavings as any[])
    .filter((v: any) => v.prizeTaken && Number(v.actualReceived ?? 0) > 0)
    .reduce((s: number, v: any) => s + Number(v.actualReceived ?? 0), 0)
  // Withdrew/won chit remaining = debt (you still owe monthly payments)
  const activeChitRepayLeft = dShared.chitRepayLeft
  const activePersonalPaid = (activePersonal as any[]).reduce((s: number, p: any) => s + getEff(p).paid * Number(p.emi ?? 0), 0)
  // I Owe pending = principal remaining, via the same ioweFacts()-based classifier Hub/Payoff use
  // (amortising / interest-only / lump). For interest-only and lump entries, principal never
  // reduces → full amount still owed.
  const activePersonalLeft = dShared.iOwePrincipal
  // Was a hand-rolled compounding-interest simulation that assumed every entry amortises
  // (declining balance) regardless of its actual classification — so an interest-only entry (whose
  // principal never reduces, per `activePersonalLeft` right above) got its balance paid down here
  // anyway, silently disagreeing with the very row it sits next to. `ioweFacts().interestPaid` is
  // the same shared classifier's own interest-paid figure for all three shapes.
  const activePersonalIntPaid = (activePersonal as any[]).reduce((s: number, p: any) => s + ioweFacts(p).interestPaid, 0)
  // Still to pay = EMI×pending (incl interest) + I Owe principal + CC balance
  const totalFutureObligations = activeLoanLeft + activePersonalLeft + activeCardDebt
  const totalFutureCashFlows = activeCCEmiLeft + activeChitRepayLeft
  // People owe me = asset (money to receive)
  const totalInvestmentValue = (investments as any[]).reduce((s:number,i:any) => s + Number(i.currentValue ?? i.invested ?? 0), 0)
  const totalInvestmentPnL = (investments as any[]).reduce((s:number,i:any) => s + Number(i.currentValue ?? i.invested ?? 0) - Number(i.invested ?? 0), 0)
  // Was only excluding 'Settled'/'settled' — missing the 'Paid' check that Dashboard, Hub, Finance
  // Overview, Budget Rules and PeopleOwePage itself all use (PeopleOwePage's own partialMut sets
  // status:'Paid' once paidAmount reaches the total, so this is a reachable value, not dead data).
  // A fully-paid-back receivable kept inflating this page's total while every other page correctly
  // dropped it once settled.
  const peopleOweMeTotal = (peopleOweMe as any[]).filter((p:any)=>p.status!=='Paid'&&p.status!=='Settled').reduce((s:number,p:any)=>s+Number(p.amount??0)-Number(p.paidAmount??0),0)

  const totalEarned = (earningsRaw as any[]).reduce((s: number, e: any) => {
    const from = e.fromDate ? new Date(e.fromDate) : null
    const to = e.toDate ? new Date(e.toDate) : new Date()
    const months = from ? Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()) : 0
    return s + Number(e.monthlyAmount ?? 0) * months
  }, 0)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your closed assets." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Closed assets"/>
      {/* Accent summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {label:'Total paid',      value:fmtINR(totalPaid),            sub:`${items.length} closed entries`,         accent:'var(--info)'},
          {label:'Interest cost',   value:fmtINR(totalInterestWasted),  sub:'cost of borrowing',                      accent:'var(--danger)'},
          {label:'Got back',        value:fmtINR(totalRecovered),       sub:'recovered amount',                        accent:'var(--success)'},
          {label:'Net P&L',         value:(totalRecovered-totalPaid>=0?'+':'-')+fmtINR(Math.abs(totalRecovered-totalPaid)), sub:'recovered minus paid', accent:totalRecovered>=totalPaid?'var(--success)':'var(--danger)'},
        ].map(m=>(
          <div key={m.label} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{background:`linear-gradient(180deg, color-mix(in srgb, ${m.accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`,border:`1px solid var(--hairline)`}}>
            <div className="relative">
              <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color: 'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:m.accent}} />{m.label}</div>
              <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{color:m.accent}}>{m.value}</div>
              <div className="text-[11px]" style={{color: 'var(--text-faint)'}}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <SegTabs options={[{ id: 'summary', label: 'Total picture', icon: ICON.summary }, { id: 'list', label: 'Closed loans', icon: ICON.closed }]} value={showSummary ? 'summary' : 'list'} onChange={(id: any) => setShowSummary(id === 'summary')} />
        <button className="btn-primary btn-sm" onClick={() => setModal({ open: true, item: emptyForm() })}>
          <Plus size={14} /> Add entry
        </button>
      </div>

      {/* Smart insight */}
      {items.length > 0 && totalInterestWasted > 0 && (
        <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg,color-mix(in srgb, var(--danger) 8%, transparent) 0%,color-mix(in srgb, var(--danger) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--danger) 15%, transparent)'}}>
          <span className="text-lg">💡</span>
          <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
            You paid <span style={{color:'var(--danger)',fontWeight:600}}>{fmtINR(totalInterestWasted)}</span> in interest across all closed loans — that's money that went to lenders, not you.
          </div>
        </div>
      )}

      {!showSummary && (
        <div className="flex items-center gap-4 flex-wrap text-[11px] px-1 py-2 mb-3 rounded-lg" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
          <span className="text-[12px] font-medium " style={{color:'var(--text-muted)'}}>Summary</span>
          <span style={{color:'var(--text-muted)'}}>Closed <span className="mono font-bold text-white">{fmtINR(totalPaid)}</span></span>
          {totalInterestWasted > 0 && <><span style={{color:'var(--text-faint)'}}>·</span>
          <span style={{color:'var(--text-muted)'}}>Interest cost <span className="mono font-bold text-red-400">{fmtINR(totalInterestWasted)}</span></span></>}
          {totalRecovered > 0 && <><span style={{color:'var(--text-faint)'}}>·</span>
          <details className="inline" style={{display:'inline'}}>
            <summary className="cursor-pointer list-none" style={{display:'inline'}}>
              <span style={{color:'var(--text-muted)'}}>Got back <span className="mono font-bold text-blue-400">{fmtINR(totalRecovered)}</span> <span style={{color:'var(--text-faint)'}}>▾</span></span>
            </summary>
            <div className="absolute z-50 mt-1 rounded-2xl p-3 text-[11px] shadow-xl" style={{background:'var(--bg-card)',border:'1px solid var(--border)',minWidth:'220px'}}>
              <div className="font-bold mb-2" style={{color:'var(--text-muted)'}}>Got back breakdown</div>
              {items.filter((i:any)=>Number(i.recoveredAmount??0)>0).map((i:any)=>{
                const pnl = Number(i.recoveredAmount??0) - Number(i.totalPaid??0)
                return <div key={i.id} className="flex justify-between py-0.5 border-b" style={{borderColor:'var(--border)'}}>
                  <span style={{color:'var(--text-faint)'}}>{i.lender}</span>
                  <div className="text-right">
                    <div className="mono font-bold text-blue-400">{fmtINR(i.recoveredAmount)}</div>
                    <div className={`text-[11px] ${pnl>=0?'text-green-400':'text-red-400'}`}>paid {fmtINR(i.totalPaid)} · {pnl>=0?'+':''}{fmtINR(pnl)}</div>
                  </div>
                </div>
              })}
              <div className="flex justify-between pt-1 font-bold">
                <span>Net P&L</span>
                <span className={netPnL>=0?'text-green-400':'text-red-400'}>{netPnL>=0?'+':''}{fmtINR(netPnL)}</span>
              </div>
            </div>
          </details>
          </>}
          {netPnL !== 0 && <><span style={{color:'var(--text-faint)'}}>·</span>
          <span style={{color:'var(--text-muted)'}}>P&L <span className={`mono font-bold ${netPnL>=0?'text-green-400':'text-red-400'}`}>{netPnL>=0?'+':''}{fmtINR(netPnL)}</span> <span style={{color:'var(--text-faint)'}}>= recovered − total paid</span></span></>}
          {unrealisedGain !== 0 && <><span style={{color:'var(--text-faint)'}}>·</span>
          <span style={{color:'var(--text-muted)'}}>Unrealised <span className={`mono font-bold ${unrealisedGain>=0?'text-green-400':'text-red-400'}`}>{unrealisedGain>=0?'+':''}{fmtINR(unrealisedGain)}</span></span></>}
          <span style={{color:'var(--text-faint)'}}>·</span>
          <span style={{color:'var(--text-muted)'}}>Still to pay <span className="mono font-bold text-red-400">{fmtINR(totalFutureObligations + activeCCEmiLeft + activeChitRepayLeft)}</span></span>
          <span style={{color:'var(--text-faint)'}}>·</span>
          <span style={{color:'var(--text-muted)'}}>Recurring <span className="mono font-bold text-orange-400">{fmtINR(totalRecurringSpent)}</span></span>
        </div>
      )}

      {showSummary && (() => {
        // ── CORE CALCULATIONS ──
        const allDue = totalFutureObligations + activeCCEmiLeft + activeChitRepayLeft
        const allTimePaid = totalPaid + activeLoanEmiPaid + activePersonalPaid
        const allTimeSpentNet = allTimePaid + totalRecurringSpent - totalRecovered

        // Interest
        const intPaidClosed = totalInterestWasted
        const intPaidActive = Math.round(activeLoanEmiPaid - activeLoanPaid)
        const intPaidIowe = Math.round(activePersonalIntPaid)
        const totalIntPaid = intPaidClosed + intPaidActive + intPaidIowe
        const totalIntPending = Math.round(activeLoanIntLeft)
        const totalInt = totalIntPaid + totalIntPending

        // Owned assets net (only profit from investments/sold, net equity from loans)
        const soldProfit = items.filter((i:any)=>Number(i.recoveredAmount??0)>Number(i.totalPaid??0)).reduce((s:number,i:any)=>s+Number(i.recoveredAmount??0)-Number(i.totalPaid??0),0)
        const loanAssetNet = (activeLoans as any[]).filter((l:any)=>Number(l.currentValue??0)>0).reduce((s:number,l:any)=>s+Number(l.currentValue??0)-getEff(l).pending*Number(l.emi??0),0)
        const closedAssetNet = items.filter((i:any)=>Number(i.currentValue??0)>0&&Number(i.recoveredAmount??0)===0).reduce((s:number,i:any)=>s+Number(i.currentValue??0),0)
        const netOwnedAssets = soldProfit + loanAssetNet + closedAssetNet + activeSavingsCorpus + peopleOweMeTotal

        // Should Have = Earned - all out + net assets
        const totalFunded = items.reduce((s:number,i:any)=>s+Number(i.fundedAmt??0),0)
        const wonChitPnL = (activeSavings as any[]).filter((v:any)=>v.prizeTaken&&Number(v.actualReceived??0)>0).reduce((s:number,v:any)=>s+Number(v.actualReceived??0)-(v.tenure??0)*Number(v.monthly??0),0)
        const shouldHave = totalEarned + totalFunded + wonChitPnL - (allTimePaid + totalRecurringSpent) + totalRecovered + activeSavingsCorpus + totalInvestmentValue

        // Debt-free date = months until all obligations cleared
        const debtFreeMonths = calcDebtFreeMonths(activeLoans as any[], activeCards as any[], activePersonal as any[], activeSavings as any[])
        const debtFreeDate = new Date()
        debtFreeDate.setMonth(debtFreeDate.getMonth() + debtFreeMonths)
        const debtFreeDateStr = debtFreeDate.toLocaleDateString('en-IN', {month:'short',year:'numeric'})

        const currentNetWorth = netOwnedAssets + activeSavingsCorpus - allDue

        return (
          <div className="mb-4 space-y-3">

            {/* ── BLOCK 1: TOTAL PICTURE ── */}
            <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
              <div className="px-4 py-2 text-[12px] font-medium " style={{background:'var(--bg-base)',color:'var(--text-muted)'}}>
                Total picture
              </div>
              <div className="grid grid-cols-4 divide-x" style={{['--tw-divide-opacity' as any]:1, borderColor:'var(--border)'}}>
                {[
                  {label:'All time committed', val:allTimePaid+allDue, color:'text-white', sub:'EMIs paid + EMIs pending (excl. recurring)'},
                  {label:'Paid so far', val:allTimePaid, color:'text-green-400', sub:`closed ₹${Math.round(totalPaid/100000)}L + active ₹${Math.round(activeLoanEmiPaid/100000)}L`},
                  {label:'Still to Pay', val:allDue, color:'text-red-400', sub:`loans+I Owe+CC+chit`},
                  {label:'Recurring spent', val:totalRecurringSpent, color:'text-orange-400', sub:'expenses + insurance'},
                ].map(m=>(
                  <div key={m.label} className="px-4 py-3">
                    <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>{m.label}</div>
                    <div className={`mono font-bold text-lg ${m.color}`}>{fmtINR(m.val)}</div>
                    <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── BLOCK 2: SHOULD HAVE + DEBT FREE ── */}
            <div className="grid grid-cols-3 gap-3">
              {(() => {
                return (
                  <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
                    <button className="w-full p-4 text-left" onClick={()=>setShowSH(!showSH)}>
                      <div className="text-[12px] font-medium mb-1" style={{color:'var(--text-muted)'}}>Should have now <span className="text-[11px] normal-case">{showSH?'▲':'▼'}</span></div>
                      <div className={`mono font-bold text-2xl ${shouldHave>=0?'text-green-400':'text-red-400'}`}>{shouldHave<0?'−':''}{fmtINR(Math.abs(shouldHave))}</div>
                      <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>tap to {showSH?'collapse':'see breakdown'}</div>
                    </button>
                    {showSH && (
                      <div className="px-4 pb-4 space-y-0.5 border-t" style={{borderColor:'var(--border)'}}>
                        <div className="flex justify-between text-[11px] pt-2"><span style={{color:'var(--text-faint)'}}>+ Salary earned</span><span className="mono text-green-400">{fmtINR(totalEarned)}</span></div>
                        {totalFunded>0&&<div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>+ Funded received</span><span className="mono text-green-400">{fmtINR(totalFunded)}</span></div>}
                        <div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>− EMIs paid</span><span className="mono text-red-400">−{fmtINR(allTimePaid)}</span></div>
                        <div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>− Recurring</span><span className="mono text-red-400">−{fmtINR(totalRecurringSpent)}</span></div>
                        {totalRecovered>0&&<div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>+ Recovered</span><span className="mono text-green-400">{fmtINR(totalRecovered)}</span></div>}
                        {activeSavingsCorpus>0&&<div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>+ Savings corpus</span><span className="mono text-blue-400">{fmtINR(activeSavingsCorpus)}</span></div>}
                        {totalInvestmentValue>0&&<div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>+ Investments</span><span className="mono text-blue-400">+{fmtINR(totalInvestmentValue)}{totalInvestmentPnL!==0&&<span className={totalInvestmentPnL>0?' text-green-400':' text-red-400'}> ({totalInvestmentPnL>0?'+':''}{fmtINR(totalInvestmentPnL)} P&L)</span>}</span></div>}
                        {netOwnedAssets>0&&<>
                          <div className="flex justify-between text-[11px]"><span style={{color:'var(--text-faint)'}}>+ Owned assets (net)</span><span className="mono text-blue-400">{fmtINR(netOwnedAssets)}</span></div>
                          {closedAssetNet>0&&<div className="flex justify-between text-[11px] pl-2"><span style={{color:'var(--text-faint)'}}>↳ owned items value</span><span className="mono text-green-400">+{fmtINR(closedAssetNet)}</span></div>}
                          {loanAssetNet!==0&&<div className="flex justify-between text-[11px] pl-2"><span style={{color:'var(--text-faint)'}}>↳ loan equity</span><span className={`mono ${loanAssetNet>=0?'text-green-400':'text-red-400'}`}>{loanAssetNet>=0?'+':loanAssetNet<0?'−':''}{fmtINR(Math.abs(loanAssetNet))}</span></div>}

                          {peopleOweMeTotal>0&&<div className="flex justify-between text-[11px] pl-2"><span style={{color:'var(--text-faint)'}}>↳ people owe me</span><span className="mono text-green-400">+{fmtINR(peopleOweMeTotal)}</span></div>}
                        </>}
                      </div>
                    )}
                  </div>
                )
              })()}
              <div className="rounded-2xl p-4" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
                <div className="text-[12px] font-medium mb-1" style={{color:'var(--text-muted)'}}>Debt free date</div>
                <div className="mono font-bold text-2xl text-blue-400">{debtFreeDateStr}</div>
                <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>{debtFreeMonths} months remaining · all debts</div>
                <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>net worth after debt free: <span className="text-green-400 mono">+{fmtINR(netOwnedAssets+activeSavingsCorpus)}</span></div>
              </div>
              <div className="rounded-2xl p-4" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
                <div className="text-[12px] font-medium mb-1" style={{color:'var(--text-muted)'}}>Net Worth (Today)</div>
                <div className={`mono font-bold text-2xl ${currentNetWorth>=0?'text-green-400':'text-red-400'}`}>{currentNetWorth<0?'−':''}{fmtINR(Math.abs(currentNetWorth))}</div>
                <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>assets {fmtINR(netOwnedAssets+activeSavingsCorpus)} − debt {fmtINR(allDue)}</div>
                
              </div>
            </div>

            {/* ── BLOCK 3: INTEREST BREAKDOWN ── */}
            <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
              <button className="w-full px-4 py-2 text-[12px] font-medium flex items-center justify-between text-left" style={{background:'var(--bg-base)',color:'var(--text-muted)',border:'none',cursor:'pointer'}} onClick={()=>toggleBlock('interest')}>
                <span>Interest — Total {fmtINR(totalInt)} <span className="normal-case font-normal tracking-normal" style={{color:'var(--text-faint)'}}>· paid {fmtINR(totalIntPaid)} · pending {fmtINR(totalIntPending)}</span></span>
                <span>{openBlocks.has('interest')?'▾':'▸'}</span>
              </button>
              {openBlocks.has('interest') && <div className="grid grid-cols-2 divide-x" style={{['--tw-divide-opacity' as any]:1, borderColor:'var(--border)'}}>
                <div className="px-4 py-3">
                  <div className="text-[12px] mb-1 text-red-400">Paid ₹{(totalIntPaid/100000).toFixed(1)}L</div>
                  <div className="mono font-bold text-lg text-red-400">{fmtINR(totalIntPaid)}</div>
                  <div className="text-[11px] mt-1 space-y-0.5">
                    <div style={{color:'var(--text-faint)'}}>Closed loans: <span className="mono text-red-300">{fmtINR(intPaidClosed)}</span></div>
                    <div style={{color:'var(--text-faint)'}}>Active EMIs: <span className="mono text-red-300">{fmtINR(intPaidActive)}</span></div>
                    <div style={{color:'var(--text-faint)'}}>I Owe interest: <span className="mono text-red-300">{fmtINR(intPaidIowe)}</span></div>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[12px] mb-1 text-orange-400">Pending ₹{(totalIntPending/100000).toFixed(1)}L</div>
                  <div className="mono font-bold text-lg text-orange-400">{fmtINR(totalIntPending)}</div>
                  <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>still to pay on {(activeLoans as any[]).filter((l:any)=>getEff(l).pending>0).length} active loans</div>
                </div>
              </div>}
            </div>

            {/* ── BLOCK 4: OWNED ASSETS ── */}
            {netOwnedAssets > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
                <button className="w-full px-4 py-2 text-[12px] font-medium flex items-center justify-between text-left" style={{background:'var(--bg-base)',color:'var(--text-muted)',border:'none',cursor:'pointer'}} onClick={()=>toggleBlock('assets')}>
                  <span>Owned Assets — Net {fmtINR(netOwnedAssets)}</span>
                  <span>{openBlocks.has('assets')?'▾':'▸'}</span>
                </button>
                {openBlocks.has('assets') && <div className="flex flex-wrap divide-x" style={{['--tw-divide-opacity' as any]:1, borderColor:'var(--border)'}}>
                  {soldProfit > 0 && (
                    <div className="px-4 py-3 min-w-[160px]">
                      <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>Sold Assets (profit only)</div>
                      <div className="mono font-bold text-green-400">{fmtINR(soldProfit)}</div>
                      <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>recovered − paid (only winners)</div>
                    </div>
                  )}
                  <div className="px-4 py-3 min-w-[150px]">
                    <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>Loan Assets (net equity)</div>
                    <div className={`mono font-bold ${loanAssetNet>=0?'text-green-400':'text-red-400'}`}>{loanAssetNet<0?'−':''}{fmtINR(Math.abs(loanAssetNet))}</div>
                    <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>asset value − pending EMIs</div>
                  </div>
                  {closedAssetNet > 0 && (
                    <div className="px-4 py-3 min-w-[150px]">
                      <div className="text-[12px] mb-1" style={{color:'var(--text-muted)'}}>Owned (Closed)</div>
                      <div className="mono font-bold text-green-400">{fmtINR(closedAssetNet)}</div>
                      <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>
                        {items.filter((i:any)=>Number(i.currentValue??0)>0&&Number(i.recoveredAmount??0)===0).map((i:any)=>{
                          const diff=Number(i.currentValue)-Number(i.totalPaid??0)
                          return <span key={i.id} className="block">{i.lender} <span className={diff>=0?'text-green-400':'text-red-400'}>{diff>=0?'↑':'↓'}{fmtINR(Math.abs(diff))}</span></span>
                        })}
                      </div>
                    </div>
                  )}
                </div>}
              </div>
            )}
          </div>
        )
      })()}

      {/* 12-Month Net Worth Chart */}
      {showSummary && (() => {
        const months = Math.max(1, (activeLoans as any[]).reduce((m:number,l:any)=>Math.max(m,getEff(l).pending),0))
        const chartData = Array.from({length:months+1},(_,mo)=>{
          const lLeft=(activeLoans as any[]).reduce((s:number,l:any)=>s+Math.max(0,getEff(l).pending-mo)*Number(l.emi??0),0)
          const chitLeft=Math.max(0,activeChitRepayLeft*(1-mo/months))
          const ccLeft=Math.max(0,activeCCEmiLeft*(1-mo/6))
          const nw=Math.round((activeSavingsCorpus-lLeft-activePersonalLeft-chitLeft-ccLeft)/1000)
          const d=new Date();d.setMonth(d.getMonth()+mo)
          return {month:d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),nw}
        })
        return (
          <div className="rounded-2xl overflow-hidden mb-4" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
            <div className="px-4 py-2 text-[12px] font-medium " style={{background:'var(--bg-base)',color:'var(--text-muted)'}}>
              Net Worth Trajectory — {months} months to debt free
            </div>
            <div className="px-4 py-3">
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={chartData} margin={{top:4,right:8,bottom:0,left:0}}>
                  <defs>
                    <linearGradient id="nwGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success-strong)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--success-strong)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{fontSize:10,fill:'var(--text-faint)'}} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={48}/>
                  <YAxis tick={{fontSize:10,fill:'var(--text-faint)'}} tickLine={false} axisLine={false} tickFormatter={(v:number)=>fmtK(v)} width={62}/>
                  <Tooltip formatter={(v:number)=>[fmtK(v),'Net worth']} labelStyle={{color:'var(--text-muted)'}} contentStyle={{background:'var(--bg-hover)',border:'1px solid var(--border)',borderRadius:8}}/>
                  <ReferenceLine y={0} stroke="var(--danger-strong)" strokeDasharray="4 4" strokeWidth={1}/>
                  <Area type="monotone" dataKey="nw" stroke="var(--success-strong)" fill="url(#nwGrad2)" strokeWidth={2} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {/* Debt table - shown in summary tab */}
      {showSummary && (() => {
        const closedLoansPaid = items.filter((i:any)=>!(i.assetType==='Funded'&&Number(i.totalPaid??0)===0)).reduce((s:number,i:any)=>s+Number(i.totalPaid??0),0)
        const rowPaid = activeLoanEmiPaid + closedLoansPaid + activePersonalPaid
        const rowPending = activeLoanEmiLeft + activePersonalLeft + activeCCEmiLeft + activeCardDebt + activeChitRepayLeft
        const rowPct = rowPaid+rowPending>0?Math.round(rowPaid/(rowPaid+rowPending)*100):0
        return (
          <div className="rounded-2xl overflow-hidden mb-4" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
            <div className="px-4 py-2 flex items-center justify-between" style={{background:'var(--bg-base)',borderBottom:'1px solid var(--border)'}}>
              <span className="text-[12px] font-medium " style={{color:'var(--text-muted)'}}>Debt breakdown</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span style={{color:'var(--text-muted)'}}>Paid <span className="mono font-bold text-green-400">{fmtINR(rowPaid)}</span></span>
                <span style={{color:'var(--text-muted)'}}>Pending <span className="mono font-bold text-red-400">{fmtINR(rowPending)}</span></span>
                <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{background:'var(--bg-base)'}}>
                  <div className="h-full bg-green-500 rounded-full" style={{width:`${rowPct}%`}}/>
                </div>
                <span className="mono text-green-400">{rowPct}%</span>
              </div>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{borderBottom:'1px solid var(--border)',background:'var(--bg-base)'}}>
                  <th className="text-left px-4 py-2 font-semibold" style={{color:'var(--text-muted)'}}>Creditor</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{color:'var(--text-muted)'}}>EMI/mo</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{color:'var(--text-muted)'}}>Paid</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{color:'var(--text-muted)'}}>Pending</th>
                  <th className="text-right px-4 py-2 font-semibold" style={{color:'var(--text-muted)'}}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {(activeLoans as any[]).filter((l:any)=>getEff(l).pending>0).map((l:any)=>{
                  const paid=getEff(l).paid*Number(l.emi??0)
                  const pend=getEff(l).pending*Number(l.emi??0)
                  const pct=paid+pend>0?Math.round(paid/(paid+pend)*100):0
                  return (
                    <tr key={l.id} style={{borderBottom:'1px solid var(--border-subtle,#1e2130)'}}>
                      <td className="px-4 py-2"><span className="font-semibold">{l.lender}</span> <span style={{color:'var(--text-faint)'}}>{getEff(l).pending}mo left</span></td>
                      <td className="px-3 py-2 text-right mono" style={{color:'var(--text-muted)'}}>{fmtINR(l.emi)}</td>
                      <td className="px-3 py-2 text-right mono text-green-400">{fmtINR(paid)}</td>
                      <td className="px-3 py-2 text-right mono text-red-400 font-bold">{fmtINR(pend)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{background:'var(--bg-base)'}}>
                            <div className="h-full bg-blue-500 rounded-full" style={{width:`${pct}%`}}/>
                          </div>
                          <span style={{color:'var(--text-faint)'}}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {closedLoansPaid>0&&<tr style={{borderBottom:'1px solid var(--border-subtle,#1e2130)',opacity:0.55}}><td className="px-4 py-2 font-semibold" style={{color:'var(--text-muted)'}}>Closed assets <span className="text-[11px] font-normal ml-1" style={{color:'var(--text-faint)'}}>{items.filter((i:any)=>!(i.assetType==='Funded'&&Number(i.totalPaid??0)===0)).length} fully paid</span></td><td className="px-3 py-2 text-right" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2 text-right mono text-green-400">{fmtINR(closedLoansPaid)}</td><td className="px-3 py-2 text-right text-green-400">—</td><td className="px-4 py-2 text-right text-[11px] text-green-400">✓ done</td></tr>}
                {(activePersonal as any[]).map((p:any)=>{
                  // Was a hand-rolled compounding-interest loop that treated every non-lump entry as
                  // amortising — so an interest-only entry's balance was paid down here even though
                  // `activePersonalLeft`/the Total row below (both via `ioweFacts`) say its
                  // principal never reduces. `ioweFacts()` is the single classifier both now share.
                  const f = ioweFacts(p)
                  const isLump = f.mode === 'lump'
                  const isIntOnly = f.mode === 'interest-only'
                  return <tr key={p.id} style={{borderBottom:'1px solid var(--border-subtle,#1e2130)'}}><td className="px-4 py-2"><span className="font-semibold">{p.person}</span> <span className={`badge text-[11px] ml-1 ${isLump?'badge-blue':'badge-orange'}`}>{isLump?'Lump Sum':isIntOnly?'Interest only':'I Owe'}</span></td><td className="px-3 py-2 text-right mono" style={{color:'var(--text-muted)'}}>{isLump?'—':fmtINR(p.emi)}</td><td className="px-3 py-2 text-right mono text-green-400">{isLump?'—':fmtINR(getEff(p).paid*Number(p.emi??0))}</td><td className="px-3 py-2 text-right mono text-orange-400 font-bold">{fmtINR(Math.round(f.principalLeft))}</td><td className="px-4 py-2 text-right text-[11px]" style={{color:'var(--text-faint)'}}>{isLump?`by ${p.paybackDate||'—'}`:isIntOnly?'not reducing':'principal'}</td></tr>
                })}
                {activeCCEmiLeft>0&&<tr style={{borderBottom:'1px solid var(--border-subtle,#1e2130)'}}><td className="px-4 py-2 font-semibold">Credit cards <span className="text-[11px] font-normal" style={{color:'var(--text-faint)'}}>EMIs</span></td><td className="px-3 py-2" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2 text-right mono text-red-400 font-bold">{fmtINR(activeCCEmiLeft)}</td><td></td></tr>}
                {activeCardDebt>0&&<tr style={{borderBottom:'1px solid var(--border-subtle,#1e2130)'}}><td className="px-4 py-2 font-semibold">CC Outstanding</td><td className="px-3 py-2" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2 text-right mono text-red-400 font-bold">{fmtINR(activeCardDebt)}</td><td></td></tr>}
                {activeChitRepayLeft>0&&<tr style={{borderBottom:'1px solid var(--border-subtle,#1e2130)'}}><td className="px-4 py-2 font-semibold">Chit repayment</td><td className="px-3 py-2" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2" style={{color:'var(--text-faint)'}}>—</td><td className="px-3 py-2 text-right mono text-yellow-400 font-bold">{fmtINR(activeChitRepayLeft)}</td><td></td></tr>}
                <tr style={{background:'var(--bg-base)'}}><td className="px-4 py-2 font-bold">Total</td><td></td><td className="px-3 py-2 text-right mono font-bold text-green-400">{fmtINR(rowPaid)}</td><td className="px-3 py-2 text-right mono font-bold text-red-400">{fmtINR(rowPending)}</td><td className="px-4 py-2 text-right mono font-bold text-green-400">{rowPct}%</td></tr>
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* Smart insight */}
      {items.length > 0 && totalInterestWasted > 0 && (
        <div className="rounded-xl px-3.5 py-2 flex items-center gap-3" style={{background:'linear-gradient(135deg,color-mix(in srgb, var(--danger) 8%, transparent) 0%,color-mix(in srgb, var(--danger) 2%, transparent) 100%)',border:'1px solid color-mix(in srgb, var(--danger) 15%, transparent)'}}>
          <span className="text-lg">💡</span>
          <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
            You paid <span style={{color:'var(--danger)',fontWeight:600}}>{fmtINR(totalInterestWasted)}</span> in interest across all closed loans — that's money that went to lenders, not you.
          </div>
        </div>
      )}

      {!showSummary && <>{items.length > 0 && <div className="flex items-center gap-2 mb-3">
        {/* Shared dropdown (up to 10 asset types was a long scrolling chip row) */}
        <FilterMenu allLabel="All types" noun="types" multiple={false} allCount={items.length}
          options={ASSET_TYPES.filter(t => {
            const n = items.filter((i: any) => i.assetType === t).length
            if (t === 'Funded' && items.filter((i: any) => i.assetType === 'Funded' && Number(i.totalPaid ?? 0) > 0).length === 0 && filter !== 'Funded') return false
            return n > 0 || t === filter
          }).map(t => ({ id: t, count: items.filter((i: any) => i.assetType === t).length }))}
          selected={filter === 'All' ? new Set<string>() : new Set([filter])}
          onChange={sel => { setFilter(sel.size ? [...sel][0] : 'All'); setPage(1) }} />
      </div>}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex gap-1">
            <button className="btn btn-xs btn-secondary" disabled={page === 1} onClick={() => setPage(p => p-1)}>← Prev</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} className={`btn btn-xs ${page === i+1 ? 'bg-orange-500 text-white' : 'btn-secondary'}`}
                onClick={() => setPage(i+1)}>{i+1}</button>
            ))}
            <button className="btn btn-xs btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p+1)}>Next →</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={ICON.closed} title="No closed assets" sub="Archive loans, savings, investments when they close" />
      ) : (
        <div className="space-y-2 mb-6">
          {paginated.map((item: any) => {
            const spent = Number(item.totalPaid ?? 0)
            const recovered = Number(item.recoveredAmount ?? 0)
            const princPaid = Number(item.principalPaid ?? 0)
            // Derive interest if not stored explicitly but principal is known
            const intPaid = deriveInt(item)
            const origVal = Number(item.originalValue ?? item.amount ?? 0)
            const months = Number(item.closedMonths ?? 0)
            // Entries closed without an explicit principalPaid (e.g. a manually-added closed loan,
            // or one closed before this field existed) always showed a blank "Principal Paid" tile
            // and no interest-rate context, even though totalPaid - interest gives the principal
            // directly. Fall back to that derivation so the tile — and the interest % below it —
            // still render.
            const derivedPrincipal = princPaid > 0 ? princPaid : Math.max(0, spent - intPaid)
            const interestPct = derivedPrincipal > 0 && intPaid > 0 ? (intPaid / derivedPrincipal) * 100 : null
            const pnl = recovered > 0 ? recovered - spent : null
          const stillOwned = Number(item.currentValue ?? 0) > 0 && recovered === 0
            const pct = recovered > 0 && spent > 0 ? ((recovered - spent) / spent * 100).toFixed(1) : null
            const roi = (item.assetType === 'Savings / Chit' || item.assetType === 'Investment / SIP') && recovered > 0 && months > 0
              ? annualizedReturn(spent, recovered, months) : null
            const v = verdict(item)
            const isExpanded = expandedItem === item.id

            return (
              <div key={item.id} className="rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
                <div className="px-4 py-3 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                  {/* Left: name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold">{item.lender}</span>
                      <span className="badge badge-blue text-[11px]">{item.assetType}</span>
                      {stillOwned && <span className="badge text-[11px]" style={{background:'#1d4ed820',color:'var(--info)',border:'1px solid #1d4ed840'}}>📦 Still own</span>}
                      <span className={`text-[11px] font-bold ${v.color}`}>{v.text}</span>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {item.closedDate}{item.purpose ? ` · ${item.purpose}` : ''}{months > 0 ? ` · ${months}mo` : ''}{item.notes ? ` · ${item.notes}` : ''}
                    </div>
                  </div>
                  {/* Right: clean summary */}
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <div className="mono font-bold text-red-400">{fmtINR(spent)}</div>
                      {intPaid > 0 && <div className="text-[11px] text-red-300">{fmtINR(intPaid)} int{interestPct !== null ? ` (${interestPct.toFixed(1)}%)` : ''}</div>}
                      {derivedPrincipal > 0 && <div className="text-[11px]" style={{color:'var(--text-faint)'}}>{fmtINR(derivedPrincipal)} principal</div>}
                      {item.fundedAmt > 0 && <div className="text-[11px] text-green-400">💰 {fmtINR(item.fundedAmt)} funded</div>}
                    </div>
                    {stillOwned && (
                      <div>
                        <div className="mono font-bold text-blue-400">{fmtINR(Number(item.currentValue))}</div>
                        <div className={`text-[11px] font-bold ${Number(item.currentValue)-spent>=0?'text-green-400':'text-red-400'}`}>{Number(item.currentValue)-spent>=0?'+':''}{fmtINR(Number(item.currentValue)-spent)}</div>
                      </div>
                    )}
                    {recovered > 0 && (
                      <div>
                        <div className="mono font-bold text-green-400">{fmtINR(recovered)}</div>
                        {pnl !== null && <div className={`text-[11px] font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnl >= 0 ? '+' : ''}{fmtINR(pnl)}</div>}
                      </div>
                    )}
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <button className="btn-ghost btn-xs" onClick={() => setModal({ open: true, item: { ...item } })}><Pencil size={12} /></button>
                      <button className="btn-danger btn-xs" onClick={() => setConfirmModal({ message: `Delete ${item.lender}?`, onConfirm: () => deleteMut.mutate(item.id), label: 'Delete' })}><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>

                {/* Expanded analysis */}
                {isExpanded && (
                  <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-base)' }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      {origVal > 0 && (
                        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
                          <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Original value</div>
                          <div className="mono font-bold">{fmtINR(origVal)}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>loan amount / purchase price</div>
                        </div>
                      )}
                      {derivedPrincipal > 0 && (
                        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
                          <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Principal paid</div>
                          <div className="mono font-bold text-yellow-400">{fmtINR(derivedPrincipal)}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{princPaid > 0 ? 'actual asset cost' : 'derived: total paid − interest'}</div>
                        </div>
                      )}
                      {intPaid > 0 && (
                        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                          <div className="text-[12px] mb-1 text-red-400">💸 Interest cost</div>
                          <div className="mono font-bold text-red-400">{fmtINR(intPaid)}</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>cost of borrowing</div>
                        </div>
                      )}
                      {interestPct !== null && (
                        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                          <div className="text-[12px] mb-1 text-red-400">Interest %</div>
                          <div className="mono font-bold text-red-400">{interestPct.toFixed(1)}%</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>of principal — interest ÷ principal</div>
                        </div>
                      )}
                      {roi !== null && (
                        <div className={`p-3 rounded-lg border ${roi > 0 ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                          <div className="text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Annualized return</div>
                          <div className={`mono font-bold ${roi > 0 ? 'text-green-400' : 'text-red-400'}`}>{roi}% / year</div>
                          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>over {months} months</div>
                        </div>
                      )}
                    </div>

                    {/* Depreciation analysis for physical assets */}
                    {item.assetType === 'Loan' && item.originalValue > 0 && (() => {
                      const depRate = getDepreciationRate(item.purpose)
                      if (!depRate) return null
                      const currentVal = currentDepreciatedValue(Number(item.originalValue), item.closedDate, depRate)
                      const recovered = Number(item.recoveredAmount ?? 0)
                      return (
                        <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 mb-3">
                          <div className="text-[11px] font-semibold text-yellow-400 mb-2">📉 Depreciation Analysis ({depRate}%/yr)</div>
                          <div className="grid grid-cols-3 gap-3 text-[11px]">
                            <div>
                              <div style={{color:'var(--text-muted)'}}>Original value</div>
                              <div className="mono font-bold">{fmtINR(item.originalValue)}</div>
                            </div>
                            <div>
                              <div style={{color:'var(--text-muted)'}}>Est. Value Now</div>
                              <div className="mono font-bold text-yellow-400">{fmtINR(currentVal)}</div>
                              <div style={{color:'var(--text-faint)'}}>after {((new Date().getTime() - new Date(item.closedDate).getTime())/(1000*60*60*24*365)).toFixed(1)} yrs</div>
                            </div>
                            {recovered > 0 && (
                              <div>
                                <div style={{color:'var(--text-muted)'}}>Sold vs Est. Value</div>
                                <div className={`mono font-bold ${recovered >= currentVal ? 'text-green-400' : 'text-red-400'}`}>
                                  {recovered >= currentVal ? '+' : ''}{fmtINR(recovered - currentVal)}
                                </div>
                                <div style={{color:'var(--text-faint)'}}>{recovered >= currentVal ? 'sold above market' : 'sold below market'}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Verdict detail */}
                    <div className={`p-3 rounded-lg text-[13px] font-semibold ${v.color.includes('green') ? 'bg-green-500/10' : v.color.includes('red') ? 'bg-red-500/10' : v.color.includes('orange') ? 'bg-orange-500/10' : 'bg-[var(--bg-hover)]'}`}>
                      <span className={v.color}>{v.text}</span>
                      {v.detail && <span className="ml-2 font-normal text-[11px]" style={{ color: 'var(--text-muted)' }}>{v.detail}</span>}
                    </div>

                    {/* "Should have bought cash" for loans */}
                    {item.assetType === 'Loan' && intPaid > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[11px]">
                        <div className="font-semibold text-blue-400 mb-1">📊 Cash vs Loan comparison</div>
                        <div className="flex gap-6">
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>If bought cash:</div>
                            <div>Paid: <span className="mono">{fmtINR(origVal)}</span></div>
                            {recovered > 0 && <div>Sold: <span className="mono text-green-400">{fmtINR(recovered)}</span></div>}
                            <div>Net: <span className={`mono font-bold ${recovered - origVal >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtINR(recovered - origVal)}</span></div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>With loan:</div>
                            <div>Paid: <span className="mono">{fmtINR(origVal)} + {fmtINR(intPaid)} interest</span></div>
                            {recovered > 0 && <div>Sold: <span className="mono text-green-400">{fmtINR(recovered)}</span></div>}
                            <div>Net: <span className={`mono font-bold text-red-400`}>{fmtINR(recovered - origVal - intPaid)}</span></div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>Loan cost you extra:</div>
                            <div className="mono font-bold text-red-400 text-[13px]">{fmtINR(intPaid)}</div>
                            <div style={{ color: 'var(--text-faint)' }}>in interest alone</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Recurring spend history */}
      {recurringRows.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-6" style={{background:"var(--bg-card)",border:"1px solid var(--hairline)"}}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[12px] font-medium " style={{ color: 'var(--text-muted)' }}>Recurring spend history</div>
            <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>auto-calculated from start date · set start date in Expenses tab</div>
          </div>
          {/* Warning for missing start dates */}
          {(expenses as any[]).filter(e => e.active !== false && Number(e.amount) > 0 && !e.startDate).length > 0 && (
            <div className="px-4 py-2 border-b bg-yellow-500/5" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[11px] text-yellow-400">
                ⚠ {(expenses as any[]).filter(e => e.active !== false && Number(e.amount) > 0 && !e.startDate).length} expenses missing start date:
                {(expenses as any[]).filter(e => e.active !== false && Number(e.amount) > 0 && !e.startDate).map((e: any) => ` ${e.label}`).join(',')}
              </div>
            </div>
          )}
          {/* The body of this table used to be <tbody>/<tr>/<td> sitting inside a plain <div>
              with no <table> ancestor. Browsers cannot lay out table elements without a table,
              so every cell collapsed into a single run of text and the columns never aligned
              with the grid header above. Rebuilt as grid rows on the same column template. */}
          {(() => {
            const COLS = 'minmax(200px,1.7fr) minmax(90px,1fr) minmax(130px,1.2fr) minmax(70px,0.8fr) minmax(90px,1fr) minmax(100px,1.1fr)'
            return (
              <div className="rounded-xl overflow-hidden text-[13px]" style={{border:'1px solid var(--border)',overflowX:'auto'}}>
                <div className="grid px-4 py-2.5 text-[12px] font-medium border-b"
                  style={{gridTemplateColumns:COLS,borderColor:'var(--border)',background:'var(--bg-base)',color:'var(--text-faint)'}}>
                  <SortHeader label="Expense" col="label" sortCol={recurSortCol} sortDir={recurSortDir} onSort={onRecurSort} />
                  <SortHeader label="Category" col="category" sortCol={recurSortCol} sortDir={recurSortDir} onSort={onRecurSort} align="center" />
                  <SortHeader label="Period" col="startDate" sortCol={recurSortCol} sortDir={recurSortDir} onSort={onRecurSort} />
                  <SortHeader label="Months" col="months" sortCol={recurSortCol} sortDir={recurSortDir} onSort={onRecurSort} align="right" />
                  <SortHeader label="Monthly" col="monthly" sortCol={recurSortCol} sortDir={recurSortDir} onSort={onRecurSort} align="right" />
                  <SortHeader label="Total spent" col="total" sortCol={recurSortCol} sortDir={recurSortDir} onSort={onRecurSort} align="right" />
                </div>

                {[...recurringRows].sort((a, b) => {
                  if (!recurSortCol) return 0
                  let cmp = 0
                  if (recurSortCol === 'label') cmp = a.label.localeCompare(b.label)
                  else if (recurSortCol === 'category') cmp = a.category.localeCompare(b.category)
                  else if (recurSortCol === 'startDate') cmp = (a.startDate ?? '').localeCompare(b.startDate ?? '')
                  else if (recurSortCol === 'months') cmp = a.months - b.months
                  else if (recurSortCol === 'monthly') cmp = a.monthly - b.monthly
                  else if (recurSortCol === 'total') cmp = (a.monthly * a.months) - (b.monthly * b.months)
                  return recurSortDir === 'asc' ? cmp : -cmp
                }).map((r, i) => (
                  <div key={i} className="grid items-center px-4 py-2.5"
                    style={{gridTemplateColumns:COLS,borderTop:i===0?'none':'1px solid color-mix(in srgb, var(--text) 5%, transparent)'}}>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.label}</div>
                      {r.isEnded && <span className="text-[11px]" style={{color:'var(--text-faint)'}}>Ended</span>}
                    </div>
                    <div className="text-center">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{background:'color-mix(in srgb, var(--text) 8%, transparent)',color:'var(--text-faint)'}}>{r.category}</span>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(r.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      {' → '}
                      {r.endDate ? new Date(r.endDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : <span className="text-green-400">Now</span>}
                    </div>
                    <div className="text-right mono">{r.months} mo</div>
                    <div className="text-right mono text-red-400">{fmtINR(r.monthly)}/mo</div>
                    <div className="text-right mono text-red-400 font-bold">{fmtINR(r.monthly * r.months)}</div>
                  </div>
                ))}

                <div className="grid px-4 py-3 text-[13px] font-bold border-t"
                  style={{gridTemplateColumns:COLS,borderColor:'var(--border)',background:'color-mix(in srgb, var(--text) 5%, transparent)'}}>
                  <span>Total recurring spent</span><span/><span/><span/><span/>
                  <span className="text-right mono text-red-400 font-bold">{fmtINR(totalRecurringSpent)}</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      </> }

      {/* Add/Edit Modal */}
      {modal.open && (
        <Modal title={modal.item.id ? 'Edit Entry' : 'Add Closed Asset'}
          onClose={() => setModal({ open: false, item: emptyForm() })}
          footer={<>
            <button className="btn-secondary" onClick={() => setModal({ open: false, item: emptyForm() })}>Cancel</button>
            <button className="btn-primary" onClick={() => { if (!modal.item.lender?.trim()) { alert("Name is required"); return; } saveMut.mutate({...modal.item, lender: modal.item.lender?.trim() || "Unknown"}); }} disabled={saveMut.isPending}>Save</button>
          </>}>
          <div className="form-grid">
            <FormField label="Name *" className="form-full">
              <input className="input" placeholder="L&T Finance, HDFC Chit..." value={modal.item.lender || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, lender: e.target.value } }))} />
            </FormField>
            <FormField label="Asset type">
              <select className="select" value={modal.item.assetType || 'Loan'}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, assetType: e.target.value } }))}>
                {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Purpose">
              <input className="input" placeholder="Bike, Car, Chit Fund..." value={modal.item.purpose || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, purpose: e.target.value } }))} />
            </FormField>
            <FormField label="Principal / Loan Amount (₹)">
              <input className="input" type="number" placeholder="Original loan / asset value" value={modal.item.originalValue || ''}
                onChange={e => {
                  const orig = +e.target.value
                  const total = modal.item.totalPaid || 0
                  setModal(m => ({ ...m, item: { ...m.item, originalValue: orig, principalPaid: orig,
                    interestPaid: total && orig ? total - orig : m.item.interestPaid
                  }}))
                }} />
            </FormField>
            <FormField label="EMI (₹)">
              <input className="input" type="number" placeholder="Monthly EMI" value={modal.item.emi || ''}
                onChange={e => {
                  const emi = +e.target.value
                  const months = modal.item.closedMonths || 0
                  const lump = modal.item.foreclosureAmt || 0
                  const orig = modal.item.originalValue || 0
                  const total = (months ? emi * months : 0) + lump
                  setModal(m => ({ ...m, item: { ...m.item, emi,
                    totalPaid: total || m.item.totalPaid,
                    interestPaid: total && orig ? total - orig : m.item.interestPaid
                  }}))
                }} />
            </FormField>
            <FormField label="Foreclosure Amount (₹)">
              <input className="input" type="number" placeholder="Lump sum paid to close early" value={modal.item.foreclosureAmt || ''}
                onChange={e => {
                  const lump = +e.target.value
                  const emi = modal.item.emi || 0
                  const months = modal.item.closedMonths || 0
                  const orig = modal.item.originalValue || 0
                  const total = (months ? emi * months : 0) + lump
                  setModal(m => ({ ...m, item: { ...m.item, foreclosureAmt: lump,
                    totalPaid: total,
                    interestPaid: orig && total ? total - orig : m.item.interestPaid
                  }}))
                }} />
            </FormField>
            <FormField label="Interest Paid (₹)">
              <input className="input" type="number" placeholder="auto = total − principal" value={modal.item.interestPaid || ''}
                onChange={e => {
                  const int = +e.target.value
                  setModal(m => ({ ...m, item: { ...m.item, interestPaid: int,
                    totalPaid: (m.item.principalPaid || 0) + int
                  }}))
                }} />
            </FormField>
            <FormField label="Total Paid (₹)">
              <input className="input" type="number" placeholder="auto = EMI × months" value={modal.item.totalPaid || ''}
                onChange={e => {
                  const total = +e.target.value
                  const princ = modal.item.principalPaid || modal.item.originalValue || 0
                  setModal(m => ({ ...m, item: { ...m.item, totalPaid: total,
                    interestPaid: princ && total ? total - princ : m.item.interestPaid
                  }}))
                }} />
            </FormField>
            <FormField label="Recovered / Sale Price (₹)">
              <input className="input" type="number" placeholder="Sale price, maturity, claim..." value={modal.item.recoveredAmount || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, recoveredAmount: +e.target.value } }))} />
            </FormField>
            <FormField label="Duration (months)">
              <input className="input" type="number" placeholder="How many months" value={modal.item.closedMonths || ''}
                onChange={e => {
                  const months = +e.target.value
                  const emi = modal.item.emi || 0
                  const orig = modal.item.originalValue || 0
                  const total = emi && months ? emi * months : modal.item.totalPaid
                  setModal(m => ({ ...m, item: { ...m.item, closedMonths: months,
                    totalPaid: total || m.item.totalPaid,
                    interestPaid: total && orig ? total - orig : m.item.interestPaid,
                    principalPaid: orig || m.item.principalPaid
                  }}))
                }} />
            </FormField>
            <FormField label="Closed date">
              <input className="input" type="date" value={modal.item.closedDate || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, closedDate: e.target.value } }))} />
            </FormField>
            <FormField label="Notes" className="form-full">
              <input className="input" value={modal.item.notes || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, notes: e.target.value } }))} />
            </FormField>
            <FormField label="Funded By (source)">
              <input className="input" placeholder="e.g. From Dad, Sold gold, Bonus..." value={modal.item.fundedBy || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, fundedBy: e.target.value } }))} />
            </FormField>
            <FormField label="Funded Amount (₹)">
              <input className="input" type="number" placeholder="How much from that source?" value={modal.item.fundedAmt || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, fundedAmt: +e.target.value || 0 } }))} />
            </FormField>
{!modal.item.recoveredAmount && (
            <FormField label="Current market value">
              <input className="input" type="number" placeholder="today's value — leave blank if sold/lost" value={modal.item.currentValue || ''}
                onChange={e => setModal(m => ({ ...m, item: { ...m.item, currentValue: +e.target.value || 0 } }))} />
            </FormField>
            )}
          </div>
          {/* Live P&L preview */}
          {(modal.item.emi > 0 || modal.item.foreclosureAmt > 0) && modal.item.closedMonths > 0 && (
            <div className="mt-3 p-3 rounded-lg text-[11px] space-y-0.5" style={{background:'var(--bg-base)'}}>
              <div style={{color:'var(--text-muted)'}}>
                {modal.item.emi > 0 && <span>{modal.item.closedMonths}mo × {fmtINR(modal.item.emi)} = <span className="text-red-400">{fmtINR(modal.item.emi * modal.item.closedMonths)}</span></span>}
                {modal.item.emi > 0 && modal.item.foreclosureAmt > 0 && <span className="mx-1">+</span>}
                {modal.item.foreclosureAmt > 0 && <span>foreclosure <span className="text-orange-400">{fmtINR(modal.item.foreclosureAmt)}</span></span>}
                <span className="ml-2">= total <span className="mono font-bold text-red-400">{fmtINR(modal.item.totalPaid)}</span></span>
              </div>
              {modal.item.originalValue > 0 && modal.item.totalPaid > 0 && (
                <div><span className="text-red-400">Interest cost: {fmtINR(modal.item.totalPaid - modal.item.originalValue)}</span></div>
              )}
            </div>
          )}
          {modal.item.totalPaid > 0 && (
            <div className="mt-4 space-y-2">
              {modal.item.interestPaid > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 text-[13px] text-red-400">
                  💸 Interest cost: {fmtINR(modal.item.interestPaid)} — cost of borrowing
                </div>
              )}
              {modal.item.recoveredAmount > 0 && (
                <div className={`p-3 rounded-lg text-[13px] font-semibold ${modal.item.recoveredAmount >= modal.item.totalPaid ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {modal.item.recoveredAmount >= modal.item.totalPaid ? '✅ Profit' : '❌ Loss'}: {fmtINR(Math.abs(modal.item.recoveredAmount - modal.item.totalPaid))}
                  {' '}({((modal.item.recoveredAmount - modal.item.totalPaid) / modal.item.totalPaid * 100).toFixed(1)}%)
                  {modal.item.closedMonths > 0 && ` · ${annualizedReturn(modal.item.totalPaid, modal.item.recoveredAmount, modal.item.closedMonths)}% annualized`}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
      {confirmModal && <ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </div>
  )
}
