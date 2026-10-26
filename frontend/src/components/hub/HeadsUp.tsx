import { useState } from 'react'
import type { HealthIssue } from '../../utils/dataHealth'
import type { FriendsOwe } from '../../utils/friendsOwe'
import { fmtINR } from '../../utils/format'

const mon = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : ''

/**
 * Two quiet notes on the Hub overview, as chips that sit on the SAME row as the Look ahead strip (rendered inside it, so they wrap together):
 *   ⚠ records that can't keep themselves up to date      👥 what friends owe you
 * Click a chip to open its detail underneath (one at a time); each row inside jumps to the page where it's handled.
 */
export default function HeadsUp({ issues, owed, asOfThen, onGo }: { issues: HealthIssue[]; owed: FriendsOwe; asOfThen?: boolean; onGo: (to: string) => void }) {
  const [open, setOpen] = useState<'health' | 'friends' | null>(null)
  if (issues.length === 0 && owed.total <= 0) return null
  const fix = issues.filter(i => i.level === 'fix').length
  const toggle = (k: 'health' | 'friends') => setOpen(o => o === k ? null : k)
  const chip = (k: 'health' | 'friends', on: boolean) => ({ background: on ? 'color-mix(in srgb, var(--text) 8%, transparent)' : 'color-mix(in srgb, var(--text) 4%, transparent)', border: '1px solid var(--hairline)', color: 'var(--text-muted)', cursor: 'pointer' } as React.CSSProperties)
  const max = Math.max(1, ...owed.people.map(p => p.amount))

  return (
    <>
        {issues.length > 0 && (
          <button type="button" onClick={() => toggle('health')} aria-expanded={open === 'health'} className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px]" style={chip('health', open === 'health')}>
            <span style={{ color: 'var(--warning)' }}>⚠</span>
            <span><b style={{ color: 'var(--text)' }}>{issues.length}</b> record{issues.length > 1 ? 's' : ''} need{issues.length > 1 ? '' : 's'} a look{fix > 0 && <span style={{ color: 'var(--text-faint)' }}> · {fix} to fix</span>}</span>
            <span style={{ color: 'var(--text-faint)' }}>{open === 'health' ? '▴' : '▾'}</span>
          </button>
        )}
        {owed.total > 0 && (
          <button type="button" onClick={() => toggle('friends')} aria-expanded={open === 'friends'} className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px]" style={chip('friends', open === 'friends')}
            title="Friends' spends and EMIs on your cards. The bank charges you; they repay you. Not counted in what you owe.">
            <span>👥</span>
            <span>Friends owe you <b className="mono" style={{ color: 'var(--info)' }}>{fmtINR(owed.total)}</b><span style={{ color: 'var(--text-faint)' }}> · {owed.people.length} {owed.people.length > 1 ? 'people' : 'person'}{asOfThen ? ' · as of then' : ''}</span></span>
            <span style={{ color: 'var(--text-faint)' }}>{open === 'friends' ? '▴' : '▾'}</span>
          </button>
        )}

      {open === 'health' && (
        <div className="basis-full text-[12px] rounded-xl px-1 py-1 max-h-64 overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="px-2 py-1 text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>These can't update on their own — fix the date or tenure and they will</div>
          {issues.map(i => (
            <button key={i.key} type="button" onClick={() => onGo(i.to)} className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <span className="mt-0.5 text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: i.level === 'fix' ? 'var(--warning)' : 'var(--text-faint)' }}>{i.kind}</span>
              <span className="flex-1 min-w-0"><b>{i.label}</b> <span style={{ color: 'var(--text-faint)' }}>— {i.why}</span></span>
              <span style={{ color: 'var(--text-faint)' }}>→</span>
            </button>
          ))}
        </div>
      )}

      {open === 'friends' && (
        <div className="basis-full text-[12px] rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="space-y-2.5">
            {owed.people.map(p => (
              <button key={p.name} type="button" onClick={() => onGo('/cards')} className="w-full text-left hover:bg-white/5 rounded-md px-1 py-0.5 block" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                <div className="flex items-baseline gap-2">
                  <b className="flex-1 min-w-0 truncate">{p.name}</b>
                  <span className="mono font-semibold" style={{ color: 'var(--info)' }}>{fmtINR(p.amount)}</span>
                  <span style={{ color: 'var(--text-faint)' }}>→</span>
                </div>
                <div className="h-1 rounded-full my-1 overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(4, p.amount / max * 100)}%`, background: 'var(--info)' }} /></div>
                <div style={{ color: 'var(--text-faint)' }}>
                  {[p.emi > 0 && `EMIs left ${fmtINR(p.emi)}`, p.spends > 0 && `spends ${fmtINR(p.spends)}`, p.perMonth > 0 && `${fmtINR(p.perMonth)}/mo hits your card`, p.oldest && `since ${mon(p.oldest)}`].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-2 pt-2 text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-faint)' }}>
            The bank charges these to your card{owed.perMonth > 0 ? ` (${fmtINR(owed.perMonth)}/month in EMIs)` : ''} and your friends repay you, so they are not counted in what you owe or in Monthly Outflow — but they do use up your card limit.
          </div>
        </div>
      )}
    </>
  )
}
