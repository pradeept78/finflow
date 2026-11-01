import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import {
  Search, LayoutDashboard, BarChart2, CreditCard, Landmark, DollarSign,
  PieChart,
  Sun, Moon,
  PiggyBank, TrendingUp, Wallet, Receipt, Users,
  Calendar, Target, CheckCircle2, LogOut, ChevronRight,
  Archive, History, Menu, X, Shield, BadgeDollarSign, FileSpreadsheet,
  Plus, Keyboard, ListTree, PanelTop, Home, MoreHorizontal, HelpCircle
} from 'lucide-react'
import { Suspense, useState, useEffect, useRef } from 'react'
import { LoadingSpinner } from '../common'
import { PAGE_LABELS } from '../../utils/pageLabels'
import QuickAdd from '../global/QuickAdd'
import IntroTour from '../global/IntroTour'
import { PageHelpButton, openIntro } from '../common/PageHelp'
import GlobalSearch from '../global/GlobalSearch'
import { useDueNotifications } from '../../hooks/useDueNotifications'
import { useThemeStore } from '../../store/themeStore'
import { useUiStore } from '../../store/uiStore'
import { FULLSCREEN_ROUTES, OVERVIEW_HUB, HISTORY_HUB, STATEMENTS_HUB, type HubTab } from './hubTabs'
import { checkIsAdmin } from '../../api/adminCheck'
import { useShortcuts, GO_SHORTCUTS } from '../../hooks/useShortcuts'


const hubNav = [
  {
    hub: '/hub/overview',
    label: 'Overview',
    icon: LayoutDashboard,
    accent: '#38bdf8',
    pages: ['/dashboard','/budget','/lookup','/master','/calendar'],
  },
  {
    hub: '/hub/debt',
    label: 'Debt',
    icon: Landmark,
    accent: '#f87171',
    pages: ['/loans','/cards','/personal','/expenses'],
  },
  {
    hub: '/hub/savings',
    label: 'Savings & income',
    icon: PiggyBank,
    accent: '#34d399',
    pages: ['/savings','/investments','/income','/earnings','/insurance','/people-owe'],
  },
  {
    hub: '/hub/history',
    label: 'History & tools',
    icon: History,
    accent: '#a78bfa',
    pages: ['/messages','/closed-loans','/payoff','/history','/break-savings','/export','/admin'],
  },
  {
    hub: '/statements/overview',
    label: 'Statements',
    icon: FileSpreadsheet,
    accent: '#fb923c',
    pages: ['/statements/overview','/statements/spending','/statements/people','/statements/accounts','/statements/transactions','/statements/ledger','/statements/data','/statements/debt-match'],
  },
]

const PAGE_LINK_LABELS: Record<string,string> = {
  '/closed-loans':'Closed assets','/earnings':'Earnings','/payoff':'Payoff','/history':'History','/break-savings':'Break savings','/export':'Export','/admin':'Admin','/account':'Your account','/messages':'Bank messages',
  '/statements/overview':'Overview','/statements/spending':'Spending','/statements/people':'People & Merchants',
  '/statements/accounts':'Accounts & Cards','/statements/transactions':'Transactions','/statements/ledger':'Lending & Loans',
  '/statements/data':'Data & Imports','/statements/debt-match':'Debt matching',
}
const TABBED_HUBS = ['/hub/overview','/hub/debt','/hub/savings','/hub/history','/statements/overview']

