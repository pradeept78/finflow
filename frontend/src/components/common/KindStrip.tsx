import { useState, type ReactNode } from 'react'
import { kindMeta } from '../../utils/kinds'

export interface KindChip {
  /** What a click toggles — the page's own id (Master passes its row type; the others pass the kind id). */
  id: string
  /** Canonical kind id, for the label and colour. */
  kind: string
  count: number
  /** Optional muted detail after the name, e.g. "₹84,121 · 25%". */
  sub?: string
}

/**
 * The "what is this count made of" strip: one soft pill per kind — coloured dot, bold count, name — instead
 * of a dotted run of text. Click a pill to filter by it; the rest dim. Shared by Calendar, Master and Lookup
 * so the three read identically.
 */
export function KindStrip({ chips, selected, onChange, lead, trail, className = '' }: {
  chips: KindChip[]
  selected: Set<string>
  /** Receives the NEW selection. A plain click picks just that kind; with "pick several" on (or Ctrl/Cmd/Shift held) it toggles. */
  onChange: (next: Set<string>) => void
  /** Left-hand headline, e.g. "31 payments this month (🚫 4 not counted)". */
  lead?: ReactNode
  /** Right-hand note, e.g. "5 reference, not charging this month". */
  trail?: ReactNode
  className?: string
}) {
  // Single-select by default, like a normal filter; multi is opt-in so a stray click can't leave a confusing union.
  const [several, setSeveral] = useState(false)
  const pick = (id: string, additive: boolean) => {
    if (several || additive) { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); onChange(n) }
    else onChange(selected.size === 1 && selected.has(id) ? new Set() : new Set([id]))
  }
  const sorted = [...chips].sort((a, b) => kindMeta(a.kind).order - kindMeta(b.kind).order)
  const any = selected.size > 0
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} onClick={e => e.stopPropagation()}>
      {lead && <div className="text-[12px] leading-snug" style={{ color: 'var(--text-faint)' }}>{lead}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {sorted.map(c => {
          const m = kindMeta(c.kind)
          const on = selected.has(c.id)
          return (
            <button key={c.id} type="button" onClick={e => pick(c.id, e.metaKey || e.ctrlKey || e.shiftKey)} aria-pressed={on}
              title={on ? 'Click to remove from the filter' : several ? `Add ${m.many} to the filter` : `Show only ${m.many} (Ctrl/Cmd-click to add more)`}
              className="inline-flex items-center gap-1.5 rounded-full text-[11px] leading-none transition-opacity"
              style={{
                padding: '4px 9px 4px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
                background: `color-mix(in srgb, ${m.color} ${on ? 22 : 9}%, transparent)`,
                border: `1px solid color-mix(in srgb, ${m.color} ${on ? 70 : 24}%, transparent)`,
                color: 'var(--text)',
                opacity: any && !on ? 0.5 : 1,
              }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: m.color, flexShrink: 0 }} />
              <b className="mono" style={{ color: 'var(--text)', fontWeight: 700 }}>{c.count}</b>
              <span>{c.count === 1 ? m.one : m.many}</span>
              {c.sub && <span className="mono" style={{ color: 'color-mix(in srgb, var(--text) 62%, transparent)', fontSize: 10.5 }}>{c.sub}</span>}
            </button>
          )
        })}
        {chips.length > 2 && (
          <label className="inline-flex items-center gap-1 text-[11px] cursor-pointer select-none" style={{ color: 'var(--text-faint)', padding: '4px 4px' }} title="Off: a click shows just that kind. On: clicks add or remove kinds.">
            <input type="checkbox" checked={several} onChange={e => setSeveral(e.target.checked)} style={{ accentColor: 'var(--accent)', colorScheme: 'dark light' }} />
            pick several
          </label>
        )}
        {any && (
          <button type="button" onClick={() => onChange(new Set())} className="text-[11px] hover:underline"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px 4px' }}>
            show all ✕
          </button>
        )}
        {trail && <span className="ml-auto text-[11px]" style={{ color: 'var(--text-faint)' }}>{trail}</span>}
      </div>
    </div>
  )
}
