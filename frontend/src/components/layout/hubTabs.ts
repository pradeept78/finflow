import type { LucideIcon } from 'lucide-react'
import { Archive, ArrowLeftRight, BadgeIndianRupee, Building2, CalendarDays, CheckCircle2, Compass, Contact, CreditCard, Download, Flag, History, Home, Landmark, LayoutDashboard, LayoutGrid, ListChecks, ListFilter, Mail, PieChart, PiggyBank, Puzzle, Receipt, Scissors, ShieldCheck, ShoppingBag, Target, TrendingUp, Upload, UserCog, UserMinus, UserPlus, Wallet } from 'lucide-react'

/**
 * Tab definitions for the grouped "hubs". Each tab is a real route (so deep links, the sidebar's
 * sub-links and in-page navigations all keep working unchanged) — TabbedHub just draws one tab bar
 * above whichever of these pages is current.
 */

/** `icon`: a line icon, the same set as the sidebar and bottom bar. One per page, none repeated within a
 *  section (the emoji had 📊 three times, 🏠 🎯 📈 🛡️ 👥 🧾 🏦 twice each, and 📅 next to "📅 Look ahead"). */
export interface HubTab { to: string; label: string; short?: string; icon: LucideIcon }
export interface HubConfig { id: string; accent: string; tabs: HubTab[] }

export const OVERVIEW_HUB: HubConfig = {
  id: 'overview',
  accent: '#38bdf8',
  tabs: [
    { to: '/hub/overview', label: 'Home', icon: Home },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/master', label: 'All commitments', short: 'Commitments', icon: ListChecks },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/lookup', label: 'Quick lookup', short: 'Lookup', icon: CheckCircle2 },
    { to: '/budget', label: 'Budget rules', short: 'Budget', icon: Target },
  ],
}

export const DEBT_HUB: HubConfig = {
  id: 'debt',
  accent: '#f87171',
  tabs: [
    { to: '/hub/debt', label: 'Summary', icon: PieChart },
    { to: '/loans', label: 'Loans', icon: Landmark },
    { to: '/cards', label: 'Credit cards', short: 'Cards', icon: CreditCard },
    { to: '/personal', label: 'I Owe', icon: UserMinus },
    { to: '/expenses', label: 'Expenses', icon: Receipt },
  ],
}

export const SAVINGS_HUB: HubConfig = {
  id: 'savings',
  accent: '#34d399',
  tabs: [
    { to: '/hub/savings', label: 'Summary', icon: PieChart },
    { to: '/income', label: 'Income', icon: Wallet },
    { to: '/savings', label: 'Savings / Chit', short: 'Savings', icon: PiggyBank },
    { to: '/investments', label: 'Investments', short: 'Invest', icon: TrendingUp },
    { to: '/insurance', label: 'Insurance', icon: ShieldCheck },
    { to: '/people-owe', label: 'People owe me', short: 'Owe me', icon: UserPlus },
    { to: '/earnings', label: 'Earnings log', short: 'Earned', icon: BadgeIndianRupee },
  ],
}

export const HISTORY_HUB: HubConfig = {
  id: 'history',
  accent: '#a78bfa',
  tabs: [
    { to: '/hub/history', label: 'Home', icon: LayoutGrid },
    { to: '/messages', label: 'Bank messages', short: 'Messages', icon: Mail },
    { to: '/history', label: 'History', icon: History },
    { to: '/closed-loans', label: 'Closed assets', short: 'Closed', icon: Archive },
    { to: '/payoff', label: 'Payoff', icon: Flag },
    { to: '/break-savings', label: 'Break savings', short: 'Break', icon: Scissors },
    { to: '/export', label: 'Export', icon: Download },
    { to: '/admin', label: 'Admin', icon: UserCog },
  ],
}

export const STATEMENTS_HUB: HubConfig = {
  id: 'statements',
  accent: '#fb923c',
  tabs: [
    { to: '/statements/overview', label: 'Overview', icon: Compass },
    { to: '/statements/spending', label: 'Spending', icon: ShoppingBag },
    { to: '/statements/people', label: 'People & merchants', short: 'People', icon: Contact },
    { to: '/statements/accounts', label: 'Accounts & cards', short: 'Accounts', icon: Building2 },
    { to: '/statements/transactions', label: 'Transactions', short: 'Txns', icon: ListFilter },
    { to: '/statements/ledger', label: 'Lending & loans', short: 'Lending', icon: ArrowLeftRight },
    { to: '/statements/debt-match', label: 'Debt matching', short: 'Match', icon: Puzzle },
    { to: '/statements/data', label: 'Data & imports', short: 'Data', icon: Upload },
  ],
}

/** Routes where the full-screen toggle exists; leaving them turns full screen off (Layout). */
export const FULLSCREEN_ROUTES: string[] = [...OVERVIEW_HUB.tabs.map(t => t.to), ...DEBT_HUB.tabs.map(t => t.to), ...SAVINGS_HUB.tabs.map(t => t.to), ...HISTORY_HUB.tabs.map(t => t.to), ...STATEMENTS_HUB.tabs.map(t => t.to)]
