import api from './axios'
import type { LoginRequest, RegisterRequest } from '../types'
import type { Loan, CreditCard, PersonalEmi, Saving, Investment, InsurancePolicy, IncomeEntry, Expense, PeopleOwe, ClosedLoan } from '../types'

// Auth
export const authApi = {
  login: (data: LoginRequest) => api.post('/auth/login', data),
  register: (data: RegisterRequest) => api.post('/auth/register', data),
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

export const cardsApi       = crud<CreditCard>('credit-cards')
export const personalEmiApi = crud<PersonalEmi>('personal-emis')
export const savingsApi     = crud<Saving>('savings')
export const investmentsApi = crud<Investment>('investments')
export const insuranceApi   = crud<InsurancePolicy>('insurance-policys')
export const incomeApi      = crud<IncomeEntry>('income-entrys')
export const expensesApi    = crud<Expense>('expenses')
export const peopleOweApi   = crud<PeopleOwe>('people-owes')
export const closedLoansApi = crud<ClosedLoan>('closed-loans')

export const adminApi = {
  isAdmin: () => api.get<{ data: boolean }>('/admin/me/is-admin').then(r => r.data.data),
  getUsers: () => api.get<{ data: any[] }>('/admin/users').then(r => r.data.data),
  resetPassword: (id: number, password: string) => api.post(`/admin/users/${id}/reset-password`, { password }),
  setRole: (id: number, role: string) => api.patch(`/admin/users/${id}/role`, { role }),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
  // A specific user's raw loans/cards/personal/savings/investments/expenses/insurance/income —
  // the per-item counterpart to getUsers()'s 40 aggregate totals. Fetched on demand (only once an
  // admin actually expands a user's full ledger), never bundled into the main user list.
  getUserCommitments: (id: number) => api.get<{ data: any }>(`/admin/users/${id}/commitments`).then(r => r.data.data),
}

export const snapshotApi = {
  getLast6: () => api.get<{ data: any[] }>('/snapshots/last6').then(r => r.data.data),
  getAll: () => api.get<{ data: any[] }>('/snapshots').then(r => r.data.data),
  generate: () => api.post<{ data: any }>('/snapshots/generate').then(r => r.data.data),
  restore: (snapshots: any[]) => api.post<{ data: number }>('/snapshots/restore', snapshots).then(r => r.data.data),
}

export const paidMarksApi = {
  getAll: () => api.get<{ data: string[] }>('/paid-marks').then(r => r.data.data),
  toggle: (itemKey: string) => api.post<{ data: boolean }>('/paid-marks/toggle', { itemKey }).then(r => r.data.data),
}
