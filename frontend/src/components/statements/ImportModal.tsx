import { useState } from 'react'
import type { InspectResult } from '../../types/statements'
import type { ImportOverride, ColumnMapping } from '../../api/statements'
import { money } from './shared'

const BANKS = ['HDFC Bank', 'Kotak Mahindra Bank', 'IDFC FIRST Bank', 'ICICI Bank', 'Axis Bank', 'SBI', 'Unknown Bank']
const MAP_FIELDS: [keyof ColumnMapping, string][] = [
  ['date', 'Date'], ['description', 'Description / narration'], ['debit', 'Debit / Withdrawal'],
  ['credit', 'Credit / Deposit'], ['amount', 'Amount (single column)'], ['type', 'Type (Dr/Cr)'],
]

export interface QueueItem { file: File; x: InspectResult }

export function ImportModal({
  item, override, setOverride, onSkip, onConfirm, pwd, setPwd, onUnlock, unlocking, unlockErr, colMap, onRemap,
}: {
  item: QueueItem
  override: ImportOverride
  setOverride: (o: ImportOverride) => void
  onSkip: () => void
  onConfirm: () => void
  pwd: string
  setPwd: (v: string) => void
  onUnlock: () => void
  unlocking: boolean
  unlockErr: string
  colMap: ColumnMapping
  onRemap: (m: ColumnMapping) => void
}) {
  const enc = item.x?.encrypted
  const tabular = item.x?.fileKind === 'tabular'
  const columns = item.x?.columns || []

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onSkip()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 className="text-lg font-bold">{enc ? 'This PDF is password protected' : 'Check this statement before importing'}</h2>
        </div>
        <div className="modal-body space-y-3">
          <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{item.file.name}</p>

          {enc ? (
            <>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                🔒 Enter the password you use to open this statement. It's sent only to your own FinFlow backend to unlock the file, and isn't stored.
              </p>
              <div>
                <label className="label">PDF password</label>
                <input type="password" autoFocus className="input" value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && pwd && !unlocking) onUnlock() }}
                  placeholder="Enter statement password" />
              </div>
              {unlockErr && <div className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>{unlockErr}</div>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Bank</label>
                  <select className="select" value={override.bank} onChange={e => setOverride({ ...override, bank: e.target.value })}>
                    {BANKS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="select" value={override.type} onChange={e => setOverride({ ...override, type: e.target.value })}>
                    <option value="DEBIT">Debit / Savings</option>
                    <option value="CREDIT_CARD">Credit Card</option>
                  </select>
                </div>
                <div>
                  <label className="label">Account / card</label>
                  <input className="input" value={override.number || ''} onChange={e => setOverride({ ...override, number: e.target.value })} />
                </div>
                <div>
                  <label className="label">Transactions detected</label>
                  <div className="font-bold text-sm pt-2">{item.x.parsed ?? 0}</div>
                </div>
              </div>

              {tabular && columns.length > 0 && (
                <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
                  <div className="text-[12px] font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                    Map columns — match your file's columns to our fields
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MAP_FIELDS.map(([field, label]) => (
                      <label key={field} className="flex flex-col gap-0.5 text-[11px]">
                        <span style={{ color: 'var(--text-faint)' }}>{label}</span>
                        <select className="select text-[11px]" value={colMap?.[field] ?? ''}
                          onChange={e => onRemap({ ...colMap, [field]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                          <option value="">— none —</option>
                          {columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {(item.x.parsed ?? 0) > 0 ? (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="px-3 py-2 text-[12px] font-medium" style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
                    Parsed preview · first {(item.x.preview || []).length} of {(item.x.parsed || 0).toLocaleString('en-IN')}
                  </div>
                  {(item.x.preview || []).map((r, i) => (
                    <div key={i} className="grid items-center gap-2 px-3 py-1.5 text-[11px]" style={{ gridTemplateColumns: '88px 1fr auto', borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-faint)' }}>{r.date || '—'}</span>
                      <strong className="truncate font-medium" title={r.description}>{r.description || '—'}</strong>
                      <b style={{ color: r.direction === 'DEBIT' ? 'var(--danger)' : 'var(--success)' }}>{r.direction === 'DEBIT' ? '−' : '+'}{money(r.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(233,107,93,.12)', color: 'var(--danger)' }}>
                    ⚠ No transactions detected — this format isn't recognized yet. Don't import.
                    {tabular ? ' Map the columns above to match your file.' : ' See the extracted text below.'}
                  </div>
                  {!tabular && (item.x.extractedSample || []).length > 0 && (
                    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="px-3 py-2 text-[12px] font-medium" style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
                        Text extracted from your PDF · first {(item.x.extractedSample || []).length} lines
                      </div>
                      <div className="max-h-48 overflow-auto px-3 py-2 font-mono text-[11px] whitespace-pre-wrap" style={{ color: 'var(--text-faint)' }}>
                        {(item.x.extractedSample || []).join('\n')}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                Check the preview matches your statement before importing. Future statements for this account are grouped together, and overlapping duplicates are ignored.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onSkip}>Skip</button>
          {enc ? (
            <button className="btn-primary" disabled={!pwd || unlocking} onClick={onUnlock}>{unlocking ? 'Unlocking…' : 'Unlock PDF →'}</button>
          ) : (
            <button className="btn-primary" onClick={onConfirm}>Confirm &amp; import →</button>
          )}
        </div>
      </div>
    </div>
  )
}
