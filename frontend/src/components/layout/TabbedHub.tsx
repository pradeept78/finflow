import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LoadingSpinner } from '../common'
import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, expensesApi, savingsApi, investmentsApi, incomeApi, insuranceApi, peopleOweApi } from '../../api'
import { useUiStore } from '../../store/uiStore'
import type { HubConfig } from './hubTabs'
import { checkIsAdmin } from '../../api/adminCheck'

export function FullScreenButton({ className = '' }: { className?: string }) {
  const fullScreen = useUiStore(s => s.fullScreen)
  const toggle = useUiStore(s => s.toggleFullScreen)
  return (
    <button onClick={toggle} title={fullScreen ? 'Exit full screen (Esc)' : 'Fill the whole screen'}
      className={`hidden md:inline-block text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap flex-shrink-0 ${className}`}
      style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
      <span className="hidden sm:inline">{fullScreen ? '⤡ Exit full screen' : '⛶ Full screen'}</span>
      <span className="sm:hidden">{fullScreen ? '⤡' : '⛶'}</span>
    </button>
  )
}

/** Item counts for tab badges. Same query keys as the pages themselves, so this is a cache read, not extra requests. */
const COUNT_SOURCES: Record<string, { key: string; fn: () => Promise<any> }> = {
  '/loans': { key: 'loans', fn: loansApi.getAll }, '/cards': { key: 'cards', fn: cardsApi.getAll },
  '/personal': { key: 'personal', fn: personalEmiApi.getAll }, '/expenses': { key: 'expenses', fn: expensesApi.getAll },
  '/savings': { key: 'savings', fn: savingsApi.getAll }, '/investments': { key: 'investments', fn: investmentsApi.getAll },
  '/income': { key: 'income', fn: incomeApi.getAll }, '/insurance': { key: 'insurance', fn: insuranceApi.getAll },
  '/people-owe': { key: 'people-owes', fn: peopleOweApi.getAll },
}
const PAUSABLE = new Set(['/expenses', '/income', '/insurance', '/investments'])
function TabCount({ to }: { to: string }) {
  const src = COUNT_SOURCES[to]
  const { data } = useQuery({ queryKey: [src?.key ?? 'none'], queryFn: src?.fn ?? (async () => []), enabled: !!src })
  const all = Array.isArray(data) ? data : []
  // These pages list the switched-on entries by default and tuck paused ones behind "+N paused", so the badge counts what the
  // page shows. (It used to count every record: Expenses read 4 while the page showed 3 with 1 paused.)
  const pausable = PAUSABLE.has(to)
  const n = pausable ? all.filter((v: any) => v?.active !== false).length : all.length
  const paused = all.length - n
  if (!src || (n === 0 && paused === 0)) return null
  return <span className="ml-1 text-[11px] font-bold px-1.5 py-px rounded-full" title={paused > 0 ? `${n} active · ${paused} paused` : undefined}
    style={{ background: 'var(--bg-hover)', color: 'var(--text-faint)' }}>{n}</span>
}

/**
 * One tab bar over a group of related pages (Debt: Loans / Cards / I Owe / Expenses, etc.). Layout
 * route: the pages stay ordinary routes rendered through <Outlet/>, so nothing inside them changes —
 * switching tab is just navigation (React Query keeps each page's data warm, so it's instant).
 * The bar sticks to the top while a long page scrolls, and scrolls sideways on a narrow screen.
 */
export default function TabbedHub({ config }: { config: HubConfig }) {
  const tabsRef = useRef<HTMLDivElement>(null)
  // The Admin tab only for admins (same query as App's admin gate); everyone else got an "Admin access required" page.
  const { data: isAdmin = false } = useQuery({ queryKey: ['is-admin'], queryFn: checkIsAdmin, retry: false, staleTime: 60_000 })
  const tabs = config.tabs.filter(t => t.to !== '/admin' || isAdmin)
  const { pathname } = useLocation()
  // Keep the active tab visible when the bar overflows (narrow window / many tabs) — scrolls the strip only, never the page.
  useEffect(() => {
    const box = tabsRef.current; const el = box?.querySelector('[aria-current="page"]') as HTMLElement | null
    if (!box || !el) return
    const l = el.offsetLeft - box.offsetLeft, r = l + el.offsetWidth
    if (l < box.scrollLeft) box.scrollLeft = l - 8
    else if (r > box.scrollLeft + box.clientWidth) box.scrollLeft = r - box.clientWidth + 8
    edges()
  }, [pathname])
  // Fade whichever edge has more tabs beyond it: a tab cut mid-word ("ard Commitments") looked broken,
  // a fade reads as "scroll for more".
  const [fade, setFade] = useState({ l: false, r: false })
  const edges = useCallback(() => {
    const b = tabsRef.current
    if (!b) return
    const next = { l: b.scrollLeft > 2, r: b.scrollLeft + b.clientWidth < b.scrollWidth - 2 }
    setFade(f => (f.l === next.l && f.r === next.r ? f : next))
  }, [])
  useEffect(() => {
    window.addEventListener('resize', edges)
    return () => window.removeEventListener('resize', edges)
  }, [edges])
  const mask = fade.l || fade.r
    ? `linear-gradient(to right, ${fade.l ? 'transparent 0, #000 28px' : '#000 0'}, ${fade.r ? '#000 calc(100% - 28px), transparent 100%' : '#000 100%'})`
    : undefined
  return (
    <div>
      {/* Phones: every tab visible, wrapping onto a second line, and not sticky (a two-line bar pinned to the
          top would eat the screen). A sideways-scrolling strip hid up to half the tabs (Budget, Insurance,
          Payoff…) with nothing to say they were there. Tablet/desktop: one sticky row, scrolls if narrow. */}
      <div className={`print:hidden z-20 flex items-start md:items-center gap-1 -mx-2 md:-mx-4 px-2 md:px-4 py-2 md:py-0 md:sticky md:top-0`}
        style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
        <div ref={tabsRef} onScroll={edges} className="flex flex-wrap md:flex-nowrap items-center gap-1 md:gap-0.5 md:overflow-x-auto min-w-0 flex-1" style={{ scrollbarWidth: 'none', maskImage: mask, WebkitMaskImage: mask }}>
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end
              className={({ isActive }) => `text-[12px] font-semibold whitespace-nowrap flex-shrink-0 rounded-lg md:rounded-none px-2.5 py-1.5 border-0 md:border-b-2 ${tabs.length > 7 ? 'md:px-2.5' : 'md:px-4'} md:py-2.5 ${isActive ? 'bg-[var(--bg-hover)] md:bg-transparent' : ''}`}
              style={({ isActive }) => ({ color: isActive ? 'var(--text)' : 'var(--text-faint)', borderColor: isActive ? config.accent : 'transparent', marginBottom: -1 })}>
              <t.icon size={14} strokeWidth={2.2} aria-hidden className="inline-block -mt-0.5 mr-1.5" /><span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.short ?? t.label}</span><TabCount to={t.to} />
            </NavLink>
          ))}
        </div>
        {/* the active page's primary action (Add Loan, Add Card…) is portalled in here by PageHeader, so it needs no row of its own */}
        <div id="hub-action-slot" className="flex items-center gap-2 flex-shrink-0 ml-2 empty:hidden" />
        <FullScreenButton className="ml-2" />
      </div>
      <div className="pt-3"><Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense></div>
    </div>
  )
}
