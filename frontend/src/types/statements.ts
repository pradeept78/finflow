// Types for the ported Statement Analyzer backend (com.finflow.analyzer.*). These endpoints do
// NOT use the ApiResponse<T> envelope the rest of the app's api/index.ts crud() factory expects —
// they return raw JSON bodies directly (see AnalyticsController / TransactionController / etc.,
// which were ported byte-for-byte from the standalone analyzer app). Callers in api/statements.ts
// read `r.data` directly, not `r.data.data`.

export interface StatementAccount {
  id: number
  bankName: string
  accountType: 'DEBIT' | 'CREDIT_CARD' | string
  maskedNumber: string
  displayName: string
  accountKey: string
}

export interface Transaction {
  id: number
  transactionDate: string | null
  description?: string
  merchant?: string
  amount: number
  direction: 'DEBIT' | 'CREDIT' | string
  category?: string
  subCategory?: string
  transactionType?: string
  account?: string
  profile?: string
  sourceFile?: string
  fingerprint?: string
  recurring?: boolean
  excludedFromSpend?: boolean
  /** Manual debt link (Debt Matching page) — set when auto name/amount matching couldn't find
   *  this transaction's Loan/CreditCard/ClosedLoan on its own. Null/undefined = not linked. */
  linkedDebtType?: 'LOAN' | 'CARD' | 'CLOSED' | null
  linkedDebtId?: number | null
}

export interface TxPage {
  items: Transaction[]
  page: number
  size: number
  total: number
  pages: number
}

export interface TxSummary {
  out: number
  in: number
  net: number
  count: number
}

export interface Summary {
  totalSpending?: number
  totalCredits?: number
  netCashFlow?: number
  transactionCount?: number
  totalDebited?: number
  totalCredited?: number
  cardPayments?: number
  emiPayments?: number
}

export interface CategoryRow { category?: string; name?: string; amount: number; transactions: number }
export interface MonthlyRow { period: string; amount: number; transactions?: number }
export interface YearlyRow { year: string | number; amount: number; transactions?: number }
export interface RankRow {
  name?: string; merchant?: string; amount: number; transactions: number; cardPayment?: boolean
  debitAmount?: number; debitTransactions?: number; creditAmount?: number; creditTransactions?: number
}
export interface Insight { title: string; value?: string; amount?: number; detail?: string }
export interface LoanRow { lender: string; taken?: number; paid?: number; transactions: number; txns?: MiniTxn[] }
export interface LedgerCounterparty { name: string; received?: number; paid?: number; transactions: number; txns?: MiniTxn[] }
export interface MiniTxn { id?: number; date?: string; description?: string; merchant?: string; direction?: string; amount?: number }

export interface AccountStat { account: string; spending?: number; credits?: number; transactions?: number }

export interface YearSummary {
  year: number
  transactions: number
  spending: number
  income: number
  accounts?: number | string[]
}

export interface YearReview {
  year: number | string
  spending: number
  income: number
  netCashFlow: number
  transactions: number
  accounts: string[]
}

export interface StatementRow {
  sourceFile: string
  transactions: number
  account?: string
  from?: string | null
  to?: string | null
}

export interface InspectAccountInfo {
  bankName: string
  accountType: string
  maskedNumber: string
  accountKey: string
  confidence: number
}

export interface InspectResult {
  file: string
  encrypted: boolean
  passwordRequired?: boolean
  wrongPassword?: boolean
  message?: string
  parsed?: number
  preview?: { date: string; description: string; amount: number; direction: string; category: string }[]
  fileKind?: 'tabular' | 'pdf'
  columns?: string[]
  sampleRows?: string[][]
  mapping?: Record<string, number>
  extractedSample?: string[]
  account?: InspectAccountInfo
}

export interface UploadResult {
  file: string
  encrypted?: boolean
  wrongPassword?: boolean
  added: number
  duplicates: number
  parsed: number
  error?: string
  account?: {
    id: number
    bankName: string
    accountType: string
    maskedNumber: string
    displayName: string
    accountKey: string
  }
}

export const STATEMENT_CATEGORIES = [
  'Food & Restaurants', 'Groceries', 'Shopping', 'Fuel', 'Travel', 'Bills & Utilities',
  'Subscriptions', 'Medical', 'Insurance', 'Entertainment', 'Education', 'EMI / Loan',
  'Bank Charges', 'Transfers', 'Credit Card Payment', 'Refunds & Cashback', 'Income / Credits', 'Other',
]

export const STATEMENT_TX_TYPES = ['SPENDING', 'INCOME', 'SAVINGS', 'LOAN', 'TRANSFER', 'REFUND', 'EMI', 'FEE', 'OTHER']

// Types whose amounts don't count as real spending — mirrors TransactionDetail's own list in the
// original analyzer app, kept in one place here instead of re-typed per page.
export const EXCLUDED_TX_TYPES = ['TRANSFER', 'INCOME', 'REFUND', 'LOAN', 'SAVINGS']
