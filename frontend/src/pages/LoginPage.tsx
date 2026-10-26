import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { SIGNED_OUT_REASON } from '../api/axios'
import { AuthShell, PasswordInput } from '../components/auth/AuthShell'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()

  // If the interceptor bounced us here because the token expired, say so. Otherwise arriving back
  // at a blank login form looks identical to a failed submit, which is how the original bug hid.
  useEffect(() => {
    const reason = sessionStorage.getItem(SIGNED_OUT_REASON)
    if (reason) {
      setError(reason)
      sessionStorage.removeItem(SIGNED_OUT_REASON)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login({ email, password })
      navigate('/master')
    } catch (err: any) {
      // There was no catch at all here, so a rejected login became an unhandled promise rejection
      // and the user was told nothing.
      setError(err?.response?.data?.message || 'Could not sign in. Check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to FinFlow" error={error}
      footer={<>No account? <Link to="/register" className="font-medium text-orange-400 hover:underline">Create one</Link></>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" placeholder="you@example.com" autoComplete="email" autoFocus
            value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={setPassword} />
        </div>
        <button type="submit" className="btn-primary w-full justify-center !py-2.5" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
