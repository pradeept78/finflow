import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api'
import { useAuthStore } from '../store/authStore'
import { AuthShell, PasswordInput, PasswordRules } from '../components/auth/AuthShell'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Invite links look like /register?invite=ABCD-EFGH-JKMN (copied from /admin), so the code is filled in.
  const [params] = useSearchParams()
  const [inviteCode, setInviteCode] = useState(params.get('invite') ?? '')
  // 'invite' unless the server says otherwise; a failed check still shows the field, since the server decides anyway.
  const { data: mode = 'invite' } = useQuery({ queryKey: ['signup-mode'], queryFn: authApi.signupMode, retry: false })
  const register = useAuthStore(s => s.register)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side strength check: native minLength=6 alone let weak/typo'd passwords through
    // with no explanation. Require 10+ chars with at least one letter and one digit (the API checks the same).
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 10 characters and include at least one letter and one number.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await register({ name, email, password, inviteCode: mode === 'invite' ? inviteCode : undefined })
      navigate('/lookup')
    } catch (err: any) {
      // Same missing catch as LoginPage. "Email already registered" is the message that matters
      // most here, and it was only ever reaching a toast.
      // Field errors ("Validation failed" + a map) read better as the field messages themselves.
      const d = err?.response?.data
      const fields = d?.data && typeof d.data === 'object' ? Object.values(d.data).join(' ') : ''
      setError(fields || d?.message || 'Could not create the account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'closed') return (
    <AuthShell title="Sign-up is closed" subtitle="New accounts aren't being created right now."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-orange-400 hover:underline">Sign in</Link></>}>
      <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>If you were expecting to join, ask the person who runs this FinFlow.</p>
    </AuthShell>
  )

  return (
    <AuthShell title="Create your account" subtitle="Start tracking your finances in a couple of minutes" error={error}
      footer={<>Already have an account? <Link to="/login" className="font-medium text-orange-400 hover:underline">Sign in</Link></>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'invite' && (
          <div>
            <label className="label" htmlFor="invite">Invite code</label>
            <input id="invite" className="input mono uppercase" type="text" placeholder="ABCD-EFGH-JKMN" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              value={inviteCode} onChange={e => setInviteCode(e.target.value)} required />
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>FinFlow is invite-only for now. Your invite link fills this in.</p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" type="text" placeholder="Your name" autoComplete="name" autoFocus={mode !== 'invite' || !!inviteCode}
            value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" placeholder="you@example.com" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="new-password" placeholder="Create a password" minLength={10} value={password} onChange={setPassword} />
          <PasswordRules password={password} />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <PasswordInput id="confirm" autoComplete="new-password" placeholder="Re-enter your password" minLength={10} value={confirmPassword} onChange={setConfirmPassword} />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--danger)' }}>Passwords don’t match yet.</p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full justify-center !py-2.5" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
