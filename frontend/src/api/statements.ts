import api from './axios'
import { useStatementFilterStore } from '../store/statementFilterStore'
import type {
  StatementAccount, Transaction, TxPage, TxSummary, Summary, CategoryRow, MonthlyRow, YearlyRow,
  RankRow, Insight, LoanRow, LedgerCounterparty, AccountStat, YearSummary, YearReview, StatementRow,
  InspectResult, UploadResult,
} from '../types/statements'

// The ported analyzer endpoints return raw JSON directly — no ApiResponse<T> envelope like the
// rest of the app's crud() factory expects (see api/index.ts's `.then(r => r.data.data)`). Every
// function below reads `r.data` directly.

const ANALYZER_PATHS = ['/profiles', '/accounts', '/statements', '/transactions', '/data-management', '/analytics']

// Every analyzer request carries the current profile/date-range as headers, mirroring the
// standalone app's window.fetch monkeypatch — but as a per-request interceptor here instead of
// patching the global fetch. Real isolation is the JWT bearer token `api`'s own interceptor
// already attaches; these headers only select an optional cosmetic sub-view of your own data.
api.interceptors.request.use(config => {
  if (typeof config.url === 'string' && ANALYZER_PATHS.some(p => config.url!.startsWith(p))) {
    const { profile, range } = useStatementFilterStore.getState()
    const { from, to } = range()
    const headers = config.headers as any
    headers['X-Profile'] = profile || 'Default'
    if (from) headers['X-From'] = from
    if (to) headers['X-To'] = to
  }
  return config
})

export const profilesApi = {
  list: () => api.get<string[]>('/profiles').then(r => r.data),
}

export const statementAccountsApi = {
  list: () => api.get<StatementAccount[]>('/accounts').then(r => r.data),
}

export interface ImportOverride { bank?: string; type?: string; number?: string; password?: string }
export interface ColumnMapping { date?: number; description?: number; debit?: number; credit?: number; amount?: number; type?: number }

function columnParams(mapping?: ColumnMapping) {
  const p: Record<string, string> = {}
  const keys: Record<keyof ColumnMapping, string> = { date: 'dateCol', description: 'descCol', debit: 'debitCol', credit: 'creditCol', amount: 'amountCol', type: 'typeCol' }
  if (mapping) {
    for (const [field, param] of Object.entries(keys) as [keyof ColumnMapping, string][]) {
      const v = mapping[field]
      if (v !== undefined && v !== null) p[param] = String(v)
    }
  }
  return p
}

export const statementsApi = {
  // `api`'s instance default sets Content-Type: application/json on every request (see axios.ts).
  // That default silently wins over a FormData body unless it's explicitly cleared per-request —
  // otherwise the browser sends the multipart body mislabeled as JSON and the server can't parse
  // it. Setting the header to `undefined` here removes it so the browser fills in the correct
  // `multipart/form-data; boundary=...` value itself.
  inspect: (file: File, override?: ImportOverride, mapping?: ColumnMapping) => {
    const fd = new FormData()
    fd.append('file', file)
    if (override?.password) fd.append('password', override.password)
    const params = columnParams(mapping)
    return api.post<InspectResult>('/statements/inspect', fd, { params, headers: { 'Content-Type': undefined } }).then(r => r.data)
  },
  upload: (file: File, override: ImportOverride, mapping?: ColumnMapping) => {
    const fd = new FormData()
    fd.append('file', file)
    if (override.bank) fd.append('bank', override.bank)
    if (override.type) fd.append('type', override.type)
    if (override.number) fd.append('number', override.number)
    if (override.password) fd.append('password', override.password)
    const params = columnParams(mapping)
    return api.post<UploadResult>('/statements/upload', fd, { params, headers: { 'Content-Type': undefined } }).then(r => r.data)
  },
  clearAll: () => api.delete<{ deleted: number }>('/statements/all').then(r => r.data),
}

export interface TxFilters {
  q?: string; category?: string; account?: string; year?: number | string; month?: string
  direction?: string; transactionType?: string; counterparty?: string
  // Manual-debt-link filter — pulls the transactions already linked to one specific loan/card
  // (see StatementsDebtMatchPage's "Link manually" feature). Only honored by transactionsApi.page().
  linkedDebtType?: string; linkedDebtId?: number
}

function txParams(f: TxFilters = {}) {
  const p: Record<string, string> = {}
  if (f.q) p.q = f.q
  if (f.category) p.category = f.category
  if (f.account) p.account = f.account
  if (f.year) p.year = String(f.year)
  if (f.month) p.month = f.month
  if (f.direction) p.direction = f.direction
  if (f.transactionType) p.transactionType = f.transactionType
  if (f.counterparty) p.counterparty = f.counterparty
  if (f.linkedDebtType) p.linkedDebtType = f.linkedDebtType
  if (f.linkedDebtId != null) p.linkedDebtId = String(f.linkedDebtId)
  return p
}

