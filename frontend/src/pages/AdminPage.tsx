import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../api'
import { KpiTile } from '../components/common/KpiTile'
import { Modal, EmptyState } from '../components/common'
import type { AdminUser, InviteCode } from '../types'

/* Account administration only. Admins see who has an account (name, email, role, joined, last seen)
   and manage roles, password resets, deletion and invite codes — never anyone's loans, cards,
   balances or totals. The page used to show every user's full finances; that was removed so a
   shared FinFlow can honestly promise that your numbers are yours alone. */

const fmtDate = (d?: string) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const ago = (d?: string) => {
  if (!d) return 'never'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return 'never'
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`
}
/** ABCDEFGHJKMN → ABCD-EFGH-JKMN */
const showCode = (c: string) => c.match(/.{1,4}/g)?.join('-') ?? c
const inviteLink = (c: string) => `${window.location.origin}/register?invite=${showCode(c)}`

const MODE_TEXT = {
  invite: 'Sign-up is invite-only: each code below works once.',
  open: 'Sign-up is open to anyone (SIGNUP_MODE=open), so invites aren’t needed.',
  closed: 'Sign-up is closed (SIGNUP_MODE=closed): nobody can create an account, even with an invite.',
} as const

export default function AdminPage() {
  const qc = useQueryClient()
  const { data: isAdmin = false, isLoading: isAdminLoading, isError: isAdminError, refetch: refetchIsAdmin } = useQuery({ queryKey: ['is-admin'], queryFn: adminApi.isAdmin })
  const { data: users = [], isLoading: isUsersLoading, isError: isUsersError, refetch: refetchUsers } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.getUsers, enabled: !!isAdmin })
  const { data: inviteData } = useQuery({ queryKey: ['admin-invites'], queryFn: adminApi.getInvites, enabled: !!isAdmin })
  const invites = inviteData?.invites ?? []

  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [resetFor, setResetFor] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void; typeToConfirm?: string } | null>(null)
  const [typed, setTyped] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  // Result banner: the backend refuses lock-out moves (demoting yourself or the last admin), and those
  // refusals must be visible instead of silently doing nothing.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong'
  const fail = (e: any) => { setConfirm(null); setNotice({ kind: 'err', text: errText(e) }) }

  const resetMut = useMutation({ mutationFn: ({ id, pw }: { id: number; pw: string }) => adminApi.resetPassword(id, pw), onSuccess: () => { setResetFor(null); setNewPassword(''); setNotice({ kind: 'ok', text: 'Password reset. Ask them to sign in with it.' }) }, onError: fail })
  const roleMut = useMutation({ mutationFn: ({ id, role }: { id: number; role: string }) => adminApi.setRole(id, role), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirm(null); setNotice({ kind: 'ok', text: 'Role updated.' }) }, onError: fail })
  const deleteMut = useMutation({ mutationFn: (id: number) => adminApi.deleteUser(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirm(null); setNotice({ kind: 'ok', text: 'Account deleted.' }) }, onError: fail })
  const createMut = useMutation({ mutationFn: (n: string) => adminApi.createInvite(n), onSuccess: (inv: InviteCode) => { qc.invalidateQueries({ queryKey: ['admin-invites'] }); setNote(''); setNotice({ kind: 'ok', text: `Invite ${showCode(inv.code)} created. Copy the link and send it to them.` }) }, onError: fail })
  const revokeMut = useMutation({ mutationFn: (id: number) => adminApi.revokeInvite(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-invites'] }); setConfirm(null); setNotice({ kind: 'ok', text: 'Invite revoked.' }) }, onError: fail })

  const copyLink = async (inv: InviteCode) => {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.code))
      setCopied(inv.id); setTimeout(() => setCopied(c => (c === inv.id ? null : c)), 2000)
    } catch {
      setNotice({ kind: 'err', text: `Couldn't copy. The link is ${inviteLink(inv.code)}` })
    }
  }

  if (isAdminLoading) return <div className="p-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Checking admin access…</div>
  if (isAdminError) return (
    <div className="p-8 text-center text-[13px]" style={{ color: 'var(--danger)' }}>
      Couldn't check admin access. <button className="btn-secondary btn-sm ml-2" onClick={() => refetchIsAdmin()}>Retry</button>
    </div>
  )
  if (!isAdmin) return <div className="p-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>🔒 Admin access required</div>
  if (isUsersLoading) return <div className="p-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Loading accounts…</div>
  if (isUsersError) return (
    <div className="p-8 text-center text-[13px]" style={{ color: 'var(--danger)' }}>
      Couldn't load accounts. <button className="btn-secondary btn-sm ml-2" onClick={() => refetchUsers()}>Retry</button>
    </div>
  )

  const q = search.trim().toLowerCase()
  const shown = [...users]
    .filter(u => !q || (u.name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
  const admins = users.filter(u => u.role === 'ADMIN').length
  const active30 = users.filter(u => u.lastLogin && Date.now() - new Date(u.lastLogin).getTime() < 30 * 86400000).length
  const unused = invites.filter(i => !i.usedAt).length
  const mode = inviteData?.mode ?? 'invite'

  const askRole = (u: AdminUser) => {
    const next = u.role === 'ADMIN' ? 'USER' : 'ADMIN'
    setConfirm({ message: next === 'ADMIN' ? `Make ${u.name} an admin?` : `Remove admin access from ${u.name}?`, onConfirm: () => roleMut.mutate({ id: u.id, role: next }) })
  }
  const askDelete = (u: AdminUser) => {
    setTyped('')
    setConfirm({ message: `Delete ${u.name}'s account? This permanently removes the account and all its data.`, typeToConfirm: u.email, onConfirm: () => deleteMut.mutate(u.id) })
  }
  const Actions = ({ u }: { u: AdminUser }) => (
    <div className="flex flex-wrap gap-1.5">
      <button className="btn-secondary btn-xs" onClick={() => { setNewPassword(''); setResetFor(u) }}>Reset password</button>
      <button className="btn-secondary btn-xs" disabled={u.isCurrentUser} title={u.isCurrentUser ? 'You can’t change your own role' : undefined} onClick={() => askRole(u)}>
        {u.role === 'ADMIN' ? 'Make user' : 'Make admin'}
      </button>
      <button className="btn-danger btn-xs" disabled={u.isCurrentUser} title={u.isCurrentUser ? 'You can’t delete your own account here' : undefined} onClick={() => askDelete(u)}>Delete</button>
    </div>
  )
  const RoleBadge = ({ u }: { u: AdminUser }) => (
    <>
      <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
        style={{ background: u.role === 'ADMIN' ? 'color-mix(in srgb, var(--info) 15%, transparent)' : 'color-mix(in srgb, var(--text) 8%, transparent)', color: u.role === 'ADMIN' ? 'var(--info)' : 'var(--text-muted)' }}>
        {u.role === 'ADMIN' ? 'Admin' : 'User'}
      </span>
      {u.isCurrentUser && <span className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: 'var(--text-muted)' }}>you</span>}
    </>
  )

  return (
    <div className="space-y-4 text-[13px]">
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[12px]" role="status"
          style={{ background: `color-mix(in srgb, var(${notice.kind === 'ok' ? '--success' : '--danger'}) 10%, transparent)`, color: `var(${notice.kind === 'ok' ? '--success' : '--danger'})`, border: `1px solid color-mix(in srgb, var(${notice.kind === 'ok' ? '--success' : '--danger'}) 25%, transparent)` }}>
          <span className="min-w-0 break-words">{notice.kind === 'ok' ? '✓ ' : '⚠ '}{notice.text}</span>
          <button className="text-[11px] underline flex-shrink-0" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        🔒 Admins see account details only, never anyone's loans, cards or balances.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Accounts" value={<span className="tabular-nums">{users.length}</span>} accent="var(--purple)" />
        <KpiTile label="Admins" value={<span className="tabular-nums">{admins}</span>} accent="var(--info)" />
        <KpiTile label="Active in 30 days" value={<span className="tabular-nums">{active30}</span>} accent="var(--success)" sub="signed in at least once" />
        <KpiTile label="Unused invites" value={<span className="tabular-nums">{unused}</span>} accent="var(--warning)" sub={mode === 'invite' ? 'waiting to be used' : `sign-up is ${mode}`} />
      </div>

      {/* ── Invites ── */}
      <section className="card p-4 space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Invites</h2>
          <p className="text-[12px] mt-0.5" style={{ color: mode === 'invite' ? 'var(--text-muted)' : 'var(--warning)' }}>{MODE_TEXT[mode]}</p>
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); createMut.mutate(note) }}>
          <input className="input flex-1 min-w-[180px]" maxLength={120} placeholder="Who is it for? (optional)" aria-label="Who the invite is for" value={note} onChange={e => setNote(e.target.value)} />
          <button type="submit" className="btn-primary btn-sm" disabled={createMut.isPending}>{createMut.isPending ? 'Creating…' : 'Create invite'}</button>
        </form>
        {invites.length === 0 ? (
          <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>No invites yet. Create one and send its link to the person you're inviting.</p>
        ) : (
          <ul className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
            {invites.map((inv, i) => (
              <li key={inv.id} className="flex items-center gap-3 px-3 py-2 flex-wrap" style={{ borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
                <span className="mono font-semibold tabular-nums" style={{ color: inv.usedAt ? 'var(--text-faint)' : 'var(--text)' }}>{showCode(inv.code)}</span>
                <span className="flex-1 basis-[200px] min-w-0 text-[12px] break-words" style={{ color: 'var(--text-muted)' }}>
                  {inv.note ? `${inv.note} · ` : ''}
                  {inv.usedAt ? <>used by {inv.usedByEmail} · {fmtDate(inv.usedAt)}</> : <>created {fmtDate(inv.createdAt)}</>}
                </span>
                {inv.usedAt ? (
                  <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}>Used</span>
                ) : (
                  <span className="flex gap-1.5">
                    <button className="btn-secondary btn-xs" onClick={() => copyLink(inv)}>{copied === inv.id ? '✓ Copied' : 'Copy link'}</button>
                    <button className="btn-ghost btn-xs" onClick={() => setConfirm({ message: `Revoke invite ${showCode(inv.code)}? Its link will stop working.`, onConfirm: () => revokeMut.mutate(inv.id) })}>Revoke</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Accounts ── */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 pb-3">
          <h2 className="text-[15px] font-semibold">Accounts</h2>
          <input aria-label="Search accounts" className="input text-[12px] py-1.5 w-full sm:w-56" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {shown.length === 0 ? (
          <EmptyState icon="👤" title={q ? 'No accounts match' : 'No accounts yet'} sub={q ? `Nothing matches “${search}”.` : undefined} />
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <table className="hidden md:table w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px]" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }}>
                  <th className="font-medium px-4 py-2">Name</th>
                  <th className="font-medium px-4 py-2">Email</th>
                  <th className="font-medium px-4 py-2">Joined</th>
                  <th className="font-medium px-4 py-2">Last seen</th>
                  <th className="font-medium px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{u.name}</span><RoleBadge u={u} /></div></td>
                    <td className="px-4 py-2.5 break-all" style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{ago(u.lastLogin)}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end"><Actions u={u} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phone: one block per account */}
            <ul className="md:hidden" style={{ borderTop: '1px solid var(--hairline)' }}>
              {shown.map(u => (
                <li key={u.id} className="px-4 py-3 space-y-1.5" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{u.name}</span><RoleBadge u={u} /></div>
                  <div className="text-[12px] break-all" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                  <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>joined {fmtDate(u.createdAt)} · last seen {ago(u.lastLogin)}</div>
                  <Actions u={u} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {resetFor && (
        <Modal title={`Reset password for ${resetFor.name}`} onClose={() => { setResetFor(null); setNewPassword('') }}
          footer={<>
            <button className="btn-secondary btn-sm" onClick={() => { setResetFor(null); setNewPassword('') }}>Cancel</button>
            <button className="btn-primary btn-sm" disabled={newPassword.length < 10 || resetMut.isPending} onClick={() => resetMut.mutate({ id: resetFor.id, pw: newPassword })}>Reset password</button>
          </>}>
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-muted)' }}>{resetFor.email}</p>
          <input className="input w-full" type="password" autoComplete="new-password" aria-label="New password" placeholder="New password (10+ characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </Modal>
      )}
      {confirm && (
        <Modal title="Please confirm" onClose={() => { setConfirm(null); setTyped('') }}
          footer={(() => {
            const locked = !!confirm.typeToConfirm && typed.trim().toLowerCase() !== confirm.typeToConfirm.toLowerCase()
            return <>
              <button className="btn-secondary btn-sm" onClick={() => { setConfirm(null); setTyped('') }}>Cancel</button>
              <button className="btn-danger btn-sm" disabled={locked} onClick={() => { confirm.onConfirm(); setTyped('') }}>Confirm</button>
            </>
          })()}>
          <p className="text-[13px]">{confirm.message}</p>
          {confirm.typeToConfirm && (
            <div className="mt-3">
              <label className="text-[12px] block mb-1" style={{ color: 'var(--text-muted)' }} htmlFor="type-confirm">Type <span className="mono" style={{ color: 'var(--text)' }}>{confirm.typeToConfirm}</span> to confirm</label>
              <input id="type-confirm" className="input w-full" autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder="email address" />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
