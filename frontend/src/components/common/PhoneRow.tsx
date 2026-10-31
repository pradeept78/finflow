import type { ReactNode } from 'react'

export interface PhoneAction { label: string; onClick: () => void; tone?: 'danger' | 'success' }

/**
 * One list item on a phone, in place of a wide table row (which needs sideways scrolling there).
 * Name and amount on top, details underneath, an optional progress bar; tap to open. Pages render it
 * `md:hidden` next to their existing table row (made `hidden md:grid`), so tablet and desktop are unchanged.
 * `actions` are shown once the row is open — for pages whose Edit / Delete buttons live in the table row
 * rather than in the expanded panel.
 */
export function PhoneRow({ title, amount, amountColor = 'var(--text)', left, right, rightColor, pct, barColor = 'var(--success)', dim, expanded, onToggle, actions }: {
  title: ReactNode
  amount: ReactNode
  amountColor?: string
  left?: ReactNode
  right?: ReactNode
  rightColor?: string
  /** 0–100: draws a progress bar */
  pct?: number
  barColor?: string
  /** Paused / closed entries: muted text (not opacity, so contrast stays readable) */
  dim?: boolean
  expanded?: boolean
  onToggle?: () => void
  actions?: PhoneAction[]
}) {
  const muted = 'var(--text-muted)'
  return (
    <div className="md:hidden">
      <button type="button" className="w-full text-left px-4 py-3" aria-expanded={onToggle ? !!expanded : undefined} onClick={onToggle}
        style={{ background: expanded ? 'var(--bg-base)' : 'transparent' }}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-[14px] truncate" style={dim ? { color: muted } : undefined}>{title}</span>
          <span className="mono font-semibold text-[14px] tabular-nums flex-shrink-0" style={{ color: dim ? muted : amountColor }}>{amount}</span>
        </div>
        {(left || right) && (
          <div className="flex items-center justify-between gap-3 mt-0.5 text-[12px]" style={{ color: muted }}>
            <span className="truncate">{left}</span>
            {right && <span className="flex-shrink-0 tabular-nums" style={rightColor ? { color: rightColor } : undefined}>{right}</span>}
          </div>
        )}
        {pct !== undefined && (
          <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor }} />
          </div>
        )}
      </button>
      {expanded && actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3" style={{ background: 'var(--bg-base)' }}>
          {actions.map(a => (
            <button key={a.label} type="button" onClick={a.onClick}
              className={`${a.tone === 'danger' ? 'btn-danger' : 'btn-secondary'} btn-sm flex-1 justify-center min-h-[40px]`}
              style={a.tone === 'success' ? { color: 'var(--success)' } : undefined}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** "/mo", "/yr", "one-time" … — the short frequency suffix used on phone rows. */
export const freqSuffix = (f?: string) =>
  !f || /^monthly$/i.test(f) ? '/mo' : /^(yearly|annual)$/i.test(f) ? '/yr' : /^half[- _]?yearly$/i.test(f) ? '/6 mo'
    : /^quarterly$/i.test(f) ? '/qtr' : /^(single|one[- ]?time)$/i.test(f) ? ' one-time' : /^weekly$/i.test(f) ? '/wk' : ` ${f}`
