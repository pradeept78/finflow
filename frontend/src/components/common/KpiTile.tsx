import type { ReactNode } from 'react'

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
