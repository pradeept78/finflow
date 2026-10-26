import { KpiTile } from '../components/common/KpiTile'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../api'
import { fmtINR } from '../utils/format'
import { useState, useMemo } from 'react'
import { buildMasterRows } from '../utils/buildMasterRows'
import { CommitmentLedger } from '../components/CommitmentLedger'

/* The backend already computes 40 fields per user. This page used to read only 21 of them and
   throw the rest away, which is why it looked like it had "fewer data" than the app actually knew:
   the entire monthly-outflow breakdown, the interest burden, card limits, owned assets, chit
   repayment and every entity count except loans were all being fetched and discarded. */

const L = (n: number) => {
  // ₹49,999 used to render as "₹0L" because this rounded to whole lakhs. Sub-lakh users
  // saw their whole net worth collapse to zero.
  const a = Math.abs(n)
  if (a >= 10000000) return (a / 10000000).toFixed(2) + 'Cr'
  if (a >= 100000)   return (a / 100000).toFixed(2) + 'L'
  if (a >= 1000)     return (a / 1000).toFixed(1) + 'K'
  return String(Math.round(a))
}
const signed = (n: number) => (n >= 0 ? '+' : '−') + '₹' + L(n)
const pos = 'var(--success)', neg = 'var(--danger)', warn = '#f59e0b', info = 'var(--info)', mut = 'var(--purple)'
/* Must be a literal hex, never `var(--text-faint)`. Tile builds its background and border by
   appending an alpha suffix to this string; `var(--text-faint)10` is not a colour, so the tile
   silently loses its box and sits unstyled next to its neighbours. */
const faint = '#94a3b8'

const fmtDate = (d: any) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const ago = (d: any) => {
  if (!d) return 'never'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return 'never'
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return days + 'd ago'
  if (days < 365) return Math.floor(days / 30) + 'mo ago'
  return Math.floor(days / 365) + 'y ago'
}

type SortKey = 'name' | 'debt' | 'networth' | 'free' | 'score'

