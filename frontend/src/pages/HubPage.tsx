import { ICON, Glyph } from '../components/common/icons'
import BankMessagesBanner from '../components/common/BankMessagesBanner'
import { useState, useLayoutEffect, useEffect } from 'react'
import { incomePct } from '../utils/incomePct'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigateFrom } from '../hooks/useNavigateFrom'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi, incomeApi, expensesApi, insuranceApi, peopleOweApi, closedLoansApi } from '../api'
import api from '../api/axios'
import { calcOutflow, outflowTierLine, freeFigures } from '../utils/calcOutflow'
import { calcDebt } from '../utils/calcDebt'
import { ioweFacts } from '../utils/iowe'
import { debtFreeMonths } from '../utils/debtFree'
import { fmtINR, getEff, monthlyIncomeTotal } from '../utils/format'
import { calcLoanSplit } from '../utils/loanCalc'
import { LoadingSpinner, ErrorState } from '../components/common'
import { investTotals, investValue } from '../utils/investValue'
import { dataHealth } from '../utils/dataHealth'
import { DebtTrend, IncomeSplit } from '../components/hub/TrendPanels'
import HeadsUp from '../components/hub/HeadsUp'
import { friendsOwe } from '../utils/friendsOwe'
import { useHorizonState, setHorizonState } from '../utils/horizonStore'
import HorizonBar from '../components/common/HorizonBar'
import { oneOffsIn } from '../utils/oneOffs'
import { advanceAll, HORIZONS, horizonLabel, monthsUntil } from '../utils/projection'


// Earnings has no entry in the shared api module; EarningsPage declares it locally too.
const earningsApi = { getAll: () => api.get<{ data: any[] }>('/earnings').then(r => r.data.data) }

interface Props { section?: string }

// "4 columns / 2x2" switch for the Debt summary. It only does anything on wide screens (below 1280px the
// four cards already wrap to two across), so it lives in the sticky tab bar next to Full screen — as two
// small icon buttons — instead of taking a full row above the cards. Not rendered at all on narrower screens.
function DebtLayoutToggle({ wide, setWide }: { wide: boolean; setWide: (v: boolean) => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setSlot(document.getElementById('hub-action-slot')) }, [])
  const q = '(min-width: 1280px)'
  const [roomy, setRoomy] = useState(() => typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(q).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(q); const on = () => setRoomy(mq.matches)
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [])
  if (!slot || !roomy) return null
  const Btn = ({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} aria-label={title} aria-pressed={on} onClick={onClick}
      className="w-7 h-6 flex items-center justify-center transition-colors"
      style={{ background: on ? '#c2410c' : 'transparent', color: on ? 'white' : 'var(--text-muted)' }}>{children}</button>
  )
  return createPortal(
    <div className="flex rounded-lg overflow-hidden flex-shrink-0 print:hidden" style={{ border: '1px solid var(--border)' }}>
      <Btn on={!wide} title="Compact — 4 cards across" onClick={() => setWide(false)}>
        <svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor"><rect x="0" y="1" width="2.5" height="10" rx="0.8" /><rect x="3.8" y="1" width="2.5" height="10" rx="0.8" /><rect x="7.6" y="1" width="2.5" height="10" rx="0.8" /><rect x="11.4" y="1" width="2.5" height="10" rx="0.8" /></svg>
      </Btn>
      <Btn on={wide} title="Detailed — 2 × 2, more room per card" onClick={() => setWide(true)}>
        <svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor"><rect x="0" y="0.5" width="6" height="4.8" rx="0.8" /><rect x="8" y="0.5" width="6" height="4.8" rx="0.8" /><rect x="0" y="6.7" width="6" height="4.8" rx="0.8" /><rect x="8" y="6.7" width="6" height="4.8" rx="0.8" /></svg>
      </Btn>
    </div>, slot)
}

// Newton-Raphson reducing-balance rate solver — mirrors LoansPage's calcRate,
// using sanctioned amount (p) not received amount, so it matches the Loans page.
const calcLoanRate = (p: number, emi: number, n: number): number => {
  if (!p || !emi || !n) return 0
  let r = 0.01
  for (let i = 0; i < 1000; i++) {
    const f = p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) - emi
    const df = p * (Math.pow(1 + r, n) * (1 + n * r) - 1) / Math.pow(Math.pow(1 + r, n) - 1, 2) / (1 + r)
    if (Math.abs(df) < 1e-15) break
    r = r - f / df
    if (Math.abs(f) < 0.01) break
  }
  return Math.round(r * 12 * 100 * 10) / 10
}