export const transactionsApi = {
  page: (f: TxFilters, page: number, size = 50) =>
    api.get<TxPage>('/transactions/page', { params: { ...txParams(f), page, size } }).then(r => r.data),
  summary: (f: TxFilters) =>
    api.get<TxSummary>('/transactions/summary', { params: txParams(f) }).then(r => r.data),
  update: (id: number, patch: Partial<Transaction>) =>
    api.patch<Transaction>(`/transactions/${id}`, patch).then(r => r.data),
  delete: (id: number) =>
    api.delete<{ deleted: boolean }>(`/transactions/${id}`).then(r => r.data),
  // `unlinkDebt: true` is a dedicated clear-flag for the manual debt link, not a Transaction field —
  // bulk-clearing follows a different rule than the blank-means-"don't touch" convention every other
  // bulk field uses (see TransactionController.bulkUpdate's comment).
  bulkUpdate: (ids: number[], patch: Partial<Transaction> & { unlinkDebt?: boolean }) =>
    api.post<{ updated: number }>('/transactions/bulk-update', { ids, ...patch }).then(r => r.data),
  bulkDelete: (ids: number[]) =>
    api.post<{ deleted: number }>('/transactions/bulk-delete', { ids }).then(r => r.data),
  // Auth is a bearer header, not a cookie, so a plain `window.location.href` link (the original
  // app's approach) would hit this endpoint with no Authorization header and 401. Fetch as a blob
  // instead and trigger the download from the response.
  // Accepts the same filter set as page()/summary() so "Export CSV" reflects whatever the table is
  // currently showing (search text, category, year, month, direction, type, counterparty) instead
  // of always dumping the account's full unfiltered history.
  exportCsv: async (f: TxFilters = {}) => {
    const res = await api.get('/transactions/export', { params: txParams(f), responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

export const dataManagementApi = {
  years: () => api.get<YearSummary[]>('/data-management/years').then(r => r.data),
  statements: () => api.get<StatementRow[]>('/data-management/statements').then(r => r.data),
  year: (year: number, account?: string) =>
    api.get<YearReview>(`/data-management/years/${year}`, { params: account ? { account } : {} }).then(r => r.data),
  deleteYear: (year: number, account?: string) =>
    api.delete<{ year: number; deleted: number }>(`/data-management/years/${year}`, { params: account ? { account } : {} }).then(r => r.data),
  deleteStatement: (sourceFile: string, account?: string) =>
    api.delete<{ sourceFile: string; deleted: number }>('/data-management/statements', { params: { sourceFile, ...(account ? { account } : {}) } }).then(r => r.data),
  reclassify: () => api.post<{ total: number; updated: number }>('/data-management/reclassify').then(r => r.data),
}

const withAccount = (account?: string) => (account ? { account } : {})

export const analyticsApi = {
  summary: (account?: string) => api.get<Summary>('/analytics/summary', { params: withAccount(account) }).then(r => r.data),
  categories: (account?: string) => api.get<CategoryRow[]>('/analytics/categories', { params: withAccount(account) }).then(r => r.data),
  monthly: (account?: string) => api.get<MonthlyRow[]>('/analytics/monthly', { params: withAccount(account) }).then(r => r.data),
  yearly: (account?: string) => api.get<YearlyRow[]>('/analytics/yearly', { params: withAccount(account) }).then(r => r.data),
  incomeMonthly: (account?: string) => api.get<MonthlyRow[]>('/analytics/income-monthly', { params: withAccount(account) }).then(r => r.data),
  incomeYearly: (account?: string) => api.get<YearlyRow[]>('/analytics/income-yearly', { params: withAccount(account) }).then(r => r.data),
  merchants: (account?: string) => api.get<RankRow[]>('/analytics/merchants', { params: withAccount(account) }).then(r => r.data),
  allMerchants: (account?: string) => api.get<RankRow[]>('/analytics/merchants/all', { params: withAccount(account) }).then(r => r.data),
  upi: (account?: string) => api.get<RankRow[]>('/analytics/upi', { params: withAccount(account) }).then(r => r.data),
  allUpi: (account?: string) => api.get<RankRow[]>('/analytics/upi/all', { params: withAccount(account) }).then(r => r.data),
  financial: (account?: string) => api.get<RankRow[]>('/analytics/financial', { params: withAccount(account) }).then(r => r.data),
  allFinancial: (account?: string) => api.get<RankRow[]>('/analytics/financial/all', { params: withAccount(account) }).then(r => r.data),
  cardPayments: (account?: string) => api.get<RankRow[]>('/analytics/card-payments', { params: withAccount(account) }).then(r => r.data),
  outflows: (account?: string) => api.get<RankRow[]>('/analytics/outflows', { params: withAccount(account) }).then(r => r.data),
  income: (account?: string) => api.get<RankRow[]>('/analytics/income', { params: withAccount(account) }).then(r => r.data),
  loans: (account?: string) => api.get<LoanRow[]>('/analytics/loans', { params: withAccount(account) }).then(r => r.data),
  ledger: (kind: 'upi' | 'other', account?: string) => api.get<LedgerCounterparty[]>('/analytics/ledger', { params: { kind, ...withAccount(account) } }).then(r => r.data),
  insights: (account?: string) => api.get<Insight[]>('/analytics/insights', { params: withAccount(account) }).then(r => r.data),
  accountSummary: () => api.get<AccountStat[]>('/analytics/account-summary').then(r => r.data),
}
