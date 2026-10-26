import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Layers, CalendarClock, TrendingDown, ShieldCheck } from 'lucide-react'

// Shared frame for Login + Register: a brand panel on wide screens, the form on its own on small ones.
// The brand panel is deliberately dark in both themes (it is a fixed "poster", not themed chrome),
// so its text colours are fixed values chosen for AA contrast on that background.
const POINTS = [
  { icon: Layers,        title: 'Everything in one view',   text: 'Loans, cards, savings, insurance and income side by side.' },
  { icon: CalendarClock, title: 'Never miss a due date',    text: 'A calendar of EMIs, card bills and premiums, month by month.' },
  { icon: TrendingDown,  title: 'Plan your payoff',         text: 'See what prepaying or closing early actually saves you.' },
  { icon: ShieldCheck,   title: 'Private to your account',  text: 'Your numbers are only visible when you are signed in.' },
]

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="rounded-xl bg-orange-500 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }} aria-hidden>
      <span className="text-white font-black" style={{ fontSize: size * 0.5 }}>F</span>
    </div>
  )
}

export function AuthShell({ title, subtitle, error, children, footer }: {
  title: string; subtitle: string; error?: string; children: ReactNode; footer: ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(380px,5fr)_6fr] bg-[var(--bg-base)]">
      {/* Brand panel */}
      <aside className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #1a1d29 0%, #12141d 55%, #1f1710 100%)', color: '#e6e8f0' }}>
        <div aria-hidden className="absolute -top-32 -right-32 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,.22), transparent 70%)' }} />
        <div className="flex items-center gap-3 relative">
          <Logo size={36} />
          <span className="text-lg font-bold tracking-tight" style={{ color: '#f4f5fa' }}>FinFlow</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight" style={{ color: '#f4f5fa' }}>
            Every rupee you owe and earn,<br />in one place.
          </h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-3.5">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(249,115,22,.14)', color: '#fb923c', border: '1px solid rgba(249,115,22,.28)' }}>
                  <Icon size={17} />
                </span>
                <div>
                  <div className="text-[14px] font-semibold" style={{ color: '#f4f5fa' }}>{t}</div>
                  <div className="text-[13px] mt-0.5" style={{ color: '#aab0c4' }}>{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[12px] relative" style={{ color: '#8d94ab' }}>© {new Date().getFullYear()} FinFlow</div>
      </aside>

      {/* Form side */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <Logo size={32} /><span className="text-base font-bold tracking-tight">FinFlow</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1.5 mb-7">{subtitle}</p>
          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px]"
              style={{ color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          {children}
          <p className="text-sm text-[var(--text-muted)] mt-6 text-center">{footer}</p>
        </div>
      </main>
    </div>
  )
}

export function PasswordInput({ value, onChange, placeholder, autoComplete, minLength, id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string; minLength?: number; id?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} className="input pr-10" type={show ? 'text' : 'password'} placeholder={placeholder}
        autoComplete={autoComplete} minLength={minLength} value={value} onChange={e => onChange(e.target.value)} required />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

// Rule checklist for the register screen — mirrors the check done on submit.
export function PasswordRules({ password }: { password: string }) {
  const rules = [
    { ok: password.length >= 8, label: '8+ characters' },
    { ok: /[A-Za-z]/.test(password), label: 'A letter' },
    { ok: /[0-9]/.test(password), label: 'A number' },
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2" aria-label="Password requirements">
      {rules.map(r => (
        <li key={r.label} className="flex items-center gap-1.5 text-[12px]"
          style={{ color: r.ok ? 'var(--success)' : 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.ok ? 'var(--success)' : 'var(--text-faint)' }} />
          {r.label}
        </li>
      ))}
    </ul>
  )
}