export default function HubPage({ section = 'overview' }: Props) {
  const navigate = useNavigateFrom()
  const qc = useQueryClient()
  // Debt tab's card breakdown: 4-across by default (matches the metric-tile row above it), with
  // an optional 2x2 "Detailed" mode for anyone whose screen makes the 4-column rows/sub-text wrap.
  const [debtWide, setDebtWide] = useState(false)
  // 0 = today; otherwise the whole Hub is shown N months ahead (every EMI moved N instalments on). Shared with Dashboard,
  // Budget and Master through utils/horizonStore, so the choice follows you between pages.
  const { horizon, typicalSpend, noDeposits } = useHorizonState()
  const setHorizon = (k: number) => setHorizonState({ horizon: k })
  const setTypical = (v: boolean) => setHorizonState({ typicalSpend: v })
  const setNoDeposits = (v: boolean) => setHorizonState({ noDeposits: v })
  const [horizonInfo, setHorizonInfo] = useState(false)   // the "details" panel under the Look-ahead row
  const { data: loansRaw       = [], isLoading: l1, isError: e1 } = useQuery({ queryKey: ['loans'],       queryFn: loansApi.getAll })
  const { data: cardsRaw       = [], isLoading: l2, isError: e2 } = useQuery({ queryKey: ['cards'],       queryFn: cardsApi.getAll })
  const { data: personalRaw    = [], isLoading: l3, isError: e3 } = useQuery({ queryKey: ['personal'],    queryFn: personalEmiApi.getAll })
  const { data: savingsRaw     = [], isLoading: l4, isError: e4 } = useQuery({ queryKey: ['savings'],     queryFn: savingsApi.getAll })
  const { data: investmentsRaw = [], isLoading: l5, isError: e5 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const { data: income      = [], isLoading: l6, isError: e6 } = useQuery({ queryKey: ['income'],      queryFn: incomeApi.getAll })
  const { data: expensesRaw = [], isLoading: l7, isError: e7 } = useQuery({ queryKey: ['expenses'],    queryFn: expensesApi.getAll })
  const { data: insuranceRaw = [], isLoading: l8, isError: e8 } = useQuery({ queryKey: ['insurance'],   queryFn: insuranceApi.getAll })
  const { data: peopleOwe   = [], isLoading: l9, isError: e9 } = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApi.getAll })
  const { data: closedLoans = [], isLoading: l10, isError: e10 } = useQuery({ queryKey: ['closed-loans'], queryFn: closedLoansApi.getAll })
  const { data: earnings    = [], isLoading: l11, isError: e11 } = useQuery({ queryKey: ['earnings'],     queryFn: earningsApi.getAll })

  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8||l9||l10||l11
  const isError = e1||e2||e3||e4||e5||e6||e7||e8||e9||e10||e11

  const nav = (to: string) => () => navigate(to)

  // The Look-ahead button is mounted from the first frame (not after the data arrives), so it doesn't pop into the tab bar late.
  if (isLoading) return <><HorizonBar /><LoadingSpinner /></>
  if (isError) return <ErrorState message="Failed to load your financial data." onRetry={() => qc.invalidateQueries()} />

  // The data as it will stand `horizon` months from now (see utils/projection). Everything below — tiles, sections,
  // breakdowns — is computed from these, so flipping the horizon re-runs every rule on the future dates.
  const proj = advanceAll({ loans: loansRaw as any[], cards: cardsRaw as any[], personal: personalRaw as any[], savings: savingsRaw as any[], investments: investmentsRaw as any[], expenses: expensesRaw as any[], insurance: insuranceRaw as any[] }, horizon, { typicalSpend, noDeposits })
  const loans: any[] = proj.loans, cards: any[] = proj.cards, personal: any[] = proj.personal, savings: any[] = proj.savings, investments: any[] = proj.investments
  const expenses: any[] = proj.expenses ?? [], insurance: any[] = proj.insurance ?? []
  // Records that can't keep themselves current — judged on today's data, never the projection.
  const health = horizon === 0 ? dataHealth({ loans: loansRaw as any[], cards: cardsRaw as any[], personal: personalRaw as any[], savings: savingsRaw as any[], investments: investmentsRaw as any[], expenses: expensesRaw as any[], insurance: insuranceRaw as any[] }) : []
  // Today's own figures, only to show "vs today" on the future view.
  const dToday = horizon ? calcDebt(loansRaw as any[], cardsRaw as any[], personalRaw as any[], savingsRaw as any[]) : null
  const oToday = horizon ? calcOutflow(loansRaw as any[], cardsRaw as any[], personalRaw as any[], savingsRaw as any[], investmentsRaw as any[], expensesRaw as any[], insuranceRaw as any[]) : null
  // Everything that ends inside the window — EMIs, chits and savings, SIPs, premiums and bills with an end date — each with
  // where to open it and what it frees every month (bills/premiums as a monthly equivalent).
  type Ended = { label: string; kind: string; left: number; to: string; friend: boolean; amount: string; freed: number }
  const perMonth = (amt: number, freq?: string) => { const f = String(freq ?? 'Monthly').toLowerCase(); return /single|one/.test(f) ? 0 : f.startsWith('quarter') ? amt / 3 : f.startsWith('half') ? amt / 6 : f.startsWith('year') || f.startsWith('annual') ? amt / 12 : amt }
  const endedByThen: Ended[] = horizon ? ([
    ...(loansRaw as any[]).filter(l => getEff(l).pending > 0 && getEff(l).pending <= horizon).map(l => ({ label: l.lender, kind: 'Loan', left: getEff(l).pending, to: '/loans', friend: false, amount: `${fmtINR(Number(l.emi ?? 0))}/mo`, freed: Number(l.emi ?? 0) })),
    ...(cardsRaw as any[]).flatMap(c => (c.emis ?? []).filter((e: any) => getEff(e).pending > 0 && getEff(e).pending <= horizon).map((e: any) => ({ label: `${c.banker} · ${e.label}`, kind: 'Card EMI', left: getEff(e).pending, to: '/cards', friend: !!e.owedBy && !e.owedSettled, amount: `${fmtINR(Number(e.emi ?? 0))}/mo`, freed: Number(e.emi ?? 0) }))),
    ...(personalRaw as any[]).filter(p => p.active !== false && p.tenure && getEff(p).pending > 0 && getEff(p).pending <= horizon).map(p => ({ label: p.person ?? p.name, kind: 'I Owe', left: getEff(p).pending, to: '/personal', friend: !!p.owedBy && !p.owedSettled, amount: `${fmtINR(Number(p.emi ?? 0))}/mo`, freed: Number(p.emi ?? 0) })),
    ...(savingsRaw as any[]).filter(v => v.active !== false && v.tenure && getEff(v).pending > 0 && getEff(v).pending <= horizon).map(v => {
      const repaying = v.mode === 'withdrew' || v.prizeTaken === true || v.status === 'Repaying'
      return { label: v.name, kind: repaying ? 'Chit repayment' : 'Chit / savings', left: getEff(v).pending, to: '/savings', friend: false, amount: `${fmtINR(Number(v.monthly ?? 0))}/mo`, freed: Number(v.monthly ?? 0) }
    }),
    ...(investmentsRaw as any[]).filter(v => v.active !== false && (monthsUntil(v.endDate) > 0 ? monthsUntil(v.endDate) <= horizon : (v.tenure && getEff(v).pending > 0 && getEff(v).pending <= horizon))).map(v => {
      const left = monthsUntil(v.endDate) || getEff(v).pending
      return { label: v.name, kind: 'SIP / investment', left, to: '/investments', friend: false, amount: Number(v.monthly ?? 0) > 0 ? `${fmtINR(Number(v.monthly))}/mo` : 'matures', freed: Number(v.monthly ?? 0) }
    }),
    ...(insuranceRaw as any[]).filter(v => v.active !== false && !v.isCardEmi && monthsUntil(v.endDate) > 0 && monthsUntil(v.endDate) <= horizon).map(v => ({ label: v.name, kind: 'Insurance', left: monthsUntil(v.endDate), to: '/insurance', friend: false, amount: `${fmtINR(Number(v.premium ?? 0))}${/month/i.test(v.frequency ?? 'Monthly') ? '/mo' : ` ${String(v.frequency ?? '').toLowerCase()}`}`, freed: perMonth(Number(v.premium ?? 0), v.frequency) })),
    ...(expensesRaw as any[]).filter(v => v.active !== false && monthsUntil(v.endDate) > 0 && monthsUntil(v.endDate) <= horizon).map(v => ({ label: v.label, kind: 'Bill', left: monthsUntil(v.endDate), to: '/expenses', friend: false, amount: `${fmtINR(Number(v.amount ?? 0))}${/month/i.test(v.frequency ?? 'Monthly') ? '/mo' : ` ${String(v.frequency ?? '').toLowerCase()}`}`, freed: perMonth(Number(v.amount ?? 0), v.frequency) })),
  ] as Ended[]).filter(x => x.label).sort((a, b) => a.left - b.left) : []
  const endedFreed = endedByThen.filter(x => !x.friend).reduce((s, x) => s + x.freed, 0)

  // Sections below show only the first N rows. Say so when rows are hidden —
  // otherwise a partial list sits under a full-value header and reads as complete.
  const moreLabel = (count: number, shown: number, fallback: string) =>
    count > shown ? `+${count - shown} more · ${fallback}` : fallback

  // ── COMPUTED ──
  /* All outflow components come from utils/calcOutflow so Hub cannot drift from Dashboard,
     Budget, Lookup or Calendar. Names kept so the JSX below is untouched. */
  const o = calcOutflow(loans as any[], cards as any[], personal as any[], savings as any[],
                        investments as any[], expenses as any[], insurance as any[])
  const totalLoanEmi   = o.loanEmi

  // Remaining principal + interest for one loan — same maths as LoansPage's "To clear" column.
  // pending*emi would ignore a bank-statement principal entry and drift from the Loans page.
  const d0 = calcDebt(loans as any[], cards as any[], personal as any[], savings as any[])
  const loanToClear = (l:any) => {
    const e = getEff(l), t = l.tenure ?? (e.paid + e.pending)
    const sp = calcLoanSplit(Number(l.amount??0), Number(l.emi??0), t, e.paid, l.principalPaid ?? undefined)
    return sp.princLeft + sp.intLeft
  }
  /* `loanToClear` (principal + interest) is still used for the per-loan "to clear" sub-lines,
     which is the right figure there. But it must never feed a debt total or breakdown — that is
     what made this page report ₹27,16,233 against Dashboard's ₹24,84,938. */
  // Full amount still to pay on the loans: principal plus the interest still to come.
  const totalLoans     = d0.loanTotal

  // Per-card helpers — only ACTIVE EMIs count towards the monthly figure, matching CreditCardsPage.
  // Friend-owed EMIs (carried for someone, not yet paid back) are left out of both figures, exactly as
  // calcDebt/calcOutflow and Master's "Not counted" tab do — otherwise Hub's Monthly EMIs ran higher
  // than every other page by the friend's instalment.
  const emiIsOwn    = (e:any) => !(e?.owedBy && !e?.owedSettled)
  const cardEmiMo   = (c:any) => (c.emis??[]).filter((e:any)=>getEff(e).pending>0 && emiIsOwn(e)).reduce((a:number,e:any)=>a+Number(e.emi??0),0)
  const cardEmiBal  = (c:any) => (c.emis??[]).filter((e:any)=>getEff(e).pending>0 && emiIsOwn(e)).reduce((a:number,e:any)=>a+getEff(e).pending*Number(e.emi??0),0)
  // Was a raw sum with no friend-owed exclusion — calcDebt.ts's `ccSpends` (baked into `totalDebt`
  // via `d0`/`d` below) excludes a spend tagged "for a friend" and not yet settled. This page's own
  // CC Spends card/section totals could disagree with the headline Total Debt by exactly that gap.
  const isFriendOwed = (x:any) => !!x?.owedBy && !x?.owedSettled
  const cardSpends  = (c:any) => (c.spends??[]).filter((s:any)=>!isFriendOwed(s)).reduce((a:number,s:any)=>a+Number(s.amount??0),0)
  // What this card still owes in total — the figure each row must show so rows sum to the section total.
  const cardBalance = (c:any) => cardEmiBal(c) + Number(c.outstanding??0) + cardSpends(c)

  const totalCCEmi     = (cards as any[]).reduce((s:number,c:any)=>s+cardEmiMo(c),0)
  const totalCCSpends  = (cards as any[]).reduce((s:number,c:any)=>s+cardSpends(c),0)
  const totalCCOutstanding = (cards as any[]).reduce((s:number,c:any)=>s+Number(c.outstanding??0),0)
  const totalCCPrincipal = (cards as any[]).reduce((s:number,c:any)=>s+cardBalance(c),0)
  // How many separate EMIs make up totalCCEmi — the Credit Cards row showed a monthly figure with
  // no sense of whether that was one EMI or six, the one count missing next to Active Loans'
  // "N loans" and People Owe Me's "N pending" on the same screen.
  const activeCCEmiCount = (cards as any[]).flatMap((c:any)=>(c.emis??[])).filter((e:any)=>getEff(e).pending>0).length
  const iOweEmi        = o.iOweEmi   // interest-only entries contribute their servicing cost only
  // Was a raw sum of `p.amount` — disagreed with `d0.iOwePrincipal` (the figure the "I Owe" Row
  // and debtLabel above already show correctly) for any interest-only or partly-amortised entry.
  const iOweTotal      = d0.iOwePrincipal
  const chitRepayEmi   = o.chitRepay
  // Withdrawn chit = pot already taken, remaining instalments still owed → a real liability.
  // Matches SavingsPage's "Chit Repayment" figure, and keeps Total Debt consistent with
  // Monthly EMIs and the Debt Free date, which both already count chit repayment.
  const chitRepayLeft  = (savings as any[]).filter((v:any)=>(v.mode==='withdrew'||v.prizeTaken)&&getEff(v).pending>0).reduce((s:number,v:any)=>s+getEff(v).pending*Number(v.monthly??0),0)
  // Same "N loans"-style count for the Chit Repayment row — same filter chitRepayLeft itself uses.
  const chitRepayCount = (savings as any[]).filter((v:any)=>(v.mode==='withdrew'||v.prizeTaken)&&getEff(v).pending>0).length
  const totalExpenses  = o.expenses

  // Debt-free horizon must span every debt on this page, not just loans —
  // a long card EMI or personal EMI can outlast the last loan.
  // The plan doesn't change when you look ahead, so the debt-free DATE doesn't either — only how far away it is from then.
  // (Re-running the calculator on the moved-forward data would shrink the "freed EMIs" it uses to clear interest-only
  // debts, and push the date out instead of keeping it fixed.)
  const maxPendingToday = debtFreeMonths(loansRaw as any[], cardsRaw as any[], personalRaw as any[], savingsRaw as any[])
  const maxPending     = Math.max(0, maxPendingToday - horizon)
  const debtFreeDate   = (() => { const d = new Date(); d.setMonth(d.getMonth()+maxPendingToday); return d.toLocaleDateString('en-IN',{month:'short',year:'numeric'}) })()

  // Row lists — kept as variables so the "+N more" counts match what is actually rendered.
  const activeLoanList    = (loans as any[]).filter((l:any)=>getEff(l).pending>0)
  const activeCardList    = (cards as any[]).filter((c:any)=>cardBalance(c)>0)
  const activeExpenseList = (expenses as any[]).filter((v:any)=>v.active!==false)

  // `|| 37500` used to sit on the end of this: whenever no saving had a currentCorpus set,
  // the app invented ₹37,500 of assets and fed it into Net Worth. Fall back to what has
  // actually been paid in (monthly × months paid) instead of a made-up constant.
  // Was missing `&& !v.prizeTaken` — Dashboard and FinanceOverviewPage both exclude a chit whose
  // prize has already been taken (it's now a debt being repaid, tracked via `chitRepayLeft` in
  // calcDebt, not an asset) even when its `mode` field is still `'saving'`. Without this exclusion,
  // Hub kept counting that chit's accumulated corpus as an asset while also counting its
  // instalments as debt elsewhere — the same underlying record shown as both, overstating Hub's
  // Net Worth and Savings Corpus relative to every other page for identical data.
  const corpusOf = (list: any[]) => list.filter((v:any)=>v.mode!=='withdrew' && !v.prizeTaken)
    .reduce((s:number,v:any)=>{ const c = v.currentCorpus != null ? Number(v.currentCorpus) : Number(v.monthly ?? 0) * getEff(v).paid; return s + (Number.isFinite(c) ? c : 0) },0)
  const savingsCorpus  = (savings as any[]).filter((v:any)=>v.mode!=='withdrew' && !v.prizeTaken)
    // `Number(...) ?? 0` never fires: Number() always returns a number, and returns NaN for a
    // missing value — so a saving with no `monthly` used to poison the whole corpus total with NaN.
    .reduce((s:number,v:any)=>{
      const c = v.currentCorpus != null ? Number(v.currentCorpus) : Number(v.monthly ?? 0) * getEff(v).paid
      return s + (Number.isFinite(c) ? c : 0)
    },0)
  const savingsEmi     = o.savings
  // "2 closing within 3 mo" today; "2 closed by Apr 2027" in a future view — so a chit that ends isn't just silently gone.
  const chitNote = (() => {
    if (horizon) { const n = endedByThen.filter(x => x.kind.startsWith('Chit')).length; return n ? `${n} closed by ${horizonLabel(horizon)}` : '' }
    const n = (savings as any[]).filter(v => v.active !== false && v.tenure && getEff(v).pending > 0 && getEff(v).pending <= 3).length
    return n ? `${n} closing within 3 mo` : ''
  })()
  // Was `v.invested` — Investment has no such field (it's `totalInvested`; see types/index.ts), so
  // this always evaluated to 0. The Investments row on this page showed "₹0 invested" and a P&L of
  // "current value minus 0" (i.e. the full current value, not the real gain) for every real
  // investment on the account. `currentVal`'s matching `??v.invested` fallback was equally dead —
  // dropped to match Dashboard/Finance Overview's plain `currentValue??0`, no fallback, exactly.
  const investedAmt    = investTotals(investments as any[]).invested   // active entries only, same rules as the Investments page
  const currentVal     = investTotals(investments as any[]).value
  const sipEmi         = o.sipInvest
  // Same components Dashboard/Finance Overview add into `totalAssets` — an owned asset's current
  // value net of what's still owed on the loan that bought it (e.g. a car/home loan tracking
  // `currentValue`), and money people owe back. Neither was in this page's Net Worth at all, so a
  // loan with `currentValue` set, or any pending People-Owe-Me balance, made Hub's Net Worth lower
  // than Dashboard's/Finance Overview's for identical data — by exactly that missing amount.
  const totalOwnedAssets  = (loans as any[]).reduce((s:number,l:any)=>s+Number(l.currentValue??0),0)
  const ownedAssetsPending = (loans as any[]).filter((l:any)=>Number(l.currentValue??0)>0).reduce((s:number,l:any)=>s+getEff(l).pending*Number(l.emi??0),0)
  const netOwnedAssets    = totalOwnedAssets - ownedAssetsPending
  const peopleOweMeTotal = (peopleOwe as any[]).filter((p:any)=>p.status!=='Paid'&&p.status!=='Settled').reduce((s:number,p:any)=>s+Number(p.amount??0)-Number(p.paidAmount??0),0)

  const monthlyIncome  = monthlyIncomeTotal(income as any[])
  // Was monthly-frequency ONLY, so a quarterly or half-yearly premium counted as zero here.
  const insMo          = o.insuranceEmi
  const insAnnual      = (insurance as any[]).filter((v:any)=>v.active!==false&&v.frequency!=='Monthly').reduce((s:number,v:any)=>s+Number(v.premium??0),0)
  const lockedMonthly  = o.locked
  const cardThisMonth  = o.card
  const totalOutflow   = o.total
  // Free / month = income − committed (card bills not taken off) — same figure as every page (calcOutflow.freeFigures)
  const { free: freeCash, left: leftThisMonth } = freeFigures(o, monthlyIncome)
  // Friends' EMIs on your cards: the bank charges them to you each month and your friend pays you back, so they are neither
  // your cost nor your profit — they are left out of Outflow, and therefore out of Free / Month too. Shown beside it so the
  // figure isn't mistaken for money that is fully yours when the bank is actually debiting a bit more.
  const friendsEmiMo   = (cards as any[]).reduce((s:number,c:any)=>s+(c.emis??[]).filter((e:any)=>getEff(e).pending>0 && !!e.owedBy && !e.owedSettled).reduce((a:number,e:any)=>a+Number(e.emi??0),0),0)
  // The two section badges below must add up to the Monthly Outflow card, to the rupee. The debt side
  // used to be EMIs + card SPENDS + bills, which left the card's statement outstanding out of both
  // badges, so they summed to ₹32,984 less than the headline. Now: the assets side is exactly what it
  // always was (savings + SIP + insurance), and the debt side is everything else in totalOutflow —
  // EMIs, bills and the whole card bill (outstanding + spends).
  const assetSideMonthly = o.savings + o.sipInvest + o.insuranceEmi
  const debtSideMonthly  = totalOutflow - assetSideMonthly
  /* Debt now comes from utils/calcDebt so Hub cannot disagree with Dashboard again. The two
     pages differed by ₹2,31,295 on identical data because Hub summed principal PLUS all remaining
     interest while Dashboard summed principal alone. Settled definition: debt is principal
     outstanding; interest still to come is reported separately, never folded into the headline. */
  const d              = d0
  const totalDebt      = d.total
  /* Net worth uses PRINCIPAL, not the interest-inclusive debt total.
     Debt headlines report "total still to pay" — principal plus interest yet to come — because that
     is what the money will actually cost. But net worth answers a different question: what is owned
     minus what is owed *today*. Interest that has not accrued is not a present liability, and it
     would be serviced out of income not yet earned, so counting it here charges the same future
     rupee twice. `totalPrincipal` is the settle-today figure from the same calculator, so the two
     readings can never drift apart. */
  // Every component Net Worth adds on the asset side, summed on its own so the Net Worth tile's
  // sub-line can actually show it — it previously read "assets − ₹27,37,655 owed today" with the
  // word "assets" hardcoded and no number in front of it, because this total was never computed as
  // its own value, only inlined straight into netWorth below.
  const totalAssetsValue = savingsCorpus + currentVal + netOwnedAssets + peopleOweMeTotal
  const netWorth       = totalAssetsValue - d.totalPrincipal
  // The same sum on today's records, so the future view can say how much richer (or not) you are by then.
  const netWorthToday  = horizon && dToday ? corpusOf(savingsRaw as any[]) + investTotals(investmentsRaw as any[]).value + netOwnedAssets + peopleOweMeTotal - dToday.totalPrincipal : null
  // One-time bills and premiums dated inside the window — not in the monthly figures, so listed separately.
  const corpusToday = horizon ? corpusOf(savingsRaw as any[]) : null
  const investToday = horizon ? investTotals(investmentsRaw as any[]) : null
  const owedToYou = friendsOwe(cards as any[])
  const oneOffs = oneOffsIn(expensesRaw as any[], insuranceRaw as any[], horizon)
  const oneOffTotal = oneOffs.reduce((a, x) => a + x.amount, 0)
  const dti            = monthlyIncome>0?Math.round((totalLoanEmi+totalCCEmi)/monthlyIncome*100):0
  const peopleOweMeCount = (peopleOwe as any[]).filter((p:any)=>p.status!=='Paid'&&p.status!=='Settled').length

  // ── CARD helper ──
  // Hero figure tile — quiet surface, one accent dot, large tight numerals (no tinted gradients or shouting caps).
  const Card = ({ color, label, value, sub, to, title, suffix }: any) => (
    <div onClick={nav(to)} title={title} className="group card-link rounded-2xl p-4 sm:p-5 min-w-0"
      style={{background:`linear-gradient(180deg,color-mix(in srgb, ${color} 5%, var(--bg-card)) 0%,var(--bg-card) 70%)`,border:'1px solid var(--hairline)'}}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium mb-2" style={{color:'var(--text-muted)'}}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{background:color}} />{label}
      </div>
      <div className="text-[19px] min-[420px]:text-[22px] sm:text-[28px] leading-tight font-semibold tracking-tight flex flex-wrap items-baseline" style={{color, fontVariantNumeric:'tabular-nums'}} title={String(value) + (suffix ?? '')}>{value}{suffix && <span className="text-[13px] font-medium ml-1.5" style={{opacity:0.7}}>{suffix.trim()}</span>}</div>
      {/* Wraps instead of clipping at two lines: on a phone the tiles are half-width and the end of a
          breakdown ("… + renewals & one-offs ₹85,096") was cut off. Subs are kept short instead. */}
      {sub && <div className="text-[11px] leading-snug mt-2.5 break-words" title={String(sub)} style={{color:'var(--text-faint)'}}>{sub}</div>}
    </div>
  )

  // ── ROW helper ──
  // Look-ahead: what a figure is today vs then, shown right under the figure ("▼ −₹20,000 · now ₹50,000"). `upGood` says which
  // direction is good news (assets up, debt down), so the change is coloured by meaning, not by sign.
  const change = (now: number, was: number | null | undefined, upGood: boolean) => {
    if (!horizon || was == null) return null
    const x = Math.round(now - was)
    if (x === 0) return <span style={{ color: 'var(--text-faint)' }}>same as today</span>
    const good = (x > 0) === upGood
    return <span style={{ color: good ? 'var(--success)' : 'var(--warning)' }}>{x > 0 ? '▲ +' : '▼ −'}{fmtINR(Math.abs(x))}<span style={{ color: 'var(--text-faint)' }}> · today {fmtINR(was)}</span></span>
  }
  const Row = ({ icon, label, value, sub, color, to, delta }: any) => (
    <div onClick={nav(to)} className="group flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 -mx-3 hover:bg-white/[0.04] transition-colors">
      {icon && <span className="w-7 h-7 rounded-lg inline-flex items-center justify-center flex-shrink-0" style={{background:`color-mix(in srgb, ${color ?? 'var(--text)'} 12%, transparent)`, color: color ?? 'var(--text-muted)'}}><Glyph icon={icon} size={15} /></span>}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium leading-tight">{label}</div>
        {sub && <div className="text-[11px] leading-snug mt-0.5" style={{color:'var(--text-faint)'}}>{sub}</div>}
      </div>
      <div className="text-right">
        <div className="text-[14px] font-semibold" style={{color:color||'var(--text)', fontVariantNumeric:'tabular-nums'}}>{value}</div>
        {delta && <div className="text-[11px] whitespace-nowrap" style={{fontVariantNumeric:'tabular-nums'}}>{delta}</div>}
      </div>
      <span className="text-[12px] opacity-30 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all" style={{color:'var(--text-faint)'}}>›</span>
    </div>
  )

  // ── SECTION HEADER ──
  const SectionCard = ({ children, title, total, monthly, color, note, dense, delta }: any) => (
    <div className="rounded-2xl overflow-hidden" style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
      <div className={`${dense?'px-4 py-3':'px-5 py-4'} flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap`} style={{borderBottom:'1px solid color-mix(in srgb, var(--text) 7%, transparent)'}}>
        <span className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:color}} />
          <span className={`${dense?'text-[13px]':'text-[14px]'} font-semibold sm:truncate`} style={{color:'var(--text)'}}>{String(title).replace(/^\S+\s/, m => /[A-Za-z]/.test(m) ? m : '')}</span>
          {note && (
            <details className="relative print:hidden">
              <summary className="list-none cursor-pointer select-none text-[11px] rounded-full w-4 h-4 inline-flex items-center justify-center" style={{border:'1px solid var(--border)',color:'var(--text-faint)'}} title="What's included">i</summary>
              <div className="absolute left-0 top-6 z-20 w-64 rounded-xl p-3 text-[12px] font-normal shadow-xl" style={{background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text-muted)'}}>{note}</div>
            </details>
          )}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold" style={{color, fontVariantNumeric:'tabular-nums'}}>{total}</span>
          {delta && <span className="text-[11px]" style={{fontVariantNumeric:'tabular-nums'}}>{delta}</span>}
          {monthly&&<span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{background:`color-mix(in srgb, ${color} 10%, transparent)`,color}}>{monthly}</span>}
        </div>
      </div>
      <div className={dense?'px-4 py-2 space-y-0 divide-y divide-white/[0.05]':'px-5 py-2 space-y-0 divide-y divide-white/[0.05]'}>{children}</div>
    </div>
  )

  // ─────────────────────────────────────────────
  // OVERVIEW
  // ─────────────────────────────────────────────
  // Was `debtLabel(d, activeLoanList.length)` — "6 loans · CC · I Owe · chit", with no numbers.
  // CC outstanding + unbilled spends were already fully included in `totalDebt`, but with nothing
  // but the word "CC" to show for it, it read as if they were missing from the total. Now the
  // actual CC balance is spelled out, same convention Master Table's "Outstanding + Spend" tile uses.
  const ccBalance = d.ccOutstanding + d.ccSpends
  const debtSub = [
    activeLoanList.length > 0 ? `${activeLoanList.length} loans` : null,
    ccBalance > 0 ? `CC bal ${fmtINR(ccBalance)}` : (d.ccEmiPrincipal > 0 ? 'CC EMI' : null),
    d.iOwePrincipal > 0 ? 'I Owe' : null,
    d.chitRepayLeft > 0 ? 'chit' : null,
      d.interestLeft > 0 ? `incl. ${fmtINR(d.interestLeft)} interest to come` : null,
  ].filter(Boolean).join(' · ')

  // ── Horizon flip: Today · +3 · +6 · +12 months ──
  const deltaTxt = (now: number, then: number) => { const x = Math.round(then - now); return x === 0 ? 'same as today' : `${x < 0 ? '−' : '+'}${fmtINR(Math.abs(x))} vs today` }
  const horizonBar = (
    <HorizonBar
      status={<>
            {endedByThen.length > 0 && <> · <b style={{ color: 'var(--success)' }}>{endedByThen.length} ending</b></>}{oneOffs.length > 0 && <> · <b style={{ color: 'var(--warning)' }}>{oneOffs.length} one-time {fmtINR(oneOffTotal)}</b></>}
          </>}
      details={
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-faint)' }}>What this assumes</div>
                <ul className="space-y-1" style={{ color: 'var(--text-muted)' }}>
                  <li>✓ Every EMI is paid on time, so each moves {horizon} instalments on.</li>
                  <li>✓ Card statement balances are cleared; {typicalSpend ? 'a typical month of card spending (this cycle\'s spends) continues.' : 'nothing new goes on the cards.'}</li>
                  <li>{noDeposits ? '✓ No new deposits: savings, chits you are building and SIPs stop where they are today.' : '✓ Savings and SIPs keep going in; no investment returns are guessed.'}</li>
                  <li>✓ No new loans or EMIs are taken.</li>
                  <li>✓ Chits, SIPs, premiums and bills that have an end date stop on it.</li>
                  <li>• Income and every other bill or premium stay exactly as they are today.</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-faint)' }}>
                  Ending by {horizonLabel(horizon)}{endedFreed > 0 && <> · frees <b className="mono" style={{ color: 'var(--success)' }}>{fmtINR(endedFreed)}/mo</b></>}
                </div>
                {endedByThen.length === 0
                  ? <div style={{ color: 'var(--text-faint)' }}>Nothing ends in this window — no EMI, chit, SIP, premium or bill with an end date.</div>
                  : <div className="max-h-44 overflow-y-auto -mx-1">
                      {endedByThen.map((x, i) => (
                        <button key={i} type="button" onClick={() => navigate(x.to)} className="w-full flex items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-white/5" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                          <span className="flex-1 min-w-0 truncate">{x.friend ? x.label.replace(/\s*\(friend\)/i, '') : x.label}{x.friend && <span style={{ color: 'var(--info)' }}> · friend's</span>} <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>{x.kind}</span></span>
                          <span style={{ color: 'var(--text-faint)' }}>{x.left} mo left</span>
                          <span className="mono w-28 text-right whitespace-nowrap" style={{ color: x.friend ? 'var(--text-faint)' : 'var(--success)' }}>{x.amount}</span>
                          <span style={{ color: 'var(--text-faint)' }}>→</span>
                        </button>
                      ))}
                    </div>}
                {oneOffs.length > 0 && (
                  <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-faint)' }}>
                      One-time payments by {horizonLabel(horizon)} · <b className="mono" style={{ color: 'var(--warning)' }}>{fmtINR(oneOffTotal)}</b> <span className="normal-case tracking-normal">(not in the monthly figures)</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto -mx-1">
                      {oneOffs.map(x => (
                        <button key={x.key} type="button" onClick={() => navigate(x.to)} className="w-full flex items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-white/5" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                          <span className="flex-1 min-w-0 truncate">{x.label} <span style={{ color: 'var(--text-faint)' }}>· {x.kind}</span></span>
                          <span style={{ color: 'var(--text-faint)' }}>{new Date(x.on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          <span className="mono w-24 text-right whitespace-nowrap" style={{ color: 'var(--warning)' }}>{fmtINR(x.amount)}</span>
                          <span style={{ color: 'var(--text-faint)' }}>→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
      } />
  )

  if (section === 'overview') return (
    <div className="space-y-4 text-[13px]">
      <BankMessagesBanner />
      {horizonBar}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0">
        <Card color="var(--danger)" label="Total debt"      value={fmtINR(totalDebt)}              sub={horizon && dToday ? `${deltaTxt(dToday.total, totalDebt)} · ${debtSub}` : debtSub} to="/loans"/>
        {/* Says which basis it uses, so "Net Worth −₹X" sitting under "Total Debt ₹Y" where
            Y > the debt implied by X reads as deliberate rather than as a discrepancy. */}
        <Card color={netWorth>=0?'var(--success)':'var(--danger)'} label="Net worth"       value={(netWorth>=0?'+':'−')+fmtINR(Math.abs(netWorth))} sub={`${horizon && netWorthToday != null ? deltaTxt(netWorthToday, netWorth) + ' · ' : ''}assets ${fmtINR(totalAssetsValue)} · owed ${fmtINR(d.totalPrincipal)}`} title={`Net worth = assets ${fmtINR(totalAssetsValue)} − owed ${fmtINR(d.totalPrincipal)} ${horizon ? 'then' : 'today'} (principal only, excluding future interest)`} to="/dashboard"/>
        {/* The breakdown must cover every component of totalOutflow. It previously listed only
            EMIs and CC spends, leaving out expenses, insurance, savings, chit and SIP — so the
            parts shown added up to far less than the headline figure. */}
        <Card color="var(--warning)" label="Monthly outflow" value={fmtINR(totalOutflow)}
          /* The tier split and the itemisation both come from the shared calculator, so this line
             is character-for-character the same on Dashboard, Budget, Calendar and Lookup. Each
             page used to build its own and the groupings had drifted: this page's "EMIs" excluded
             chit repayment while Budget's included it, so the same data produced ₹1,31,101 here
             and ₹1,56,101 there under an identical label. */
          /* Trimmed to the tier split. The ten-component itemisation was a wall of text in a
             summary card, and the "Debt & Monthly Commitments" section directly below already
             breaks the same figure out row by row. */
          sub={horizon && oToday ? `${deltaTxt(oToday.total ?? 0, o.total ?? totalOutflow)} · ${outflowTierLine(o)}` : outflowTierLine(o)}
          to="/lookup"/>
        <Card color={freeCash>=0?'var(--success)':'var(--danger)'} label="Free / month" value={(freeCash>=0?'+':'−')+fmtINR(Math.abs(freeCash))} suffix={incomePct(freeCash, monthlyIncome)} title={`Free = income ${fmtINR(monthlyIncome)} − committed ${fmtINR(o.locked)} (EMIs, bills, insurance, savings, SIPs). Card bills are not taken off — Left this month on Lookup includes them. Committed = ${fmtINR(o.locked)} of ${fmtINR(monthlyIncome)} income.${friendsEmiMo>0 ? ` Friends' EMIs (${fmtINR(friendsEmiMo)}/mo) are left out — they repay you.` : ''} The % is the share of income already committed; what's left over is not yet assigned to anything (it is not counted as savings — your savings and SIPs are already inside the committed part).`} sub={`before card bills · left this month ${leftThisMonth>=0?'+':'−'}${fmtINR(leftThisMonth)}`} to="/budget"/>
      </div>
      {(totalDebt > 0 || monthlyIncome > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 [&>*]:min-w-0">
          <div className="lg:col-span-3">
            <DebtTrend raw={{ loans: loansRaw as any[], cards: cardsRaw as any[], personal: personalRaw as any[], savings: savingsRaw as any[], investments: investmentsRaw as any[], expenses: expensesRaw as any[], insurance: insuranceRaw as any[] }}
              opts={{ typicalSpend, noDeposits }} horizon={horizon} onPick={setHorizon} maxMonths={maxPendingToday} />
          </div>
          <div className="lg:col-span-2 [&>*]:h-full">
            {(() => {
              const emis = o.loanEmi + o.ccEmi + o.iOweEmi + o.chitRepay
              const rest = Math.max(0, totalOutflow - (emis + o.expenses + o.insuranceEmi + o.savings + o.sipInvest + o.card))
              return <IncomeSplit fill income={monthlyIncome} horizonText={horizon ? horizonLabel(horizon) : undefined} parts={[
                { label: 'EMIs', value: emis, color: 'var(--danger)' },
                { label: 'Bills', value: o.expenses, color: 'var(--info)' },
                { label: 'Insurance', value: o.insuranceEmi, color: 'var(--pink)' },
                { label: 'Savings & SIPs', value: o.savings + o.sipInvest, color: 'var(--purple)' },
                { label: 'Card bill', value: o.card, color: 'var(--warning)' },
                { label: 'Set-asides', value: rest, color: '#94a3b8' },
              ]} />
            })()}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Retitled: recurring bills belong in the monthly picture but are not debt, and their
            absence here made the page look like it was ignoring ₹{totalExpenses} of outflow.
            The monthly badge now includes them so it reconciles with the rows listed. */}
        <SectionCard title="💳 Debt & monthly commitments" total={fmtINR(totalDebt)} monthly={fmtINR(debtSideMonthly)+"/mo incl. card bill"} color="var(--danger)" delta={change(totalDebt, dToday?.total, false)}>
          <Row icon={ICON.loan} label="Active loans"    value={fmtINR(d.loanTotal)} delta={change(d.loanTotal, dToday?.loanTotal, false)}
               sub={`${fmtINR(totalLoanEmi)}/mo · ${activeLoanList.length} loans · ${fmtINR(d.loanPrincipal)} principal + ${fmtINR(d.interestLeft)} interest`}
               color="var(--danger)" to="/loans"/>
          {/* This row used to read "₹47,378/mo" — the EMI added to the current cycle's spends. That
              mixes a recurring commitment with a one-month balance, and it never showed the
              statement outstanding at all. Now: the total owed on cards is the figure, the EMI is
              the recurring part, and outstanding + spends is called out as this month's balance. */}
          <Row icon={ICON.card} label="Credit cards"
               value={fmtINR(d.ccEmiPrincipal + d.ccOutstanding + d.ccSpends)}
               delta={change(d.ccEmiPrincipal + d.ccOutstanding + d.ccSpends, dToday && dToday.ccEmiPrincipal + dToday.ccOutstanding + dToday.ccSpends, false)}
               sub={`${fmtINR(totalCCEmi)}/mo${activeCCEmiCount>0?` · ${activeCCEmiCount} EMI${activeCCEmiCount===1?'':'s'}`:''} · ${fmtINR(d.ccOutstanding + d.ccSpends)} due this month (${fmtINR(d.ccOutstanding)} outstanding + ${fmtINR(d.ccSpends)} spends)`}
               color="var(--warning)" to="/cards"/>
          <Row icon={ICON.iowe} label="I Owe"           value={fmtINR(d.iOwePrincipal)} delta={change(d.iOwePrincipal, dToday?.iOwePrincipal, false)}
               sub={`${fmtINR(iOweEmi)}/mo${(personal as any[]).some((x:any)=>ioweFacts(x).mode==='interest-only') ? ' · interest only — principal not reducing' : ' principal'}`}
               color="var(--orange)" to="/personal"/>
          <Row icon={ICON.chitRepay} label="Chit repayment"  value={fmtINR(d.chitRepayLeft)} delta={change(d.chitRepayLeft, dToday?.chitRepayLeft, false)}
               sub={`${fmtINR(chitRepayEmi)}/mo${chitRepayCount>0?` · ${chitRepayCount} chit${chitRepayCount===1?'':'s'}`:''} · payout already taken`} color="var(--purple)" to="/savings"/>
          <Row icon={ICON.bill} label="Bills / expenses" value={fmtINR(totalExpenses)+'/mo'} delta={change(totalExpenses, oToday?.expenses, false)} sub="recurring, not debt" color="var(--info)" to="/expenses"/>
          <div className="pt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px]" style={{color:'var(--text-faint)'}}>
            <span>DTI {dti}%</span>
            <HeadsUp issues={health} owed={owedToYou} asOfThen={horizon > 0} onGo={navigate} />
            <span onClick={nav('/payoff')} className="cursor-pointer ml-auto" style={{color:'var(--purple)'}}>Payoff plan →</span>
          </div>
        </SectionCard>
        <SectionCard title="💰 Assets & income" total={fmtINR(savingsCorpus+currentVal)} monthly={fmtINR(assetSideMonthly)+"/mo committed"} color="var(--success)" delta={change(savingsCorpus+currentVal, corpusToday != null && investToday ? corpusToday + investToday.value : null, true)} note="Total = savings + investments. Owned assets and People Owe Me are shown for reference only.">
          <Row icon={ICON.savings} label="Savings / Chit"  value={fmtINR(savingsCorpus)} delta={change(savingsCorpus, corpusToday, true)} sub={fmtINR(savingsEmi)+'/mo'+(chitNote ? ' · '+chitNote : '')} color="var(--success)" to="/savings"/>
          <Row icon={ICON.investment} label="Investments"     value={fmtINR(currentVal)} delta={change(currentVal, investToday?.value, true)} sub={`${fmtINR(investedAmt)} invested · P&L ${fmtINR(currentVal-investedAmt)}`} color="var(--info)" to="/investments"/>
          <Row icon={ICON.income} label="Monthly income"  value={fmtINR(monthlyIncome)} sub="active sources" color="var(--purple)" to="/income"/>
          <Row icon={ICON.insurance} label="Insurance"       value={fmtINR(insMo)+'/mo'} delta={change(insMo, oToday?.insuranceEmi, false)} sub={`${fmtINR(insAnnual)} annual lump-sum`} color="var(--pink)" to="/insurance"/>
          <Row icon={ICON.oweMe} label="People owe me"   value={fmtINR(peopleOweMeTotal)} sub={`${peopleOweMeCount} pending · what people owe you${horizon ? ' — assumed unchanged' : ''}`} color="var(--success)" to="/people-owe"/>
        </SectionCard>
      </div>
      {/* Quick links: icon beside the label with a one-line description, matching the
          History tab's tiles. The stacked icon-over-label version gave two ragged lines
          of text per tile and no indication of what each page actually does. */}
      <div>
        <div className="text-[12px] font-medium mb-2.5" style={{color:'var(--text-muted)'}}>More tools</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 [&>*]:min-w-0">
          {[
            {icon:ICON.payoff,label:'Payoff plan',    sub:'Snowball simulator',       to:'/payoff',        color:'var(--purple)'},
            {icon:ICON.history,label:'History',        sub:'Track debt over time',     to:'/history',       color:'var(--purple)'},
            {icon:ICON.breakSavings,label:'Break savings?', sub:'Worth cashing out?',       to:'/break-savings', color:'var(--purple)'},
          ].map(q=>(
            <div key={q.label} onClick={nav(q.to)}
              className="group card-link rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{background:'var(--bg-card)',border:'1px solid var(--hairline)'}}>
              <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-lg flex-shrink-0" style={{background:`color-mix(in srgb, ${q.color} 12%, transparent)`, color: q.color}}><Glyph icon={q.icon} size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold leading-tight truncate" style={{color:'var(--text)'}}>{q.label}</div>
                <div className="text-[11px] leading-snug truncate" style={{color:'var(--text-faint)'}}>{q.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────
  // DEBT
  // ─────────────────────────────────────────────
  if (section === 'debt') return (
    <div className="space-y-4">
      {horizonBar}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0">
        {/* These parts must come from the same source as the total. `totalLoans` is loanToClear —
            principal PLUS all remaining interest — so inside a principal-only total the breakdown
            overshot by exactly the interest: ₹14,08,051 listed for loans where the total was built
            from ₹11,76,756. The parts now sum to the total exactly. */}
        <Card color="var(--danger)" label="Total debt"     value={fmtINR(totalDebt)}
              sub={[`loans ${fmtINR(d.loanTotal)}${d.interestLeft>0?` incl. ${fmtINR(d.interestLeft)} interest`:''}`, d.ccTotal>0?`cards ${fmtINR(d.ccTotal)}`:null, d.iOwePrincipal>0?`I Owe ${fmtINR(d.iOwePrincipal)}`:null, d.chitRepayLeft>0?`chit ${fmtINR(d.chitRepayLeft)}`:null].filter(Boolean).join(' · ')} to="/loans"/>
        <Card color="var(--warning)" label="Monthly EMIs"   value={fmtINR(totalLoanEmi+totalCCEmi+iOweEmi+chitRepayEmi)} sub={[`loans ${fmtINR(totalLoanEmi)}`, totalCCEmi>0?`cards ${fmtINR(totalCCEmi)}`:null, iOweEmi>0?`I Owe ${fmtINR(iOweEmi)}`:null, chitRepayEmi>0?`chit ${fmtINR(chitRepayEmi)}`:null].filter(Boolean).join(' · ')} title="EMIs only: card spends and bills are not included" to="/lookup"/>
        <Card color="var(--pink)" label="CC Spends"      value={fmtINR(totalCCSpends)}        sub="clear before billing date"  to="/cards"/>
        <Card color="var(--purple)" label="Debt free"      value={maxPending>0?debtFreeDate:'Debt free!'} sub={maxPending>0?`${maxPending} months away`:'no active loans'} to="/payoff"/>
      </div>
      {/* Defaults to 4-across, matching the metric-tile row above. Each card below holds a small
          list of real rows (lender names, "₹47,378 to clear · 8 left · 12.5% p.a." style sub-text)
          though, denser than a flat metric tile — a quarter-width column can wrap that awkwardly on
          a smaller screen. "Detailed" switches to 2x2 so each card gets roughly double the room. */}
      <DebtLayoutToggle wide={debtWide} setWide={setDebtWide} />
      <div className={`grid ${debtWide ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'} gap-3 items-start`}>
        <SectionCard dense title="🏦 Loans" total={fmtINR(totalLoans)} monthly={fmtINR(totalLoanEmi)+"/mo"} color="var(--danger)">
          {activeLoanList.slice(0,5).map((l:any)=>{
            const eff = getEff(l)
            const t = l.tenure ?? (eff.paid + eff.pending)
            const rate = l.amount > 0 && l.emi > 0 && t > 0 ? calcLoanRate(Number(l.amount), Number(l.emi), t) : Number(l.interestRate ?? 0)
            return <Row key={l.id} label={l.lender} value={fmtINR(l.emi)+'/mo'} sub={`${fmtINR(loanToClear(l))} to clear · ${eff.pending} left · ${rate>0 && isFinite(rate)?rate.toFixed(1)+'% p.a.':'rate N/A'}`} color="var(--danger)" to="/loans"/>
          })}
          <Row label={moreLabel(activeLoanList.length,5,'View all loans →')} value="" color="var(--danger)" to="/loans"/>
        </SectionCard>
        <SectionCard dense title="💳 Cards + I Owe" total={fmtINR(totalCCPrincipal+iOweTotal)} monthly={fmtINR(totalCCEmi+o.card+iOweEmi)+"/mo incl. card bill"} color="var(--warning)">
          {activeCardList.slice(0,4).map((c:any)=>(
            <Row key={c.id} label={c.banker||c.cardName} value={fmtINR(cardBalance(c))}
              sub={`Due ${fmtINR(Number(c.outstanding??0))} · EMI bal ${fmtINR(cardEmiBal(c))} (${fmtINR(cardEmiMo(c))}/mo) · Spends ${fmtINR(cardSpends(c))}`}
              color="var(--warning)" to="/cards"/>
          ))}
          {(personal as any[]).map((p:any)=>{
            const isLump = !Number(p.emi??0)
            // Was raw `p.amount` for the "total" sub-label — overstated what's left on an
            // amortising entry already partly repaid, and understated nothing on an interest-only
            // one (whose principal never reduces) but for the wrong reason. `principalLeft` is the
            // same figure `iOweTotal`/`calcDebt` use, so this row's own total can't drift from the
            // section total it sits inside of.
            return <Row key={p.id} label={`I Owe: ${p.person}`}
              value={isLump?fmtINR(p.amount):fmtINR(p.emi)+'/mo'}
              sub={isLump?'lump sum'+(p.paybackDate?` · due ${new Date(p.paybackDate).toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}`:''):fmtINR(ioweFacts(p).principalLeft)+' left'}
              color="var(--orange)" to="/personal"/>
          })}
          <Row label={moreLabel(activeCardList.length,4,'View all →')} value="" color="var(--warning)" to="/cards"/>
        </SectionCard>
        {/* Was missing entirely: Total Debt and Monthly EMIs above both fold chit repayment in
            (see chitRepayEmi/d.chitRepayLeft, and the matching "Chit Repayment" row already on the
            Overview tab), but this three-column breakdown never listed it anywhere — so the columns
            didn't add up to the headline Total Debt, and there was no way to see which chit(s) were
            behind that ₹ figure without leaving the page. A chit here means one whose payout has
            already been taken (mode='withdrew' or prizeTaken) and still has instalments left — the
            same filter chitRepayLeft/chitRepayEmi use, so this card can't drift from the tiles above. */}
        <SectionCard dense title="🔄 Chit repayment" total={fmtINR(d.chitRepayLeft)} monthly={fmtINR(chitRepayEmi)+"/mo"} color="var(--purple)">
          {(savings as any[]).filter((v:any)=>(v.mode==='withdrew'||v.prizeTaken)&&getEff(v).pending>0).map((v:any)=>{
            const eff = getEff(v)
            return <Row key={v.id} label={v.name} value={fmtINR(v.monthly)+'/mo'}
              sub={`${fmtINR(eff.pending*Number(v.monthly??0))} left · ${eff.pending} instalments · payout already taken`}
              color="var(--purple)" to="/savings"/>
          })}
          {chitRepayEmi === 0 && <div className="text-[11px] py-2" style={{color:'var(--text-faint)'}}>No chit currently being repaid</div>}
        </SectionCard>
        <SectionCard dense title="📊 Expenses" total={fmtINR(totalExpenses)} monthly={fmtINR(totalExpenses)+"/mo"} color="var(--info)">
          {activeExpenseList.slice(0,6).map((v:any)=>(
            <Row key={v.id} label={v.label} value={fmtINR(v.amount)} sub={v.category} color="var(--info)" to="/expenses"/>
          ))}
          <Row label={moreLabel(activeExpenseList.length,6,'Manage expenses →')} value="" color="var(--info)" to="/expenses"/>
        </SectionCard>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────
  // SAVINGS & INCOME
  // ─────────────────────────────────────────────
  if (section === 'savings') return (
    <div className="space-y-4">
      {horizonBar}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0">
        <Card color="var(--success)" label="Savings corpus"   value={fmtINR(savingsCorpus)}    sub={fmtINR(savingsEmi)+'/mo building'}  to="/savings"/>
        <Card color="var(--info)" label="Investments"      value={fmtINR(currentVal)}       sub={`P&L ${fmtINR(currentVal-investedAmt)}`} to="/investments"/>
        <Card color="var(--purple)" label="Monthly income"   value={fmtINR(monthlyIncome)}    sub="active income sources"               to="/income"/>
        <Card color="var(--success)" label="People owe me"    value={fmtINR(peopleOweMeTotal)} sub={`${peopleOweMeCount} pending`}       to="/people-owe"/>
      </div>
      <DebtLayoutToggle wide={debtWide} setWide={setDebtWide} />
      <div className={`grid ${debtWide ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'} gap-3 items-start`}>
        <SectionCard dense title="🏦 Savings / chit funds" total={fmtINR(savingsCorpus)} monthly={fmtINR(savingsEmi)+"/mo"} color="var(--success)" note="corpus estimated from monthly contribution × months paid when not tracked directly">
          {(savings as any[]).slice(0,5).map((v:any)=>{
            // Same NaN hole as above: `v.monthly*paid` is NaN when monthly is unset, and the
            // trailing `?? 0` cannot catch NaN.
            const rawCorpus = v.currentCorpus != null ? Number(v.currentCorpus) : Number(v.monthly ?? 0) * getEff(v).paid
            const corpus = Number.isFinite(rawCorpus) ? rawCorpus : 0
            // A chit/saving with a tenure shows where it stands: finished (no more instalments, so no "/mo" any more) or
            // about to finish. In a Look-ahead view this reads as of that month.
            const left = v.tenure ? getEff(v).pending : null
            const closed = left === 0
            const closing = left != null && left > 0 && left <= 3
            return <Row key={v.id} label={v.name}
              value={closed ? '✓ Closed' : fmtINR(v.monthly)+'/mo'}
              sub={`${v.savingType||'Saving'} · ${fmtINR(corpus)} ${closed ? 'final corpus' : 'corpus'}${closing ? ` · closes in ${left} mo` : ''}${closed ? ` · all ${v.tenure} instalments done` : ''}`}
              color={closed ? 'var(--text-faint)' : v.mode==='withdrew'?'var(--orange)':'var(--success)'} to="/savings"/>
          })}
          <Row label={moreLabel((savings as any[]).length,5,'Manage savings →')} value="" color="var(--success)" to="/savings"/>
        </SectionCard>
        <SectionCard dense title="📈 Investments" total={fmtINR(currentVal)} monthly={fmtINR(sipEmi)+"/mo SIP"} color="var(--info)">
          {(investments as any[]).slice(0,5).map((v:any)=>(
            <Row key={v.id} label={v.name} value={fmtINR(investValue(v))} sub={`${v.investType||'Other'} · ${fmtINR(v.monthly??0)}/mo SIP`} color="var(--info)" to="/investments"/>
          ))}
          <Row label={moreLabel((investments as any[]).length,5,'Manage investments →')} value="" color="var(--info)" to="/investments"/>
        </SectionCard>
        <SectionCard dense title="💰 Income" total={fmtINR(monthlyIncome)} monthly={fmtINR(monthlyIncome)+"/mo"} color="var(--purple)">
          {(income as any[]).filter((v:any)=>v.active!==false).slice(0,5).map((v:any)=>(
            <Row key={v.id} label={v.label||v.source} value={fmtINR(v.amount)} sub={v.frequency||'Monthly'} color="var(--purple)" to="/income"/>
          ))}
          <Row label={moreLabel((income as any[]).filter((v:any)=>v.active!==false).length,5,'Add income source →')} value="" color="var(--purple)" to="/income"/>
        </SectionCard>
        <SectionCard dense title="🛡️ Insurance" total={fmtINR(insMo)+"/mo"} monthly={fmtINR(insAnnual)+" annual"} color="var(--pink)">
          {(insurance as any[]).filter((v:any)=>v.active!==false).slice(0,5).map((v:any)=>(
            <Row key={v.id} label={v.name} value={fmtINR(v.premium)} sub={`${v.frequency||'Yearly'}${v.policyType?` · ${v.policyType}`:''}`} color="var(--pink)" to="/insurance"/>
          ))}
          <Row label={moreLabel((insurance as any[]).filter((v:any)=>v.active!==false).length,5,'Manage insurance →')} value="" color="var(--pink)" to="/insurance"/>
        </SectionCard>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────
  // HISTORY & TOOLS
  // ─────────────────────────────────────────────
  if (section === 'history') {
    // Every figure on this tab was previously a hardcoded literal (₹64,62,129 lifetime
    // earnings, ₹24,91,589 closed assets, "25 months", "1 worthy"), so it never moved
    // with the data. All of it is derived from the API now.
    // Same maths as EarningsPage: months between fromDate and toDate (or today) × monthlyAmount.
    // An earlier version guessed at `monthlySalary`/`months`, which do not exist on the record,
    // so every period multiplied out to zero.
    const monthsBetween = (from?: string, to?: string) => {
      if (!from) return 0
      const start = new Date(from), end = to ? new Date(to) : new Date()
      return Math.max(0, (end.getFullYear()-start.getFullYear())*12 + (end.getMonth()-start.getMonth()) + 1)
    }
    const lifetimeEarnings = (earnings as any[]).reduce((s:number,e:any)=>
      s + monthsBetween(e.fromDate, e.toDate || undefined) * Number(e.monthlyAmount ?? 0), 0)
    const closedCount   = (closedLoans as any[]).length
    const closedValue   = (closedLoans as any[]).reduce((s:number,c:any)=>s+Number(c.totalPaid??0),0)
    const closedPnL     = (closedLoans as any[]).reduce((s:number,c:any)=>s+(Number(c.recoveredAmount??0)-Number(c.totalPaid??0)),0)
    // Mirrors BreakSavingsPage: a chit is worth breaking when the interest saved by clearing
    // debt beats what the remaining instalments cost.
    const breakWorthy = (savings as any[]).filter((v:any)=>{
      const e = getEff(v)
      if (e.pending <= 0) return false
      const paidIn = Number(v.currentCorpus ?? Number(v.monthly??0)*e.paid)
      const remaining = e.pending * Number(v.monthly??0)
      return paidIn - remaining > 10000
    }).length

    return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0">
        <Card color="var(--success)" label="Lifetime earnings" value={fmtINR(lifetimeEarnings)} sub={`${(earnings as any[]).length} salary periods`} to="/earnings"/>
        <Card color="var(--warning)" label="Closed assets"     value={fmtINR(closedValue)} sub={`${closedCount} entries · P&L ${closedPnL>=0?'+':'−'}${fmtINR(Math.abs(closedPnL))}`} to="/closed-assets"/>
        <Card color="var(--purple)" label="Debt free in"      value={maxPending>0?`${maxPending} months`:'Debt free!'} sub={maxPending>0?`${debtFreeDate} at current pace`:'no active debt'} to="/payoff"/>
        <Card color="var(--pink)" label="Break Savings?"    value={`${breakWorthy} worthy`} sub={breakWorthy>0?'could save interest':'none worth breaking'} to="/break-savings"/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {icon:ICON.history,label:'Monthly history',    sub:'Track debt month-by-month',      color:'var(--cyan)',  to:'/history'},
          {icon:ICON.payoff,label:'Payoff simulator',   sub:maxPending>0?`${maxPending}mo to debt freedom`:'No active debt', color:'var(--purple)',  to:'/payoff'},
          {icon:ICON.earnings,label:'Earnings history',   sub:`${fmtINR(lifetimeEarnings)} lifetime`, color:'var(--success)',  to:'/earnings'},
          {icon:ICON.closed,label:'Closed assets',      sub:`${closedCount} entries · full P&L`, color:'var(--warning)',  to:'/closed-assets'},
          {icon:ICON.breakSavings,label:'Break savings?',     sub:breakWorthy>0?`${breakWorthy} saving${breakWorthy>1?'s':''} worth breaking`:'None worth breaking', color:'var(--pink)',  to:'/break-savings'},
          {icon:ICON.export,label:'Export data',        sub:'Download CSV',                   color:'var(--info)',  to:'/export'},
          {icon:ICON.admin,label:'Admin panel',        sub:'User comparison',                color:'var(--danger)',  to:'/admin'},
          {icon:ICON.lookup,label:'Quick lookup',       sub:'All payments this month',        color:'var(--warning)',  to:'/lookup'},
          {icon:ICON.calendar,label:'Payment calendar',   sub:'Month-by-month forecast',        color:'var(--cyan)',  to:'/calendar'},
        ].map(q=>(
          <div key={q.label} onClick={nav(q.to)} className="rounded-xl p-3.5 cursor-pointer hover:opacity-90 transition-all flex items-center gap-3"
            style={{background:`color-mix(in srgb, ${q.color} 6%, transparent)`,border:`1px solid color-mix(in srgb, ${q.color} 13%, transparent)`}}>
            <span className="w-10 h-10 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in srgb, ${q.color} 12%, transparent)`, color: q.color }}><Glyph icon={q.icon} size={20} /></span>
            <div>
              <div className="text-[13px] font-semibold" style={{color:q.color}}>{q.label}</div>
              <div className="text-[10px]" style={{color:'var(--text-faint)'}}>{q.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    )
  }

  return null
}
