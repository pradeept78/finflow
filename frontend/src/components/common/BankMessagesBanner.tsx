import { useQuery } from '@tanstack/react-query'
import { bankMessagesApi } from '../../api'
import { FromLink } from '.'

/** On Home and Due: messages waiting for a tap, and ones added automatically in the last 3 days (to check or undo). */
export default function BankMessagesBanner() {
  const { data } = useQuery({ queryKey: ['bank-messages-summary'], queryFn: bankMessagesApi.summary, staleTime: 60_000 })
  const n = data?.newCount ?? 0, auto = data?.autoAddedRecent ?? 0
  if (n <= 0 && auto <= 0) return null
  const text = n > 0
    ? <>📩 <b className="tabular-nums">{n}</b> from bank messages waiting for you{auto > 0 && <> · <b className="tabular-nums">{auto}</b> added automatically</>}</>
    : <>✅ <b className="tabular-nums">{auto}</b> added automatically from bank messages</>
  return (
    <FromLink to="/messages" className="card-link flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[13px]"
      style={{ background: 'color-mix(in srgb, var(--info) 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--info) 22%, transparent)' }}>
      <span>{text}</span>
      <span className="font-semibold flex-shrink-0" style={{ color: 'var(--orange)' }}>{n > 0 ? 'Review →' : 'See →'}</span>
    </FromLink>
  )
}
