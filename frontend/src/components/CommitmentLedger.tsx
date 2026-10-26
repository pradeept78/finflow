import { useState, useEffect } from 'react'
import { fmtINR } from '../utils/format'
import { TYPE_COLOR, isFriendOwed, type MasterRow } from '../utils/buildMasterRows'

/**
 * Read-only grouped commitment list — the Admin panel's per-user ledger (GET
 * /admin/users/{id}/commitments -> buildMasterRows) uses this to show the exact same categories
 * /master's own "By Type"/"By Card" views group by, on someone else's data. It's the display half
 * of that pattern factored out so it isn't rewritten by hand here; /master's own grouped views stay
 * inline in MasterTablePage.tsx since they also need search/sort/print/due-date features this
 * read-only panel has no use for.
 *
 * No row click-to-navigate: a row here belongs to another user's account, so there's nowhere for
 * an admin to usefully be sent — this is a look, not an edit surface.
 *
 * `expandSignal`/`collapseSignal` are optional bump counters (increment to fire): the side-by-side
 * comparison modal passes the same counter value to both columns' instances at once so one
 * "Expand all"/"Collapse all" pair controls both ledgers together. The single-user Full Ledger view
 * doesn't pass these, so it keeps its original per-group-only collapse behavior unchanged.
 */
export function CommitmentLedger({ rows, groupBy, expandSignal, collapseSignal }: {
  rows: MasterRow[]
  groupBy: (r: MasterRow) => string
  expandSignal?: number
  collapseSignal?: number
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // The shared fallback every group's collapsed state resolves to until it's individually
  // toggled. Expand all / Collapse all just change this one value and wipe individual overrides,
  // rather than needing to know every group key that currently exists.
  const [defaultCollapsed, setDefaultCollapsed] = useState(true)
  const toggle = (g: string) => setCollapsed(c => ({ ...c, [g]: !(c[g] ?? defaultCollapsed) }))

  useEffect(() => { if (expandSignal != null) { setDefaultCollapsed(false); setCollapsed({}) } }, [expandSignal])
  useEffect(() => { if (collapseSignal != null) { setDefaultCollapsed(true); setCollapsed({}) } }, [collapseSignal])

  const buckets = new Map<string, MasterRow[]>()
  rows.forEach(r => { const k = groupBy(r); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k)!.push(r) })
  const groupKeys = [...buckets.keys()].sort((a, b) => {
    const val = (k: string) => {
      const own = (buckets.get(k) ?? []).filter(r => !isFriendOwed(r))
      const pending = own.reduce((s, r) => s + r.totalPending, 0)
      return pending > 0 ? pending : own.reduce((s, r) => s + (r.isCardEmi ? 0 : (r.emi ?? 0)), 0)
    }
    return val(b) - val(a)
  })

  if (groupKeys.length === 0) {
    return <div className="p-6 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing on the books for this user.</div>
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
      {groupKeys.map(g => {
        const groupRows = buckets.get(g) ?? []
        const isCollapsed = collapsed[g] ?? defaultCollapsed
        const ownGroupRows = groupRows.filter(r => !isFriendOwed(r))
        const groupPending = ownGroupRows.reduce((s, r) => s + r.totalPending, 0)
        const groupMonthly = ownGroupRows.reduce((s, r) => s + (r.isCardEmi ? 0 : (r.emi ?? 0)), 0)
        return (
          <div key={g}>
            <div className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none"
              style={{ background: 'color-mix(in srgb, var(--text) 4%, transparent)', borderTop: '1px solid var(--hairline)' }}
              onClick={() => toggle(g)}>
              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                {isCollapsed ? '▸' : '▾'} {g}
                <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({groupRows.length})</span>
              </span>
              <span className="text-[11px] mono font-bold text-right">
                {groupMonthly > 0 && <span style={{ color: 'var(--warning)' }}>{fmtINR(Math.round(groupMonthly))}/mo</span>}
                {groupPending > 0 && groupMonthly > 0 && ' · '}
                {groupPending > 0 && <span style={{ color: 'var(--danger)' }}>pending {fmtINR(groupPending)}</span>}
                {groupPending <= 0 && groupMonthly <= 0 && <span style={{ color: 'var(--text-faint)' }}>—</span>}
              </span>
            </div>
            {!isCollapsed && groupRows.map(r => {
              const friendOwed = isFriendOwed(r)
              const dimmed = friendOwed || r.isCardEmi
              return (
                <div key={r.key} className="flex items-center gap-3 px-3 py-1.5" style={{ borderTop: '1px solid var(--hairline)', opacity: dimmed ? 0.55 : 1 }}>
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `color-mix(in srgb, ${TYPE_COLOR[r.type] ?? 'var(--text-faint)'} 15%, transparent)`, color: TYPE_COLOR[r.type] ?? 'var(--text-faint)' }}>{r.type}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{r.name}</div>
                    {(r.sub || friendOwed) && (
                      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {friendOwed ? `for ${r.owedBy} · excluded from totals` : r.sub}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.emi != null && <div className="mono font-bold text-[12px]" style={{ color: 'var(--warning)' }}>{fmtINR(r.emi)}/mo</div>}
                    {r.totalPending > 0 && (
                      <div className={r.emi != null ? 'text-[11px] mono' : 'mono font-bold text-[12px]'} style={{ color: r.emi != null ? 'var(--text-faint)' : 'var(--danger)' }}>
                        {r.emi != null ? `pending ${fmtINR(r.totalPending)}` : fmtINR(r.totalPending)}
                      </div>
                    )}
                    {r.emi == null && r.totalPending <= 0 && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
