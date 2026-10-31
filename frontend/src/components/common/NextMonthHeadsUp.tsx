import { fmtINR } from '../../utils/format'
import { nextMonthHeadsUp, fmtDueDate } from '../../utils/cardCycle'

/**
 * Heads-up in the current month: what's already set to land on next month's card bills — EMIs taken after
 * the statement date (first billed next month) and spends logged after it. Not part of this month's total;
 * it explains why next month will be higher. Renders nothing when there's nothing new.
 */
export default function NextMonthHeadsUp({ cards, className = '' }: { cards: any[]; className?: string }) {
  const h = nextMonthHeadsUp(cards)
  if (!h.newEmis.length && !h.spends.length && !h.friendEmis.length) return null
  const extra = h.newEmiTotal + h.spendTotal
  return (
    <div className={`rounded-2xl px-4 py-3 text-[12px] ${className}`}
      style={{ background: 'color-mix(in srgb, var(--info) 6%, var(--bg-card))', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--info)' }}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="text-[13px] font-semibold">Heads-up for {h.month}</div>
        {extra > 0 && <div className="mono font-semibold tabular-nums" style={{ color: 'var(--warning)' }}>+{fmtINR(extra)}</div>}
      </div>
      <ul className="space-y-1" style={{ color: 'var(--text-muted)' }}>
        {h.newEmis.map(e => (
          <li key={`e-${e.card}-${e.label}`}>
            New EMI <b style={{ color: 'var(--text)' }}>{e.label}</b> on {e.card}: <span className="mono" style={{ color: 'var(--text)' }}>+{fmtINR(e.emi)}/mo</span> from {fmtDueDate(e.firstDue)}
          </li>
        ))}
        {h.spends.map(s => (
          <li key={`s-${s.card}-${s.due.getTime()}`}>
            Spends already on the next {s.card} bill: <span className="mono" style={{ color: 'var(--text)' }}>{fmtINR(s.amount)}</span>, due {fmtDueDate(s.due)}
          </li>
        ))}
        {h.friendEmis.map(e => (
          <li key={`f-${e.card}-${e.label}`}>
            {e.label} on {e.card} starts too ({fmtINR(e.emi)}/mo) — carried for {e.owedBy}, not in your totals
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        Taken or spent after this cycle's statement date, so they're billed next month — not in this month's total.
      </div>
    </div>
  )
}
