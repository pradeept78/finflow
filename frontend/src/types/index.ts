export interface User {
  id: number
  name: string
  email: string
}

export interface AuthResponse {
  token: string
  userId: number
  name: string
  email: string
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

export interface Loan {
  id?: number
  lender: string
  /** loan account's last 4 digits: matches EMI messages to it */
  last4?: string | null
  loanType?: string
  amount?: number
  emi?: number
  tenure?: number
  paid?: number
  pending?: number
  pendingAmt?: number
  dueDay?: number
  interestRate?: number
  missedMonths?: number
  principalPaid?: number
  startDate?: string
  endDate?: string
  notes?: string
  debitAccount?: string
  processingFee?: number
}

export interface CardEmi {
  id?: number
  label: string
  principal?: number
  emi: number
  tenure?: number
  paid?: number
  pending?: number
  missedMonths?: number
  startDate?: string
  endDate?: string
  owedBy?: string
  owedSettled?: boolean
  /** What this EMI is actually for — Lifestyle, Insurance, Clothing, etc. Same idea as CardSpend's
   *  category, just never existed on EMIs until now. */
  category?: string
}

export interface CardSpend {
  category?: string
  id?: number
  purpose: string
  amount: number
  spendDate?: string
  owedBy?: string
  owedSettled?: boolean
}

export interface CreditCard {
  id?: number
  banker: string
  /** card number's last 4 digits: matches bank messages to it */
  last4?: string | null
  cardLimit: number
  outstanding: number
  dueDay?: number
  billingDay?: number
  /** Date the outstanding amount was entered (or the statement it was picked for) — which statement it is. */
  outstandingAsOf?: string
  notes?: string
  emis?: CardEmi[]
  spends?: CardSpend[]
}

export interface PersonalEmi {
  id?: number
  person: string
  amount: number
  emi?: number
  tenure?: number
  paid?: number
  pending?: number
  interestRate?: number
  dueDay?: number
  startDate?: string
  paybackDate?: string
  notes?: string
}

export interface Saving {
  id?: number
  name: string
  savingType?: string
  type?: string
  mode?: string
  chitValue?: number
  monthly: number
  tenure: number
  paidMonths?: number
  missedMonths?: number
  doublePayments?: number
  actualReceived?: number
  prizeTaken?: boolean
  prizeMonth?: number
  maturityAmount?: number
  dueDay?: number
  startDate?: string
  endDate?: string
  notes?: string
}

export interface Investment {
  id?: number
  name: string
  investType?: string
  monthly?: number
  startDate?: string
  endDate?: string
  tenure?: number
  missedMonths?: number
  totalInvested?: number
  currentValue?: number
  maturityValue?: number
  notes?: string
}

export interface InsurancePolicy {
  id?: number
  name: string
  policyType?: string
  premium: number
  frequency?: string
  startDate?: string
  paymentEndDate?: string
  endDate?: string
  sumAssured?: number
  lastPaidDate?: string
  notes?: string
  active?: boolean
  /** Reference only — which card this premium is paid on. Doesn't create a card spend. */
  paidByCardId?: number
  /** True when this premium is already being paid off as a Credit Card EMI (see `linkedEmiId`),
   *  so its cost must be excluded from every Insurance outflow total — it's already counted once,
   *  as that card's CC EMI. Coverage (sum assured) still counts it. */
  isCardEmi?: boolean
  /** The specific CardEmi.id on `paidByCardId`'s card that this premium maps to. Reading the real
   *  EMI's amount/tenure from there (instead of re-typing them here) is the single source of truth —
   *  the two numbers can't drift apart. */
  linkedEmiId?: number
}

export interface IncomeEntry {
  nextIncrementDate?: string
  nextIncrementPct?: number
  id?: number
  label: string
  amount: number
  incomeType?: string
  frequency?: string
  startDate?: string
  notes?: string
  active?: boolean
}

export interface Expense {
  id?: number
  label: string
  amount: number
  category?: string
  frequency?: string
  dueDay?: number
  startDate?: string
  endDate?: string
  notes?: string
  active?: boolean
}

export interface PeopleOwe {
  id?: number
  person: string
  amount: number
  givenDate?: string
  expectedDate?: string
  status?: string
  notes?: string
  /* Exists on the backend entity as `paid_amount` and is written by the partial-payment
     mutation, but was missing here — so TypeScript could not catch a typo on it anywhere. */
  paidAmount?: number
}

export interface ClosedLoan {
  id?: number
  lender: string
  purpose?: string
  assetType?: string
  amount: number
  totalPaid?: number
  recoveredAmount?: number
  interestPaid?: number
  principalPaid?: number
  originalValue?: number
  closedMonths?: number
  closedDate?: string
  notes?: string
}

export interface LoginRequest { email: string; password: string }
export interface RegisterRequest { name: string; email: string; password: string; inviteCode?: string }
export type SignupMode = 'invite' | 'open' | 'closed'
export interface AdminUser { id: number; name: string; email: string; role: string; isCurrentUser: boolean; createdAt?: string; lastLogin?: string }
/** A single-use sign-up code; `code` is 12 characters with no dashes (shown as XXXX-XXXX-XXXX). */
export interface InviteCode { id: number; code: string; note?: string; createdBy?: string; createdAt: string; usedAt?: string; usedByEmail?: string }

/** A bank SMS / alert FinFlow read (backend messages/BankMessage). Money only changes when it's confirmed. */
export type BankMessageKind = 'CARD_SPEND' | 'CARD_STATEMENT' | 'CARD_PAYMENT' | 'CARD_EMI' | 'EMI_DEBIT' | 'IGNORED' | 'UNKNOWN'
export interface BankMessage {
  id: number; source: 'sms' | 'paste'; sender?: string; body: string; receivedAt: string
  kind: BankMessageKind; amount?: number; last4?: string; merchant?: string; txnDate?: string; dueDate?: string
  minDue?: number; tenure?: number; emiAmount?: number; note?: string
  targetType?: 'CARD' | 'LOAN'; targetId?: number; sure: boolean
  status: 'NEW' | 'CONFIRMED' | 'IGNORED'; resultNote?: string
  /** added without a tap (auto-add); Undo reverses it */
  autoAdded?: boolean
}
