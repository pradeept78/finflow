import { Children, useState, type ReactNode } from 'react'

// The one KPI tile: tinted gradient, accent dot + label, big tabular value, small sub-line.
// New pages should use this instead of re-typing the style block.
export function KpiTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent: string }) {
  return (
    <div className="kpi-tile rounded-2xl px-4 py-3 relative overflow-hidden"
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 5%, var(--bg-card)) 0%, var(--bg-card) 75%)`, border: '1px solid var(--hairline)' }}>
      <div className="text-[13px] font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />{label}
      </div>
      <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}

/**
 * A page's row of KPI tiles. Tablet and desktop: unchanged — every tile, in the grid the page passes in.
 * Phones: only the tiles at `keep` (the page's two most important numbers), with "More stats" for the rest,
 * so the first screen shows the list instead of a wall of tiles.
 */
export function KpiRow({ className, keep = [0, 1], children }: { className: string; keep?: number[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const items = Children.toArray(children)
  const extra = items.length - keep.filter(i => i < items.length).length
  return (
    <>
      <div className={className}>
        {items.map((c, i) => keep.includes(i) || open ? c : <div key={i} className="hidden md:contents">{c}</div>)}
      </div>
      {extra > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="md:hidden -mt-1 text-[12px] font-medium px-1 py-1" style={{ color: 'var(--text-muted)' }}>
          {open ? 'Fewer stats ▴' : `More stats (${extra}) ▾`}
        </button>
      )}
    </>
  )
}
