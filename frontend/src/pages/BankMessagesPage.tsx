import { ICON } from '../components/common/icons'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { bankMessagesApi, cardsApi, loansApi } from '../api'
import { EmptyState, LoadingSpinner, ErrorState } from '../components/common'
import { fmtINR } from '../utils/format'
import type { BankMessage, BankMessageKind } from '../types'

/* Bank messages: what FinFlow read from bank SMS (sent by the iPhone Shortcut) or text pasted here.
   Nothing changes your numbers until you confirm a message — then it goes through the same records the
   forms write: a card spend, a card bill, a paid tick, a card EMI. Matching is by the last 4 digits set
   on each card and loan. */

const KIND: Record<BankMessageKind, { label: string; color: string }> = {
  CARD_SPEND:     { label: 'Card spend',   color: 'var(--pink)' },
  CARD_STATEMENT: { label: 'Card bill',    color: 'var(--warning)' },
  CARD_PAYMENT:   { label: 'Card payment', color: 'var(--success)' },
  CARD_EMI:       { label: 'New card EMI', color: 'var(--purple)' },
  EMI_DEBIT:      { label: 'Loan EMI',     color: 'var(--info)' },
  IGNORED:        { label: 'Ignored',      color: 'var(--text-faint)' },
  UNKNOWN:        { label: 'Not recognised', color: 'var(--text-faint)' },
}
const fmtDay = (d?: string) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
const errText = (e: any) => e?.response?.data?.message ?? 'Something went wrong'