export default function Layout() {
  const isAdmin = useAuthStore(s => s.user?.role === 'ADMIN')
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Full screen hides the shell chrome (sidebar, mobile bar, quick-add). Esc and the browser's own
  // fullscreen exit both leave it, and so does navigating to a page with no toggle (otherwise there'd
  // be no visible way out). Moving between tabs of the same hub keeps it on.
  const fullScreen = useUiStore(s => s.fullScreen)
  const navLayout = useUiStore(s => s.navLayout)
  const setNavLayout = useUiStore(s => s.setNavLayout)
  const navSubLinks = useUiStore(s => s.navSubLinks)
  const setNavSubLinks = useUiStore(s => s.setNavSubLinks)
  const topNav = navLayout === 'top'
  const setFullScreen = useUiStore(s => s.setFullScreen)
  useEffect(() => {
    if (!fullScreen) { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); return }
    document.documentElement.requestFullscreen?.().catch(() => { /* hiding the chrome alone is fine */ })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullScreen(false) }
    const onFs = () => { if (!document.fullscreenElement) setFullScreen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs) }
  }, [fullScreen, setFullScreen])
  useEffect(() => { if (fullScreen && !FULLSCREEN_ROUTES.includes(location.pathname)) setFullScreen(false) }, [location.pathname, fullScreen, setFullScreen])

  // Remember the last page visited inside each section, so clicking "Debt" reopens the tab you were
  // on (Cards, say) rather than always the Summary. Clicking a section you're already inside goes to its Summary.
  const LAST_KEY = 'finflow.lastPage.'
  const sectionOf = (path: string) => hubNav.find(sec => path === sec.hub || sec.pages.some(p => path.startsWith(p)))
  useEffect(() => {
    const sec = sectionOf(location.pathname)
    if (sec) { try { localStorage.setItem(LAST_KEY + sec.hub, location.pathname) } catch { /* private mode */ } }
  }, [location.pathname])
  const goSection = (section: typeof hubNav[number]) => {
    const inside = sectionOf(location.pathname)?.hub === section.hub
    let last = ''
    try { last = localStorage.getItem(LAST_KEY + section.hub) || '' } catch { /* ignore */ }
    const valid = last && (last === section.hub || section.pages.some(p => last.startsWith(p)))
    navigate(!inside && valid ? last : section.hub)
  }
  const [showKeys, setShowKeys] = useState(false)
  const canFullScreen = FULLSCREEN_ROUTES.includes(location.pathname)
  useShortcuts({ go: to => navigate(to), toggleFullScreen: () => setFullScreen(!fullScreen), canFullScreen, toggleHelp: () => setShowKeys(v => !v), closeHelp: () => setShowKeys(false) })

  const navRef = useRef<HTMLElement>(null)

  const fullNav = hubNav

  // Scroll main to top on route change only
  const prevPath = useRef(location.pathname)
  const savedNavScroll = useRef(0)
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      document.getElementById('main-content')?.scrollTo({ top: 0 })
      prevPath.current = location.pathname
    }
  }, [location.pathname])

  // Restore sidebar scroll on every render (React Query refetches cause re-renders)
  useEffect(() => {
    if (navRef.current && savedNavScroll.current > 0) {
      navRef.current.scrollTop = savedNavScroll.current
    }
  })

  const handleNavClick = () => { setMobileOpen(false) }
  const handleLogout = () => { logout(); navigate('/login') }
  useDueNotifications()
  const { dark, toggle: toggleTheme } = useThemeStore()

  const FootBtn = ({ title, onClick, active, hideOnMobile, children }: { title: string; onClick: () => void; active?: boolean; hideOnMobile?: boolean; children: React.ReactNode }) => (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={active}
      className={`${hideOnMobile ? 'hidden md:flex' : 'flex'} w-9 h-9 items-center justify-center rounded-lg transition-colors text-[#aab2c2] hover:text-[#eef0f6] hover:bg-[#262a38]`}
      style={active ? { background: 'rgba(52,211,153,0.15)', color: '#6ee7b7' } : undefined}>
      {children}
    </button>
  )

  const SidebarContent = () => {
  // Full screen shows the sidebar as a slim icon rail instead of hiding it, so navigation stays one click away.
  const col = collapsed || fullScreen
  return (
    <>
      <div className={`relative flex items-center gap-2.5 ${col && !mobileOpen ? 'justify-center px-2' : 'px-4'} h-16 border-b flex-shrink-0`} style={{borderColor:'#252836'}}>
        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0" style={{boxShadow:'0 6px 14px -6px rgba(249,115,22,.6)'}}>
          <span className="text-white font-black text-base">F</span>
        </div>
        {(!col || mobileOpen) && (
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-[#eef0f6] leading-none tracking-tight">FinFlow</div>
            <div className="text-[11px] text-[#8c96a9] mt-1">Personal finance</div>
          </div>
        )}
        {/* In the slim rail there is no room beside the logo, so the expand arrow sits on the sidebar's edge as a small round tab instead of spilling over the border. */}
        <button onClick={() => { setCollapsed(c => !c); setMobileOpen(false) }} title={col ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={col ? 'Expand sidebar' : 'Collapse sidebar'}
          className={col && !mobileOpen
            ? `${fullScreen ? 'hidden' : 'hidden md:flex'} absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 w-5 h-5 rounded-full items-center justify-center text-[#aab2c2] hover:text-[#eef0f6]`
            : `ml-auto w-7 h-7 rounded-lg items-center justify-center text-[#8c96a9] hover:text-[#eef0f6] hover:bg-[#262a38] ${fullScreen ? 'hidden' : 'hidden md:flex'}`}
          style={col && !mobileOpen ? { background: '#0c0e14', border: '1px solid #252836' } : undefined}>
          <ChevronRight size={14} className={`transition-transform ${col ? '' : 'rotate-180'}`} />
        </button>
        <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="ml-auto text-[#8c96a9] hover:text-[#eef0f6] md:hidden">
          <X size={18} />
        </button>
      </div>

      <nav ref={navRef} onScroll={() => { if (navRef.current) savedNavScroll.current = navRef.current.scrollTop }} className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4 overscroll-contain" style={{scrollbarColor:"#2a2d3a #0c0e14",scrollbarWidth:"thin"}}>
        {(!col || mobileOpen) && (
          <div className="px-1 mb-2">
            <GlobalSearch />
          </div>
        )}
        {!mobileOpen && (
          <div className={col ? 'flex justify-center' : 'px-1'}>
            <button onClick={() => window.dispatchEvent(new Event('ff:quick-add'))} title="Quick add — spend, EMI, expense, loan, savings, insurance, income…" aria-label="Quick add"
              className={`hidden md:flex items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[.98] ${col ? 'w-10 h-10' : 'w-full py-2.5'}`}
              style={{ background: '#c2410c', boxShadow: '0 6px 14px -8px rgba(249,115,22,.7)' }}>
              <Plus size={col ? 18 : 16} strokeWidth={2.5} />{!col && <span>Quick add</span>}
            </button>
          </div>
        )}
        <div className="space-y-1">
          {fullNav.map(section => {
            const isActive = location.pathname === section.hub || section.pages.some(p => location.pathname.startsWith(p))
            const isOnHub  = location.pathname === section.hub
            return (
              <div key={section.hub}>
                {/* Section button */}
                <button title={section.label}
                  onClick={() => { goSection(section); handleNavClick() }}
                  className={`w-full flex items-center ${col && !mobileOpen ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm font-semibold transition-all`}
                  style={{
                    background: isActive ? `${section.accent}18` : 'transparent',
                    color: isActive ? section.accent : '#aab2c2',
                    borderLeft: isActive ? `3px solid ${section.accent}` : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#252836' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ background: isActive ? `${section.accent}22` : 'rgba(255,255,255,0.04)' }}>
                    <section.icon size={16} />
                  </span>
                  {(!col || mobileOpen) && <span className="text-left leading-tight">{section.label}</span>}
                </button>

                {/* Sub-pages when inside this section */}
                {/* Every group has a tab bar, so by default the sidebar stays one row per group. "Pages in menu" (sidebar footer, remembered per browser) lists each group's pages here too for anyone who prefers it. */}
                {isActive && !col && (navSubLinks || !TABBED_HUBS.includes(section.hub)) && (
                  <div className="ml-4 mt-1 space-y-0.5 pl-3 border-l" style={{borderColor:`${section.accent}30`}}>
                    {section.pages.map(p => {
                      const labels: Record<string,string> = {
                        '/dashboard':'Dashboard','/budget':'Budget rules',
                        '/lookup':'Due this month','/master':'All commitments','/calendar':'Calendar',
                        '/loans':'Loans','/cards':'Credit cards','/personal':'I Owe','/expenses':'Expenses',
                        '/savings':'Savings / Chit','/investments':'Investments','/income':'Income',
                        '/insurance':'Insurance','/people-owe':'People owe me',
                        '/closed-loans':'Closed assets','/closed-assets':'Closed assets','/earnings':'Earnings','/payoff':'Payoff',
                        '/history':'History','/break-savings':'Break savings','/export':'Export','/admin':'Admin','/account':'Your account','/messages':'Bank messages',
                        '/statements/overview':'Overview','/statements/spending':'Spending','/statements/people':'People & Merchants',
                        '/statements/accounts':'Accounts & Cards','/statements/transactions':'Transactions',
                        '/statements/ledger':'Lending & Loans','/statements/data':'Data & Imports',
                        '/statements/debt-match':'Debt matching',
                      }
                      if (!labels[p]) return null
                      // admin link always shown - AdminRoute handles access control
                      const isCurrent = location.pathname === p
                      return (
                        <NavLink key={p} to={p}
                          onClick={e => { if (location.pathname === p) e.preventDefault(); handleNavClick() }}
                          className="block px-2 py-1.5 rounded-lg text-xs transition-colors"
                          style={{color:isCurrent?section.accent:'#aab2c2',background:isCurrent?`${section.accent}15`:'transparent',fontWeight:isCurrent?600:400}}>
                          {labels[p]}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      <div className="border-t p-3 space-y-2.5 flex-shrink-0" style={{borderColor:"#252836"}}>
        {/* Preferences as one tidy row of icon buttons (tooltips say what each does) instead of four text rows. */}
        <div className={`flex ${col && !mobileOpen ? 'flex-col items-center' : 'items-center justify-between'} gap-1`}>
          <FootBtn title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
            {dark ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} className="text-blue-400" />}
          </FootBtn>
          {!mobileOpen && <FootBtn title="Keyboard shortcuts (press ?)" onClick={() => setShowKeys(true)} hideOnMobile><Keyboard size={16} /></FootBtn>}
          {!mobileOpen && <FootBtn title="How FinFlow works" onClick={openIntro} hideOnMobile><HelpCircle size={16} /></FootBtn>}
          {!mobileOpen && !col && (
            <FootBtn title={navSubLinks ? 'Pages are listed under each group — click to hide them (the tabs stay)' : "Also list each group's pages under it in this menu"}
              onClick={() => setNavSubLinks(!navSubLinks)} active={navSubLinks} hideOnMobile><ListTree size={16} /></FootBtn>
          )}
          {!mobileOpen && <FootBtn title="Show the menu as a bar across the top" onClick={() => setNavLayout('top')} hideOnMobile><PanelTop size={16} /></FootBtn>}
        </div>
        <div className={`flex items-center ${col && !mobileOpen ? 'flex-col gap-1.5' : 'gap-2.5'} rounded-xl ${col && !mobileOpen ? 'p-1 py-2' : 'px-2.5 py-2'}`} style={{ background: 'rgba(255,255,255,0.04)' }}>
          {/* Avatar and name open the account page (change password, delete account). */}
          <NavLink to="/account" onClick={handleNavClick} aria-label="Your account"
            title={col && !mobileOpen ? `Your account · ${user?.email ?? ''}` : 'Your account'}
            className={`flex items-center min-w-0 rounded-lg hover:bg-white/5 transition-colors ${col && !mobileOpen ? 'justify-center' : 'gap-2.5 flex-1 -m-1 p-1'}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
              style={{ background: 'rgba(249,115,22,.18)', color: '#fb923c', border: '1px solid rgba(249,115,22,.3)' }}>
              {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
            </div>
            {(!col || mobileOpen) && (
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[#eef0f6] truncate leading-tight">{user?.name}</div>
                <div className="text-[11px] text-[#8c96a9] truncate">{user?.email}</div>
              </div>
            )}
          </NavLink>
          <button onClick={handleLogout} title="Log out" aria-label="Log out"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#aab2c2] hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  )
  }

  // ── Phone "More" sheet ──
  // Its own layout, not the desktop sidebar squeezed in: the sidebar listed Overview / Debt / Savings again
  // (already the bottom tabs) and hid the pages people open More for (Payoff, Bank messages, Export, the
  // Statements pages) one level down. Here every page is a tile, grouped, plus search, theme and account.
  const { data: isAdminUser = false } = useQuery({ queryKey: ['is-admin'], queryFn: checkIsAdmin, retry: false, staleTime: 60_000 })
  const moreGroups: { label: string; accent: string; tabs: HubTab[] }[] = [
    { label: 'Overview', accent: '#38bdf8', tabs: OVERVIEW_HUB.tabs.filter(t => ['/dashboard', '/master', '/calendar', '/budget'].includes(t.to)) },
    { label: 'History & tools', accent: '#a78bfa', tabs: HISTORY_HUB.tabs.filter(t => t.to !== '/hub/history' && (t.to !== '/admin' || isAdminUser)) },
    { label: 'Statements', accent: '#fb923c', tabs: STATEMENTS_HUB.tabs },
  ]
  const MoreSheet = () => (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[15px] font-semibold text-[#eef0f6]">More</span>
        <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="w-8 h-8 flex items-center justify-center rounded-lg text-[#aab2c2] hover:bg-white/5"><X size={18} /></button>
      </div>
      <div className="px-4 pb-2"><GlobalSearch /></div>
      <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-4 overscroll-contain">
        {moreGroups.map(g => (
          <section key={g.label}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#8c96a9' }}>{g.label}</div>
            {/* explicit 4 columns: index.css turns .grid-cols-4 into 2 on phones (for KPI rows) */}
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
              {g.tabs.map(t => {
                const on = location.pathname === t.to
                return (
                  <NavLink key={t.to} to={t.to} onClick={handleNavClick}
                    className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center transition-colors"
                    style={{ background: on ? `${g.accent}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? `${g.accent}55` : 'transparent'}` }}>
                    <t.icon size={20} strokeWidth={2} style={{ color: g.accent }} aria-hidden />
                    <span className="text-[11px] font-medium leading-tight" style={{ color: on ? '#eef0f6' : '#c3cad6' }}>{t.short ?? t.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="px-4 pt-2 pb-3 space-y-2 border-t" style={{ borderColor: '#252836' }}>
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
          <button onClick={toggleTheme} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {dark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-400" />}
            <span className="text-[13px] font-medium text-[#eef0f6]">{dark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button onClick={() => { setMobileOpen(false); openIntro() }} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <HelpCircle size={18} className="text-sky-400" />
            <span className="text-[13px] font-medium text-[#eef0f6]">How it works</span>
          </button>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <NavLink to="/account" onClick={handleNavClick} aria-label="Your account" className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
              style={{ background: 'rgba(249,115,22,.18)', color: '#fb923c', border: '1px solid rgba(249,115,22,.3)' }}>
              {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#eef0f6] truncate leading-tight">{user?.name}</div>
              <div className="text-[11px] text-[#8c96a9] truncate">Your account · {user?.email}</div>
            </div>
          </NavLink>
          <button onClick={handleLogout} aria-label="Log out" title="Log out" className="w-9 h-9 flex items-center justify-center rounded-lg text-[#aab2c2] hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  )

  // Desktop top-bar navigation (alternative to the sidebar). Hubs with their own tab bar need no second
  // row; History & Tools and Statements show their pages as a sub-row, as the sidebar does for them.
  const activeSection = fullNav.find(sec => location.pathname === sec.hub || sec.pages.some(p => location.pathname.startsWith(p)))
  const subPages = activeSection && (navSubLinks || !TABBED_HUBS.includes(activeSection.hub)) ? activeSection.pages.filter(p => PAGE_LINK_LABELS[p]) : []
  const TopNav = () => (
    <header className="hidden md:block flex-shrink-0 border-b print:hidden" style={{ background: '#0c0e14', borderColor: '#252836' }}>
      <div className="flex items-center gap-2 px-4 h-12">
        <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0"><span className="text-white font-black text-xs">F</span></div>
        {!fullScreen && <span className="font-bold text-[#eef0f6] mr-3">FinFlow</span>}
        <nav className="flex items-center gap-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {fullNav.map(section => {
            const isActive = activeSection?.hub === section.hub
            return (
              <button key={section.hub} title={section.label} onClick={() => goSection(section)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors"
                style={{ background: isActive ? `${section.accent}18` : 'transparent', color: isActive ? section.accent : '#aab2c2' }}>
                <section.icon size={fullScreen ? 18 : 15} className="flex-shrink-0" />{!fullScreen && section.label}
              </button>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {!fullScreen && <div className="w-56"><GlobalSearch /></div>}
          <button onClick={toggleTheme} className="p-1.5 rounded-lg hover:bg-[#262a38] transition-colors" title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun size={14} className="text-yellow-400" /> : <Moon size={14} className="text-blue-400" />}
          </button>
          <button onClick={() => setShowKeys(true)} title="Keyboard shortcuts (press ?)" className="w-7 h-7 rounded-lg text-[12px] font-bold text-[#aab2c2] hover:text-[#eef0f6] hover:bg-[#262a38] transition-colors">?</button>
          <button onClick={() => setNavLayout('side')} title="Show the menu as a sidebar on the left"
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            ⤙ Sidebar
          </button>
          <NavLink to="/account" title="Your account" aria-label="Your account"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
            style={{ background: 'rgba(249,115,22,.18)', color: '#fb923c', border: '1px solid rgba(249,115,22,.3)' }}>
            {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
          </NavLink>
          <button onClick={handleLogout} title={`Log out ${user?.email ?? ''}`} className="p-1.5 rounded-lg text-[#aab2c2] hover:text-red-400 hover:bg-red-500/10 transition-colors"><LogOut size={15} /></button>
        </div>
      </div>
      {subPages.length > 0 && (
        <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {subPages.map(p => {
            const cur = location.pathname === p
            return (
              <NavLink key={p} to={p} className="px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors"
                style={{ color: cur ? activeSection!.accent : '#aab2c2', background: cur ? `${activeSection!.accent}15` : 'transparent', fontWeight: cur ? 600 : 400 }}>
                {PAGE_LINK_LABELS[p]}
              </NavLink>
            )
          })}
        </div>
      )}
    </header>
  )

  return (
    <div id="app-shell" className="flex flex-col h-screen overflow-hidden bg-[var(--bg-base)]">
      {topNav && TopNav()}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Desktop sidebar — print:hidden so a printed/PDF-exported page (see AllCommitmentsPage's
          Print button) shows just the content, not the nav chrome around it. */}
      <aside className={`${topNav ? 'hidden' : 'hidden md:flex'} flex-col bg-[#0c0e14] border-r border-[var(--border)] transition-all duration-300 ${collapsed || fullScreen ? 'w-16' : 'w-52'} flex-shrink-0 h-full print:hidden`}> 
        <SidebarContent />
      </aside>

      {/* Phone "More" sheet: the full menu (every section and page, search, theme, sign out) sliding up
          from the bottom tab bar. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          {/* Sits on top of the bottom tab bar (h-14 + safe area, drawn above this sheet) rather than under it,
              which used to hide the user card at the bottom: account link and Log out. */}
          <aside aria-label="Menu" className="sheet-up absolute inset-x-0 rounded-t-2xl border-t flex flex-col"
            style={{background:'#0c0e14',borderColor:'#252836',bottom:'calc(3.5rem + env(safe-area-inset-bottom))',maxHeight:'calc(85vh - 3.5rem)'}}>
            <MoreSheet />
          </aside>
        </div>
      )}

      {/* Main */}
      <main id="main-content" className="flex-1 overflow-y-auto">
        <h1 className="sr-only">{(PAGE_LABELS as Record<string, string>)[location.pathname] ?? 'FinFlow'}</h1>
        {/* Mobile top bar */}
        {/* Exactly 49px (border included): TabbedHub's tab strip sticks at top-[49px] right under it. At ~45px
            content scrolled through the gap between the two. */}
        {/* Phones keep the top bar and bottom tabs even in full screen (a desktop mode): without them there was no way to move around. */}
        {<div className="md:hidden flex items-center gap-2.5 px-4 h-[49px] border-b bg-[#0c0e14] sticky top-0 z-30 print:hidden" style={{borderColor:"#252836"}}>
          <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center">
            <span className="text-white font-black text-xs">F</span>
          </div>
          <span className="font-semibold text-sm text-[#eef0f6] truncate">
            {(PAGE_LABELS as Record<string, string>)[location.pathname] ?? 'FinFlow'}
          </span>
          {/* ⓘ: what this page shows and what its terms mean (utils/pageHelp). */}
          <PageHelpButton dark className="-ml-1.5" />
          {/* The page's main action (Add loan, Add card…) lands here on phones — see PageHeader. Compact so it fits the bar. */}
          <div id="phone-action-slot" className="ml-auto flex items-center gap-2 flex-shrink-0 empty:hidden [&_button]:!py-1.5 [&_button]:!px-3 [&_button]:!text-[12px] [&_button]:!min-h-0" />
        </div>}

        {/* Phones: room at the bottom for the tab bar (and the iPhone home indicator) */}
        <div className="p-2 md:p-4 pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-14 w-full">
          <Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense>
        </div>
      </main>
      </div>

      {showKeys && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 print:hidden" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowKeys(false)}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">Keyboard shortcuts</div>
              <button onClick={() => setShowKeys(false)} className="text-[#aab2c2] hover:text-[#eef0f6]"><X size={16} /></button>
            </div>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>Press <kbd className="px-1 rounded" style={{ background: 'var(--bg-hover)' }}>g</kbd> then a key to jump. <kbd className="px-1 rounded" style={{ background: 'var(--bg-hover)' }}>f</kbd> toggles full screen on tabbed pages. <kbd className="px-1 rounded" style={{ background: 'var(--bg-hover)' }}>⌘K</kbd> searches.</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
              {GO_SHORTCUTS.map(k => (
                <div key={k.key} className="flex items-center gap-2">
                  <kbd className="text-[11px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>g {k.key}</kbd>
                  <span className="truncate">{k.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Phone bottom tab bar — the main sections under your thumb. Sidebar colours are fixed values on purpose
          (the nav is dark in both themes). Debt and Savings reopen the tab you were last on, like the sidebar. */}
      {(() => {
        const p = location.pathname
        const sec = sectionOf(p)?.hub
        const tabs = [
          { key: 'home',    label: 'Home',    icon: Home,           accent: '#38bdf8', active: sec === '/hub/overview' && p !== '/lookup', go: () => navigate('/hub/overview') },
          { key: 'due',     label: 'Due',     icon: CheckCircle2,   accent: '#fb923c', active: p === '/lookup',                          go: () => navigate('/lookup') },
          // The add button sits in the middle of the bar (it used to float over the content, covering amounts).
          { key: 'add',     label: 'Add',     icon: Plus,           accent: '#fb923c', active: false,                                    go: () => window.dispatchEvent(new Event('ff:quick-add')) },
          { key: 'debt',    label: 'Debt',    icon: Landmark,       accent: '#f87171', active: sec === '/hub/debt',                      go: () => goSection(hubNav[1]) },
          { key: 'savings', label: 'Savings', icon: PiggyBank,      accent: '#34d399', active: sec === '/hub/savings',                   go: () => goSection(hubNav[2]) },
          { key: 'more',    label: 'More',    icon: MoreHorizontal, accent: '#a78bfa', active: mobileOpen || sec === '/hub/history' || sec === '/statements/overview', go: () => setMobileOpen(o => !o) },
        ]
        return (
          <nav aria-label="Sections" className="md:hidden fixed inset-x-0 bottom-0 z-[60] border-t flex print:hidden"
            style={{ background: '#0c0e14', borderColor: '#252836', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {tabs.map(t => {
              const Icon = t.icon
              if (t.key === 'add') return (
                <button key="add" onClick={() => { setMobileOpen(false); t.go() }} aria-label="Quick add"
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium" style={{ color: '#aab2c2' }}>
                  {/* The + says it all — no "Add" label under it. Sized to sit within the bar like the other tabs. */}
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: '#c2410c' }}>
                    <Icon size={20} strokeWidth={2.6} />
                  </span>
                </button>
              )
              return (
                <button key={t.key} onClick={() => { if (t.key !== 'more') setMobileOpen(false); t.go() }}
                  aria-current={t.active && t.key !== 'more' ? 'page' : undefined} aria-expanded={t.key === 'more' ? mobileOpen : undefined}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium"
                  style={{ color: t.active ? t.accent : '#aab2c2' }}>
                  <Icon size={21} strokeWidth={t.active ? 2.4 : 2} />
                  {t.label}
                </button>
              )
            })}
          </nav>
        )
      })()}

      {/* Always mounted: the sidebar's "+" fires an event this component listens for, so unmounting it in
          full screen made that button do nothing. Only its floating button is hidden there. */}
      <div className="print:hidden">
        <QuickAdd sidebarTrigger={!topNav} hideTrigger={fullScreen} />
        <IntroTour />
      </div>
    </div>
  )
}
