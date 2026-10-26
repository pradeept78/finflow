import { useState, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PAGE_LABELS } from '../../utils/pageLabels'
import { FULLSCREEN_ROUTES } from '../layout/hubTabs'
import { fmtINR } from '../../utils/format'
import { useUiStore } from '../../store/uiStore'

// StatTile
interface StatTileProps {
  label: string
  value: string | number
  sub?: string
  color?: 'red' | 'green' | 'blue' | 'orange' | 'yellow' | 'muted'
  isCurrency?: boolean
}
export function StatTile({ label, value, sub, color = 'muted', isCurrency }: StatTileProps) {
  const colorMap = {
    red: 'text-red-400', green: 'text-green-400', blue: 'text-blue-400',
    orange: 'text-orange-400', yellow: 'text-yellow-400', muted: 'text-[var(--text)]'
  }
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${colorMap[color]}`}>
        {isCurrency ? fmtINR(Number(value)) : value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

// Modal
interface ModalProps { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }
export function Modal({ title, onClose, children, footer }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-xs rounded-lg"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// PageHeader
interface PageHeaderProps { title: string; action?: React.ReactNode; /** small cross-page shortcut pills — share the header row instead of getting a row of their own */ links?: React.ReactNode }
export function PageHeader({ title, action, links }: PageHeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  // Arriving via an in-app hyperlink (an All Commitments row, a Hub/Dashboard card…) carries
  // `{ from }` in router state — either the legacy 'master' marker or the origin's path — so this page
  // can offer an obvious way back instead of making the user hunt through the sidebar. Lives here,
  // once, so every page using PageHeader gets it with no per-page changes. Sidebar and tab navigation
  // don't set `from`, so they never show it.
  const fromState = (location.state as any)?.from as string | undefined
  const fromPath = fromState === 'master' ? '/master' : fromState
  const backLabel = fromPath && fromPath !== location.pathname ? PAGE_LABELS[fromPath] : undefined
  // On a tabbed-hub page the active tab already names the page, so repeating it as a big title just
  // costs a row — keep only the action button (Add …), and keep the title for print.
  // Statements pages keep their titles: those are descriptive (and sub-views like "Year review" have no tab of their own).
  const inTabbedHub = FULLSCREEN_ROUTES.includes(location.pathname) && !location.pathname.startsWith('/statements/')
  // On a tabbed-hub page the primary action lives in the sticky tab bar (next to Full screen) instead of
  // on a row of its own above the content: that row cost ~60px on every Debt / Savings tab and pushed
  // the first table about 40% down the screen. Falls back to the old in-page spot if the slot isn't there.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setSlot(inTabbedHub ? document.getElementById('hub-action-slot') : null) }, [inTabbedHub, location.pathname])
  // Phones keep the button in the page: squeezing it into the tab bar would push the active tab off screen.
  const [wide, setWide] = useState(() => typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia('(min-width: 640px)').matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(min-width: 640px)'); const on = () => setWide(mq.matches)
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [])
  const portalled = inTabbedHub && wide && !!slot && !!action
  // Shortcut pills only go into the tab bar when there is room for them beside the tabs.
  // The sidebar takes ~210px, so with it open the tab bar needs a much wider window before pills fit beside the tabs.
  const fullScreenMode = useUiStore(st => st.fullScreen)
  const minW = fullScreenMode ? 1180 : 1560
  const [roomy, setRoomy] = useState(() => typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(`(min-width: ${minW}px)`).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(`(min-width: ${minW}px)`); const on = () => setRoomy(mq.matches); on()
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [minW])
  const linksPortalled = inTabbedHub && wide && roomy && !!slot && !!links
  const inRowLinks = !!links && !linksPortalled
  const showRow = !inTabbedHub || (!!action && !portalled) || inRowLinks || !!backLabel
  return (
    <>
      {(portalled || linksPortalled) && createPortal(<>{linksPortalled && <div className="flex items-center gap-1.5">{links}</div>}{portalled && action}</>, slot!)}
      {showRow ? (
        <div className={inTabbedHub ? 'mb-1' : 'mb-4'}>
          {backLabel && (
            <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fromPath as string))} className="text-[11px] font-medium mb-2 flex items-center gap-1 print:hidden" style={{ color: 'var(--text-faint)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              ← Back to {backLabel}
            </button>
          )}
          <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap">
            <h1 className={inTabbedHub ? 'page-title hidden print:block' : 'page-title'}>{title}</h1>
            {((action && !portalled) || inRowLinks) && (
              <div className={`flex items-center gap-2 flex-wrap flex-shrink-0 ${inTabbedHub ? 'ml-auto' : ''}`}>{inRowLinks && links}{action && !portalled && action}</div>
            )}
          </div>
        </div>
      ) : (
        <h1 className="page-title hidden print:block">{title}</h1>
      )}
    </>
  )
}

// EmptyState
interface EmptyStateProps { icon?: string; title: string; sub?: string; action?: React.ReactNode }
export function EmptyState({ icon = '📭', title, sub, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 flex flex-col items-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3"
        style={{ background: 'color-mix(in srgb, var(--text) 5%, var(--bg-card))', border: '1px solid var(--hairline)' }}>{icon}</div>
      <div className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text)' }}>{title}</div>
      {sub && <div className="text-[13px] mb-4 max-w-xs" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
      {action}
    </div>
  )
}

// ProgressBar
interface ProgressBarProps { value: number; max?: number; color?: string }
export function ProgressBar({ value, max = 100, color = 'bg-blue-500' }: ProgressBarProps) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0)
  return (
    <div className="progress-bar">
      <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// FormField
interface FormFieldProps { label: string; children: React.ReactNode; className?: string }
export function FormField({ label, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

// DueBadge
export function DueBadge({ dueDay, hasPending = true }: { dueDay?: number; hasPending?: boolean }) {
  if (!dueDay || !hasPending) return <span className="badge badge-muted">—</span>
  const today = new Date().getDate()
  const diff = dueDay - today
  if (diff < 0) return <span className="badge badge-red">Overdue</span>
  if (diff === 0) return <span className="badge badge-red">Today</span>
  if (diff <= 3) return <span className="badge badge-yellow">Day {dueDay}</span>
  return <span className="badge badge-muted">Day {dueDay}</span>
}

// LoadingSpinner
export function LoadingSpinner({ text }: { text?: string } = {}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <div className="w-8 h-8 border-2 border-[var(--border)] border-t-orange-500 rounded-full animate-spin" />
    </div>
  )
}

// ErrorState — every page's useQuery only ever handled the loading/success cases; a failed
// request (backend down, expired session, network drop) silently rendered as an empty/zero state
// instead of telling the user anything went wrong. Pages should check `isError` and render this
// instead of falling through to their normal (empty-looking) body.
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--danger) 8%, transparent) 0%, color-mix(in srgb, var(--danger) 2%, transparent) 100%)', border: '1px solid color-mix(in srgb, var(--danger) 15%, transparent)' }}>
      <span className="text-lg">⚠️</span>
      <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Couldn't load this data.</span> {message || 'Check your connection and try again.'}
      </div>
      {onRetry && <button className="btn-secondary btn-xs ml-auto flex-shrink-0" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export { AlertModal, InputModal } from './AlertModal'
// ConfirmModal — replaces native confirm() everywhere
interface ConfirmModalProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}
export function ConfirmModal({ message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <div className="modal-body text-center py-2">
          <div className="text-3xl mb-3">{danger ? '🗑️' : '⚠️'}</div>
          <div className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{message}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</div>
        </div>
        <div className="modal-footer flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>{cancelLabel}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── MetricStrip ─────────────────────────────────────────────────────────────
// Compact 5-tile hero used across all pages
interface MetricItem {
  label: string
  value: number
  color?: string
  sub?: string
  neg?: boolean
  delta?: number
  deltaGoodWhenPositive?: boolean
}
export function MetricStrip({ metrics, footer }: { metrics: MetricItem[]; footer?: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden mb-3" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
      <div className={`grid gap-px`} style={{gridTemplateColumns:`repeat(${metrics.length},1fr)`,background:'var(--border)'}}>
        {metrics.map(m => (
          <div key={m.label} className="px-3 py-2.5" style={{background:'var(--bg-card)'}}>
            <div className="text-[12px] font-medium mb-0.5 flex items-center gap-1.5" style={{color:'var(--text-muted)'}}><span className={`inline-block w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 ${m.color ?? 'text-[var(--text)]'}`} />{m.label}</div>
            <div className={`font-semibold tracking-tight tabular-nums text-[15px] ${m.color ?? 'text-[var(--text)]'}`}>
              {m.neg ? '−' : ''}{fmtINR(Math.abs(m.value))}
            </div>
            {m.delta !== undefined && Math.abs(m.delta) > 500 && (
              <div className={`text-[11px] font-semibold ${m.deltaGoodWhenPositive ? (m.delta>0?'text-green-400':'text-red-400') : (m.delta<0?'text-green-400':'text-red-400')}`}>
                {m.delta>0?'↑':'↓'} {fmtINR(Math.abs(m.delta))}
              </div>
            )}
            {m.sub && <div className="text-[11px] truncate" style={{color:'var(--text-faint)'}}>{m.sub}</div>}
          </div>
        ))}
      </div>
      {footer && <div className="px-4 py-1.5 text-xs border-t" style={{borderColor:'var(--border)',background:'color-mix(in srgb, var(--success-strong) 3%, transparent)'}}>{footer}</div>}
    </div>
  )
}

// ── SortBar ──────────────────────────────────────────────────────────────────
// Sort pills used in tables/lists
interface SortOption<T extends string> { key: T; label: string }
export function SortBar<T extends string>({ options, current, onChange }: { options: SortOption<T>[]; current: T; onChange: (k: T) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap mb-2">
      <span style={{color:'var(--text-muted)'}}>Sort:</span>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 rounded-full font-medium transition-colors ${current===o.key?'bg-orange-500 text-white':'hover:bg-[var(--bg-hover)]'}`}
          style={{color:current===o.key?'white':'var(--text-muted)'}}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── ExpandDrawer ──────────────────────────────────────────────────────────────
