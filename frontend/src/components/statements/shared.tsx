import { ICON } from '../common/icons'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { profilesApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import type { StatementAccount, YearSummary } from '../../types/statements'
import { EmptyState } from '../common'

// ── Formatters ────────────────────────────────────────────────────────────────
// `compact` mirrors the original analyzer app's abbreviation (₹ / L / Cr) — the rest of finflow-
// clean's fmtINR always spells out full digits, which reads fine for EMIs but is unreadable for a
// year of transaction totals in the lakhs/crores, so this section keeps its own compact formatter.
export const money = (n?: number | null) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
export const compact = (n?: number | null) => {
  const x = Number(n || 0)
  if (x >= 10000000) return '₹' + (x / 10000000).toFixed(2) + 'Cr'
  if (x >= 100000) return '₹' + (x / 100000).toFixed(1) + 'L'
  if (x >= 1000) return '₹' + (x / 1000).toFixed(0) + 'k'
  return money(x)
}
export const formatTxDate = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}
export const accountDisplay = (key: string | undefined, accounts: StatementAccount[]) =>
  accounts.find(a => a.accountKey === key)?.displayName || key || '—'

export const CHART_COLORS = ['#f97316', '#5865f2', '#11a683', '#f3a43b', '#e96b5d', '#8c7cf0', '#2f8fce', '#9a6b46']

