import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi } from '../../api'
import { fmtINR } from '../../utils/format'
import { nextMonthHeadsUp, fmtDueDate } from '../../utils/cardCycle'
import { newCommitmentsNextMonth } from '../../utils/nextMonth'

const KIND_WORD: Record<string, string> = { loan: 'loan', 'card-emi': 'card EMI', iowe: 'I owe EMI', savings: 'savings', sip: 'SIP' }

/**
 * Heads-up in the current month: what's already set for next month — new commitments whose first payment
 * is next month (loans, card EMIs, I Owe, savings, SIPs; utils/nextMonth) and card spends already on next
 * month's bills (utils/cardCycle). None of it is in this month's total; it explains next month's jump.
 * A slim pill with the full list in its tooltip. Reads the shared query cache, so any page can show it.
 * Renders nothing when there's nothing new.
 */
export default function NextMonthHeadsUp({ className = '' }: { className?: string }) {
  const { data: loans = [] } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: personal = [] } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll })
  const { data: savings = [] } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll })
  const { data: investments = [] } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })

  const fresh = newCommitmentsNextMonth({ loans: loans as any[], cards: cards as any[], personal: personal as any[], savings: savings as any[], investments: investments as any[] })
  const own = fresh.filter(x => !x.owedBy), friends = fresh.filter(x => x.owedBy)
  const h = nextMonthHeadsUp(cards as any[])
  const items = [
    ...own.map(x => `${x.label} ${KIND_WORD[x.kind]} +${fmtINR(x.amount)}/mo from ${fmtDueDate(x.firstDue)}`),
    ...h.spends.map(s => `${s.card} spends ${fmtINR(s.amount)} · due ${fmtDueDate(s.due)}`),
  ]
  if (!items.length && !friends.length) return null
  const extra = own.reduce((s, x) => s + x.amount, 0) + h.spendTotal
  const friendLines = friends.map(x => `${x.label} ${fmtINR(x.amount)}/mo — carried for ${x.owedBy}, not in your totals`)
  const title = [`Already set for ${h.month} (first payment next month, or spent after this cycle's statement date — not in this month's total):`,
    ...items.map(x => `• ${x}`), ...friendLines.map(x => `• ${x}`)].join('\n')
  return (
    <div title={title}
      className={`text-[11px] px-2.5 py-1 rounded-lg min-w-0 max-w-full whitespace-nowrap overflow-hidden text-ellipsis ${className}`}
      style={{ background: 'color-mix(in srgb, var(--info) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 18%, transparent)', color: 'var(--text-faint)' }}>
      📅 <span style={{ color: 'var(--info)', fontWeight: 700 }}>{h.month}{extra > 0 ? `: +${fmtINR(extra)}` : ''}</span>
      {items.length > 0 ? <> — {items.join(' · ')}</> : <> — {friendLines.join(' · ')}</>}
    </div>
  )
}
