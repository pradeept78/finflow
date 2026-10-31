import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { accountApi } from '../api'
import { SIGNED_OUT_REASON } from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { PasswordInput, PasswordRules } from '../components/auth/AuthShell'
import { Modal } from '../components/common'

/* The signed-in user's own account: who they are, change password, delete the account.
   Reached from the user card at the bottom of the sidebar (the More tab on a phone). */

const errText = (e: any) => e?.response?.data?.message ?? 'Something went wrong. Please try again.'
const strong = (p: string) => p.length >= 10 && /[A-Za-z]/.test(p) && /[0-9]/.test(p)

export default function AccountPage() {
  const user = useAuthStore(s => s.user)
  const setToken = useAuthStore(s => s.setToken)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwError, setPwError] = useState('')

  const [deleting, setDeleting] = useState(false)
  const [delPassword, setDelPassword] = useState('')
  const [delTyped, setDelTyped] = useState('')
  const [delError, setDelError] = useState('')

  const changeMut = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    onSuccess: ({ token }) => {
      setToken(token)
      setCurrent(''); setNext(''); setConfirm(''); setPwError('')
      toast.success('Password changed. Any other devices are now signed out.')
    },
    onError: (e: any) => setPwError(errText(e)),
  })
  const deleteMut = useMutation({
    mutationFn: () => accountApi.deleteAccount(delPassword),
    onSuccess: () => {
      qc.clear()
      logout()
      sessionStorage.setItem(SIGNED_OUT_REASON, 'Your account and all its data have been deleted.')
      navigate('/login', { replace: true })
    },
    onError: (e: any) => setDelError(errText(e)),
  })

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    if (!strong(next)) return setPwError('The new password needs 10+ characters, a letter and a number.')
    if (next !== confirm) return setPwError('The new passwords don’t match.')
    changeMut.mutate()
  }
  const closeDelete = () => { setDeleting(false); setDelPassword(''); setDelTyped(''); setDelError('') }

  return (
    <div className="space-y-4 text-[13px] max-w-2xl">
      <section className="card p-4">
        <h2 className="text-[15px] font-semibold mb-3">Your account</h2>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2">
          <dt style={{ color: 'var(--text-muted)' }}>Name</dt><dd className="min-w-0 break-words">{user?.name ?? '—'}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Email</dt><dd className="min-w-0 break-all">{user?.email ?? '—'}</dd>
          {user?.role === 'ADMIN' && <><dt style={{ color: 'var(--text-muted)' }}>Role</dt><dd>Admin</dd></>}
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="text-[15px] font-semibold">Change password</h2>
        <p className="text-[12px] mt-0.5 mb-3" style={{ color: 'var(--text-muted)' }}>This signs you out on every other device. You stay signed in here.</p>
        <form onSubmit={submitPassword} className="space-y-3">
          <div>
            <label className="label" htmlFor="cur-pw">Current password</label>
            <PasswordInput id="cur-pw" autoComplete="current-password" value={current} onChange={setCurrent} />
          </div>
          <div>
            <label className="label" htmlFor="new-pw">New password</label>
            <PasswordInput id="new-pw" autoComplete="new-password" minLength={10} value={next} onChange={setNext} />
            <PasswordRules password={next} />
          </div>
          <div>
            <label className="label" htmlFor="new-pw2">Confirm new password</label>
            <PasswordInput id="new-pw2" autoComplete="new-password" minLength={10} value={confirm} onChange={setConfirm} />
          </div>
          {pwError && <p className="text-[12px]" role="alert" style={{ color: 'var(--danger)' }}>{pwError}</p>}
          <button type="submit" className="btn-primary btn-sm" disabled={changeMut.isPending}>{changeMut.isPending ? 'Changing…' : 'Change password'}</button>
        </form>
      </section>

      <section className="card p-4" style={{ borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--border))' }}>
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--danger)' }}>Delete account</h2>
        <p className="text-[12px] mt-0.5 mb-3" style={{ color: 'var(--text-muted)' }}>
          Permanently deletes your account and everything in it: loans, cards, savings, statements, history. It can’t be undone.
          {' '}Want a copy first? <Link to="/export" className="underline" style={{ color: 'var(--orange)' }}>Export your data</Link>.
        </p>
        <button className="btn-danger btn-sm" onClick={() => setDeleting(true)}>Delete my account…</button>
      </section>

      {deleting && (
        <Modal title="Delete your account?" onClose={closeDelete}
          footer={<>
            <button className="btn-secondary btn-sm" onClick={closeDelete}>Cancel</button>
            <button className="btn-danger btn-sm" disabled={!delPassword || delTyped.trim().toUpperCase() !== 'DELETE' || deleteMut.isPending}
              onClick={() => { setDelError(''); deleteMut.mutate() }}>{deleteMut.isPending ? 'Deleting…' : 'Delete everything'}</button>
          </>}>
          <div className="space-y-3">
            <p className="text-[13px]">All your data will be removed permanently. This can’t be undone.</p>
            <div>
              <label className="label" htmlFor="del-pw">Your password</label>
              <PasswordInput id="del-pw" autoComplete="current-password" value={delPassword} onChange={setDelPassword} />
            </div>
            <div>
              <label className="label" htmlFor="del-typed">Type <span className="mono" style={{ color: 'var(--text)' }}>DELETE</span> to confirm</label>
              <input id="del-typed" className="input" autoComplete="off" value={delTyped} onChange={e => setDelTyped(e.target.value)} />
            </div>
            {delError && <p className="text-[12px]" role="alert" style={{ color: 'var(--danger)' }}>{delError}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