export default function BankMessagesPage() {
  const qc = useQueryClient()
  const { data: messages = [], isLoading, isError, refetch } = useQuery({ queryKey: ['bank-messages'], queryFn: bankMessagesApi.list })
  const { data: summary } = useQuery({ queryKey: ['bank-messages-summary'], queryFn: bankMessagesApi.summary })
  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: loans = [] } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })

  const [paste, setPaste] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showDone, setShowDone] = useState<boolean | null>(null)

  // Confirming changes cards, loans and paid ticks, so every page's numbers refresh.
  const refreshAll = () => { qc.invalidateQueries() }
  const confirmMut = useMutation({
    mutationFn: ({ id, e }: { id: number; e?: Record<string, unknown> }) => bankMessagesApi.confirm(id, e),
    onSuccess: m => { setEditing(null); setEdits({}); refreshAll(); toast.success(m.resultNote ?? 'Added') },
    onError: (e: any) => toast.error(errText(e)),
  })
  const ignoreMut = useMutation({ mutationFn: (id: number) => bankMessagesApi.ignore(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-messages'] }); qc.invalidateQueries({ queryKey: ['bank-messages-summary'] }) }, onError: (e: any) => toast.error(errText(e)) })
  const sureMut = useMutation({ mutationFn: bankMessagesApi.confirmSure, onSuccess: r => { refreshAll(); toast.success(`${r.confirmed} added${r.failed ? ` · ${r.failed} need a look` : ''}`) }, onError: (e: any) => toast.error(errText(e)) })
  const pasteMut = useMutation({
    mutationFn: (t: string) => bankMessagesApi.paste(t),
    onSuccess: m => { setPaste(''); qc.invalidateQueries({ queryKey: ['bank-messages'] }); qc.invalidateQueries({ queryKey: ['bank-messages-summary'] }); toast(m.status === 'NEW' ? `Read as: ${KIND[m.kind].label}` : `Not added: ${m.note ?? KIND[m.kind].label}`) },
    onError: (e: any) => toast.error(errText(e)),
  })
  const undoMut = useMutation({ mutationFn: (id: number) => bankMessagesApi.undo(id), onSuccess: () => { refreshAll(); toast.success('Undone: it is back in To review') }, onError: (e: any) => toast.error(errText(e)) })
  const autoMut = useMutation({ mutationFn: (on: boolean) => bankMessagesApi.setAutoAdd(on), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-messages-summary'] }), onError: (e: any) => toast.error(errText(e)) })
  const keyMut = useMutation({ mutationFn: bankMessagesApi.newKey, onSuccess: k => { setNewKey(k); qc.invalidateQueries({ queryKey: ['bank-messages-summary'] }) }, onError: (e: any) => toast.error(errText(e)) })
  const revokeMut = useMutation({ mutationFn: bankMessagesApi.revokeKey, onSuccess: () => { setNewKey(null); qc.invalidateQueries({ queryKey: ['bank-messages-summary'] }); toast.success('Shortcut key turned off') } })

  const waiting = messages.filter(m => m.status === 'NEW')
  const done = messages.filter(m => m.status !== 'NEW').slice(0, 40)
  const sureCount = waiting.filter(m => m.sure).length
  // Open by default when something was added automatically lately, so it's easy to check (and undo).
  const doneOpen = showDone ?? (summary?.autoAddedRecent ?? 0) > 0
  const cardName = useMemo(() => new Map((cards as any[]).map(c => [c.id, c.banker])), [cards])
  const loanName = useMemo(() => new Map((loans as any[]).map(l => [l.id, l.lender])), [loans])
  const targetName = (m: BankMessage) => m.targetId == null ? null : m.targetType === 'LOAN' ? loanName.get(m.targetId) : cardName.get(m.targetId)

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load bank messages." onRetry={() => refetch()} />

  /** What confirming will do, in plain words. */
  const outcome = (m: BankMessage, who: string | null) => {
    const amt = m.amount != null ? fmtINR(m.amount) : '—'
    const on = who ?? 'which card?'
    switch (m.kind) {
      case 'CARD_SPEND': return `Adds a ${amt} spend to ${on}`
      case 'CARD_STATEMENT': return `Sets ${on}'s bill to ${amt}${m.dueDate ? `, due ${fmtDay(m.dueDate)}` : ''}`
      case 'CARD_PAYMENT': return `Ticks ${on}'s bill as paid`
      case 'CARD_EMI': return `Adds a card EMI on ${on}: ${m.emiAmount != null ? fmtINR(m.emiAmount) : '₹?'} × ${m.tenure ?? '?'} months`
      case 'EMI_DEBIT': return `Ticks ${who ?? 'which loan?'} as paid for this month`
      default: return ''
    }
  }
  const startEdit = (m: BankMessage) => {
    setEditing(m.id)
    setEdits({ targetId: m.targetId ?? '', amount: m.amount ?? '', merchant: m.merchant ?? '', date: m.txnDate ?? '', emiAmount: m.emiAmount ?? '', tenure: m.tenure ?? '' })
  }
  const saveEdit = (m: BankMessage) => {
    const e: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(edits)) if (v !== '' && v != null) e[k] = v
    confirmMut.mutate({ id: m.id, e })
  }

  return (
    <div className="space-y-4 text-[13px] max-w-3xl">
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Bank SMS and alerts FinFlow has read. Cards and loans are matched by their last 4 digits: pick the card once
        for a new one and FinFlow remembers it.
      </p>

      <label className="card p-4 flex items-start justify-between gap-4 cursor-pointer">
        <span>
          <span className="block text-[14px] font-semibold">Add sure ones automatically</span>
          <span className="block text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            When the card or loan and the amount are clear, it's added right away. You can undo it under Added below.
            Anything unclear waits here for you.
          </span>
        </span>
        <input type="checkbox" role="switch" className="mt-1 w-5 h-5 flex-shrink-0 accent-orange-700" aria-label="Add sure ones automatically"
          checked={summary?.autoAdd ?? true} disabled={autoMut.isPending} onChange={e => autoMut.mutate(e.target.checked)} />
      </label>

      {/* ── Waiting ── */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 pb-3">
          <h2 className="text-[15px] font-semibold">To review{waiting.length > 0 && <span className="ml-1.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{waiting.length}</span>}</h2>
          {sureCount > 0 && (
            <button className="btn-primary btn-sm" disabled={sureMut.isPending} onClick={() => sureMut.mutate()}>
              {sureMut.isPending ? 'Adding…' : `Confirm all sure (${sureCount})`}
            </button>
          )}
        </div>
        {waiting.length === 0 ? (
          <EmptyState icon={ICON.messages} title="Nothing to review" sub="New bank SMS from your iPhone Shortcut, or messages you paste below, show up here." />
        ) : (
          <ul style={{ borderTop: '1px solid var(--hairline)' }}>
            {waiting.map(m => {
              const k = KIND[m.kind], who = targetName(m) ?? null, isEdit = editing === m.id
              const options = m.kind === 'EMI_DEBIT' ? (loans as any[]).map(l => ({ id: l.id, name: `${l.lender}${l.last4 ? ` ••${l.last4}` : ''}` })) : (cards as any[]).map(c => ({ id: c.id, name: `${c.banker}${c.last4 ? ` ••${c.last4}` : ''}` }))
              return (
                <li key={m.id} className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${k.color} 14%, transparent)`, color: k.color }}>{k.label}</span>
                        {m.sure && <span className="text-[11px]" style={{ color: 'var(--success)' }}>✓ sure</span>}
                        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{m.source === 'sms' ? 'SMS' : 'Pasted'} · {fmtDay(m.receivedAt.slice(0, 10))}</span>
                      </div>
                      <div className="mt-1 font-medium break-words">{outcome(m, who)}</div>
                      {(m.merchant || m.txnDate) && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{[m.merchant, m.txnDate && fmtDay(m.txnDate)].filter(Boolean).join(' · ')}</div>}
                    </div>
                    {m.amount != null && <div className="mono font-semibold tabular-nums flex-shrink-0">{fmtINR(m.amount)}</div>}
                  </div>
                  <details className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                    <summary className="cursor-pointer select-none">Message{m.last4 ? ` · ••${m.last4}` : ''}</summary>
                    <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                  </details>

                  {isEdit && (
                    <div className="form-grid">
                      <label className="text-[12px]"><span className="label">{m.kind === 'EMI_DEBIT' ? 'Loan' : 'Card'}</span>
                        <select className="select" value={edits.targetId} onChange={e => setEdits(x => ({ ...x, targetId: e.target.value }))}>
                          <option value="">Choose…</option>
                          {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </label>
                      <label className="text-[12px]"><span className="label">Amount (₹)</span>
                        <input className="input" inputMode="decimal" value={edits.amount} onChange={e => setEdits(x => ({ ...x, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
                      </label>
                      {(m.kind === 'CARD_SPEND' || m.kind === 'CARD_EMI') && (
                        <label className="text-[12px]"><span className="label">{m.kind === 'CARD_EMI' ? 'Item' : 'Where'}</span>
                          <input className="input" maxLength={60} value={edits.merchant} onChange={e => setEdits(x => ({ ...x, merchant: e.target.value }))} />
                        </label>
                      )}
                      {m.kind !== 'CARD_STATEMENT' && (
                        <label className="text-[12px]"><span className="label">Date</span>
                          <input className="input" type="date" value={edits.date} onChange={e => setEdits(x => ({ ...x, date: e.target.value }))} />
                        </label>
                      )}
                      {m.kind === 'CARD_EMI' && <>
                        <label className="text-[12px]"><span className="label">EMI / month (₹)</span>
                          <input className="input" inputMode="decimal" value={edits.emiAmount} onChange={e => setEdits(x => ({ ...x, emiAmount: e.target.value.replace(/[^\d.]/g, '') }))} />
                        </label>
                        <label className="text-[12px]"><span className="label">Months</span>
                          <input className="input" inputMode="numeric" value={edits.tenure} onChange={e => setEdits(x => ({ ...x, tenure: e.target.value.replace(/\D/g, '') }))} />
                        </label>
                      </>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {isEdit ? <>
                      <button className="btn-primary btn-xs" disabled={confirmMut.isPending} onClick={() => saveEdit(m)}>Confirm</button>
                      <button className="btn-secondary btn-xs" onClick={() => { setEditing(null); setEdits({}) }}>Cancel</button>
                    </> : <>
                      <button className="btn-primary btn-xs" disabled={confirmMut.isPending || m.targetId == null} title={m.targetId == null ? 'Choose the card or loan first (Edit)' : undefined}
                        onClick={() => confirmMut.mutate({ id: m.id })}>Confirm</button>
                      <button className="btn-secondary btn-xs" onClick={() => startEdit(m)}>{m.targetId == null ? 'Choose & confirm' : 'Edit'}</button>
                      <button className="btn-ghost btn-xs" disabled={ignoreMut.isPending} onClick={() => ignoreMut.mutate(m.id)}>Ignore</button>
                    </>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Paste ── */}
      <section className="card p-4 space-y-2">
        <h2 className="text-[15px] font-semibold">Paste a message</h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Copy a bank SMS or alert email and paste it here.</p>
        <textarea className="input w-full" rows={3} maxLength={1000} aria-label="Bank message text" placeholder="e.g. Rs.1,250.00 spent on HDFC Bank Card XX4521 at SWIGGY on 30-10-26…"
          value={paste} onChange={e => setPaste(e.target.value)} />
        <button className="btn-secondary btn-sm" disabled={!paste.trim() || pasteMut.isPending} onClick={() => pasteMut.mutate(paste)}>{pasteMut.isPending ? 'Reading…' : 'Read message'}</button>
      </section>

      {/* ── iPhone Shortcut ── */}
      <section className="card p-4 space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Send bank SMS automatically (iPhone)</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {summary?.hasKey ? 'A Shortcut key is on.' : 'Not set up yet.'} An iPhone Shortcut forwards only the messages you choose to FinFlow. Your phone must be connected to Tailscale.
          </p>
        </div>
        {newKey ? (
          <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
            <p className="text-[12px] font-medium">Your key (shown once; copy it into the Shortcut now):</p>
            <div className="flex gap-2 items-center flex-wrap">
              <code className="mono text-[12px] break-all flex-1 min-w-0">{newKey}</code>
              <button className="btn-secondary btn-xs" onClick={() => navigator.clipboard.writeText(newKey).then(() => toast.success('Key copied'), () => toast.error('Copy failed'))}>Copy key</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" disabled={keyMut.isPending} onClick={() => keyMut.mutate()}>{summary?.hasKey ? 'Make a new key' : 'Create key'}</button>
            {summary?.hasKey && <button className="btn-ghost btn-sm" onClick={() => revokeMut.mutate()}>Turn off</button>}
          </div>
        )}
        <ol className="list-decimal pl-5 space-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <li>Open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Message</b>.</li>
          <li><b>Message contains</b>: <code className="mono">card</code>, then <b>Run immediately</b>. (Make a second one with <code className="mono">EMI</code> for loan EMIs.)</li>
          <li>Add the action <b>Get contents of URL</b>:
            <div className="mt-1 space-y-0.5">
              <div>URL: <code className="mono break-all">{window.location.origin}/api/ingest/sms</code></div>
              <div>Method: <code className="mono">POST</code> · Header <code className="mono">X-FinFlow-Key</code> = your key</div>
              <div>Request body (JSON): <code className="mono">text</code> = Shortcut input → Content, <code className="mono">sender</code> = Shortcut input → Sender</div>
            </div>
          </li>
          <li>Done. New bank SMS appear in <b>To review</b> above.</li>
        </ol>
      </section>

      {/* ── Done ── */}
      {done.length > 0 && (
        <section className="card overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setShowDone(!doneOpen)} aria-expanded={doneOpen}>
            <h2 className="text-[15px] font-semibold">Added & ignored <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{done.length}</span></h2>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{doneOpen ? 'Hide' : 'Show'}</span>
          </button>
          {doneOpen && (
            <ul style={{ borderTop: '1px solid var(--hairline)' }}>
              {done.map(m => (
                <li key={m.id} className="px-4 py-2.5 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium" style={{ color: m.status === 'CONFIRMED' ? 'var(--success)' : 'var(--text-muted)' }}>
                      {m.status === 'CONFIRMED' ? `✓ ${m.resultNote ?? 'Added'}` : `Ignored${m.note ? ` · ${m.note}` : ''}`}
                      {m.autoAdded && <span className="ml-1.5 font-normal" style={{ color: 'var(--text-muted)' }}>· added automatically</span>}
                    </div>
                    <div className="text-[12px] truncate" style={{ color: 'var(--text-faint)' }}>{m.body}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{fmtDay(m.receivedAt.slice(0, 10))}</span>
                    {m.status === 'CONFIRMED' && <button className="btn-secondary btn-xs" disabled={undoMut.isPending} onClick={() => undoMut.mutate(m.id)}>Undo</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
