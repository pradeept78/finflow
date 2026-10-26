import { useState, useEffect } from 'react'
import type { StatementAccount, Transaction } from '../../types/statements'
import { STATEMENT_CATEGORIES, STATEMENT_TX_TYPES, EXCLUDED_TX_TYPES } from '../../types/statements'
import { money, accountDisplay } from './shared'

export function TransactionDetailModal({
  tx, accounts, onSave, onDelete, onClose,
}: {
  tx: Transaction
  accounts: StatementAccount[]
  onSave: (id: number, patch: Partial<Transaction>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onClose: () => void
}) {
  const [cur, setCur] = useState(tx)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { setCur(tx); setErr(''); setConfirmDel(false) }, [tx])

  const patch = async (changes: Partial<Transaction>) => {
    const next = { ...cur, ...changes }
    setCur(next)
    setSaving(true)
    setErr('')
    try { await onSave(tx.id, changes) } catch { setErr('Could not save. Is the backend running?') } finally { setSaving(false) }
  }

  const removeTx = async () => {
    setDeleting(true)
    try { await onDelete(tx.id); onClose() } catch { setErr('Delete failed. Is the backend running?'); setDeleting(false) }
  }

  const catOpts = cur.category && !STATEMENT_CATEGORIES.includes(cur.category) ? [cur.category, ...STATEMENT_CATEGORIES] : STATEMENT_CATEGORIES

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header"><h2 className="text-lg font-bold">Transaction details</h2></div>
        <div className="modal-body space-y-3">
          <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'var(--bg-base)' }}>
            <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>{cur.direction}</span>
            <strong className="text-lg mono" style={{ color: cur.direction === 'DEBIT' ? 'var(--danger)' : 'var(--success)' }}>
              {cur.direction === 'DEBIT' ? '−' : '+'}{money(cur.amount)}
            </strong>
            <small style={{ color: 'var(--text-faint)' }}>{cur.transactionDate}</small>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Merchant / counterparty</label><div className="font-semibold text-sm">{cur.merchant || 'Unknown'}</div></div>
            <div><label className="label">Account</label><div className="font-semibold text-sm">{accountDisplay(cur.account, accounts)}</div></div>
            <div>
              <label className="label">Category</label>
              <select className="select" value={cur.category || 'Other'} onChange={e => patch({ category: e.target.value })}>
                {catOpts.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={cur.transactionType || 'OTHER'}
                onChange={e => { const v = e.target.value; patch({ transactionType: v, excludedFromSpend: EXCLUDED_TX_TYPES.includes(v) }) }}>
                {STATEMENT_TX_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div><label className="label">Source statement</label><div className="text-sm truncate">{cur.sourceFile || '—'}</div></div>
            <div><label className="label">Description / reference</label><div className="text-sm truncate" title={cur.description}>{cur.description || '—'}</div></div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!cur.excludedFromSpend} onChange={e => patch({ excludedFromSpend: !e.target.checked })} />
            <span>{cur.excludedFromSpend ? 'Excluded from spending totals' : 'Included in spending totals'}</span>
          </label>
        </div>
        <div className="modal-footer flex items-center gap-2">
          {confirmDel ? (
            <>
              <span className="text-xs font-semibold mr-auto" style={{ color: 'var(--danger)' }}>Delete this transaction permanently?</span>
              <button className="btn-secondary" onClick={() => setConfirmDel(false)} disabled={deleting}>Cancel</button>
              <button className="btn-danger" onClick={removeTx} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete permanently'}</button>
            </>
          ) : (
            <>
              <span className="text-xs mr-auto" style={{ color: err ? 'var(--danger)' : 'var(--text-faint)' }}>{err || (saving ? 'Saving…' : 'Changes save automatically')}</span>
              <button className="btn-danger" onClick={() => setConfirmDel(true)}>Delete</button>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
