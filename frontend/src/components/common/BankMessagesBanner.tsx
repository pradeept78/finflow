import { useQuery } from '@tanstack/react-query'
import { bankMessagesApi } from '../../api'
import { FromLink } from '.'

/** "📩 3 new from bank messages · Review" on Home and Due. Renders nothing when none are waiting. */
export default function BankMessagesBanner() {
  const { data } = useQuery({ queryKey: ['bank-messages-summary'], queryFn: bankMessagesApi.summary, staleTime: 60_000 })
  const n = data?.newCount ?? 0
  if (n <= 0) return null
  return (
    <FromLink to="/messages" className="card-link flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[13px]"
      style={{ background: 'color-mix(in srgb, var(--info) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--info) 22%, transparent)' }}>
      <span>📩 <b className="tabular-nums">{n}</b> new from bank messages, waiting for you to confirm</span>
      <span className="font-semibold flex-shrink-0" style={{ color: 'var(--orange)' }}>Review →</span>
    </FromLink>
  )
}
