import { useCallback, useState } from 'react'
import { fmtINR } from '../../utils/format'

/** Tick-to-simulate state shared by the Loans / Cards / I Owe pages (same idea as the closing planner). */
export function usePicks() {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = useCallback((k: string) => setPicked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }), [])
  const clear = useCallback(() => setPicked(new Set()), [])
  return { picked, toggle, clear }
}

export function PickBox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label?: string }) {
  return (
    <input type="checkbox" className="flex-shrink-0 mt-0.5" checked={checked} aria-label={label ?? 'Add to what-if'}
      onClick={e => e.stopPropagation()} onChange={onToggle} title="Tick to see what closing this would cost and free" />
  )
}

/**
 * Appears once something is ticked. Closing an item fully costs its whole remaining balance and stops its
 * monthly payment, so both numbers are plain sums; the bill line shows the new monthly total.
 */
export function WhatIfBar({ count, need, free, billNow, income, onClear }: {
  count: number; need: number; free: number; billNow: number; income?: number; onClear: () => void
}) {
  if (count === 0) return null
  const after = Math.max(0, billNow - free)
  const stat = (label: string, value: string, color: string) => (
    <div className="flex flex-col leading-tight">
      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="text-[15px] font-semibold tabular-nums tracking-tight" style={{ color }}>{value}</span>
    </div>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-2.5 text-[12px] print:hidden sticky top-[92px] md:top-[46px] z-10 mb-2 backdrop-blur"
      style={{ background: 'color-mix(in srgb, #f97316 8%, var(--bg-card))', border: '1px solid color-mix(in srgb, #f97316 35%, transparent)', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
      <span className="inline-flex items-center gap-2 font-semibold"><span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] text-white" style={{ background: '#f97316' }}>{count}</span>selected</span>
      {stat('Needs to close', fmtINR(Math.round(need)), 'var(--danger)')}
      {stat('Frees per month', `${fmtINR(Math.round(free))}/mo`, 'var(--success)')}
      {stat('Monthly bill', `${fmtINR(Math.round(billNow))} → ${fmtINR(Math.round(after))}`, 'var(--text)')}
      {income && income > 0 ? stat('Share of income', `${Math.round(billNow / income * 100)}% → ${Math.round(after / income * 100)}%`, 'var(--info)') : null}
      <button onClick={onClear} className="ml-auto text-[12px] px-2.5 py-1 rounded-lg hover:bg-[var(--bg-hover)]" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>Clear</button>
    </div>
  )
}

/** "Select all N" / "Deselect all" link for a what-if list. `total` = rows that can be ticked, `selected` = how many are. */
export function SelectAllLink({ total, selected, onSelectAll, onClear }: { total: number; selected: number; onSelectAll: () => void; onClear: () => void }) {
  if (total < 2) return null
  const all = selected >= total
  return (
    <button onClick={all ? onClear : onSelectAll} className="print:hidden"
      style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
      {all ? `☐ Deselect all ${total}` : `☑ Select all ${total} for a what-if`}
    </button>
  )
}
