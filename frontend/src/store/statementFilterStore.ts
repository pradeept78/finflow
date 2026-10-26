import { create } from 'zustand'

// Filter state shared across every /statements/* page: which optional sub-profile, account and
// date-range window the analyzer endpoints should scope to. Ported from the standalone analyzer
// app's window.__finflowProfile / X-Profile header mechanism — the profile is still just a
// cosmetic sub-label within the logged-in user's own data (real isolation is the JWT), so this
// store only ever affects which of *your own* rows come back, never whose data you can see.
//
// `profile` is the only piece worth persisting across a reload — account/period are page-session
// filters, same as the original app treated them.

const PROFILE_KEY = 'ff_statement_profile'

export type Period = 'all' | 'ytd' | '12m' | '3m' | string // string = a specific year, e.g. '2024'

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (/^\d{4}$/.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31` }
  if (period === 'ytd') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }
  if (period === '12m') { const f = new Date(now); f.setMonth(f.getMonth() - 12); return { from: iso(f), to: iso(now) } }
  if (period === '3m') { const f = new Date(now); f.setMonth(f.getMonth() - 3); return { from: iso(f), to: iso(now) } }
  return { from: '', to: '' }
}

interface StatementFilterStore {
  profile: string
  profiles: string[]
  account: string
  period: Period
  setProfile: (p: string) => void
  setProfiles: (p: string[]) => void
  setAccount: (a: string) => void
  setPeriod: (p: Period) => void
  range: () => { from: string; to: string }
}

export const useStatementFilterStore = create<StatementFilterStore>((set, get) => ({
  profile: localStorage.getItem(PROFILE_KEY) || 'Default',
  profiles: ['Default'],
  account: '',
  period: 'all',

  setProfile: (p) => { localStorage.setItem(PROFILE_KEY, p); set({ profile: p, account: '' }) },
  setProfiles: (p) => set(s => ({ profiles: [...new Set([...p, ...s.profiles])] })),
  setAccount: (a) => set({ account: a }),
  setPeriod: (p) => set({ period: p }),
  range: () => periodRange(get().period),
}))
