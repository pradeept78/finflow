import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { loansApi, cardsApi, closedLoansApi } from '../../api'
import { transactionsApi } from '../../api/statements'
import { useStatementFilterStore } from '../../store/statementFilterStore'
import type { Loan, CreditCard, ClosedLoan } from '../../types'
import type { Transaction } from '../../types/statements'
import { PageHeader, LoadingSpinner, ErrorState, EmptyState, Modal } from '../../components/common'
import { SectionCard, CardHead, FilterBar, money, formatTxDate } from '../../components/statements/shared'
import { dataManagementApi, statementAccountsApi } from '../../api/statements'
import { ChevronDown, Link2, Unlink } from 'lucide-react'
import toast from 'react-hot-toast'

// This page never writes anything back to your Loans/Cards/Closed Loans records — it's read-only
// by design (per your request: "no messing data, a preview page to track"). It just lines up your
// manually-entered debts against statement transactions that plausibly belong to them, using name
// + amount matching, so you can eyeball whether the two sources of truth agree. The one exception
// is manual linking (both the per-debt "Link manually" button and the "Unmatched transactions"
// browse panel below): it edits ONLY the transaction's own linkedDebtType/Id fields (a manual
// annotation), never your Loans/Cards/Closed Loans records themselves.

const normalize = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// A short lender/bank name (e.g. "SBI") risks false-positive substring matches — it can turn up
// inside unrelated words or codes that just happen to contain the same three letters. Below this
// length, require a whole-token match instead of "one string contains the other".
const TOKEN_EXACT_THRESHOLD = 4

// Loose "does this transaction plausibly belong to this lender/bank" check — one name containing
// the other (after stripping punctuation/case) catches most real-world cases ("HDFC Bank" vs
// "HDFCBANK EMI ..."), without needing a fuzzy-match library for what's ultimately just a visual aid.
const nameMatches = (candidate: string, target: string) => {
  const a = normalize(candidate), b = normalize(target)
  if (!a || !b) return false
  if (b.length < TOKEN_EXACT_THRESHOLD) {
    const tokens = (candidate || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    return tokens.includes(b)
  }
  return a.includes(b) || b.includes(a)
}

const txLabel = (t: Transaction) => `${t.merchant || ''} ${t.description || ''}`

type DebtType = 'LOAN' | 'CARD' | 'CLOSED'
type Quality = 'strong' | 'weak' | 'none'
function qualityBadge(q: Quality) {
  const map = { strong: ['✓ Matches well', 'var(--success)'], weak: ['~ Name matches, amount differs', 'var(--warning)'], none: ['No matching transactions found', 'var(--text-faint)'] } as const
  const [label, color] = map[q]
  return <span className="text-[11px] font-bold" style={{ color }}>{label}</span>
}

interface LinkTarget { type: DebtType; id: number; name: string; expectedAmount?: number }

function MatchRow({ title, sub, quality, matches, manualIds, extra, onLinkManually, onUnlink }: {
  title: string; sub?: string; quality: Quality; matches: Transaction[]; manualIds: Set<number>
  extra?: React.ReactNode; onLinkManually?: () => void; onUnlink?: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const total = matches.reduce((s, t) => s + Number(t.amount || 0), 0)
  const manualCount = matches.filter(t => manualIds.has(t.id)).length
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div className="w-full flex items-center gap-3 py-3 text-left">
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => setOpen(o => !o)} disabled={!matches.length}>
          <ChevronDown size={13} style={{ transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s', color: 'var(--text-faint)', flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <strong className="block truncate">{title}</strong>
            {sub && <small style={{ color: 'var(--text-faint)' }}>{sub}</small>}
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              {qualityBadge(quality)}
              {manualCount > 0 && <span className="text-[11px] font-bold" style={{ color: 'var(--info)' }}>✓ Manually linked ({manualCount})</span>}
            </div>
          </div>
        </button>
        {extra}
        {onLinkManually && (
          <button className="text-[11px] px-2 py-1 rounded font-medium flex-shrink-0 flex items-center gap-1"
            style={{ background: 'color-mix(in srgb, var(--info) 10%, transparent)', color: 'var(--info)', border: '1px solid color-mix(in srgb, var(--info) 20%, transparent)' }}
            onClick={onLinkManually}>
            <Link2 size={11} /> Link manually
          </button>
        )}
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-sm">{money(total)}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{matches.length} matched txn{matches.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      {open && matches.length > 0 && (
        <div className="pb-3 pl-6 space-y-1">
          {/* Manual links sorted to the front before slicing — otherwise a lender with 20+ auto
              matches could push a manually-linked transaction (appended after auto-matches) past
              the visible window, making it look unlinked even though it's saved. */}
          {[...matches].sort((a, b) => Number(manualIds.has(b.id)) - Number(manualIds.has(a.id))).slice(0, 20).map((t, i) => {
            const isManual = manualIds.has(t.id)
            return (
              <div key={t.id || i} className="grid items-center gap-2 py-1 text-[11px]" style={{ gridTemplateColumns: '110px 1fr auto auto' }}>
                <span style={{ color: 'var(--text-faint)' }}>{formatTxDate(t.transactionDate)}</span>
                <span className="truncate" title={t.description}>{t.merchant || t.description || '—'}{isManual && <span className="ml-1" style={{ color: 'var(--info)' }}>· manual</span>}</span>
                <b>{money(t.amount)}</b>
                {isManual && onUnlink ? (
                  <button title="Unlink" className="text-[11px] px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ color: 'var(--text-faint)' }} onClick={() => onUnlink(t.id)}>
                    <Unlink size={10} /> unlink
                  </button>
                ) : <span />}
              </div>
            )
          })}
          {matches.length > 20 && <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>+{matches.length - 20} more</div>}
        </div>
      )}
    </div>
  )
}

