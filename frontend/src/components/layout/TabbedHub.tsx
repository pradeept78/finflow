import { Suspense, useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LoadingSpinner } from '../common'
import { useQuery } from '@tanstack/react-query'
import { loansApi, cardsApi, personalEmiApi, expensesApi, savingsApi, investmentsApi, incomeApi, insuranceApi, peopleOweApi } from '../../api'
import { useUiStore } from '../../store/uiStore'
import type { HubConfig } from './hubTabs'

export function FullScreenButton({ className = '' }: { className?: string }) {
  const fullScreen = useUiStore(s => s.fullScreen)
  const toggle = useUiStore(s => s.toggleFullScreen)
  return (
    <button onClick={toggle} title={fullScreen ? 'Exit full screen (Esc)' : 'Fill the whole screen'}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap flex-shrink-0 ${className}`}
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
  const fullScreen = useUiStore(s => s.fullScreen)
  const tabsRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  // Keep the active tab visible when the bar overflows (narrow window / many tabs) — scrolls the strip only, never the page.
  useEffect(() => {
    const box = tabsRef.current; const el = box?.querySelector('[aria-current="page"]') as HTMLElement | null
    if (!box || !el) return
    const l = el.offsetLeft - box.offsetLeft, r = l + el.offsetWidth
    if (l < box.scrollLeft) box.scrollLeft = l - 8
    else if (r > box.scrollLeft + box.clientWidth) box.scrollLeft = r - box.clientWidth + 8
  }, [pathname])
  return (
    <div>
      {/* top offset clears the mobile app bar (~49px) unless full screen has hidden it */}
      <div className={`print:hidden sticky z-20 flex items-center gap-1 -mx-2 md:-mx-4 px-2 md:px-4 ${fullScreen ? 'top-0' : 'top-[49px] md:top-0'}`}
        style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
        <div ref={tabsRef} className="flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1" style={{ scrollbarWidth: 'none' }}>
          {config.tabs.map(t => (
            <NavLink key={t.to} to={t.to} end
              className={`text-[12px] font-semibold ${config.tabs.length > 7 ? "px-2.5 sm:px-2.5" : "px-3 sm:px-4"} py-2.5 whitespace-nowrap flex-shrink-0`}
              style={({ isActive }) => ({ color: isActive ? 'var(--text)' : 'var(--text-faint)', borderBottom: `2px solid ${isActive ? config.accent : 'transparent'}`, marginBottom: -1 })}>
              {t.icon} <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.short ?? t.label}</span><TabCount to={t.to} />
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
