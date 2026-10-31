import { lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import { checkIsAdmin } from './api/adminCheck'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
const QuickLookupPage = lazy(() => import('./pages/QuickLookupPage'))
const MasterTablePage = lazy(() => import('./pages/MasterTablePage'))
import TabbedHub from './components/layout/TabbedHub'
import { OVERVIEW_HUB, DEBT_HUB, SAVINGS_HUB, HISTORY_HUB, STATEMENTS_HUB } from './components/layout/hubTabs'
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LoansPage = lazy(() => import('./pages/LoansPage'))
const CreditCardsPage = lazy(() => import('./pages/CreditCardsPage'))
const PersonalEmiPage = lazy(() => import('./pages/PersonalEmiPage'))
const SavingsPage = lazy(() => import('./pages/SavingsPage'))
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'))
const InsurancePage = lazy(() => import('./pages/InsurancePage'))
const IncomePage = lazy(() => import('./pages/IncomePage'))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))
const PeopleOwePage = lazy(() => import('./pages/PeopleOwePage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const PayoffPage = lazy(() => import('./pages/PayoffPage'))
const BreakSavingsPage = lazy(() => import('./pages/BreakSavingsPage'))
const ClosedLoansPage = lazy(() => import('./pages/ClosedLoansPage'))
const BudgetRulesPage = lazy(() => import('./pages/BudgetRulesPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const ExportPage = lazy(() => import('./pages/ExportPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const EarningsPage = lazy(() => import('./pages/EarningsPage'))
const HubPage = lazy(() => import('./pages/HubPage'))
const StatementsOverviewPage = lazy(() => import('./pages/statements/StatementsOverviewPage'))
const StatementsSpendingPage = lazy(() => import('./pages/statements/StatementsSpendingPage'))
const StatementsPeoplePage = lazy(() => import('./pages/statements/StatementsPeoplePage'))
const StatementsAccountsPage = lazy(() => import('./pages/statements/StatementsAccountsPage'))
const StatementsTransactionsPage = lazy(() => import('./pages/statements/StatementsTransactionsPage'))
const StatementsLedgerPage = lazy(() => import('./pages/statements/StatementsLedgerPage'))
const StatementsDataPage = lazy(() => import('./pages/statements/StatementsDataPage'))
const StatementsDebtMatchPage = lazy(() => import('./pages/statements/StatementsDebtMatchPage'))

function AdminRoute() {
  const cachedRole = useAuthStore(s => s.user?.role)
  const setRole = useAuthStore(s => s.setRole)

  // The server is the source of truth. Checking it here means a role granted in the
  // database takes effect on refresh, instead of only after a full logout/login cycle.
  const { data: serverIsAdmin, isLoading, isError } = useQuery({
    queryKey: ['is-admin'],
    queryFn: checkIsAdmin,
    retry: false,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (serverIsAdmin !== undefined) setRole(serverIsAdmin ? 'ADMIN' : 'USER')
  }, [serverIsAdmin, setRole])

  // Fall back to the cached role only while the request is in flight or if it failed.
  const isAdmin = serverIsAdmin ?? (cachedRole === 'ADMIN')

  if (isLoading && cachedRole !== 'ADMIN') return (
    <div className="p-8 text-center text-sm" style={{color:'var(--text-faint)'}}>Checking access…</div>
  )

  if (!isAdmin) return (
    <div className="p-8 text-center space-y-3">
      <div style={{color:'#f87171',fontSize:'3rem'}}>🔒</div>
      <div className="text-xl font-bold">Admin access required</div>
      <div style={{color:'var(--text-faint)'}} className="text-sm">
        This page is limited to administrator accounts.
        {isError && <><br/>Could not reach the server to verify your access — try refreshing.</>}
      </div>
    </div>
  )
  return <AdminPage />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated())
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<ErrorBoundary label="//login"><LoginPage /></ErrorBoundary>} />
        <Route path="/register" element={<ErrorBoundary label="//register"><RegisterPage /></ErrorBoundary>} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          {/* Landing page: All Commitments (/master) — the closing/EMI planner is what gets opened first. */}
          <Route index element={<Navigate to="/master" replace />} />
          <Route path="commitments" element={<Navigate to="/master" replace />} />
          {/* Tabbed hubs: layout routes that draw one tab bar (+ full-screen toggle) over the group's
              pages. The pages and their URLs are unchanged — each tab is still its own route. */}
          <Route element={<TabbedHub config={OVERVIEW_HUB} />}>
            <Route path="lookup" element={<ErrorBoundary label="/lookup"><QuickLookupPage /></ErrorBoundary>} />
            <Route path="master" element={<ErrorBoundary label="/master"><MasterTablePage /></ErrorBoundary>} />
            <Route path="dashboard" element={<ErrorBoundary label="/dashboard"><DashboardPage /></ErrorBoundary>} />
            <Route path="calendar" element={<ErrorBoundary label="/calendar"><CalendarPage /></ErrorBoundary>} />
            <Route path="budget" element={<ErrorBoundary label="/budget"><BudgetRulesPage /></ErrorBoundary>} />
            <Route path="hub/overview" element={<ErrorBoundary label="/hub/overview"><HubPage section="overview" /></ErrorBoundary>} />
          </Route>
          <Route element={<TabbedHub config={DEBT_HUB} />}>
            <Route path="loans" element={<ErrorBoundary label="/loans"><LoansPage /></ErrorBoundary>} />
            <Route path="cards" element={<ErrorBoundary label="/cards"><CreditCardsPage /></ErrorBoundary>} />
            <Route path="personal" element={<ErrorBoundary label="/personal"><PersonalEmiPage /></ErrorBoundary>} />
            <Route path="expenses" element={<ErrorBoundary label="/expenses"><ExpensesPage /></ErrorBoundary>} />
            <Route path="hub/debt" element={<ErrorBoundary label="/hub/debt"><HubPage section="debt" /></ErrorBoundary>} />
          </Route>
          <Route element={<TabbedHub config={SAVINGS_HUB} />}>
            <Route path="savings" element={<ErrorBoundary label="/savings"><SavingsPage /></ErrorBoundary>} />
            <Route path="investments" element={<ErrorBoundary label="/investments"><InvestmentsPage /></ErrorBoundary>} />
            <Route path="income" element={<ErrorBoundary label="/income"><IncomePage /></ErrorBoundary>} />
            <Route path="earnings" element={<ErrorBoundary label="/earnings"><EarningsPage /></ErrorBoundary>} />
            <Route path="insurance" element={<ErrorBoundary label="/insurance"><InsurancePage /></ErrorBoundary>} />
            <Route path="people-owe" element={<ErrorBoundary label="/people-owe"><PeopleOwePage /></ErrorBoundary>} />
            <Route path="hub/savings" element={<ErrorBoundary label="/hub/savings"><HubPage section="savings" /></ErrorBoundary>} />
          </Route>
          <Route path="closed-assets" element={<Navigate to="/closed-loans" replace />} />
          <Route element={<TabbedHub config={HISTORY_HUB} />}>
            <Route path="payoff" element={<ErrorBoundary label="/payoff"><PayoffPage /></ErrorBoundary>} />
            <Route path="break-savings" element={<ErrorBoundary label="/break-savings"><BreakSavingsPage /></ErrorBoundary>} />
            <Route path="closed-loans" element={<ErrorBoundary label="/closed-loans"><ClosedLoansPage /></ErrorBoundary>} />
            <Route path="history" element={<ErrorBoundary label="/history"><HistoryPage /></ErrorBoundary>} />
            <Route path="export" element={<ErrorBoundary label="/export"><ExportPage /></ErrorBoundary>} />
            <Route path="hub/history" element={<ErrorBoundary label="/hub/history"><HubPage section="history" /></ErrorBoundary>} />
            <Route path="admin" element={<ErrorBoundary label="/admin"><AdminRoute /></ErrorBoundary>} />
            <Route path="account" element={<ErrorBoundary label="/account"><AccountPage /></ErrorBoundary>} />
          </Route>
          <Route path="overview" element={<Navigate to="/dashboard" replace />} />
          <Route element={<TabbedHub config={STATEMENTS_HUB} />}>
            <Route path="statements/overview" element={<ErrorBoundary label="/statements/overview"><StatementsOverviewPage /></ErrorBoundary>} />
            <Route path="statements/spending" element={<ErrorBoundary label="/statements/spending"><StatementsSpendingPage /></ErrorBoundary>} />
            <Route path="statements/people" element={<ErrorBoundary label="/statements/people"><StatementsPeoplePage /></ErrorBoundary>} />
            <Route path="statements/accounts" element={<ErrorBoundary label="/statements/accounts"><StatementsAccountsPage /></ErrorBoundary>} />
            <Route path="statements/transactions" element={<ErrorBoundary label="/statements/transactions"><StatementsTransactionsPage /></ErrorBoundary>} />
            <Route path="statements/ledger" element={<ErrorBoundary label="/statements/ledger"><StatementsLedgerPage /></ErrorBoundary>} />
            <Route path="statements/data" element={<ErrorBoundary label="/statements/data"><StatementsDataPage /></ErrorBoundary>} />
            <Route path="statements/debt-match" element={<ErrorBoundary label="/statements/debt-match"><StatementsDebtMatchPage /></ErrorBoundary>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
