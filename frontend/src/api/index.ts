import api from './axios'
import { withCycleDates } from '../utils/cardCycle'
import type { LoginRequest, RegisterRequest, SignupMode, AdminUser, InviteCode, BankMessage } from '../types'
import type { Loan, CreditCard, PersonalEmi, Saving, Investment, InsurancePolicy, IncomeEntry, Expense, PeopleOwe, ClosedLoan } from '../types'

// Auth
export const authApi = {
  login: (data: LoginRequest) => api.post('/auth/login', data),
  register: (data: RegisterRequest) => api.post('/auth/register', data),
  /** 'invite' (sign-up needs a code from an admin), 'open' or 'closed' */
  signupMode: () => api.get<{ data: SignupMode }>('/auth/signup-mode').then(r => r.data.data),
}

// Generic CRUD factory
const crud = <T>(path: string) => ({
  getAll: () => api.get<{ data: T[] }>(`/${path}`).then(r => r.data.data),
  getById: (id: number) => api.get<{ data: T }>(`/${path}/${id}`).then(r => r.data.data),
  create: (data: Partial<T>) => api.post<{ data: T }>(`/${path}`, data).then(r => r.data.data),
  update: (id: number, data: Partial<T>) => api.put<{ data: T }>(`/${path}/${id}`, data).then(r => r.data.data),
  delete: (id: number) => api.delete(`/${path}/${id}`),
})

export const loansApi = {
  ...crud<Loan>('loans'),
  markPaid: (id: number) => api.patch<{ data: Loan }>(`/loans/${id}/mark-paid`).then(r => r.data.data),
}

// Card EMIs are tagged with their first billed due date on load (utils/cardCycle withCycleDates), so every
// page counts instalments paid from the statement cycle, not the day the EMI was taken.
const cardsCrud = crud<CreditCard>('credit-cards')
export const cardsApi = {
  ...cardsCrud,
  getAll: () => cardsCrud.getAll().then(cs => (cs ?? []).map(withCycleDates)),
  getById: (id: number) => cardsCrud.getById(id).then(withCycleDates),
}
export const personalEmiApi = crud<PersonalEmi>('personal-emis')
export const savingsApi     = crud<Saving>('savings')
export const investmentsApi = crud<Investment>('investments')
export const insuranceApi   = crud<InsurancePolicy>('insurance-policys')
export const incomeApi      = crud<IncomeEntry>('income-entrys')
export const expensesApi    = crud<Expense>('expenses')
export const peopleOweApi   = crud<PeopleOwe>('people-owes')
export const closedLoansApi = crud<ClosedLoan>('closed-loans')

// The signed-in user's own account. Both need the current password; a wrong one answers 400.
export const accountApi = {
  /** Returns a fresh session token: every other device is signed out by the change. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ data: { token: string } }>('/account/password', { currentPassword, newPassword }).then(r => r.data.data),
  deleteAccount: (password: string) => api.delete('/account', { data: { password } }),
}

// Bank messages: what FinFlow read from bank SMS (iPhone Shortcut) or pasted text, waiting for a confirm.
export const bankMessagesApi = {
  list: () => api.get<{ data: BankMessage[] }>('/bank-messages').then(r => r.data.data),
  summary: () => api.get<{ data: { newCount: number; hasKey: boolean; autoAdd: boolean; autoAddedRecent: number } }>('/bank-messages/summary').then(r => r.data.data),
  undo: (id: number) => api.post<{ data: BankMessage }>(`/bank-messages/${id}/undo`).then(r => r.data.data),
  setAutoAdd: (autoAdd: boolean) => api.put('/bank-messages/settings', { autoAdd }),
  paste: (text: string) => api.post<{ data: BankMessage }>('/bank-messages/paste', { text }).then(r => r.data.data),
  confirm: (id: number, edits?: Record<string, unknown>) => api.post<{ data: BankMessage }>(`/bank-messages/${id}/confirm`, edits ?? {}).then(r => r.data.data),
  ignore: (id: number) => api.post(`/bank-messages/${id}/ignore`),
  confirmSure: () => api.post<{ data: { confirmed: number; failed: number } }>('/bank-messages/confirm-sure').then(r => r.data.data),
  newKey: () => api.post<{ data: string }>('/bank-messages/key').then(r => r.data.data),
  revokeKey: () => api.delete('/bank-messages/key'),
}

// Account administration only: admins see who has an account, never anyone's finances.
export const adminApi = {
  isAdmin: () => api.get<{ data: boolean }>('/admin/me/is-admin').then(r => r.data.data),
  getUsers: () => api.get<{ data: AdminUser[] }>('/admin/users').then(r => r.data.data),
  resetPassword: (id: number, password: string) => api.post(`/admin/users/${id}/reset-password`, { password }),
  setRole: (id: number, role: string) => api.patch(`/admin/users/${id}/role`, { role }),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
  getInvites: () => api.get<{ data: { mode: SignupMode; invites: InviteCode[] } }>('/admin/invites').then(r => r.data.data),
  createInvite: (note: string) => api.post<{ data: InviteCode }>('/admin/invites', { note }).then(r => r.data.data),
  revokeInvite: (id: number) => api.delete(`/admin/invites/${id}`),
}

export const snapshotApi = {
  getLast6: () => api.get<{ data: any[] }>('/snapshots/last6').then(r => r.data.data),
  getAll: () => api.get<{ data: any[] }>('/snapshots').then(r => r.data.data),
  // netWorth comes from the frontend's shared calculators; the backend records it as sent.
  generate: (body?: { netWorth?: number }) => api.post<{ data: any }>('/snapshots/generate', body ?? {}).then(r => r.data.data),
  restore: (snapshots: any[]) => api.post<{ data: number }>('/snapshots/restore', snapshots).then(r => r.data.data),
}

export const paidMarksApi = {
  getAll: () => api.get<{ data: string[] }>('/paid-marks').then(r => r.data.data),
  toggle: (itemKey: string) => api.post<{ data: boolean }>('/paid-marks/toggle', { itemKey }).then(r => r.data.data),
  // A bill due in another month (a card statement generated now, due next month): read and tick it for that month.
  getFor: (month: string) => api.get<{ data: string[] }>('/paid-marks', { params: { month } }).then(r => r.data.data),
  toggleFor: (itemKey: string, monthYear: string) => api.post<{ data: boolean }>('/paid-marks/toggle', { itemKey, monthYear }).then(r => r.data.data),
}