export default function AdminPage() {
  const qc = useQueryClient()
  const { data: isAdmin = false, isLoading: isAdminLoading, isError: isAdminError, refetch: refetchIsAdmin } = useQuery({ queryKey: ['is-admin'], queryFn: adminApi.isAdmin })
  const { data: users = [], isLoading: isUsersLoading, isError: isUsersError, refetch: refetchUsers } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.getUsers, enabled: !!isAdmin })
  const [resetModal, setResetModal] = useState<{ userId: number; email: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void; typeToConfirm?: string } | null>(null)
  const [typed, setTyped] = useState('')
  // Result banner for admin actions — the backend now refuses lock-out moves (demoting yourself or
  // the last admin), and those refusals must be visible instead of silently doing nothing.
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong'
  const [expandedUser, setExpandedUser] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('debt')
  // Full per-item ledger for one user at a time, fetched only once an admin actually asks for it
  // (GET /admin/users/{id}/commitments) — the aggregate figures above come for free with the user
  // list, but the raw loans/cards/EMIs/etc. a user actually has are a separate, heavier call.
  const [ledgerUserId, setLedgerUserId] = useState<number | null>(null)
  const [ledgerGroupBy, setLedgerGroupBy] = useState<'type' | 'card'>('type')
  const { data: ledgerData, isLoading: ledgerLoading, isError: ledgerError } = useQuery({
    queryKey: ['admin-user-commitments', ledgerUserId],
    queryFn: () => adminApi.getUserCommitments(ledgerUserId as number),
    enabled: ledgerUserId != null,
  })

  // Side-by-side comparison: pick up to two users (⚖ button on each card) and see their Full
  // Ledgers next to each other. Two fixed query slots rather than a loop over compareIds, since
  // hooks can't be called a variable number of times — the queryKey matches the one Full Ledger
  // uses above, so a user already expanded there is served from cache instead of refetched.
  const [compareIds, setCompareIds] = useState<number[]>([])
  const [compareGroupBy, setCompareGroupBy] = useState<'type' | 'card'>('type')
  // Bump counters, not booleans — CommitmentLedger watches these with useEffect and reacts to a
  // changed value, including clicking "Expand all" twice in a row, which a plain boolean toggle
  // would silently no-op on the second click.
  const [compareExpandSignal, setCompareExpandSignal] = useState(0)
  const [compareCollapseSignal, setCompareCollapseSignal] = useState(0)
  const compareA = compareIds[0] ?? null
  const compareB = compareIds[1] ?? null
  const { data: compareDataA, isLoading: compareALoading, isError: compareAError } = useQuery({
    queryKey: ['admin-user-commitments', compareA],
    queryFn: () => adminApi.getUserCommitments(compareA as number),
    enabled: compareA != null,
  })
  const { data: compareDataB, isLoading: compareBLoading, isError: compareBError } = useQuery({
    queryKey: ['admin-user-commitments', compareB],
    queryFn: () => adminApi.getUserCommitments(compareB as number),
    enabled: compareB != null,
  })
  // Selecting a third user drops the oldest rather than refusing the click — keeps the
  // interaction a plain toggle instead of needing an explicit "replace which one?" step.
  const toggleCompare = (id: number) => setCompareIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id])

  const resetMut  = useMutation({ mutationFn: ({ id, pw }: { id: number; pw: string }) => adminApi.resetPassword(id, pw), onSuccess: () => { setResetModal(null); setNewPassword(''); setNotice({ kind: 'ok', text: 'Password reset. Ask the user to sign in and change it.' }) }, onError: (e: any) => setNotice({ kind: 'err', text: errText(e) }) })
  const roleMut   = useMutation({ mutationFn: ({ id, role }: { id: number; role: string }) => adminApi.setRole(id, role), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirmModal(null); setNotice({ kind: 'ok', text: 'Role updated.' }) }, onError: (e: any) => { setConfirmModal(null); setNotice({ kind: 'err', text: errText(e) }) } })
  const deleteMut = useMutation({ mutationFn: (id: number) => adminApi.deleteUser(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirmModal(null); setNotice({ kind: 'ok', text: 'User deleted.' }) }, onError: (e: any) => { setConfirmModal(null); setNotice({ kind: 'err', text: errText(e) }) } })

  /* Derive every figure once, here, so the cards, the banner, the sort and the chart all agree.
     Previously DTI was computed inline from loanEmi alone while Free/Month used the server's
     full monthlyOutflow, so a user could show "DTI 18%" next to a negative free-cash figure. */
  const rows = useMemo(() => (users as any[]).map((u: any) => {
    const income   = Number(u.monthlyIncome ?? 0)
    const loanEmi  = Number(u.loanEmi ?? 0)
    const ccEmiMo  = Number(u.ccEmiMo ?? 0)
    const ccSpends = Number(u.ccSpends ?? 0)
    const ccOut    = Number(u.ccOutstanding ?? 0)
    const ccLimit  = Number(u.ccLimit ?? 0)

    /* Is the server actually sending the outflow breakdown?
       This matters more than it looks. When the API is an older build these fields are simply
       absent, every `?? 0` below fires, and `lockedMo` silently collapses to loan EMI + CC EMI —
       a plausible-looking number that omitted bills, insurance, savings, chit and I Owe. On real
       data that reported "+₹1.26L free" when the user was actually ₹22,551 SHORT. A missing
       field must never be allowed to read as a zero commitment, so the figures that depend on
       this breakdown are withheld rather than guessed. */
    const BREAKDOWN_FIELDS = ['lockedMonthly', 'expenseMo', 'insuranceMo', 'savingsMo', 'sipMo', 'personalEmiMo']
    const hasBreakdown = BREAKDOWN_FIELDS.some(f => u[f] != null)

    // Locked recurring commitment: everything that repeats identically next month.
    // Prefer the server's `lockedMonthly`. Do NOT fall back to `monthlyOutflow` — that figure
    // is locked + card, so using it here would fold the card balance into the recurring number
    // and then add it a second time as cardThisMonth.
    const lockedMo = !hasBreakdown ? null
      : u.lockedMonthly != null
        ? Number(u.lockedMonthly)
        : loanEmi + ccEmiMo + Number(u.personalEmiMo ?? 0) + Number(u.expenseMo ?? 0)
          + Number(u.insuranceMo ?? 0) + Number(u.savingsMo ?? 0) + Number(u.sipMo ?? 0)

    // The card balance is a one-month event, not a standing commitment — kept separate.
    // This one is safe to derive locally: ccOutstanding and ccSpends are sent by every API build.
    const cardThisMonth = u.cardThisMonth != null ? Number(u.cardThisMonth) : ccOut + ccSpends
    const totalThisMonth = lockedMo != null ? lockedMo + cardThisMonth : null

    // DTI against the FULL locked commitment, not just loan EMIs. The old loan-only ratio
    // understated leverage badly: a user with ₹2.8L of commitments on ₹2.5L income showed 18%.
    const dti  = income > 0 && lockedMo != null ? Math.round(lockedMo / income * 100) : null
    /* Utilisation is everything currently drawn against the limit, not just the billed statement.
       Unbilled spends reduce available credit exactly as much as the outstanding balance does —
       with ₹0 outstanding and ₹9,500 spent against a ₹17,000 limit this reported 0% when the card
       was 56% utilised, which is the difference between "fine" and "hurting your credit score". */
    const util = ccLimit > 0 ? Math.round((ccOut + ccSpends) / ccLimit * 100) : null
    // `freeMonth` from an older API is income − (EMIs only), which overstates free cash. Only
    // trust it once the breakdown confirms this build computes the full commitment.
    const freeMo = income > 0 && hasBreakdown
      ? (u.freeMonth != null ? Number(u.freeMonth) : income - (lockedMo ?? 0))
      : null

    // freeMo is read below, so it must be declared before `score`. It previously sat after,
    // putting it in the temporal dead zone and crashing the page whenever the API sent no score.
    const score = u.score != null ? Number(u.score)
      : income === 0 && Number(u.totalDebt ?? 0) > 0 ? 20
      : Math.max(0, Math.min(100, 100 - (dti ?? 100)
          - (Number(u.netWorth ?? 0) < 0 ? 10 : 0)
          - (freeMo != null && freeMo < 0 ? 15 : 0)
          - ((util ?? 0) > 50 ? 10 : 0)))

    return {
      u, income, loanEmi, ccEmiMo, ccSpends, ccOut, ccLimit, hasBreakdown,
      lockedMo, cardThisMonth, totalThisMonth, dti, util, freeMo, score,
      nw: Number(u.netWorth ?? 0), debt: Number(u.totalDebt ?? 0),
    }
  }), [users])

  const exportUsersCsv = () => {
    const esc = (v: any) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const head = ['Name', 'Email', 'Role', 'Joined', 'Last seen', 'Debt', 'Monthly income', 'Net worth', 'Free per month', 'Health score']
    const lines = visible.map(r => [r.u.name, r.u.email, r.u.role, r.u.createdAt ?? '', r.u.lastLogin ?? '', Math.round(r.debt), Math.round(r.income), Math.round(r.nw), r.freeMo == null ? '' : Math.round(r.freeMo), r.score].map(esc).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finflow-users-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // If the API is not sending the breakdown, say so loudly at the top of the page rather than
  // letting each card quietly render a figure that is missing most of the user's commitments.
  const staleApi = rows.length > 0 && rows.every(r => !r.hasBreakdown)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const f = q ? rows.filter(r => (r.u.name ?? '').toLowerCase().includes(q) || (r.u.email ?? '').toLowerCase().includes(q)) : rows
    // Copy before sorting: .sort() mutates in place, and these rows derive from the
    // React Query cache — sorting them directly would reorder the cached array.
    return [...f].sort((a, b) =>
      sortKey === 'name'     ? String(a.u.name ?? '').localeCompare(String(b.u.name ?? ''))
      : sortKey === 'networth' ? a.nw - b.nw
      : sortKey === 'free'   ? (a.freeMo ?? -Infinity) - (b.freeMo ?? -Infinity)
      : sortKey === 'score'  ? a.score - b.score
      : b.debt - a.debt)
  }, [rows, search, sortKey])

  // Previously an is-admin fetch failure (or the brief loading window) silently defaulted `isAdmin`
  // to false, so an actual admin whose request was still loading or had failed saw the same
  // "🔒 Admin access required" message as someone genuinely unauthorized — indistinguishable from
  // a real permissions problem.
  if (isAdminLoading) return <div className="p-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Checking admin access…</div>
  if (isAdminError) return (
    <div className="p-8 text-center text-[13px]" style={{ color: neg }}>
      Failed to check admin access. <button className="btn-secondary btn-sm ml-2" onClick={() => refetchIsAdmin()}>Retry</button>
    </div>
  )
  if (!isAdmin) return <div className="p-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>🔒 Admin access required</div>
  if (isUsersLoading) return <div className="p-8 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Loading users…</div>
  if (isUsersError) return (
    <div className="p-8 text-center text-[13px]" style={{ color: neg }}>
      Failed to load users. <button className="btn-secondary btn-sm ml-2" onClick={() => refetchUsers()}>Retry</button>
    </div>
  )

  const totalDebt    = rows.reduce((s, r) => s + r.debt, 0)
  const totalNW      = rows.reduce((s, r) => s + r.nw, 0)
  const totalEarned  = rows.reduce((s, r) => s + Number(r.u.totalEarned ?? 0), 0)
  const totalLocked  = rows.reduce((s, r) => s + (r.lockedMo ?? 0), 0)
  const totalIncome  = rows.reduce((s, r) => s + r.income, 0)
  const maxDebt      = rows.reduce((m, r) => Math.max(m, r.debt), 0)   // hoisted out of the render loop
  const maxNW        = rows.reduce((m, r) => Math.max(m, Math.abs(r.nw)), 0)
  // Only rows whose commitment is actually known can be judged at-risk. Without the breakdown
  // `dti` is null and `score` is a guess, and the banner rendered the literal text "DTI null%".
  const atRisk       = rows.filter(r => r.hasBreakdown && r.score < 40)
  const noIncome     = rows.filter(r => r.income === 0 && r.debt > 0)

  const scoreColor = (s: number) => (s >= 60 ? pos : s >= 40 ? warn : neg)
  const dtiColor   = (d: number | null) => (d == null ? 'var(--text-faint)' : d <= 40 ? pos : d <= 70 ? warn : neg)
  const utilColor  = (v: number | null) => (v == null ? 'var(--text-faint)' : v <= 30 ? pos : v <= 60 ? warn : neg)

  const Tile = ({ label, value, color, sub }: any) => <KpiTile label={label} value={value} accent={color} sub={sub} />

  const Line = ({ label, value, color = 'var(--text-faint)' }: any) => (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="mono text-[11px]" style={{ color }}>{value}</span>
    </div>
  )

  return (
    <div className="space-y-4 text-[13px]">

      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[12px]" role="status"
             style={{ background: notice.kind === 'ok' ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)', color: notice.kind === 'ok' ? 'var(--success)' : 'var(--danger)', border: `1px solid ${notice.kind === 'ok' ? 'color-mix(in srgb, var(--success) 25%, transparent)' : 'color-mix(in srgb, var(--danger) 25%, transparent)'}` }}>
          <span>{notice.kind === 'ok' ? '✓ ' : '⚠ '}{notice.text}</span>
          <button className="text-[11px] underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {/* ── COMBINED ── */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-x-4 gap-y-3 flex-wrap">
          <div>
            <div className="text-[12px] mb-0.5" style={{ color: 'var(--text-faint)' }}>🛡️ Admin panel · {rows.length} user{rows.length === 1 ? '' : 's'}</div>
            {/* This was hardcoded red, so a healthy positive combined net worth still read as a warning. */}
            <div className="text-2xl font-semibold tracking-tight mono" style={{ color: totalNW >= 0 ? pos : neg }}>
              {signed(totalNW)}
              <span className="text-[13px] font-normal ml-2" style={{ color: 'var(--text-faint)' }}>combined net worth</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input aria-label="Search users" className="input text-[12px] py-1.5 w-52" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
            <select aria-label="Sort users" className="select text-[12px] py-1.5 w-auto" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
              <option value="debt">Sort: Debt ↓</option>
              <option value="networth">Sort: Net worth ↑</option>
              <option value="free">Sort: Free/mo ↑</option>
              <option value="score">Sort: Health ↑</option>
              <option value="name">Sort: Name A–Z</option>
            </select>
            <button onClick={() => window.open('/api/admin/export', '_blank')} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0" style={{ background: 'var(--bg-hover)', border: '1px solid var(--hairline)', color: 'var(--text-muted)', cursor: 'pointer' }}>⬇ Export all</button>
            <button onClick={exportUsersCsv} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0" style={{ background: 'var(--bg-hover)', border: '1px solid var(--hairline)', color: 'var(--text-muted)', cursor: 'pointer' }} title="Download the users shown below as a spreadsheet">⬇ Users CSV</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile label="Combined Debt"  value={fmtINR(totalDebt)}   color={neg}  sub={`across ${rows.length} users`} />
          <Tile label="Combined NW"    value={signed(totalNW)}     color={totalNW >= 0 ? pos : neg} sub={`peak ₹${L(maxNW)}`} />
          <Tile label="Lifetime Earned" value={fmtINR(totalEarned)} color={pos}  sub="all users" />
          <Tile label="Committed / Month" value={staleApi ? '—' : fmtINR(Math.round(totalLocked))} color="var(--warning)" sub={staleApi ? 'API not sending breakdown' : totalIncome > 0 ? `${Math.round(totalLocked / totalIncome * 100)}% of income` : 'no income set'} />
          <Tile label="Combined Income" value={fmtINR(Math.round(totalIncome))} color={info} sub={`${rows.filter(r => r.income > 0).length} with income`} />
          <Tile label="Users"          value={`${rows.length}`}    color={mut}  sub={`${rows.filter(r => r.u.role === 'ADMIN').length} admin · ${atRisk.length} at risk`} />
        </div>
      </div>

      {/* The API is running an older build that does not send the outflow breakdown. Without it
          the locked commitment can only be guessed from EMIs, which omits bills, insurance,
          savings, chit and I Owe — and the resulting free-cash figure reads far too healthy.
          Better to say so than to print a confident wrong number. */}
      {staleApi && (
        <div className="rounded-2xl px-4 py-3 flex items-start gap-2 text-[11px]" style={{ background: `color-mix(in srgb, ${neg} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${neg} 25%, transparent)` }}>
          <span>🔄</span>
          <span style={{ color: neg }}>
            <b>Backend is out of date.</b> The API is not returning the monthly-outflow breakdown
            (<span className="mono">lockedMonthly</span>, <span className="mono">expenseMo</span>,
            {' '}<span className="mono">insuranceMo</span>, <span className="mono">savingsMo</span>,
            {' '}<span className="mono">personalEmiMo</span>), so Committed/Month, DTI and Free/Month
            are withheld — computing them from EMIs alone would omit bills, insurance, savings and
            chit, and overstate free cash by a wide margin. Rebuild with{' '}
            <span className="mono">docker compose build backend &amp;&amp; docker compose up -d</span>.
          </span>
        </div>
      )}

      {/* ── INSIGHT ── */}
      {!staleApi && (atRisk.length > 0 || noIncome.length > 0) && (
        <div className="space-y-2 text-[13px]">
          {noIncome.length > 0 && (
            <div className="rounded-2xl px-4 py-2.5 flex items-start gap-2 text-[11px]" style={{ background: `color-mix(in srgb, ${neg} 7%, transparent)`, border: `1px solid color-mix(in srgb, ${neg} 19%, transparent)` }}>
              <span>🚫</span>
              <span style={{ color: neg }}><b>{noIncome.map(r => r.u.name).join(', ')}</b> — debt recorded but no income set, so DTI, free cash and health score cannot be computed for {noIncome.length === 1 ? 'this account' : 'these accounts'}.</span>
            </div>
          )}
          {atRisk.filter(r => r.income > 0 && r.dti != null).length > 0 && (
            <div className="rounded-2xl px-4 py-2.5 flex items-start gap-2 text-[11px]" style={{ background: `${warn}12`, border: `1px solid ${warn}30` }}>
              <span>⚠️</span>
              <span style={{ color: warn }}>
                {atRisk.filter(r => r.income > 0 && r.dti != null).map(r => `${r.u.name} (DTI ${r.dti}%)`).join(', ')} — committed payments are high relative to income.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── USER CARDS ── */}
      {visible.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>
          {search.trim() ? <>No users match “{search}”.</> : 'No users yet.'}
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-3">
        {visible.map(r => {
          const u = r.u
          const isSelf = u.isCurrentUser === true
          /* These parts are all principal — no interest. The server's `totalDebt` used to add
             `loanIntLeftCalc` on top, so the Total Debt tile and this composition showed two
             different figures on the same card (₹27,17,835 against ₹24,84,938). The backend now
             excludes interest to match utils/calcDebt, but an API that has not been rebuilt still
             sends the old figure — so the gap is detected and named below rather than left for
             someone to notice. */
          const debtParts = [
            { label: 'Loans',     val: Number(u.loanDebt ?? 0),     color: neg },
            // Interest is part of the total now, so it is a segment rather than a footnote.
            { label: 'Loan interest', val: Number(u.loanIntLeft ?? 0), color: '#fb7185' },
            { label: 'CC EMI',    val: Number(u.ccEmiPending ?? 0), color: warn },
            { label: 'CC Outstanding', val: r.ccOut,                color: 'var(--orange)' },
            { label: 'I Owe',     val: Number(u.personalDebt ?? 0), color: 'var(--pink)' },
            { label: 'Chit repay', val: Number(u.chitRepayRemaining ?? 0), color: mut },
          ].filter(s => s.val > 0)
          const debtTot = debtParts.reduce((s, p) => s + p.val, 0)
          const intLeft = Number(u.loanIntLeft ?? 0)
          // > ₹1 apart means the server total is not principal-only. If the gap is the interest,
          // say so precisely — that is the one cause worth calling out by name.
          const debtGap = Math.round(r.debt - debtTot)
          const gapIsInterest = Math.abs(Math.abs(debtGap) - Math.round(intLeft)) <= 2

          const outParts = [
            { label: 'Loan EMIs',    val: r.loanEmi },
            { label: 'CC EMIs',      val: r.ccEmiMo },
            { label: 'I Owe EMIs',   val: Number(u.personalEmiMo ?? 0) },
            { label: 'Bills',        val: Number(u.expenseMo ?? 0) },
            { label: 'Insurance',    val: Number(u.insuranceMo ?? 0) },
            { label: 'Savings',      val: Number(u.savingsMo ?? 0) },
            { label: 'SIP',          val: Number(u.sipMo ?? 0) },
          ].filter(p => p.val > 0)
          const outSum = outParts.reduce((s, p) => s + p.val, 0)

          // Unified commitment rows — same category set /master's Full List uses (Loan, CC EMI,
          // CC Outstanding, CC Spends, I Owe, Chit Repay, Expense, Insurance, Savings/Chit,
          // Investment/SIP), built from the aggregate fields the admin API already sends for this
          // user. A category with nothing in it (both figures 0) is dropped rather than shown as a
          // row of dashes, same as /master only ever pushing a row when there's something to show.
          const commitRows = [
            { label: 'Loans', color: neg, monthly: r.loanEmi, pending: Number(u.loanDebt ?? 0), sub: intLeft > 0 ? `${fmtINR(Math.round(intLeft))} interest left` : '' },
            { label: 'CC EMI', color: warn, monthly: r.ccEmiMo, pending: Number(u.ccEmiPending ?? 0), sub: '' },
            { label: 'CC Outstanding', color: 'var(--orange)', monthly: 0, pending: r.ccOut, sub: r.util != null ? `${r.util}% of ₹${L(r.ccLimit)} limit` : '' },
            { label: 'CC Spends', color: '#f472b6', monthly: 0, pending: r.ccSpends, sub: 'this billing cycle' },
            { label: 'I Owe', color: 'var(--pink)', monthly: Number(u.personalEmiMo ?? 0), pending: Number(u.personalDebt ?? 0), sub: '' },
            { label: 'Chit Repay', color: mut, monthly: 0, pending: Number(u.chitRepayRemaining ?? 0), sub: '' },
            { label: 'Bills', color: '#c084fc', monthly: Number(u.expenseMo ?? 0), pending: 0, sub: 'reference only' },
            { label: 'Insurance', color: info, monthly: Number(u.insuranceMo ?? 0), pending: 0, sub: 'reference only' },
            { label: 'Savings', color: pos, monthly: Number(u.savingsMo ?? 0), pending: 0, sub: 'reference only' },
            { label: 'SIP / Investments', color: 'var(--info)', monthly: Number(u.sipMo ?? 0), pending: 0, sub: 'reference only' },
          ].filter(c => c.monthly > 0 || c.pending > 0)
          const commitDebtTot = commitRows.reduce((s, c) => s + c.pending, 0)
          const commitMonthlyTot = commitRows.reduce((s, c) => s + c.monthly, 0)

          return (
            <div key={u.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)', borderLeft: `3px solid ${scoreColor(r.score)}` }}>

              {/* Hero */}
              <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap cursor-pointer select-none" onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
                <div className="min-w-0 flex-1 basis-[220px]">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-[15px]">{u.name}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: u.role === 'ADMIN' ? 'color-mix(in srgb, var(--info) 15%, transparent)' : 'color-mix(in srgb, var(--text) 8%, transparent)', color: u.role === 'ADMIN' ? info : 'var(--text-faint)' }}>{u.role}</span>
                    {isSelf && <span className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--text) 10%, transparent)', color: 'var(--text-faint)' }}>you</span>}
                    <button
                      className="text-[11px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                      style={{
                        background: compareIds.includes(Number(u.id)) ? 'color-mix(in srgb, var(--purple) 20%, transparent)' : 'color-mix(in srgb, var(--text) 8%, transparent)',
                        color: compareIds.includes(Number(u.id)) ? mut : 'var(--text-faint)',
                        border: compareIds.includes(Number(u.id)) ? '1px solid color-mix(in srgb, var(--purple) 40%, transparent)' : '1px solid transparent',
                      }}
                      onClick={e => { e.stopPropagation(); toggleCompare(Number(u.id)) }}
                      title="Add to side-by-side comparison">
                      {compareIds.includes(Number(u.id)) ? '✓ ⚖ compare' : '⚖ compare'}
                    </button>
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{u.email}</div>
                  {/* joined / last-seen were computed by the backend and never shown */}
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    joined {fmtDate(u.createdAt)} · last seen {ago(u.lastLogin)} · {Number(u.snapshots ?? 0)} snapshots
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[12px] " style={{ color: `color-mix(in srgb, ${r.nw >= 0 ? pos : neg} 67%, transparent)` }}>Net Worth</div>
                  <div className="text-xl font-semibold tracking-tight mono" style={{ color: r.nw >= 0 ? pos : neg }}>{signed(r.nw)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[12px] mb-0.5" style={{ color: `color-mix(in srgb, ${scoreColor(r.score)} 67%, transparent)` }}>Health</div>
                  <div className="text-2xl font-semibold tracking-tight leading-none" style={{ color: scoreColor(r.score) }}>{r.score}</div>
                  <div className="w-20 h-1.5 rounded-full overflow-hidden mt-1 ml-auto" style={{ background: 'color-mix(in srgb, var(--text) 10%, transparent)' }}>
                    <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: scoreColor(r.score) }} />
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: scoreColor(r.score) }}>{r.score >= 60 ? 'Healthy' : r.score >= 40 ? 'Moderate' : 'At Risk'}</div>
                </div>
                <div className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{expandedUser === u.id ? '▲' : '▼'}</div>
              </div>

              {/* Headline tiles — committed and card kept apart, exactly as the app now shows them */}
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 px-4 pb-3">
                <Tile label="Total Debt"    value={fmtINR(r.debt)} color={neg}
                      sub={`${Number(u.loanCount ?? 0)}L · ${Number(u.cardCount ?? 0)}C · ${Number(u.personalCount ?? 0)}P`} />
                <Tile label="Committed / mo" value={r.lockedMo != null ? fmtINR(Math.round(r.lockedMo)) : '—'} color={warn}
                      sub={r.lockedMo == null ? 'breakdown missing' : r.dti != null ? `DTI ${r.dti}%` : 'income not set'} />
                <Tile label="Card this month" value={fmtINR(Math.round(r.cardThisMonth))} color="var(--orange)"
                      sub={r.util != null ? `util ${r.util}% of ₹${L(r.ccLimit)}` : 'no limit set'} />
                <Tile label="Free / mo"  value={r.freeMo != null ? signed(r.freeMo) : 'N/A'}
                      color={r.freeMo != null ? (r.freeMo >= 0 ? pos : neg) : faint}
                      sub={r.freeMo != null ? `income − committed`
                           : !r.hasBreakdown ? 'needs backend rebuild' : 'income not set'} />

                <Tile label="Savings Corpus" value={fmtINR(Number(u.savingsCorpus ?? 0))} color={pos} sub={`${Number(u.savingsCount ?? 0)} plans`} />
                <Tile label="Investments"    value={fmtINR(Number(u.investValue ?? 0))}   color={info} sub={`${Number(u.investmentCount ?? 0)} holdings`} />
                <Tile label="Owned Assets"   value={fmtINR(Number(u.ownedAssetsNet ?? 0))} color={mut}
                      sub={Number(u.ownedAssetsPending ?? 0) > 0 ? `${fmtINR(Number(u.ownedAssetsPending))} still owed` : 'fully owned'} />
                <Tile label="Interest Left"  value={fmtINR(Number(u.loanIntLeft ?? 0))}   color="var(--orange)"
                      sub={`${fmtINR(Number(u.loanIntPaid ?? 0))} paid of ${fmtINR(Number(u.loanTotalInt ?? 0))}`} />
              </div>

              {/* Expandable */}
              {expandedUser === u.id && (
                <div className="px-4 pb-3 space-y-3" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>

                  {/* Unified commitment list — same idea as /master's All Commitments page: one row
                      per category with a colored Type badge and an EMI/mo + pending two-line amount,
                      instead of a debt bar-chart and a separate monthly-breakdown list that could
                      show two different numbers for the same thing. The admin API only sends
                      per-category TOTALS for each user (40 aggregate fields), not each individual
                      loan/EMI/spend, so this can't drill into actual line items the way /master does
                      for your own data — that would need a new backend endpoint returning a user's
                      raw records. This is the aggregate-level equivalent: same categories, same visual
                      language, built entirely from numbers the admin API already sends. */}
                  {commitRows.length > 0 && (
                    <div>
                      <div className="text-[12px] mb-1" style={{ color: 'var(--text-faint)' }}>Commitments · same categories as All Commitments</div>
                      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
                        {commitRows.map((c, i) => (
                          <div key={c.label} className="flex items-center gap-3 px-3 py-1.5" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `color-mix(in srgb, ${c.color} 15%, transparent)`, color: c.color }}>{c.label}</span>
                            <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{c.sub}</span>
                            <div className="text-right flex-shrink-0">
                              {c.monthly > 0 && <div className="mono font-bold text-[12px]" style={{ color: warn }}>{fmtINR(Math.round(c.monthly))}/mo</div>}
                              {c.pending > 0 && (
                                <div className={c.monthly > 0 ? 'text-[11px] mono' : 'mono font-bold text-[12px]'} style={{ color: c.monthly > 0 ? 'var(--text-faint)' : neg }}>
                                  {c.monthly > 0 ? `pending ${fmtINR(c.pending)}` : fmtINR(c.pending)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--text) 13%, transparent)', background: 'color-mix(in srgb, var(--text) 4%, transparent)' }}>
                          <span className="text-[11px] font-semibold">Total</span>
                          <span>
                            {commitMonthlyTot > 0 && <span className="mono font-bold text-[12px] mr-2" style={{ color: warn }}>{fmtINR(Math.round(commitMonthlyTot))}/mo</span>}
                            {commitDebtTot > 0 && <span className="mono font-bold text-[12px]" style={{ color: neg }}>{fmtINR(Math.round(commitDebtTot))} pending</span>}
                          </span>
                        </div>
                      </div>
                      {/* These reconciliation checks still matter even though the bar/list they used
                          to sit under is gone — they catch the API disagreeing with its own numbers. */}
                      {Math.abs(debtGap) > 1 && (
                        <div className="text-[11px] mt-1" style={{ color: neg }}>
                          ⚠ Total Debt tile above reads {fmtINR(r.debt)} but these categories sum to {fmtINR(debtTot)} —
                          {gapIsInterest
                            ? <> a {fmtINR(Math.abs(debtGap))} gap that matches the remaining loan interest exactly, so this API is still using the old principal-only total. Rebuild the backend.</>
                            : <> a {fmtINR(Math.abs(debtGap))} gap with no obvious cause; the API total and its own components disagree.</>}
                        </div>
                      )}
                      {r.lockedMo != null && Math.abs(outSum - r.lockedMo) > 1 && (
                        <div className="text-[11px] mt-1" style={{ color: neg }}>
                          ⚠ Committed/Month tile reads {fmtINR(Math.round(r.lockedMo))} but these categories' monthly figures sum to {fmtINR(Math.round(outSum))} — a {fmtINR(Math.round(Math.abs((r.lockedMo ?? 0) - outSum)))} gap.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ratios and reference figures — not commitment amounts, so they stay as plain lines
                      rather than being forced into the row pattern above. */}
                  <div className="grid grid-cols-2 gap-x-6">
                    <Line label="Total due this month" value={r.totalThisMonth != null ? fmtINR(Math.round(r.totalThisMonth)) : '—'} color={neg} />
                    <Line label="Card limit" value={r.ccLimit > 0 ? fmtINR(r.ccLimit) : '—'} />
                    <Line label="Utilisation (drawn ÷ limit)"
                          value={r.util != null ? `${r.util}% · ${fmtINR(Math.round(r.ccOut + r.ccSpends))}` : '—'}
                          color={utilColor(r.util)} />
                    <Line label="DTI (committed ÷ income)" value={r.dti != null ? r.dti + '%' : '—'} color={dtiColor(r.dti)} />
                    <Line label="Lifetime earned" value={fmtINR(Number(u.totalEarned ?? 0))} color={pos} />
                    {Number(u.totalDebtPrincipal ?? 0) > 0 && <Line label="Settle today (principal only)" value={fmtINR(Number(u.totalDebtPrincipal))} />}
                  </div>

                  {/* Full per-item ledger — the categories above are totals; this is what they're
                      actually built from, fetched only now rather than for every user up front. */}
                  <div>
                    <button
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                      style={{ background: 'color-mix(in srgb, var(--info) 10%, transparent)', color: info, border: '1px solid color-mix(in srgb, var(--info) 20%, transparent)' }}
                      onClick={() => setLedgerUserId(id => id === u.id ? null : Number(u.id))}>
                      {ledgerUserId === u.id ? '▾' : '▸'} 📋 Full Ledger — every loan/card/EMI/spend individually
                    </button>
                    {ledgerUserId === u.id && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[12px] " style={{ color: 'var(--text-faint)' }}>Group by</span>
                          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--text) 13%, transparent)' }}>
                            <button className="text-[11px] px-2.5 py-1 font-medium" style={{ background: ledgerGroupBy === 'type' ? '#c2410c' : 'transparent', color: ledgerGroupBy === 'type' ? 'white' : 'var(--text-faint)' }} onClick={() => setLedgerGroupBy('type')}>Type</button>
                            <button className="text-[11px] px-2.5 py-1 font-medium" style={{ background: ledgerGroupBy === 'card' ? '#c2410c' : 'transparent', color: ledgerGroupBy === 'card' ? 'white' : 'var(--text-faint)' }} onClick={() => setLedgerGroupBy('card')}>Card</button>
                          </div>
                        </div>
                        {ledgerLoading ? (
                          <div className="p-6 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Loading {u.name}'s commitments…</div>
                        ) : ledgerError ? (
                          <div className="p-6 text-center text-[12px]" style={{ color: neg }}>Failed to load.</div>
                        ) : (
                          <CommitmentLedger
                            rows={buildMasterRows(
                              ledgerData?.loans ?? [], ledgerData?.cards ?? [], ledgerData?.personal ?? [],
                              ledgerData?.savings ?? [], ledgerData?.investments ?? [], ledgerData?.expenses ?? [],
                              ledgerData?.insurance ?? [],
                            )}
                            groupBy={r => ledgerGroupBy === 'card' ? (r.cardGroup ?? r.type) : (r.category ?? r.type)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="px-4 pb-3 flex items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--hairline)' }}>
                <button className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--hairline)', color: 'var(--text-muted)' }} onClick={() => setResetModal({ userId: Number(u.id), email: u.email })}>🔑 Reset PW</button>
                {/* isSelf now actually resolves — the backend sends isCurrentUser, so these two
                    destructive actions are finally disabled on your own account. */}
                <button className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" disabled={isSelf}
                        style={{ background: 'var(--bg-hover)', border: '1px solid var(--hairline)', color: 'var(--text-muted)', opacity: isSelf ? 0.4 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
                        onClick={() => {
                          if (isSelf) return
                          const nextRole = u.role === 'ADMIN' ? 'USER' : 'ADMIN'
                          setConfirmModal({
                            message: nextRole === 'ADMIN' ? `Make ${u.name} an admin?` : `Remove admin access from ${u.name}?`,
                            onConfirm: () => roleMut.mutate({ id: Number(u.id), role: nextRole }),
                          })
                        }}
                        title={isSelf ? 'Cannot change your own role' : 'Change role'}>
                  {u.role === 'ADMIN' ? '⬇ Make User' : '⬆ Make Admin'}
                </button>
                <button className="text-[11px] font-semibold px-2.5 py-1 rounded-lg ml-auto" disabled={isSelf}
                        style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: neg, border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)', opacity: isSelf ? 0.4 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
                        title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                        onClick={() => { if (!isSelf) { setTyped(''); setConfirmModal({ message: `Delete ${u.name}? This permanently removes all their financial data and cannot be undone.`, typeToConfirm: u.email, onConfirm: () => deleteMut.mutate(Number(u.id)) }) } }}>
                  🗑 Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* ── SIDE BY SIDE: pick-one-more hint ──
          Picking a first user used to immediately pop the full-screen modal below, whose backdrop
          then covered every other user's "⚖ compare" button — there was no way to actually pick a
          second user. This small floating bar (no backdrop, doesn't block clicks) shows while
          exactly one user is selected, so the rest of the list stays clickable until there are two. */}
      {compareIds.length === 1 && (() => {
        const r = rows.find(rr => Number(rr.u.id) === compareIds[0])
        return (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-2xl text-[11px]" style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in srgb, var(--purple) 30%, transparent)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            <span>⚖️ <b>{r?.u.name ?? 'User'}</b> selected — click "⚖ compare" on one more user</span>
            <button className="btn-secondary btn-xs text-[11px]" onClick={() => setCompareIds([])}>Cancel</button>
          </div>
        )
      })()}

      {/* ── SIDE BY SIDE (modal) ──
          Two users' Full Ledgers rendered next to each other, picked via the "⚖ compare" button
          on each card above. Opens as an overlay rather than inline so there's room for both full
          ledgers at once without the rest of the page pushing them off-screen. */}
      {compareIds.length === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setCompareIds([])}>
          <div className="rounded-2xl p-4 w-full flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in srgb, var(--purple) 25%, transparent)', maxWidth: 1100, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2 flex-shrink-0">
              <div className="text-[12px] " style={{ color: 'var(--text-faint)' }}>
                ⚖️ Side-by-side comparison
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--text) 13%, transparent)' }}>
                  <button className="text-[11px] px-2.5 py-1 font-medium" style={{ background: compareGroupBy === 'type' ? '#c2410c' : 'transparent', color: compareGroupBy === 'type' ? 'white' : 'var(--text-faint)' }} onClick={() => setCompareGroupBy('type')}>Type</button>
                  <button className="text-[11px] px-2.5 py-1 font-medium" style={{ background: compareGroupBy === 'card' ? '#c2410c' : 'transparent', color: compareGroupBy === 'card' ? 'white' : 'var(--text-faint)' }} onClick={() => setCompareGroupBy('card')}>Card</button>
                </div>
                <button className="btn-secondary btn-xs text-[11px]" onClick={() => setCompareExpandSignal(n => n + 1)}>Expand all</button>
                <button className="btn-secondary btn-xs text-[11px]" onClick={() => setCompareCollapseSignal(n => n + 1)}>Collapse all</button>
                <button className="btn-secondary btn-xs text-[11px]" onClick={() => setCompareIds([])}>Clear</button>
                <button className="text-[14px] px-1.5" style={{ color: 'var(--text-faint)' }} onClick={() => setCompareIds([])} title="Close">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto">
              {compareIds.map((id, idx) => {
                const r = rows.find(rr => Number(rr.u.id) === id)
                if (!r) return null
                const u = r.u
                const data    = idx === 0 ? compareDataA    : compareDataB
                const loading = idx === 0 ? compareALoading : compareBLoading
                const errored = idx === 0 ? compareAError   : compareBError
                return (
                  <div key={id} className="rounded-lg overflow-hidden self-start" style={{ border: '1px solid var(--hairline)' }}>
                    <div className="flex items-center justify-between px-3 py-2" style={{ background: 'color-mix(in srgb, var(--text) 4%, transparent)', borderBottom: '1px solid var(--hairline)' }}>
                      <div className="min-w-0">
                        <div className="font-bold text-[13px] truncate">{u.name}</div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{u.email}</div>
                      </div>
                      <button className="text-[12px] flex-shrink-0 ml-2 px-1" style={{ color: 'var(--text-faint)' }} onClick={() => toggleCompare(id)} title="Remove from comparison">✕</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-2.5">
                      <Tile label="Debt" value={fmtINR(r.debt)} color={neg} />
                      <Tile label="Net Worth" value={signed(r.nw)} color={r.nw >= 0 ? pos : neg} />
                      <Tile label="Committed/Mo" value={r.lockedMo != null ? fmtINR(Math.round(r.lockedMo)) : '—'} color={warn} />
                      <Tile label="Health" value={`${r.score}`} color={scoreColor(r.score)} />
                    </div>
                    <div className="px-2.5 pb-2.5">
                      {loading ? (
                        <div className="p-4 text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>Loading {u.name}'s commitments…</div>
                      ) : errored ? (
                        <div className="p-4 text-center text-[11px]" style={{ color: neg }}>Failed to load.</div>
                      ) : (
                        <CommitmentLedger
                          rows={buildMasterRows(
                            data?.loans ?? [], data?.cards ?? [], data?.personal ?? [],
                            data?.savings ?? [], data?.investments ?? [], data?.expenses ?? [],
                            data?.insurance ?? [],
                          )}
                          groupBy={rr => compareGroupBy === 'card' ? (rr.cardGroup ?? rr.type) : (rr.category ?? rr.type)}
                          expandSignal={compareExpandSignal}
                          collapseSignal={compareCollapseSignal}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARISON ── */}
      {rows.length > 1 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--hairline)' }}>
          {/* The old title promised "Debt vs Net Worth" but only ever drew a debt bar. */}
          <div className="text-[12px] mb-3" style={{ color: 'var(--text-faint)' }}>Debt vs net worth vs committed payments</div>
          <div className="space-y-2.5">
            {visible.map(r => (
              <div key={r.u.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium">{r.u.name}</span>
                  <span className="text-[11px] mono flex gap-3">
                    <span style={{ color: neg }}>debt {fmtINR(r.debt)}</span>
                    <span style={{ color: r.nw >= 0 ? pos : neg }}>nw {signed(r.nw)}</span>
                    <span style={{ color: warn }}>committed {r.lockedMo != null ? fmtINR(Math.round(r.lockedMo)) + '/mo' : '—'}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
                    <div className="h-full rounded-full" style={{ width: `${maxDebt > 0 ? r.debt / maxDebt * 100 : 0}%`, background: neg }} />
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
                    <div className="h-full rounded-full" style={{ width: `${maxNW > 0 ? Math.abs(r.nw) / maxNW * 100 : 0}%`, background: r.nw >= 0 ? pos : '#7f1d1d' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-80" style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in srgb, var(--text) 13%, transparent)' }}>
            <div className="font-semibold mb-3 text-[13px]">Reset password for {resetModal.email}</div>
            <input className="input w-full mb-3" type="password" placeholder="New password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary btn-sm" onClick={() => { setResetModal(null); setNewPassword('') }}>Cancel</button>
              <button className="btn-primary btn-sm" disabled={newPassword.length < 6} style={{ opacity: newPassword.length < 6 ? 0.5 : 1 }} onClick={() => resetMut.mutate({ id: resetModal.userId, pw: newPassword })}>Reset</button>
            </div>
          </div>
        </div>
      )}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: 'var(--bg-card)', border: '1px solid color-mix(in srgb, var(--text) 13%, transparent)' }}>
            <div className="font-semibold mb-3 text-[13px]">{confirmModal.message}</div>
            {confirmModal.typeToConfirm && (
              <div className="mb-4">
                <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Type <span className="mono" style={{ color: 'var(--text)' }}>{confirmModal.typeToConfirm}</span> to confirm</div>
                <input className="input w-full" autoFocus value={typed} onChange={e => setTyped(e.target.value)} placeholder="email address" />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary btn-sm" onClick={() => { setConfirmModal(null); setTyped('') }}>Cancel</button>
              {(() => {
                const locked = !!confirmModal.typeToConfirm && typed.trim().toLowerCase() !== confirmModal.typeToConfirm.toLowerCase()
                return (
                  <button className="btn-sm px-4" disabled={locked}
                          style={{ background: neg, color: 'white', borderRadius: 6, opacity: locked ? 0.4 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
                          onClick={() => { confirmModal.onConfirm(); setTyped('') }}>Confirm</button>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
