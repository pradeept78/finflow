export interface SegOption<T extends string> { id: T; label: string; badge?: string | number; color?: string }

/**
 * The one compact "switch" used for in-page view toggles (Months/Table, Loans/People/Other, the
 * closing-planner lists). Same 11px semibold type and padding everywhere; the main hub tab bar
 * (TabbedHub, 12px) is the only larger tab style. `color` on an option tints its active state and badge.
 */
export default function SegTabs<T extends string>({ options, value, onChange, accent = '#f97316', className = '' }: {
  options: SegOption<T>[]; value: T; onChange: (id: T) => void; accent?: string; className?: string
}) {
  return (
    // max-w-full + overflow-x-auto: on a phone a long set of options scrolls inside itself instead of
    // pushing the whole page sideways (Cards' four views were 18px wider than a 390px screen).
    <div role="tablist" className={`inline-flex rounded-lg overflow-x-auto max-w-full flex-shrink-0 ${className}`} style={{ border: '1px solid var(--hairline)', scrollbarWidth: 'none' }}>
      {options.map(o => {
        const on = o.id === value
        const c = o.color ?? accent
        return (
          <button key={o.id} role="tab" aria-selected={on} onClick={() => onChange(o.id)}
            className="px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors"
            style={{ background: on ? `color-mix(in srgb, ${c} 24%, transparent)` : 'transparent', color: on ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
            {o.label}{o.badge !== undefined && <> <span className="mono" style={{ color: c }}>{o.badge}</span></>}
          </button>
        )
      })}
    </div>
  )
}
