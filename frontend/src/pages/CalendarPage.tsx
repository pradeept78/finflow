import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi, insuranceApi, expensesApi, incomeApi, paidMarksApi } from '../api'
import { calcOutflow, outflowTierLine } from '../utils/calcOutflow'
import { ioweFacts } from '../utils/iowe'
import { KindStrip } from '../components/common/KindStrip'
import { calendarKind, isChitRepaying } from '../utils/kinds'
import { buildDueRows } from '../utils/dueRows'
import { fmtINR, getEff, freqMonths, monthlyIncomeTotal, resolveDueDay, isPaidThisMonth, toMonthly, isOneOff, isDueInMonth } from '../utils/format'
import toast from 'react-hot-toast'
import { LoadingSpinner, PageHeader, ErrorState } from '../components/common'

// Request browser notification permission
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

function scheduleNotification(title: string, body: string, delayMs: number) {
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  }, delayMs)
}

// setTimeout silently misbehaves (fires immediately) past ~24.8 days — cap what we'll schedule.
const MAX_TIMEOUT_MS = 2_000_000_000


export default function CalendarPage() {
  const { data: loans = [], isLoading: l1, isError: e1 } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: cards = [], isLoading: l2, isError: e2 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: personal = [], isLoading: l3, isError: e3 } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: savings = [], isLoading: l4, isError: e4 } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: investments = [], isLoading: l5, isError: e5 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const { data: insurance = [], isLoading: l6, isError: e6 } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const { data: expenses = [], isLoading: l7, isError: e7 } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll })
  const { data: income = [], isLoading: l8, isError: e8, refetch: refetchIncome } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const qc = useQueryClient()
  const { data: markedKeys = [] } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  const toggleMut = useMutation({ mutationFn: paidMarksApi.toggle, onSuccess: () => qc.invalidateQueries({ queryKey: ['paid-marks'] }) })
  const toggle = (key: string) => toggleMut.mutate(key)
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null)
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set())

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8
  const isError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8

  const now = new Date()
  // Months 1-11 use this monthly-equivalent total in `regularOut` below (month 0 comes from the
  // shared calculator instead — see the comment further down). Was summing every active expense's
  // raw amount with no frequency conversion — a Yearly ₹1,20,000 fee counted as ₹1,20,000/mo in
  // every one of the 11 projected months instead of its true ~₹10,000/mo share, so only month 0
  // (which already went through the shared calculator) was ever correct.
  // Monthly bills only. A quarterly / yearly bill lands at its full amount in its renewal month (billsDue in the
  // loop below), the same rule insurance follows and calcOutflow's dueNow uses for this month — spreading it as a
  // monthly share here made future months disagree with month 0.
  const baseExpenses = (expenses as any[]).filter(v => v.active !== false && !isOneOff(v.frequency) && freqMonths(v.frequency) <= 1).reduce((s, v) => s + Number(v.amount ?? 0), 0)

  interface DueItem { label: string; type: string; amount: number; dueDay?: number; color: string; isLast?: boolean; isOverdue?: boolean; key?: string }

  // Pre-calculate CC spends (current billing cycle) - used for month 0
  const currentCCSpends = (cards as any[]).reduce((s: number, card: any) =>
    s + (card.spends ?? []).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0), 0)

  // Single source of truth for the current month.

  // Income normalised to a monthly figure through the shared frequency map, so a quarterly or
  // yearly income source is not counted at face value, and one-off income doesn't inflate it.
  const monthlyIncome = monthlyIncomeTotal(income as any[])
  const shared = calcOutflow(loans as any[], cards as any[], personal as any[], savings as any[],

                             investments as any[], expenses as any[], insurance as any[])


  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const ym = d.getFullYear() * 12 + d.getMonth()
    const isCurrentMonth = i === 0
    let loanEmi = 0, ccEmi = 0, ccSpends = 0, ccOutstanding = 0, savEmi = 0, repayEmi = 0, persEmi = 0, lumpSum = 0, oneTime = 0, insEmi = 0, sipEmi = 0, billsDue = 0
    const dueItems: DueItem[] = []
    const ending: Array<{ label: string; type: string; amount: number }> = []
    const warnings: string[] = []
    // Rows that are real but deliberately outside every total (friend-owed EMIs, insurance already paid as a
    // Card EMI) — current month only, shown in a collapsed note so the main list and count stay in step with Master.
    const notCounted: Array<{ label: string; type: string; amount: number; dueDay?: number; why: string }> = []

    // Loans
    loans.forEach(l => {
      if (!l.startDate || !l.tenure) return
      const sd = new Date(l.startDate)
      const sYM = sd.getFullYear() * 12 + sd.getMonth()
      const lYM = sYM + l.tenure - 1
      if (ym >= sYM && ym <= lYM) {
        loanEmi += l.emi ?? 0
        const isLast = ym === lYM
        const isOverdue = isCurrentMonth && l.dueDay && l.dueDay < now.getDate()
        dueItems.push({ label: l.lender, type: 'Loan', amount: l.emi ?? 0, dueDay: resolveDueDay(l), color: 'bg-blue-500', isLast, isOverdue, key: `loan-${l.id}` })
        if (isLast) ending.push({ label: l.lender, type: 'Loan', amount: l.emi ?? 0 })
      }
    })

    // CC EMIs
    cards.forEach(c => {
      ;(c.emis ?? []).forEach((e: any) => {
        if (!e.startDate || !e.tenure) return
        // Carried for a friend and not yet paid back: not the user's own commitment. Every total
        // (calcOutflow, Master, Hub) already leaves it out; listing it here made the count disagree.
        const sd = new Date(e.startDate)
        const sYM = sd.getFullYear() * 12 + sd.getMonth()
        const lYM = sYM + e.tenure - 1
        if (e.owedBy && !e.owedSettled) {
          if (i === 0 && ym >= sYM && ym <= lYM) notCounted.push({ label: `${c.banker} — ${e.label}`, type: 'CC EMI', amount: e.emi ?? 0, dueDay: resolveDueDay(c), why: `carried for ${e.owedBy}` })
          return
        }
        if (ym >= sYM && ym <= lYM) {
          ccEmi += e.emi ?? 0
          const isLast = ym === lYM
          dueItems.push({ label: `${c.banker} — ${e.label}`, type: 'CC EMI', amount: e.emi ?? 0, dueDay: resolveDueDay(c), color: 'bg-purple-500', isLast, key: `card-${c.id}` })
          if (isLast) ending.push({ label: `${c.banker} — ${e.label}`, type: 'CC EMI', amount: e.emi ?? 0 })
        }
      })

      // CC Outstanding — current month
      if (i === 0) {
        ccOutstanding += Number(c.outstanding ?? 0)
        if (Number(c.outstanding ?? 0) > 0) {
          dueItems.push({ label: `${c.banker} Outstanding`, type: 'CC Outstanding', amount: Number(c.outstanding), dueDay: resolveDueDay(c), color: 'bg-red-500', isOverdue: (resolveDueDay(c) ?? 0) > 0 && (resolveDueDay(c) ?? 0) < now.getDate(), key: `card-out-${c.id}` })
        }
        /* Unbilled spends were counted into the month total but never listed as a payment, so a card
           whose only balance is this cycle's spends had NO row at all — ₹9,500 of real money due,
           invisible on the calendar while Lookup showed it. That was one of the two reasons the two
           pages' counts differed. */
        const cycleSpends = (c.spends ?? []).filter((sp: any) => !(sp.owedBy && !sp.owedSettled)).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
        if (cycleSpends > 0) {
          dueItems.push({ label: `${c.banker} Spends`, type: 'CC Spends', amount: cycleSpends, dueDay: resolveDueDay(c), color: 'bg-pink-500', isOverdue: (resolveDueDay(c) ?? 0) > 0 && (resolveDueDay(c) ?? 0) < now.getDate(), key: `card-spend-${c.id}` })
        }
      }

    })

    // Savings / Chit
    savings.forEach((v: any) => {
      const t = v.tenure ?? 0
      if (!t || !v.startDate) return
      const sd = new Date(v.startDate)
      const sYM = sd.getFullYear() * 12 + sd.getMonth()
      const lYM = sYM + t - 1 - (v.doublePayments ?? 0)
      if (ym >= sYM && ym <= lYM) {
        if (isChitRepaying(v)) { repayEmi += Number(v.monthly ?? 0) } else { savEmi += Number(v.monthly ?? 0) }
        const isLast = ym === lYM
        dueItems.push({ label: v.name, type: isChitRepaying(v) ? 'Chit Repaying' : v.savingType === 'Chit' ? 'Chit' : 'Savings', amount: Number(v.monthly ?? 0), dueDay: resolveDueDay(v), color: isChitRepaying(v) ? 'bg-red-500' : 'bg-green-500', isLast, key: `sav-${v.id}` })
        if (isLast) ending.push({ label: v.name, type: 'Chit/Savings Matures', amount: Number(v.monthly ?? 0) })
      }
    })

    // I Owe
    ;(personal as any[]).forEach(p => {
      // Settled / switched-off entries aren't payments (calcOutflow and Master skip them too).
      if ((p.emi ?? 0) > 0 && p.active !== false) {
        // Was `!p.tenure` — an interest-only entry that happens to have a `tenure` value set (not
        // meant as a real amortisation schedule) was wrongly treated as ending after `tenure`
        // months, triggering a "closes → frees Xmo" projection for a debt whose principal never
        // actually reduces. `ioweFacts` is the shared classifier; any entry with emi>0 that isn't
        // 'amortising' has no real end month regardless of what `tenure` happens to hold.
        const isOpen = ioweFacts(p).mode !== 'amortising'
        if (isOpen) {
          persEmi += p.emi ?? 0
          dueItems.push({ label: p.person, type: 'I Owe', amount: p.emi ?? 0, dueDay: resolveDueDay(p), color: 'bg-yellow-500', key: `personal-${p.id}` })
        } else {
          const t = p.tenure ?? 0
          if (!p.startDate) return
          const sd = new Date(p.startDate)
          const sYM = sd.getFullYear() * 12 + sd.getMonth()
          const lYM = sYM + t - 1
          if (ym >= sYM && ym <= lYM) {
            persEmi += p.emi ?? 0
            const isLast = ym === lYM
            dueItems.push({ label: p.person, type: 'I Owe', amount: p.emi ?? 0, dueDay: resolveDueDay(p), color: 'bg-yellow-500', isLast })
            if (isLast) ending.push({ label: p.person, type: 'I Owe', amount: p.emi ?? 0 })
          }
        }
      }
      if (p.paybackDate && (p.amount ?? 0) > 0) {
        const pd = new Date(p.paybackDate)
        if (!isNaN(pd.getTime()) && pd.getFullYear() * 12 + pd.getMonth() === ym) {
          lumpSum += Number(p.amount ?? 0)
          const isOverdue = isCurrentMonth && pd < now
          dueItems.push({ label: `${p.person} lump sum`, type: 'Lump Sum', amount: Number(p.amount ?? 0), color: 'bg-orange-500', isOverdue })
          ending.push({ label: p.person, type: 'Lump Sum Due', amount: Number(p.amount ?? 0) })
          if (isOverdue) warnings.push(`${p.person} lump sum was due ${pd.toLocaleDateString('en-IN')}`)
        }
      }
    })

    // Insurance
    insurance.forEach((v: any) => {
      if (v.active === false) return
      // Already being paid as a Card EMI — its cost sits in that card's EMI row, so it is not
      // a second payment (Master shows it under "Not counted").
      if (v.isCardEmi) {
        if (i === 0 && !isOneOff(v.frequency)) notCounted.push({ label: v.insurer ?? v.name, type: 'Insurance', amount: toMonthly(v.premium, v.frequency), dueDay: resolveDueDay(v, 1), why: 'already a Card EMI' })
        return
      }
      // One-time ("Single") premiums aren't a recurring payment. freqMonths() has no entry for them, so
      // they fell back to "every 1 month" and the full premium was listed in every month's due list —
      // while Master and the shared totals (calcOutflow) skip them. Keep the list in step with both.
      if (isOneOff(v.frequency)) {
        // ...but it IS real money in the month it's paid. So: listed once, in its own start month, as a
        // "One-time" payment and added to that month's total only (never to committed/month, never to
        // later months). Same idea as the lump sum above, kept separate so the label can't be confused.
        const sd1 = v.startDate ? new Date(v.startDate) : null
        if (sd1 && !isNaN(sd1.getTime()) && sd1.getFullYear() * 12 + sd1.getMonth() === ym && Number(v.premium ?? 0) > 0) {
          oneTime += Number(v.premium ?? 0)
          dueItems.push({ label: `${v.insurer ?? v.name} (one-time premium)`, type: 'One-time', amount: Number(v.premium ?? 0), color: 'bg-pink-500', dueDay: resolveDueDay(v, 1), key: `ins-${v.id}` })
        }
        return
      }
      const mo = freqMonths(v.frequency ?? 'Yearly')
      const moEMI = Number(v.premium ?? 0) / mo
      // `ym` is year*12 + month, so it is ~24300 for 2026. The old "no end date" sentinel of
      // 9999 works out to year 833 — in the past — so every policy without an end date failed
      // the `ym <= eYM` test and insurance never appeared in the calendar or its totals.
      const NO_END = Number.MAX_SAFE_INTEGER
      // Monthly policies: always include regardless of start date
      if (freqMonths(v.frequency) <= 1) {
        const ped = v.paymentEndDate || v.endDate
        const eYM = ped ? new Date(ped).getFullYear() * 12 + new Date(ped).getMonth() : NO_END
        if (ym <= eYM) {
          insEmi += Number(v.premium ?? 0)
          dueItems.push({ label: v.insurer ?? v.name, type: 'Insurance', amount: Number(v.premium ?? 0), color: 'bg-pink-500', dueDay: resolveDueDay(v, 1), key: `ins-${v.id}` })
        }
        if (ym === eYM) ending.push({ label: v.insurer ?? v.name, type: 'Insurance Ends', amount: Number(v.premium ?? 0) })
        return
      }
      if (!v.startDate) return
      const sd = new Date(v.startDate)
      const sYM = sd.getFullYear() * 12 + sd.getMonth()
      const ped = v.paymentEndDate || v.endDate
      const eYM = ped ? new Date(ped).getFullYear() * 12 + new Date(ped).getMonth() : NO_END
      if (ym >= sYM && ym <= eYM) {
        // Non-monthly: only in payment months
        // Non-monthly premiums land only in their renewal month, at the full amount. Lookup used to
        // normalise them and list a fake monthly figure every month; it now uses the same rule.
        if ((ym - sYM) % mo === 0) {
          insEmi += Number(v.premium ?? 0) // full payment in due month
          dueItems.push({ label: v.insurer ?? v.name, type: 'Insurance', amount: Number(v.premium ?? 0), color: 'bg-pink-500', dueDay: resolveDueDay(v, 1), key: `ins-${v.id}` })
        }
        if (ym === eYM) ending.push({ label: v.insurer ?? v.name, type: 'Insurance Ends', amount: moEMI })
      }
    })

    // Investments
    investments.forEach((v: any) => {
      if (v.active === false) return // switched-off SIPs aren't charged (same filter as calcOutflow / Master)
      if (!v.monthly || !v.startDate) return
      const sd = new Date(v.startDate)
      const sYM = sd.getFullYear() * 12 + sd.getMonth()
      if (ym < sYM) return
      if (v.tenure) {
        const lYM = sYM + v.tenure - 1
        if (ym > lYM) return
        if (ym === lYM) ending.push({ label: v.name, type: 'SIP Matures', amount: v.monthly })
      }
      sipEmi += Number(v.monthly ?? 0)
      dueItems.push({ label: v.name, type: 'SIP', amount: Number(v.monthly ?? 0), color: 'bg-teal-500' })
    })

    // Recurring bills. These were previously folded into baseExpenses for the money total
    // but never given a row, so they counted towards the month's outflow while contributing
    // nothing to "N scheduled payments" — the count and the breakdown disagreed.
    //
    // The row-list itself then had its own bug: it pushed every active expense into every one of
    // the 12 months regardless of frequency, so a Yearly or Quarterly bill showed as "due" (at its
    // full amount, not even the monthly-equivalent baseExpenses uses) in months nothing is actually
    // owed — the same class of bug insurance's due-month gating above already fixes. `isDueInMonth`
    // only lets a non-monthly bill land in its actual renewal month, at its real full amount.
    ;(expenses as any[]).filter(v => v.active !== false && !isOneOff(v.frequency) && isDueInMonth(v.startDate, v.frequency, d.getFullYear(), d.getMonth())).forEach((v: any) => {
      if (freqMonths(v.frequency) > 1) billsDue += Number(v.amount ?? 0)
      dueItems.push({
        label: v.label, type: v.category ? `Bill · ${v.category}` : 'Bill',
        amount: Number(v.amount ?? 0), dueDay: resolveDueDay(v), color: 'bg-sky-500',
        isOverdue: !!v.dueDay && v.dueDay < now.getDate() && isCurrentMonth,
        key: `expense-${v.id}`,
      })
    })

    // One-time expenses: same rule as a one-time premium — once, in their own month, outside "committed".
    ;(expenses as any[]).filter(v => v.active !== false && isOneOff(v.frequency) && v.startDate).forEach((v: any) => {
      const sd1 = new Date(v.startDate)
      if (isNaN(sd1.getTime()) || sd1.getFullYear() * 12 + sd1.getMonth() !== ym || !(Number(v.amount ?? 0) > 0)) return
      oneTime += Number(v.amount ?? 0)
      dueItems.push({ label: `${v.label} (one-time)`, type: 'One-time', amount: Number(v.amount ?? 0), color: 'bg-sky-500', dueDay: resolveDueDay(v), key: `expense-${v.id}` })
    })

    /* Month 0 is THIS month: its payment list, "not counted" list, lump sum and one-time totals come from the
       shared builder (utils/dueRows) — the same one Quick Lookup uses — so the two pages cannot disagree on
       what is due. The per-month loop above only supplies the 11 projected months (and `ending`). */
    if (i === 0) {
      const due = buildDueRows({ loans, cards, personal, expenses, savings, investments, insurance } as any, now)
      const TYPE: Record<string, [string, string]> = {
        loan: ['Loan', 'bg-blue-500'], 'card-emi': ['CC EMI', 'bg-purple-500'], 'card-out': ['CC Outstanding', 'bg-red-500'], 'card-spend': ['CC Spends', 'bg-pink-500'],
        iowe: ['I Owe', 'bg-yellow-500'], 'iowe-lump': ['Lump Sum', 'bg-orange-500'], insurance: ['Insurance', 'bg-pink-500'], sip: ['SIP', 'bg-teal-500'],
        'chit-repay': ['Chit Repaying', 'bg-red-500'], savings: ['Savings', 'bg-green-500'], bill: ['Bill', 'bg-sky-500'], 'one-time': ['One-time', 'bg-pink-500'],
      }
      dueItems.length = 0
      due.rows.forEach(r => {
        const [type, color] = TYPE[r.kind] ?? ['Other', 'bg-gray-500']
        dueItems.push({
          label: r.kind === 'one-time' ? `${r.label} (one-time${r.sub.includes('premium') ? ' premium' : ''})` : r.label,
          type: r.kind === 'bill' && r.category ? `Bill · ${r.category}` : r.kind === 'savings' && r.ref?.savingType === 'Chit' ? 'Chit' : type,
          amount: r.amount, dueDay: r.dueDay, color, isLast: r.isLast, key: r.key,
          isOverdue: (r.dueDay ?? 0) > 0 && (r.dueDay ?? 0) < now.getDate(),
        })
      })
      notCounted.length = 0
      due.notCounted.forEach(x => notCounted.push({ label: x.label, type: x.sub, amount: x.amount, dueDay: x.dueDay, why: x.why }))
      lumpSum = due.rows.filter(r => r.kind === 'iowe-lump').reduce((a, r) => a + r.amount, 0)
      oneTime = due.rows.filter(r => r.kind === 'one-time').reduce((a, r) => a + r.amount, 0)
    }

    /* Months 1..11 are projections and keep the per-month loop above. Month 0 is THIS month, and
       it must equal what Dashboard, Budget, Lookup and Hub report to the rupee — so it comes from
       the shared calculator rather than being recomputed here with slightly different rules. */
    const regularOut = i === 0 ? shared.locked : (loanEmi + ccEmi + savEmi + repayEmi + persEmi + baseExpenses + billsDue + insEmi + sipEmi)
    const totalOut = i === 0
      ? shared.total   // already includes this month's lump sums, one-offs and renewals (calcOutflow dueNow)
      : regularOut + lumpSum + oneTime + ccOutstanding
    const free = monthlyIncome - totalOut
    const dropAmt = ending.filter(e => !e.type.includes('Due') && !e.type.includes('Matures')).reduce((s, e) => s + e.amount, 0)

    // Tight month warning
    if (free < 0) warnings.push(`Short by ${fmtINR(Math.abs(free))} this month`)
    else if (free < 10000 && monthlyIncome > 0) warnings.push(`Only ${fmtINR(free)} free — very tight`)
    if (lumpSum > 0) warnings.push(`Lump sum ${fmtINR(lumpSum)} due`)
    if (oneTime > 0) warnings.push(`One-time payment ${fmtINR(oneTime)} due`)

    // Sort dueItems by dueDay
    dueItems.sort((a, b) => (a.dueDay ?? 31) - (b.dueDay ?? 31))
    // For current month: mark items as paid if in markedKeys
    if (i === 0) {
      dueItems.forEach(item => {
        // Same shared rule as Lookup: paid only when ticked.
        if (item.key && isPaidThisMonth(item.key, (item as any).dueDay, markedKeys as string[])) (item as any).markedPaid = true
      })
    }

    return { label: d.toLocaleString('default', { month: 'short', year: 'numeric' }), ym, loanEmi, ccEmi, ccOutstanding, ccSpends, savEmi, repayEmi, persEmi, lumpSum, oneTime, notCounted, insEmi, sipEmi, baseExpenses, totalOut, regularOut, free, ending, dropAmt, isCurrent: i === 0, dueItems, warnings }
  })

  const maxRegular = Math.max(...months.map(m => m.regularOut), 1)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Failed to load calendar data." onRetry={() => refetchIncome()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Payment Calendar" action={
        <button className="btn-secondary btn-sm flex items-center gap-2"
          onClick={async () => {
            if (!('Notification' in window)) { toast.error('Notifications not supported'); return }
            const perm = await Notification.requestPermission()
            if (perm !== 'granted') { toast.error('Notifications blocked'); return }
            /* Previously stopped here — permission was granted but nothing was ever actually
               scheduled, so the button did nothing beyond a toast. This uses a plain setTimeout,
               so it only fires while this tab stays open until the due date; there's no service
               worker/push backend behind it, so it can't wake a closed browser. That's a real
               constraint, not a bug — surfaced honestly in the toast below rather than implying a
               reminder that survives closing the tab. */
            const currentMonth = months[0]
            const todayDate = now.getDate()
            let scheduled = 0
            currentMonth?.dueItems?.forEach((item: any) => {
              if (item.markedPaid || !item.dueDay || item.dueDay < todayDate) return
              const target = new Date(now.getFullYear(), now.getMonth(), item.dueDay, 9, 0, 0, 0)
              const delayMs = target.getTime() - Date.now()
              if (delayMs <= 0 || delayMs > MAX_TIMEOUT_MS) return
              scheduleNotification(`💰 ${item.label} due today`, `${item.type} · ${fmtINR(item.amount)}`, delayMs)
              scheduled++
            })
            toast.success(scheduled > 0
              ? `${scheduled} reminder${scheduled !== 1 ? 's' : ''} set for this month — keep this tab open to receive them`
              : 'Reminders enabled — no upcoming due dates left this month')
          }}>
          🔔 Reminders
        </button>
      }/>

      {/* Month hero */}
      {months.length > 0 && (
        <div className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{background:'linear-gradient(180deg, color-mix(in srgb, var(--cyan) 5%, var(--bg-card)) 0%, var(--bg-card) 75%)',border:'1px solid var(--hairline)'}}>
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color:'var(--text-muted)'}}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:'var(--cyan)'}} />📅 {new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</div>
              <div className="text-[34px] leading-none font-semibold tracking-tight tabular-nums" style={{color:'var(--cyan)'}}>{fmtINR(months[0].totalOut)}</div>
              <div className="text-[11px] mt-1" style={{color:'var(--text-faint)'}}>
              {/* This breakdown must account for every part of totalOut. It previously listed
                  only EMIs + CC spends + bills, which omitted the CC outstanding bill and any
                  lump sums — so the parts summed to less than the headline directly above. */}
              {/* Shared line, so the current month's itemisation matches every other page. This
                  previously derived "EMIs" as everything-locked minus bills, which lumped savings,
                  chit and insurance into a label that said EMIs — ₹1,92,625 against Hub's
                  ₹1,31,101 for the same data. */}
              {/* "payments charging in <month>" not "due" or "scheduled": this counts dated payment
                  EVENTS actually landing this month — a card with three EMIs is three payments here
                  but one commitment on Lookup, and a non-monthly bill/premium sitting between
                  renewals isn't counted at all (it shows on Master Table year-round as a reference
                  row instead, with no real charge this month). "Due" read as if it should match
                  Lookup's or Master Table's item count, which it was never meant to. */}
              {(() => {
                const di = months[0].dueItems
                const bills = new Set(di.filter(d => d.type === 'CC Outstanding' || d.type === 'CC Spends').map(d => d.key?.replace(/^card-(out|spend)-/, ''))).size
                const own = di.filter(d => d.type !== 'CC Outstanding' && d.type !== 'CC Spends').length
                const nc = months[0].notCounted.length
                return <>
                  <span title={`${own} commitments + ${di.length - own} card-bill line${di.length - own === 1 ? '' : 's'} for ${bills} card${bills === 1 ? '' : 's'}. A card's bill is listed as separate lines (outstanding + this cycle's spends).`}>{di.length} payments in {new Date().toLocaleDateString('en-IN',{month:'long'})}</span>
                  {nc > 0 && <button type="button" className="ml-1.5 hover:underline" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-faint)', font: 'inherit' }}
                    title="Left out of the count and every total — click to see which"
                    onClick={(e) => { e.stopPropagation(); setExpandedMonth(0); setTimeout(() => { const el = document.getElementById('cal-not-counted') as HTMLDetailsElement | null; if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } }, 80) }}>
                    (🚫 {nc} not counted)
                  </button>}
                </>
              })()} · {outflowTierLine(shared)}
              {months[0].lumpSum > 0 && <> · lump sum {fmtINR(months[0].lumpSum)}</>}
              {months[0].oneTime > 0 && <> · one-time {fmtINR(months[0].oneTime)}</>}
            </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-medium mb-1" style={{color:'var(--text-muted)'}}>Free this month · after card bill</div>
              <div className="text-[24px] font-semibold tracking-tight tabular-nums" style={{color:months[0].free>=0?'var(--success)':'var(--danger)'}}>{months[0].free>=0?'+':'-'}{fmtINR(Math.abs(months[0].free))}</div>
            </div>
          </div>
          {/* Own full-width row under both blocks: inside the left column the wide pill strip forced the
              "Free this month" block to wrap underneath and sit off-centre, and every filter click shifted it. */}
          <div className="relative mt-3 pt-3" style={{ borderTop: '1px solid color-mix(in srgb, var(--cyan) 14%, transparent)' }}>
                          <KindStrip
              chips={(() => { const m = new Map<string, number>(); months[0].dueItems.forEach(d => { const k = calendarKind(d.type); m.set(k, (m.get(k) ?? 0) + 1) }); return [...m.entries()].map(([k, n]) => ({ id: k, kind: k, count: n })) })()}
              selected={kindFilter}
              onChange={next => { setKindFilter(next); if (next.size > 0) setExpandedMonth(0) }} />
          </div>
        </div>
      )}



      {/* Smart insight - biggest payment this month */}
      {months[0]?.dueItems?.length > 0 && (() => {
        const biggest = [...months[0].dueItems].sort((a:any,b:any)=>b.amount-a.amount)[0]
        return (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{background:'linear-gradient(180deg, color-mix(in srgb, var(--info) 5%, var(--bg-card)) 0%, var(--bg-card) 75%)',border:'1px solid var(--hairline)'}}>
            <span className="text-lg">💡</span>
            <div className="text-[12px]" style={{color:'var(--text-muted)'}}>
              Biggest this month: <span style={{color:'var(--info)',fontWeight:600}}>{biggest?.label}</span> at <span style={{color:'var(--info)',fontWeight:600}}>{fmtINR(biggest?.amount)}</span>
            </div>
          </div>
        )
      })()}

      {/* Overdue alerts */}
      {months[0].dueItems.filter(d => d.isOverdue && !(d as any).markedPaid).length > 0 && (
        <div className="rounded-2xl p-4 mb-4" style={{background:"linear-gradient(180deg, color-mix(in srgb, var(--danger) 5%, var(--bg-card)) 0%, var(--bg-card) 75%)",border:"1px solid var(--hairline)"}}>
          <div className="font-bold mb-2 flex items-center gap-2" style={{color:"var(--danger)"}}>🚨 Overdue This Month</div>
          {months[0].dueItems.filter(d => d.isOverdue && !(d as any).markedPaid).map((item, i) => (
            <div key={i} className="flex justify-between text-[13px]">
              <span className="text-red-400">{item.label} ({item.type})</span>
              <span className="mono text-red-400 font-bold">{fmtINR(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 12 month list */}
      <div className="space-y-2">
        {months.map((mo, idx) => {
          const isExpanded = expandedMonth === idx
          const prev = months[idx - 1]
          const delta = prev ? mo.totalOut - prev.totalOut : 0
          const hasTightWarning = mo.free < 0 || (mo.free < 10000 && monthlyIncome > 0)

          // Every future month used to repeat the same category badges (Loans ₹X · CC EMI ₹Y · ...)
          // even when nothing about them had changed since the month before — a loan running
          // unchanged for a year showed the identical row 12 times over. The current month always
          // shows its full breakdown; a later month only re-shows it when something actually moved
          // (an EMI starts, one closes, an amount changes) — otherwise it collapses to just the
          // month name and total until the next month where something changes.
          const unchanged = idx > 0 && !!prev &&
            mo.loanEmi === prev.loanEmi && mo.ccEmi === prev.ccEmi && mo.ccOutstanding === prev.ccOutstanding &&
            mo.savEmi === prev.savEmi && (mo as any).repayEmi === (prev as any).repayEmi &&
            mo.sipEmi === prev.sipEmi && mo.insEmi === prev.insEmi && mo.persEmi === prev.persEmi &&
            mo.lumpSum === prev.lumpSum && mo.oneTime === prev.oneTime

          // A month identical to the one before it (and not tight on cash) renders as one slim line —
          // label, total, free — instead of a full card with a bar; tap it to open the full detail.
          const slim = unchanged && !isExpanded && !hasTightWarning && mo.warnings.length === 0

          return (
            <div key={mo.ym} className={`card overflow-hidden ${mo.isCurrent ? 'border-orange-500/40' : ''} ${hasTightWarning && !mo.isCurrent ? 'border-red-500/20' : ''}`}>
              {/* Header row - always visible */}
              <div className={`px-4 cursor-pointer ${slim ? 'py-1.5' : 'py-2'}`} onClick={() => setExpandedMonth(isExpanded ? null : idx)}>
                <div className="flex items-center gap-4 flex-wrap">
                  <div style={{ minWidth: 80 }}>
                    <div className={`font-bold text-[13px] ${mo.isCurrent ? 'text-orange-400' : ''}`}>{mo.label}</div>
                    {mo.isCurrent && <div className="text-[12px] text-orange-400 ">Current</div>}
                  </div>

                  {/* Mini breakdown — only shown for the current month, or a later month where
                      something changed since the one before it (see `unchanged` above). */}
                  {!unchanged && (
                    <div className="flex gap-x-3 gap-y-0.5 flex-wrap text-[11px] order-last basis-full sm:order-none sm:basis-auto sm:flex-1">
                      {mo.loanEmi > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--info)' }} />Loans {fmtINR(mo.loanEmi)}</span>}
                      {(mo.ccEmi + mo.ccOutstanding) > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--purple)' }} />CC EMI {fmtINR(mo.ccEmi + mo.ccOutstanding)}</span>}{mo.isCurrent && mo.ccSpends > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--pink)' }} />+Spends {fmtINR(mo.ccSpends)}</span>}
                      {mo.savEmi > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--success)' }} />Savings {fmtINR(mo.savEmi)}</span>}{(mo as any).repayEmi > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--danger)' }} />Repaying {fmtINR((mo as any).repayEmi)}</span>}
                      {mo.sipEmi > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--cyan)' }} />SIP {fmtINR(mo.sipEmi)}</span>}
                      {mo.insEmi > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--pink)' }} />Insurance {fmtINR(mo.insEmi)}</span>}
                      {mo.persEmi > 0 && <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--warning)' }} />I Owe {fmtINR(mo.persEmi)}</span>}
                      {mo.lumpSum > 0 && <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--orange)' }} />+Lump {fmtINR(mo.lumpSum)}</span>}
                      {mo.oneTime > 0 && <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}><i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--pink)' }} />+One-time {fmtINR(mo.oneTime)}</span>}
                    </div>
                  )}
                  {unchanged && <div className="flex-1" />}

                  <div className="text-right flex-shrink-0 ml-auto sm:ml-0">
                    <div className="mono font-bold">{fmtINR(mo.totalOut)}</div>
                    {idx > 0 && delta !== 0 && <div className={`text-[11px] ${delta < 0 ? 'text-green-400' : 'text-red-400'}`}>{delta < 0 ? `↓ −${fmtINR(Math.abs(delta))}` : `↑ +${fmtINR(delta)}`}</div>}
                    {monthlyIncome > 0 && <div className={`text-[11px] font-semibold ${mo.free >= 0 ? 'text-green-400' : 'text-red-400'}`}>{mo.free >= 0 ? '+' : ''}{fmtINR(mo.free)} free</div>}
                  </div>
                </div>

                {/* Bar */}
                {!slim && <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
                  {(() => {
                    // Bar = share of monthly income this month takes. Colour grades by how bad it is:
                    // green = comfortable, yellow = under 10% spare, orange = short, red = short by 25%+ of income.
                    const hasInc = monthlyIncome > 0
                    const pct = hasInc ? Math.min(100, Math.round(mo.totalOut / monthlyIncome * 100)) : Math.min(100, Math.round(mo.regularOut / maxRegular * 100))
                    const short = hasInc ? -mo.free / monthlyIncome : 0
                    const tone = !hasInc ? 'bg-yellow-500/60' : mo.free < 0 ? (short >= 0.25 ? 'bg-red-500' : 'bg-orange-500') : mo.free < monthlyIncome * 0.1 ? 'bg-yellow-500' : 'bg-emerald-500/70'
                    return <div title={hasInc ? `${Math.round(mo.totalOut / monthlyIncome * 100)}% of income` : undefined} className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
                  })()}
                </div>}

                {/* Warnings */}
                {mo.warnings.filter(w => !/^Short by /.test(w)).length > 0 && !isExpanded && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {mo.warnings.filter(w => !/^Short by /.test(w)).map((w, i) => (
                      <span key={i} className="badge badge-red text-[11px]">⚠ {w}</span>
                    ))}
                  </div>
                )}

                {/* Inline due items for current month - only overdue items collapsed */}
                {mo.isCurrent && mo.dueItems.length > 0 && !isExpanded && (
                  <div className="mt-2 space-y-1">
                    {mo.dueItems.filter(item => item.isOverdue && !(item as any).markedPaid).slice(0, 5).map((item, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg transition-opacity ${(item as any).markedPaid ? 'opacity-40 bg-green-500/5' : item.isOverdue ? 'bg-red-500/10 border border-red-500/20' : item.isLast ? 'bg-green-500/10 border border-green-500/20' : 'bg-[var(--bg-base)]'}`}>
                        {(item as any).markedPaid ? <span className="text-green-400 text-[11px] flex-shrink-0">✓</span> : <div className={`w-1.5 h-1.5 rounded-full ${item.color} flex-shrink-0`} />}
                        {item.dueDay && (
                          <span className={`mono text-[11px] whitespace-nowrap flex-shrink-0 font-bold ${item.isOverdue ? 'text-red-400' : 'text-orange-400'}`}>
                            Day {item.dueDay}{item.isOverdue ? ' ⚠' : ''}
                          </span>
                        )}
                        <span className="flex-1 font-medium text-[11px] min-w-0 truncate">{item.label}</span>
                        <span className={`text-[11px] flex-shrink-0 px-1 rounded ${
                          item.type === 'Loan' ? 'bg-blue-500/20 text-blue-400' :
                          item.type === 'CC EMI' || item.type === 'CC Outstanding' ? 'bg-yellow-500/20 text-yellow-400' :
                          item.type === 'Chit' || item.type === 'Savings' ? 'bg-green-500/20 text-green-400' :
                          item.type === 'Insurance' ? 'bg-red-500/20 text-red-400' :
                          'bg-[var(--bg-card)] text-[var(--text-muted)]'
                        }`}>{item.type}</span>
                        <span className="mono text-[11px] font-bold flex-shrink-0">{fmtINR(item.amount)}</span>
                        {item.isLast && <span className="text-green-400 text-[11px] flex-shrink-0">Last</span>}
                      </div>
                    ))}
                    {mo.dueItems.filter(item => !(item as any).markedPaid).length > 0 && (
                      <div className="text-[11px] text-center py-1 cursor-pointer hover:text-orange-400" style={{color:'var(--text-muted)'}} onClick={() => setExpandedMonth(idx)}>
                        {mo.dueItems.filter(item => !(item as any).markedPaid).length} still to pay · click to see all
                      </div>
                    )}
                  </div>
                )}

                {/* Ending payments preview */}
                {mo.ending.length > 0 && (
                  <div className="mt-1 text-[11px] text-green-400">
                    🎉 {mo.ending.map(e => e.label).join(', ')} {mo.ending.length === 1 ? 'closes' : 'close'} → frees {fmtINR(mo.dropAmt)}/mo
                  </div>
                )}
              </div>

              {/* Expanded: due dates detail */}
              {isExpanded && (
                <div className="border-t px-4 py-3" style={{ borderColor:'var(--hairline)', background: 'var(--bg-base)' }}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      Due Dates — {mo.label}
                    </div>
                    {mo.isCurrent && mo.dueItems.filter(item => !(item as any).markedPaid).length > 0 && (
                      <button className="btn btn-xs bg-green-500/15 text-green-400"
                        onClick={() => mo.dueItems.filter(item => !(item as any).markedPaid && (kindFilter.size === 0 || kindFilter.has(calendarKind(item.type)))).forEach(item => toggle(item.key))}>
                        ✓ Mark all paid
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {(mo.isCurrent && kindFilter.size > 0 ? mo.dueItems.filter(d => kindFilter.has(calendarKind(d.type))) : mo.dueItems).map((item, i) => (
                      <div key={i} className={`flex items-center gap-3 text-[13px] p-2 rounded-lg transition-opacity ${(item as any).markedPaid ? 'opacity-40 bg-green-500/5' : item.isOverdue ? 'bg-red-500/10' : item.isLast ? 'bg-green-500/10' : ''}`}>
                        <div className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0`} />
                        {item.dueDay && (
                          <div className={`mono text-[11px] whitespace-nowrap flex-shrink-0 font-bold ${item.isOverdue ? 'text-red-400' : 'text-orange-400'}`}>
                            Day {item.dueDay}{item.isOverdue ? ' ⚠' : ''}
                          </div>
                        )}
                        <div className="flex-1">
                          <span className="font-semibold">{item.label}</span>
                          <span className="ml-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>({item.type})</span>
                          {item.isLast && <span className="ml-2 badge badge-green text-[11px]">Last payment!</span>}
                          {(item as any).markedPaid && <span className="ml-2 badge badge-green text-[11px]">✓ Paid</span>}
                        </div>
                        <div className="mono font-bold">{fmtINR(item.amount)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Rows kept out of every total — collapsed so the list above stays the same length as Master's "All items". */}
                  {mo.isCurrent && mo.notCounted.length > 0 && (
                    <details id="cal-not-counted" className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      <summary className="cursor-pointer select-none py-1">
                        🚫 {mo.notCounted.length} not counted · {fmtINR(Math.round(mo.notCounted.reduce((a, x) => a + x.amount, 0)))}/mo
                        <span className="ml-1 opacity-70">— left out of the count and every total</span>
                      </summary>
                      <div className="space-y-1 mt-1">
                        {mo.notCounted.map((x, k) => (
                          <div key={k} className="flex items-center gap-3 px-2 py-1 rounded-lg opacity-70" style={{ background: 'color-mix(in srgb, var(--text) 3%, transparent)' }}>
                            <div className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-500" />
                            {x.dueDay ? <div className="mono text-[11px] whitespace-nowrap flex-shrink-0">Day {x.dueDay}</div> : null}
                            <div className="flex-1 min-w-0"><span className="font-semibold">{x.label}</span><span className="ml-2 text-[11px]">({x.type} · {x.why})</span></div>
                            <div className="mono">{fmtINR(x.amount)}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Ending details */}
                  {mo.ending.length > 0 && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor:'var(--hairline)' }}>
                      <div className="text-[12px] font-medium text-green-400 mb-2">🎉 Closing This Month</div>
                      {mo.ending.map((e, i) => (
                        <div key={i} className="flex justify-between text-[11px] py-1">
                          <span className="text-green-400 font-semibold">{e.label} <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>({e.type})</span></span>
                          <span className="mono text-green-400">−{fmtINR(e.amount)}/mo freed</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