// ── Kpi ───────────────────────────────────────────────────────────────────────
export function Kpi({ label, value, sub, accent, onClick }: { label: string; value: string; sub?: string; accent?: boolean; onClick?: () => void }) {
  const dot = accent ? '#f97316' : 'var(--text-faint)'
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 relative overflow-hidden ${onClick ? 'cursor-pointer transition-opacity hover:opacity-90' : ''}`}
      style={{
        background: accent
          ? 'linear-gradient(180deg, color-mix(in srgb, #f97316 6%, var(--bg-card)) 0%, var(--bg-card) 75%)'
          : 'var(--bg-card)',
        border: '1px solid var(--hairline)',
      }}>
      <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />{label}</div>
      <div className="text-[22px] font-semibold tracking-tight tabular-nums" style={{ color: accent ? 'var(--accent, #f97316)' : 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}{onClick ? ' ›' : ''}</div>}
    </div>
  )
}

// ── CardHead ──────────────────────────────────────────────────────────────────
export function CardHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <div className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>{eyebrow}</div>
        <h2 className="text-[15px] font-semibold mt-0.5">{title}</h2>
      </div>
      {action}
    </div>
  )
}

// ── Section card wrapper — matches finflow-clean's var(--bg-card)/var(--border) convention ──
export function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl p-4 ${className}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)' }}>
      {children}
    </section>
  )
}

// ── RankList ──────────────────────────────────────────────────────────────────
export function RankList({ data, nameKey, subKey, onClick }: { data: any[]; nameKey: string; subKey?: string; onClick?: (name: string) => void }) {
  if (!data.length) return <EmptyState icon={ICON.empty} title="Nothing here yet" />
  return (
    <div className="space-y-0.5">
      {data.map((x, i) => (
        <button key={i} onClick={() => onClick?.(x[nameKey])}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-[var(--bg-hover)]">
          <span className="text-[11px] font-bold w-5 flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1">
            <strong className="block text-[13px] truncate">{x[nameKey] || 'Unknown'}</strong>
            {subKey && <small className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{x[subKey]} transactions</small>}
          </span>
          <b className="text-[13px] flex-shrink-0">{money(x.amount)}</b>
        </button>
      ))}
    </div>
  )
}

// ── CategoryList ──────────────────────────────────────────────────────────────
export function CategoryList({ data, onClick }: { data: { category?: string; name?: string; amount: number }[]; onClick?: (cat: string) => void }) {
  const total = data.reduce((s, x) => s + Number(x.amount || 0), 0) || 1
  if (!data.length) return <EmptyState icon={ICON.empty} title="Nothing here yet" />
  return (
    <div className="space-y-0.5">
      {data.map((x, i) => {
        const label = x.category || x.name || 'Other'
        const row = (
          <>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1">
              <strong className="block text-[13px] truncate">{label}</strong>
              <small className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{Math.round((Number(x.amount || 0) / total) * 100)}%</small>
            </span>
            <b className="text-[13px] flex-shrink-0">{money(x.amount)}</b>
          </>
        )
        return onClick ? (
          <button key={i} onClick={() => onClick(label)} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-[var(--bg-hover)]">{row}</button>
        ) : (
          <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">{row}</div>
        )
      })}
    </div>
  )
}

// ── FilterBar ─────────────────────────────────────────────────────────────────
// The header row every /statements page shows: profile switcher, period, account. Keeps the
// three selects consistent (and their side effects — new-profile creation, account reset on
// profile switch) in one place instead of duplicating per page like the original main.jsx did.
export function FilterBar({ years, accounts }: { years: YearSummary[]; accounts: StatementAccount[] }) {
  const { profile, profiles, period, account, setProfile, setProfiles, setPeriod, setAccount } = useStatementFilterStore()
  const [newProfileOpen, setNewProfileOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')

  const profilesQuery = useQuery({ queryKey: ['statement-profiles'], queryFn: profilesApi.list })
  useEffect(() => {
    if (profilesQuery.data?.length) setProfiles(profilesQuery.data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesQuery.data])

  const createProfile = () => {
    const name = newProfileName.trim()
    if (name) { setProfiles([...profiles, name]); setProfile(name) }
    setNewProfileOpen(false)
    setNewProfileName('')
  }

  const sortedYears = [...years].sort((a, b) => Number(b.year) - Number(a.year))

  return (
    // Compact pickers that wrap: on a phone they used to stack into three full-width rows, and a
    // sideways-scrolling row hid the Account picker. Now two short rows at most, all visible.
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <label className="flex min-w-0 items-center gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5 sm:flex-shrink-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Profile</span>
        <select className="select min-w-0 flex-1 sm:flex-none sm:!w-auto text-[12px] py-0" style={{ background: 'transparent', border: 'none' }}
          value={profile}
          onChange={e => { if (e.target.value === '__new__') { setNewProfileName(''); setNewProfileOpen(true) } else setProfile(e.target.value) }}>
          {profiles.map(p => <option key={p} value={p}>{p}</option>)}
          <option value="__new__">+ New profile…</option>
        </select>
      </label>

      <label className="flex min-w-0 items-center gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5 sm:flex-shrink-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Period</span>
        <select className="select min-w-0 flex-1 sm:flex-none sm:!w-auto text-[12px] py-0" style={{ background: 'transparent', border: 'none' }} value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">All time</option>
          <option value="ytd">This year</option>
          <option value="12m">Last 12 months</option>
          <option value="3m">Last 3 months</option>
          {sortedYears.map(y => <option key={y.year} value={String(y.year)}>{y.year}</option>)}
        </select>
      </label>

      <label className="col-span-2 flex min-w-0 items-center gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5 sm:flex-shrink-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Account</span>
        <select className="select min-w-0 flex-1 sm:flex-none sm:!w-auto text-[12px] py-0" style={{ background: 'transparent', border: 'none' }} value={account} onChange={e => setAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.accountKey} value={a.accountKey}>{a.displayName}</option>)}
        </select>
      </label>

      {newProfileOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setNewProfileOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h2 className="text-lg font-bold">Create a profile</h2></div>
            <div className="modal-body space-y-2">
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Each profile keeps its own statements &amp; analytics, fully separate — all still under your own account.</p>
              <input autoFocus className="input" placeholder="e.g. Personal, Business"
                value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newProfileName.trim()) createProfile() }} />
            </div>
            <div className="modal-footer flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setNewProfileOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={!newProfileName.trim()} onClick={createProfile}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