// Slide-down detail section used inside cards
export function ExpandDrawer({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t px-4 py-3 space-y-3" style={{borderColor:'var(--border)',background:'var(--bg-base)'}}>
      {children}
    </div>
  )
}

// ── PageMetricCard ────────────────────────────────────────────────────────────
// Single metric card used in grids
export function MetricCard({ label, value, sub, color = 'text-[var(--text)]', isCurrency = true, neg = false }: { label:string; value:number; sub?:string; color?:string; isCurrency?:boolean; neg?:boolean }) {
  return (
    <div className="rounded-2xl p-3" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
      <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{color:'var(--text-muted)'}}><span className={`inline-block w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 ${color}`} />{label}</div>
      <div className={`font-semibold tracking-tight tabular-nums text-[20px] ${color}`}>{neg?'−':''}{isCurrency?fmtINR(Math.abs(value)):value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{color:'var(--text-faint)'}}>{sub}</div>}
    </div>
  )
}

// ── SortHeader ───────────────────────────────────────────────────────────────
// Clickable column-header label with an up/down arrow, for tables built as CSS-grid
// header rows (plain <span> cells) rather than real <table><th> elements — clicking
// toggles asc/desc on that column; an inactive column shows a faint ⇅ hint.
export function SortHeader({ label, col, sortCol, sortDir, onSort, align = 'left' }: {
  label: string; col: string; sortCol: string | null; sortDir: 'asc' | 'desc'; onSort: (col: string) => void; align?: 'left' | 'right' | 'center'
}) {
  const active = sortCol === col
  return (
    <button type="button" onClick={() => onSort(col)}
      className={`inline-flex items-center gap-0.5 ${align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : ''}`}
      style={{ background: 'transparent', border: 'none', padding: 0, font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', color: active ? 'var(--text)' : 'inherit', cursor: 'pointer' }}>
      {label}
      <span style={{ fontSize: '8px', opacity: active ? 1 : 0.35 }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </button>
  )
}

// ── StatusBadge ────────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: 'good' | 'warn' | 'bad' | 'info' }) {
  const map = { good: 'bg-green-500/15 text-green-400', warn: 'bg-yellow-500/15 text-yellow-400', bad: 'bg-red-500/15 text-red-400', info: 'bg-blue-500/15 text-blue-400' }
  const labels = { good: '✅ On track', warn: '⚠ Watch out', bad: '🚨 Action needed', info: 'ℹ Info' }
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${map[status]}`}>{labels[status]}</span>
}


/** In-app link that remembers the page it was clicked from, so the destination's PageHeader can offer "← Back to …". */
export function FromLink({ to, ...rest }: { to: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { pathname } = useLocation()
  return <Link to={to} state={{ from: pathname }} {...rest} />
}