// Search-and-pick modal used by "Link manually" on a debt row — pre-filtered to the debt's own
// name, candidates sorted by amount-proximity to the expected EMI/outstanding first, then
// date-desc as a tiebreaker. A transaction already linked to a *different* debt is shown but
// disabled, to cheaply prevent double-linking the same transaction to two debts at once.
function LinkDebtModal({ target, account, resolveLabel, onClose, onLinked }: {
  target: LinkTarget; account?: string
  resolveLabel: (type: DebtType, id: number) => string
  onClose: () => void; onLinked: () => void
}) {
  const [search, setSearch] = useState(target.name)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const searchQ = useQuery({
    queryKey: ['stmt-debt-link-search', search, account],
    queryFn: () => transactionsApi.page({ q: search, account }, 0, 100),
    enabled: search.trim().length > 0,
  })

  const linkMut = useMutation({
    mutationFn: () => transactionsApi.bulkUpdate([...picked], { linkedDebtType: target.type, linkedDebtId: target.id }),
    onSuccess: () => { toast.success(`Linked ${picked.size} transaction${picked.size === 1 ? '' : 's'}`); onLinked(); onClose() },
    onError: () => toast.error('Failed to link — try again'),
  })

  const items = searchQ.data?.items || []
  const sorted = [...items].sort((a, b) => {
    if (target.expectedAmount) {
      const da = Math.abs(Number(a.amount) - target.expectedAmount)
      const db = Math.abs(Number(b.amount) - target.expectedAmount)
      if (da !== db) return da - db
    }
    return (b.transactionDate || '').localeCompare(a.transactionDate || '')
  })

  const toggle = (id: number) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <Modal title={`Link manually — ${target.name}`} onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!picked.size || linkMut.isPending} onClick={() => linkMut.mutate()}>
          {linkMut.isPending ? 'Linking...' : `Link ${picked.size || ''} transaction${picked.size === 1 ? '' : 's'}`.trim()}
        </button>
      </>}>
      <div className="space-y-2">
        <input className="input w-full" placeholder="Search merchant, UPI name, description..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          Pre-filled with "{target.name}" — edit the search if the transaction is labeled differently on your statement.
        </div>
        <div className="max-h-80 overflow-auto space-y-0.5">
          {searchQ.isLoading ? <LoadingSpinner /> : sorted.length === 0 ? (
            <div className="text-[11px] py-4 text-center" style={{ color: 'var(--text-faint)' }}>No transactions match "{search}"</div>
          ) : sorted.map(t => {
            const alreadyThis = t.linkedDebtType === target.type && t.linkedDebtId === target.id
            const linkedElsewhere = !!t.linkedDebtType && !alreadyThis
            const disabled = alreadyThis || linkedElsewhere
            return (
              <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px]"
                style={{ opacity: disabled ? 0.5 : 1, background: picked.has(t.id) ? 'var(--bg-hover)' : 'transparent', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <input type="checkbox" disabled={disabled} checked={picked.has(t.id) || alreadyThis} onChange={() => !disabled && toggle(t.id)} />
                <span style={{ width: 80, flexShrink: 0, color: 'var(--text-faint)' }}>{formatTxDate(t.transactionDate)}</span>
                <span className="flex-1 truncate">{t.merchant || t.description || '—'}</span>
                <b className="flex-shrink-0">{money(t.amount)}</b>
                {alreadyThis && <span className="flex-shrink-0" style={{ color: 'var(--success)' }}>✓ already linked here</span>}
                {linkedElsewhere && <span className="flex-shrink-0" style={{ color: 'var(--text-faint)' }}>already linked to {resolveLabel(t.linkedDebtType as DebtType, t.linkedDebtId!)}</span>}
              </label>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

// One row of the "Unmatched transactions" browse panel — the reverse of the per-debt flow above:
// instead of picking a debt and searching for its transaction, you start from a transaction that
// looks like a loan/EMI or card payment but didn't match anything, and assign it directly.
function AssignRow({ t, loans, cards, closed, pending, onAssign }: {
  t: Transaction; loans: Loan[]; cards: CreditCard[]; closed: ClosedLoan[]; pending: boolean
  onAssign: (id: number, type: DebtType, debtId: number) => void
}) {
  return (
    <div className="grid items-center gap-2 py-1.5 text-[11px]" style={{ gridTemplateColumns: '95px 1fr auto 190px' }}>
      <span style={{ color: 'var(--text-faint)' }}>{formatTxDate(t.transactionDate)}</span>
      <span className="truncate" title={t.description}>{t.merchant || t.description || '—'}</span>
      <b className="flex-shrink-0">{money(t.amount)}</b>
      <select className="select text-[11px] py-1" disabled={pending} defaultValue=""
        onChange={e => {
          const v = e.target.value
          if (!v) return
          const [type, idStr] = v.split(':')
          onAssign(t.id, type as DebtType, Number(idStr))
        }}>
        <option value="">Assign to...</option>
        {loans.length > 0 && <optgroup label="Loans">{loans.map(l => <option key={`L${l.id}`} value={`LOAN:${l.id}`}>{l.lender}</option>)}</optgroup>}
        {cards.length > 0 && <optgroup label="Credit cards">{cards.map(c => <option key={`C${c.id}`} value={`CARD:${c.id}`}>{c.banker}</option>)}</optgroup>}
        {closed.length > 0 && <optgroup label="Closed loans">{closed.map(cl => <option key={`X${cl.id}`} value={`CLOSED:${cl.id}`}>{cl.lender}</option>)}</optgroup>}
      </select>
    </div>
  )
}

export default function StatementsDebtMatchPage() {
  const qc = useQueryClient()
  const { account, profile, period } = useStatementFilterStore()
  const deps = [account, profile, period]
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null)
  const [assigningId, setAssigningId] = useState<number | null>(null)
  const [unmatchedSearch, setUnmatchedSearch] = useState('')

  const loansQ = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll })
  const cardsQ = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const closedQ = useQuery({ queryKey: ['closed-loans'], queryFn: closedLoansApi.getAll })
  const accountsQ = useQuery({ queryKey: ['stmt-accounts', profile], queryFn: statementAccountsApi.list })
  const yearsQ = useQuery({ queryKey: ['stmt-years', profile], queryFn: dataManagementApi.years })

  // Two calls, not one — /transactions/page only accepts a single transactionType value at a time.
  const emiQ = useQuery({ queryKey: ['stmt-debt-match-emi', ...deps], queryFn: () => transactionsApi.page({ account, transactionType: 'EMI' }, 0, 1000) })
  const loanQ = useQuery({ queryKey: ['stmt-debt-match-loan', ...deps], queryFn: () => transactionsApi.page({ account, transactionType: 'LOAN' }, 0, 1000) })
  const cardPayQ = useQuery({ queryKey: ['stmt-debt-match-cardpay', ...deps], queryFn: () => transactionsApi.page({ account, category: 'Credit Card Payment' }, 0, 1000) })
  // Manually-linked transactions, fetched separately by type so a manual link survives even when
  // the transaction's own category/type never matched the auto-detection pools above (that's
  // exactly the case manual linking exists for).
  const linkedLoanQ = useQuery({ queryKey: ['stmt-debt-match-linked-loan', ...deps], queryFn: () => transactionsApi.page({ account, linkedDebtType: 'LOAN' }, 0, 1000) })
  const linkedCardQ = useQuery({ queryKey: ['stmt-debt-match-linked-card', ...deps], queryFn: () => transactionsApi.page({ account, linkedDebtType: 'CARD' }, 0, 1000) })
  const linkedClosedQ = useQuery({ queryKey: ['stmt-debt-match-linked-closed', ...deps], queryFn: () => transactionsApi.page({ account, linkedDebtType: 'CLOSED' }, 0, 1000) })

  const refetchLinked = () => {
    qc.invalidateQueries({ queryKey: ['stmt-debt-match-linked-loan'] })
    qc.invalidateQueries({ queryKey: ['stmt-debt-match-linked-card'] })
    qc.invalidateQueries({ queryKey: ['stmt-debt-match-linked-closed'] })
  }

  const unlinkMut = useMutation({
    mutationFn: (id: number) => transactionsApi.update(id, { linkedDebtType: null, linkedDebtId: null }),
    onSuccess: () => { toast.success('Unlinked'); refetchLinked() },
    onError: () => toast.error('Failed to unlink — try again'),
  })

  // Powers the "Unmatched transactions" panel — a single transaction at a time, so a plain PATCH
  // rather than the bulk endpoint the per-debt modal uses.
  const assignMut = useMutation({
    mutationFn: ({ id, type, debtId }: { id: number; type: DebtType; debtId: number }) =>
      transactionsApi.update(id, { linkedDebtType: type, linkedDebtId: debtId }),
    onMutate: ({ id }) => setAssigningId(id),
    onSuccess: () => { toast.success('Assigned'); refetchLinked() },
    onError: () => toast.error('Failed to assign — try again'),
    onSettled: () => setAssigningId(null),
  })

  // Was only `loansQ.isError || emiQ.isError` — 2 of the 11 queries this page depends on. A failure
  // in any of the others (including accountsQ/yearsQ, which feed FilterBar and were still missing
  // even after that first fix) fell through silently and rendered with partial/undefined data
  // instead of the error state.
  const isLoading = loansQ.isLoading || cardsQ.isLoading || closedQ.isLoading || accountsQ.isLoading || yearsQ.isLoading
    || emiQ.isLoading || loanQ.isLoading || cardPayQ.isLoading
    || linkedLoanQ.isLoading || linkedCardQ.isLoading || linkedClosedQ.isLoading
  const isError = loansQ.isError || cardsQ.isError || closedQ.isError || accountsQ.isError || yearsQ.isError
    || emiQ.isError || loanQ.isError || cardPayQ.isError
    || linkedLoanQ.isError || linkedCardQ.isError || linkedClosedQ.isError

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Make sure the backend is running." onRetry={() => qc.invalidateQueries()} />

  const loanLikeTx = [...(emiQ.data?.items || []), ...(loanQ.data?.items || [])]
  const cardPayTx = cardPayQ.data?.items || []
  const loans = (loansQ.data || []) as Loan[]
  const cards = (cardsQ.data || []) as CreditCard[]
  const closed = (closedQ.data || []) as ClosedLoan[]

  const matchesFor = (name: string, pool: Transaction[]) => pool.filter(t => nameMatches(txLabel(t), name))
  const manualLinksFor = (type: DebtType, id: number): Transaction[] => {
    const pool = type === 'LOAN' ? linkedLoanQ.data?.items : type === 'CARD' ? linkedCardQ.data?.items : linkedClosedQ.data?.items
    return (pool || []).filter(t => t.linkedDebtId === id)
  }
  // Union of auto-matched and manually-linked transactions, deduped by id — a transaction can be
  // both (auto-matched AND manually confirmed) without appearing twice.
  const mergeMatches = (auto: Transaction[], manual: Transaction[]) => {
    const seen = new Set(auto.map(t => t.id))
    return [...auto, ...manual.filter(t => !seen.has(t.id))]
  }
  const resolveDebtLabel = (type: DebtType, id: number) => {
    if (type === 'LOAN') return loans.find(l => l.id === id)?.lender || `loan #${id}`
    if (type === 'CARD') return cards.find(c => c.id === id)?.banker || `card #${id}`
    return closed.find(cl => cl.id === id)?.lender || `closed loan #${id}`
  }

  // Every one of these queries is capped at 1000 rows (see the .page(..., 0, 1000) calls above) —
  // this used to only watch the 3 auto-match pools, so a debt type with 1000+ manual links (the
  // linkedLoan/linkedCard/linkedClosed queries) could silently hide entries past the cap with no
  // warning at all.
  const truncatedWarning = (emiQ.data && emiQ.data.total > (emiQ.data.items?.length || 0)) ||
    (loanQ.data && loanQ.data.total > (loanQ.data.items?.length || 0)) ||
    (cardPayQ.data && cardPayQ.data.total > (cardPayQ.data.items?.length || 0)) ||
    (linkedLoanQ.data && linkedLoanQ.data.total > (linkedLoanQ.data.items?.length || 0)) ||
    (linkedCardQ.data && linkedCardQ.data.total > (linkedCardQ.data.items?.length || 0)) ||
    (linkedClosedQ.data && linkedClosedQ.data.total > (linkedClosedQ.data.items?.length || 0))

  // ── Unmatched transactions: the reverse-direction view ──────────────────────────────────────
  // Every loan-like/card-payment transaction that no loan, card, or closed loan already claims
  // (by name match or manual link) — so instead of picking a debt and searching for its
  // transaction, you can start from the transaction and point it at the right debt directly.
  const matchedLoanIds = new Set(loans.flatMap(l => matchesFor(l.lender, loanLikeTx).map(t => t.id)))
  const matchedClosedIds = new Set(closed.flatMap(cl => matchesFor(cl.lender, loanLikeTx).map(t => t.id)))
  const matchedCardIds = new Set(cards.flatMap(c => matchesFor(c.banker, cardPayTx).map(t => t.id)))
  const linkedAnyIds = new Set([
    ...(linkedLoanQ.data?.items || []), ...(linkedCardQ.data?.items || []), ...(linkedClosedQ.data?.items || []),
  ].map(t => t.id))

  const q = unmatchedSearch.trim().toLowerCase()
  const searchFilter = (t: Transaction) => !q || txLabel(t).toLowerCase().includes(q)

  const unmatchedLoanLike = loanLikeTx
    .filter(t => !matchedLoanIds.has(t.id) && !matchedClosedIds.has(t.id) && !linkedAnyIds.has(t.id))
    .filter(searchFilter)
  const unmatchedCardPay = cardPayTx
    .filter(t => !matchedCardIds.has(t.id) && !linkedAnyIds.has(t.id))
    .filter(searchFilter)
  const unmatchedTotal = unmatchedLoanLike.length + unmatchedCardPay.length

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Debt matching — statements vs your records" />
      <FilterBar years={yearsQ.data || []} accounts={accountsQ.data || []} />
      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'color-mix(in srgb, var(--info) 10%, transparent)', color: 'var(--info)' }}>
        This page only compares — it never edits your Loans, Credit Cards or Closed Loans. Matching is by lender/bank name + amount, so double-check anything marked "amount differs" before trusting it. When auto-matching can't find a transaction, use "Link manually" (or the browse list below) to point it at the right loan/card/closed loan yourself — that only tags the transaction, nothing else.
      </div>
      {truncatedWarning && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', color: 'var(--warning)' }}>
          You have more matching transactions than fit in one page — this view is capped at 1000 rows per type, so totals below may undercount for very large statement histories.
        </div>
      )}

      <SectionCard>
        <CardHead eyebrow="Unmatched" title={`Unmatched transactions (${unmatchedTotal})`} />
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-faint)' }}>
          These look like loan/EMI or credit card payments but didn't match any lender/bank name above — assign each one directly instead of hunting for it from the debt side.
        </p>
        {(loanLikeTx.length + cardPayTx.length) > 0 && (
          <input className="input w-full mb-2" placeholder="Filter by merchant/description..." value={unmatchedSearch} onChange={e => setUnmatchedSearch(e.target.value)} />
        )}
        {unmatchedTotal === 0 ? (
          <EmptyState icon="✓" title={q ? 'No unmatched transactions match your filter' : 'Nothing unmatched — every loan/EMI and card payment is accounted for'} />
        ) : (
          <div className="max-h-96 overflow-auto divide-y" style={{ borderColor: 'var(--border)' }}>
            {unmatchedLoanLike.length > 0 && (
              <div className="pb-1">
                <div className="text-[13px] font-semibold py-1" style={{ color: 'var(--text-faint)' }}>Loan / EMI — {unmatchedLoanLike.length}</div>
                {unmatchedLoanLike.slice(0, 100).map(t => (
                  <AssignRow key={t.id} t={t} loans={loans} cards={cards} closed={closed} pending={assigningId === t.id}
                    onAssign={(id, type, debtId) => assignMut.mutate({ id, type, debtId })} />
                ))}
                {unmatchedLoanLike.length > 100 && <div className="text-[11px] pt-1" style={{ color: 'var(--text-faint)' }}>+{unmatchedLoanLike.length - 100} more — narrow with the filter above</div>}
              </div>
            )}
            {unmatchedCardPay.length > 0 && (
              <div className="pt-2">
                <div className="text-[13px] font-semibold py-1" style={{ color: 'var(--text-faint)' }}>Credit Card Payment — {unmatchedCardPay.length}</div>
                {unmatchedCardPay.slice(0, 100).map(t => (
                  <AssignRow key={t.id} t={t} loans={loans} cards={cards} closed={closed} pending={assigningId === t.id}
                    onAssign={(id, type, debtId) => assignMut.mutate({ id, type, debtId })} />
                ))}
                {unmatchedCardPay.length > 100 && <div className="text-[11px] pt-1" style={{ color: 'var(--text-faint)' }}>+{unmatchedCardPay.length - 100} more — narrow with the filter above</div>}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <CardHead eyebrow="Loans" title="Loans vs EMI/loan transactions" />
        {loans.length ? loans.map(l => {
          const autoMatches = matchesFor(l.lender, loanLikeTx)
          const manualMatches = manualLinksFor('LOAN', l.id!)
          const matches = mergeMatches(autoMatches, manualMatches)
          const avgAmt = autoMatches.length ? autoMatches.reduce((s, t) => s + Number(t.amount || 0), 0) / autoMatches.length : 0
          const autoQuality: Quality = !autoMatches.length ? 'none' : (l.emi && Math.abs(avgAmt - l.emi) / l.emi <= 0.15 ? 'strong' : 'weak')
          const quality: Quality = manualMatches.length > 0 && autoQuality !== 'strong' ? 'strong' : autoQuality
          const manualIds = new Set(manualMatches.map(t => t.id))
          return <MatchRow key={l.id} title={l.lender} sub={`EMI ${money(l.emi)} · ${l.loanType || 'Loan'}`} quality={quality} matches={matches} manualIds={manualIds}
            onLinkManually={autoQuality !== 'strong' ? () => setLinkTarget({ type: 'LOAN', id: l.id!, name: l.lender, expectedAmount: l.emi }) : undefined}
            onUnlink={id => unlinkMut.mutate(id)} />
        }) : <EmptyState icon="🏦" title="No loans on record yet" />}
      </SectionCard>

      <SectionCard>
        <CardHead eyebrow="Credit cards" title="Cards vs 'Credit Card Payment' transactions" />
        {cards.length ? cards.map(c => {
          const autoMatches = matchesFor(c.banker, cardPayTx)
          const manualMatches = manualLinksFor('CARD', c.id!)
          const matches = mergeMatches(autoMatches, manualMatches)
          // A single matched transaction is plausible but not confident — a name match alone
          // doesn't rule out coincidence the way a repeated pattern does. Require 2+ matches
          // before calling it "strong", same reasoning as the loan-side EMI-amount check above.
          const autoQuality: Quality = autoMatches.length >= 2 ? 'strong' : autoMatches.length === 1 ? 'weak' : 'none'
          const quality: Quality = manualMatches.length > 0 && autoQuality !== 'strong' ? 'strong' : autoQuality
          const manualIds = new Set(manualMatches.map(t => t.id))
          return <MatchRow key={c.id} title={c.banker} sub={`Outstanding ${money(c.outstanding)} · Limit ${money(c.cardLimit)}`} quality={quality} matches={matches} manualIds={manualIds}
            onLinkManually={autoQuality !== 'strong' ? () => setLinkTarget({ type: 'CARD', id: c.id!, name: c.banker, expectedAmount: c.outstanding || undefined }) : undefined}
            onUnlink={id => unlinkMut.mutate(id)} />
        }) : <EmptyState icon="💳" title="No credit cards on record yet" />}
      </SectionCard>

      <SectionCard>
        <CardHead eyebrow="Closed loans" title="Any activity after closing?" />
        {closed.length ? closed.map(cl => {
          const autoMatches = matchesFor(cl.lender, loanLikeTx)
          const manualMatches = manualLinksFor('CLOSED', cl.id!)
          const matches = mergeMatches(autoMatches, manualMatches)
          const afterClose = cl.closedDate ? matches.filter(t => t.transactionDate && t.transactionDate > cl.closedDate!) : matches
          const quality: Quality = !matches.length ? 'none' : (afterClose.length ? 'weak' : 'strong')
          const manualIds = new Set(manualMatches.map(t => t.id))
          return (
            <MatchRow key={cl.id} title={cl.lender} sub={`Closed ${cl.closedDate || '—'} · ${cl.purpose || cl.assetType || 'Closed loan'}`}
              quality={quality} matches={matches} manualIds={manualIds}
              onLinkManually={!autoMatches.length ? () => setLinkTarget({ type: 'CLOSED', id: cl.id!, name: cl.lender }) : undefined}
              onUnlink={id => unlinkMut.mutate(id)}
              extra={afterClose.length > 0 && <span className="text-[11px] font-bold flex-shrink-0" style={{ color: 'var(--danger)' }}>⚠ {afterClose.length} txn{afterClose.length === 1 ? '' : 's'} after closing</span>} />
          )
        }) : <EmptyState icon="✅" title="No closed loans on record yet" />}
      </SectionCard>

      {linkTarget && (
        <LinkDebtModal target={linkTarget} account={account} resolveLabel={resolveDebtLabel}
          onClose={() => setLinkTarget(null)} onLinked={refetchLinked} />
      )}
    </div>
  )
}
