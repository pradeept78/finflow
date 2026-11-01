/**
 * Tab definitions for the grouped "hubs". Each tab is a real route (so deep links, the sidebar's
 * sub-links and in-page navigations all keep working unchanged) — TabbedHub just draws one tab bar
 * above whichever of these pages is current.
 */
export interface HubTab { to: string; label: string; short?: string; icon: string }
export interface HubConfig { id: string; accent: string; tabs: HubTab[] }

export const OVERVIEW_HUB: HubConfig = {
  id: 'overview',
  accent: '#38bdf8',
  tabs: [
    { to: '/hub/overview', label: 'Home', icon: '🏠' },
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/master', label: 'All commitments', short: 'Commitments', icon: '📋' },
    { to: '/calendar', label: 'Calendar', icon: '📅' },
    { to: '/lookup', label: 'Quick lookup', short: 'Lookup', icon: '🔎' },
    { to: '/budget', label: 'Budget rules', short: 'Budget', icon: '🎯' },
  ],
}

export const DEBT_HUB: HubConfig = {
  id: 'debt',
  accent: '#f87171',
  tabs: [
    { to: '/hub/debt', label: 'Summary', icon: '📊' },
    { to: '/loans', label: 'Loans', icon: '🏦' },
    { to: '/cards', label: 'Credit cards', short: 'Cards', icon: '💳' },
    { to: '/personal', label: 'I Owe', icon: '🤝' },
    { to: '/expenses', label: 'Expenses', icon: '🧾' },
  ],
}

export const SAVINGS_HUB: HubConfig = {
  id: 'savings',
  accent: '#34d399',
  tabs: [
    { to: '/hub/savings', label: 'Summary', icon: '📊' },
    { to: '/income', label: 'Income', icon: '💰' },
    { to: '/savings', label: 'Savings / Chit', short: 'Savings', icon: '🐖' },
    { to: '/investments', label: 'Investments', short: 'Invest', icon: '📈' },
    { to: '/insurance', label: 'Insurance', icon: '🛡️' },
    { to: '/people-owe', label: 'People owe me', short: 'Owe me', icon: '👥' },
    { to: '/earnings', label: 'Earnings log', short: 'Earned', icon: '🧾' },
  ],
}

export const HISTORY_HUB: HubConfig = {
  id: 'history',
  accent: '#a78bfa',
  tabs: [
    { to: '/hub/history', label: 'Home', icon: '🏠' },
    { to: '/messages', label: 'Bank messages', short: 'Messages', icon: '📩' },
    { to: '/history', label: 'History', icon: '📈' },
    { to: '/closed-loans', label: 'Closed assets', short: 'Closed', icon: '📦' },
    { to: '/payoff', label: 'Payoff', icon: '🎯' },
    { to: '/break-savings', label: 'Break savings', short: 'Break', icon: '💡' },
    { to: '/export', label: 'Export', icon: '📤' },
    { to: '/admin', label: 'Admin', icon: '🛡️' },
  ],
}

export const STATEMENTS_HUB: HubConfig = {
  id: 'statements',
  accent: '#fb923c',
  tabs: [
    { to: '/statements/overview', label: 'Overview', icon: '🧭' },
    { to: '/statements/spending', label: 'Spending', icon: '🛍️' },
    { to: '/statements/people', label: 'People & merchants', short: 'People', icon: '👥' },
    { to: '/statements/accounts', label: 'Accounts & cards', short: 'Accounts', icon: '🏦' },
    { to: '/statements/transactions', label: 'Transactions', short: 'Txns', icon: '🔍' },
    { to: '/statements/ledger', label: 'Lending & loans', short: 'Lending', icon: '⇄' },
    { to: '/statements/debt-match', label: 'Debt matching', short: 'Match', icon: '🧩' },
    { to: '/statements/data', label: 'Data & imports', short: 'Data', icon: '📥' },
  ],
}

/** Routes where the full-screen toggle exists; leaving them turns full screen off (Layout). */
export const FULLSCREEN_ROUTES: string[] = [...OVERVIEW_HUB.tabs.map(t => t.to), ...DEBT_HUB.tabs.map(t => t.to), ...SAVINGS_HUB.tabs.map(t => t.to), ...HISTORY_HUB.tabs.map(t => t.to), ...STATEMENTS_HUB.tabs.map(t => t.to)]
