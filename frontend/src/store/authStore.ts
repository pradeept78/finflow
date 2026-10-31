import { create } from 'zustand'
import type { LoginRequest, RegisterRequest } from '../types'
import { authApi } from '../api'
import toast from 'react-hot-toast'

// LoginRequest and RegisterRequest moved to types/index.ts

interface AuthUser { id: number; name: string; email: string; role?: string }

interface AuthStore {
  user: AuthUser | null
  token: string | null
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
  isAuthenticated: () => boolean
  setRole: (role: string | undefined) => void
  /** Swap in a new session token (after a password change, which invalidates the old one). */
  setToken: (token: string) => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: JSON.parse(localStorage.getItem('ff_user') || 'null'),
  token: localStorage.getItem('ff_token'),

  login: async (data) => {
    const res = await authApi.login(data)
    // `role` must be carried through — the admin gate reads user.role, so dropping it
    // here made every account look non-admin regardless of the value in the database.
    const { token, userId, name, email, role } = res.data.data
    const user = { id: userId, name, email, role }
    localStorage.setItem('ff_token', token)
    localStorage.setItem('ff_user', JSON.stringify(user))
    set({ token, user })
    toast.success(`Welcome back, ${name}!`)
  },

  register: async (data) => {
    const res = await authApi.register(data)
    const { token, userId, name, email, role } = res.data.data
    const user = { id: userId, name, email, role }
    localStorage.setItem('ff_token', token)
    localStorage.setItem('ff_user', JSON.stringify(user))
    set({ token, user })
    toast.success(`Welcome to FinFlow, ${name}!`)
  },

  // Refresh just the role from the server without forcing a re-login.
  // Lets a role change in the database take effect on the next page load.
  setRole: (role) => {
    const current = get().user
    if (!current || current.role === role) return
    const user = { ...current, role }
    localStorage.setItem('ff_user', JSON.stringify(user))
    set({ user })
  },

  setToken: (token) => {
    localStorage.setItem('ff_token', token)
    set({ token })
  },

  logout: () => {
    localStorage.removeItem('ff_token')
    localStorage.removeItem('ff_user')
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!get().token && !!get().user,
}))

