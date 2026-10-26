import { useEffect, useRef, useState } from 'react'

export interface FilterOption { id: string; label?: string; color?: string; hint?: string; count?: number }

/**
 * The one filter control used across the app for "pick from a list of categories/types".
 * It adapts to the data, not to the schema: callers pass only the options that actually have rows.
 *   · 4 or fewer in use → inline chips (one tap, nothing hidden)
 *   · 5 or more in use  → a dropdown, so a long row of chips never pushes the table down
 *   · 1 or none         → nothing (a filter with no choice is just noise)
 * With `multiple`, chips toggle (OR); the dropdown offers a "Pick several at once" checkbox.
 */
export default function FilterMenu({ allLabel, noun, options, selected, onChange, multiple = true, accent = '#f97316', inlineMax = 4, allCount }: {
  allLabel: string            // e.g. "All types"
  noun: string                // e.g. "types" → "3 types"
  options: FilterOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  multiple?: boolean          // allow more than one selected
  allCount?: number           // total shown on the "All" chip
  inlineMax?: number          // show chips instead of a dropdown up to this many options
  accent?: string
}) {
  const [open, setOpen] = useState(false)
  const [multi, setMulti] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const badge = (n?: number) => n == null ? null : <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 4 }}>{n}</span>
  const label = (id: string) => options.find(o => o.id === id)?.label ?? id
  const on = selected.size > 0
  const pick = (id: string) => {
    const next = new Set(multi ? selected : [])
    if (selected.has(id)) next.delete(id); else next.add(id)
    onChange(next)
    if (!multi) setOpen(false)
  }

  if (options.length <= 1) return null

  if (options.length <= inlineMax) {
    const chip = (isOn: boolean, c: string) => ({
      background: isOn ? `color-mix(in srgb, ${c} 18%, transparent)` : 'var(--bg-hover)',
      color: isOn ? c : 'var(--text-faint)',
      border: `1px solid ${isOn ? `color-mix(in srgb, ${c} 35%, transparent)` : 'var(--border)'}`,
    })
    const toggle = (id: string) => {
      if (multiple) { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); onChange(next) }
      else onChange(selected.has(id) && selected.size === 1 ? new Set() : new Set([id]))
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={noun}>
        <button type="button" onClick={() => onChange(new Set())} className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
          style={chip(!on, 'var(--text)')}>{allLabel}{badge(allCount)}</button>
        {options.map(o => (
          <button type="button" key={o.id} onClick={() => toggle(o.id)} aria-pressed={selected.has(o.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
            style={chip(selected.has(o.id), o.color ?? accent)}>
            {o.label ?? o.id}{badge(o.count)}{o.hint ? <span style={{ fontWeight: 500 }}> {o.hint}</span> : null}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="text-[11px] px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5"
        style={{ background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'var(--bg-hover)', color: on ? accent : 'var(--text-muted)', border: `1px solid ${on ? `color-mix(in srgb, ${accent} 35%, transparent)` : 'var(--border)'}` }}>
        {!on ? allLabel : selected.size === 1 ? label([...selected][0]) : `${selected.size} ${noun}`} <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 rounded-2xl p-3 shadow-xl" style={{ width: 320, maxWidth: '86vw', background: 'var(--bg-card)', border: '1px solid var(--border-2, var(--border))' }}>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { onChange(new Set()); setOpen(false) }} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: !on ? 'var(--border-2)' : 'var(--bg-hover)', color: !on ? 'var(--text)' : 'var(--text-faint)', border: '1px solid var(--border)' }}>All{badge(allCount)}</button>
            {options.map(o => {
              const isOn = selected.has(o.id)
              const c = o.color ?? 'var(--text-faint)'
              return (
                <button type="button" key={o.id} onClick={() => pick(o.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                  style={{ background: isOn ? `color-mix(in srgb, ${c} 18%, transparent)` : 'var(--bg-hover)', color: isOn ? c : 'var(--text-faint)', border: `1px solid ${isOn ? `color-mix(in srgb, ${c} 35%, transparent)` : 'var(--border)'}` }}>
                  {o.label ?? o.id}{badge(o.count)}{o.hint ? <span style={{ fontWeight: 500 }}> {o.hint}</span> : null}
                </button>
              )
            })}
          </div>
          {multiple && (
            <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer select-none mt-2.5 pt-2.5" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" checked={multi} onChange={e => {
                setMulti(e.target.checked)
                if (!e.target.checked && selected.size > 1) onChange(new Set([[...selected][0]]))
              }} />
              Pick several at once
            </label>
          )}
        </div>
      )}
    </div>
  )
}
