import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cardsApi, paidMarksApi, closedLoansApi, insuranceApi, incomeApi } from '../api'
import { usePicks, PickBox, WhatIfBar } from '../components/common/WhatIf'
import SegTabs from '../components/common/SegTabs'
import { emiFacts, rateColor } from '../utils/emiFacts'
import api from '../api/axios'
import type { CreditCard } from '../types'
import { PageHeader, ConfirmModal, Modal, FormField, EmptyState, LoadingSpinner, ErrorState, SortHeader, FromLink } from '../components/common'
import { fmtINR, getEff, isPaidThisMonth, resolveDueDay, monthlyIncomeTotal } from '../utils/format'
import { cardLimitUse } from '../utils/cardLimit'
import { AmountInput } from '../components/common/AmountInput'
import { Plus, Pencil, Trash2, CheckCircle, Archive, ChevronDown, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

type ModalType = 'card' | 'emi' | 'spend' | 'editEmi' | null

// Shared by both Spends and EMIs — one segment list so "where did this money go" reads the same way
// whether it was a straight spend or something being paid off in installments. Lifestyle/Clothing/
// Electronics/Insurance added alongside the original spend-only categories.
const CATEGORIES = ['Food', 'Fuel', 'Shopping', 'Lifestyle', 'Clothing', 'Electronics', 'Phone', 'Baby Product', 'Gold', 'Travel', 'Medical', 'Insurance', 'Entertainment', 'Bills', 'Service', 'General', 'Other']

// Due date badge helper
const getDueBadge = (dueDay: number | undefined | null, isPaid: boolean) => {
  if (!dueDay || isPaid) return null
  const now = new Date()
  const today = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()

  // Days until this month's due
  let diff = dueDay - today

  // If already past this month's due day, check next month
  if (diff < -7) {
    // Next month's due: days remaining in this month + dueDay days into next month
    diff = (daysInMonth - today) + dueDay
  }

  if (diff === 0)             return { label: '🔴 Due Today',      color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff < 0 && diff >= -7) return { label: `⚠ ${Math.abs(diff)}d overdue`, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff > 0 && diff <= 3)  return { label: `🔴 Due in ${diff}d`, color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' }
  if (diff > 3 && diff <= 7)  return { label: `⚡ Due in ${diff}d`, color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 15%, transparent)' }
  if (diff > 7 && diff <= 10) return { label: `Due in ${diff}d`,    color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 10%, transparent)' }
  return null
}

export default function CreditCardsPage() {
  const qc = useQueryClient()
  const wi = usePicks()
  const { data: incomeRows = [] } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll })
  const { data: cards = [], isLoading: l1, isError: e1, refetch: r1 } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll })
  const { data: markedKeys = [], isLoading: l2, isError: e2, refetch: r2 } = useQuery({ queryKey: ['paid-marks'], queryFn: paidMarksApi.getAll })
  // Reference only — lets an EMI row show "🛡️ linked to <policy>" when an Insurance premium points
  // back at it (the link itself lives on the Insurance side, via paidByCardId + linkedEmiId).
  const { data: insurance = [] } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll })
  const linkedPolicyFor = (cardId?: number, emiId?: number) =>
    (insurance as any[]).find(v => v.isCardEmi && v.paidByCardId === cardId && v.linkedEmiId === emiId)
  // Was only tracking the `cards` query — `paid-marks` feeds the paid/due-badge state below.
  const isLoading = l1 || l2
  const isError = e1 || e2
  const refetch = () => { r1(); r2() }
  const [convertEmi, setConvertEmi] = useState<{cardId:number,amount:number,months:number}|null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  // 'cards' = one row per card (expand for its EMIs/spends); 'emis' = every EMI of every card in one table.
  const [cardsView, setCardsView] = useState<'cards' | 'emis' | 'spends' | 'outstanding'>('cards')
  const [showDoneEmis, setShowDoneEmis] = useState(false)
  const [showClearedCards, setShowClearedCards] = useState(false)
  // The All-EMIs groups start collapsed (just the group totals); this holds the ones you have opened.
  const [openEmiGroups, setOpenEmiGroups] = useState<Set<string>>(new Set())
  const [groupEmisBy, setGroupEmisBy] = useState<'card' | 'category' | 'ends' | 'whose' | 'none'>('card')
  const [emiSortCol, setEmiSortCol] = useState<string>('pending')
  const [emiSortDir, setEmiSortDir] = useState<'asc' | 'desc'>('desc')
  const onEmiSort = (col: string) => { if (emiSortCol === col) setEmiSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setEmiSortCol(col); setEmiSortDir('desc') } }
  const [spendSortCol, setSpendSortCol] = useState<string>('date')
  const [spendSortDir, setSpendSortDir] = useState<'asc' | 'desc'>('desc')
  const onSpendSort = (col: string) => { if (spendSortCol === col) setSpendSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSpendSortCol(col); setSpendSortDir('desc') } }
  const [expandTab, setExpandTab] = useState<Record<number, 'emis' | 'spends'>>({})
  const [confirmModal, setConfirmModal] = useState<any>(null)
  const [modalType, setModalType] = useState<ModalType>(null)
  const [activeCard, setActiveCard] = useState<CreditCard | null>(null)
  const [cardForm, setCardForm] = useState<any>({ banker: '', cardLimit: 0, outstanding: 0 })
  const [emiForm, setEmiForm] = useState<any>({})
  const [spendForm, setSpendForm] = useState<any>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const onSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }

  const validateCard = (c: any) => {
    const errs: Record<string, string> = {}
    if (!c.banker?.trim()) errs.banker = 'Bank name is required'
    if (c.cardLimit != null && c.cardLimit < 0) errs.cardLimit = 'Credit limit cannot be negative'
    if (c.outstanding != null && c.outstanding < 0) errs.outstanding = 'Outstanding cannot be negative'
    if (c.cardLimit > 0 && c.outstanding > c.cardLimit) errs.outstanding = 'Outstanding cannot exceed credit limit'
    if (c.dueDay && (c.dueDay < 1 || c.dueDay > 31)) errs.dueDay = 'Due day must be 1–31'
    if (c.billingDay && (c.billingDay < 1 || c.billingDay > 31)) errs.billingDay = 'Statement day must be 1–31'
    return errs
  }
  const validateEmi = (e: any) => {
    const errs: Record<string, string> = {}
    if (!e.label?.trim()) errs.label = 'Label is required'
    if (!e.emi || e.emi <= 0) errs.emi = 'EMI must be greater than 0'
    if (!e.tenure || e.tenure <= 0) errs.tenure = 'Tenure must be greater than 0'
    if (!e.startDate) errs.startDate = 'Start date is required'
    return errs
  }
  const validateSpend = (s: any) => {
    const errs: Record<string, string> = {}
    if (!s.purpose?.trim()) errs.purpose = 'Purpose is required'
    if (!s.amount || s.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!s.spendDate) errs.spendDate = 'Date is required'
    return errs
  }

  const saveMut      = useMutation({ mutationFn: (c: any) => c.id ? cardsApi.update(c.id, c) : cardsApi.create(c), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Saved'); setModalType(null); setFormErrors({}) }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save card') })
  const deleteMut    = useMutation({ mutationFn: async (card: any) => { if (Number(card.outstanding ?? 0) > 0 || (card.emis ?? []).some((e: any) => getEff(e).pending > 0) || (card.spends ?? []).length > 0) throw new Error('Clear balance first'); return cardsApi.delete(card.id) }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Deleted') }, onError: (e: any) => toast.error(e.message) })
  const payOutMut    = useMutation({ mutationFn: (c: any) => cardsApi.update(c.id, { ...c, outstanding: 0 }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Cleared') }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to clear balance') })
  const markMut      = useMutation({ mutationFn: paidMarksApi.toggle, onSuccess: () => qc.invalidateQueries({ queryKey: ['paid-marks'] }), onError: () => toast.error('Failed to update paid status') })
  const markEmiMut   = useMutation({ mutationFn: ({ cardId, emiId }: any) => api.patch(`/credit-cards/${cardId}/emis/${emiId}/mark-paid`), onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }), onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to mark EMI paid') })
  const missedEmiMut = useMutation({ mutationFn: ({ emiId, missed }: any) => api.put(`/card-emis/${emiId}`, { missedMonths: missed }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Updated') }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update') })
  const addEmiMut    = useMutation({ mutationFn: ({ cardId, emi }: any) => api.post(`/credit-cards/${cardId}/emis`, emi), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Added'); setModalType(null); setFormErrors({}) }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to add EMI') })
  const editEmiMut   = useMutation({ mutationFn: ({ emiId, emi }: any) => api.put(`/card-emis/${emiId}`, emi), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Saved'); setModalType(null); setFormErrors({}) }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save EMI') })
  const deleteEmiMut = useMutation({ mutationFn: (id: number) => api.delete(`/card-emis/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }), onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete EMI') })
  const closeEmiMut  = useMutation({ mutationFn: async ({ card, emi }: any) => { const tp = (emi.emi ?? 0) * (emi.tenure ?? 0); await closedLoansApi.create({ lender: `${card.banker} — ${emi.label}`, purpose: 'CC EMI', assetType: 'CC EMI', amount: emi.principal ?? tp, totalPaid: tp, interestPaid: Math.max(0, tp - (emi.principal ?? tp)), principalPaid: emi.principal ?? tp, recoveredAmount: null, closedMonths: emi.tenure ?? 0, closedDate: new Date().toISOString().slice(0, 10) }); await api.delete(`/card-emis/${emi.id}`) }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); qc.invalidateQueries({ queryKey: ['closed-loans'] }); toast.success('Archived!') }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to archive EMI') })
  const addSpendMut    = useMutation({ mutationFn: ({ cardId, spend }: any) => api.post(`/credit-cards/${cardId}/spends`, spend), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Added'); setModalType(null); setFormErrors({}) }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to add spend') })
  const deleteSpendMut = useMutation({ mutationFn: (id: number) => api.delete(`/card-spends/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }), onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete spend') })
  const clearSpendsMut = useMutation({ mutationFn: async (c: any) => { await Promise.all((c.spends ?? []).map((sp: any) => api.delete(`/card-spends/${sp.id}`))) }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards'] }); toast.success('Cleared') }, onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to clear spends') })
  // Toggle whether a "for a friend" spend/EMI has been paid back to you yet — doesn't touch the
  // card's own outstanding/EMI balance, just the separate receivable tag.
  const toggleSpendOwedMut = useMutation({ mutationFn: ({ id, owedSettled }: any) => api.put(`/card-spends/${id}`, { owedSettled }), onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }), onError: () => toast.error('Failed to update') })
  const toggleEmiOwedMut   = useMutation({ mutationFn: ({ id, owedSettled }: any) => api.put(`/card-emis/${id}`, { owedSettled }), onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }), onError: () => toast.error('Failed to update') })

  const today      = new Date().getDate()
  const totLimit   = cards.reduce((s: number, c: any) => s + Number(c.cardLimit ?? 0), 0)
  const totOut     = cards.reduce((s: number, c: any) => s + Number(c.outstanding ?? 0), 0)
  // "Own" = not a friend's unsettled EMI. Hub, Calendar and Master all leave friends' EMIs out of what you owe, so the
  // EMI / month figures here do too (friends' instalments still count toward Limit used, and are shown on the side).
  const emiOwn      = (e: any) => !(e.owedBy && !e.owedSettled)
  const liveEmis    = (c: any) => (c.emis ?? []).filter((e: any) => getEff(e).pending > 0)
  const totEmi      = cards.reduce((s: number, c: any) => s + liveEmis(c).filter(emiOwn).reduce((a: number, e: any) => a + Number(e.emi ?? 0), 0), 0)
  const totEmiFriends = cards.reduce((s: number, c: any) => s + liveEmis(c).filter((e: any) => !emiOwn(e)).reduce((a: number, e: any) => a + Number(e.emi ?? 0), 0), 0)
  const totEmiPendOwn = cards.reduce((s: number, c: any) => s + liveEmis(c).filter(emiOwn).reduce((a: number, e: any) => a + getEff(e).pending * Number(e.emi ?? 0), 0), 0)
  const totEmiPend  = cards.reduce((s: number, c: any) => s + (c.emis ?? []).filter((e: any) => getEff(e).pending > 0).reduce((a: number, e: any) => a + getEff(e).pending * Number(e.emi ?? 0), 0), 0)
  // Count of still-running EMIs behind the "EMI / month" tile above — same `pending > 0` filter as
  // totEmi/totEmiPend, so it's the number of line items those two rupee figures are actually summing.
  const totEmiCount = cards.reduce((s: number, c: any) => s + liveEmis(c).length, 0)   // all running EMIs, friends' included
  const totEmiAll   = totEmi + totEmiFriends                                          // what the cards are charged each month
  const totSpends  = cards.reduce((s: number, c: any) => s + (c.spends ?? []).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0), 0)
  const util       = totLimit > 0 ? Math.round((totOut + totSpends + totEmiPend) / totLimit * 100) : 0 // same three parts as cardLimitUse, summed over cards
  const totalLiab  = totOut + totEmiPend + totSpends
  // "For a friend" spends/EMIs that haven't been paid back yet — a receivable owed TO the user,
  // tracked separately from what the card itself owes the bank (doesn't touch totalLiab).
  const owedSpends  = cards.flatMap((c: any) => (c.spends ?? []).filter((sp: any) => sp.owedBy && !sp.owedSettled))
  const owedEmis    = cards.flatMap((c: any) => (c.emis ?? []).filter((e: any) => e.owedBy && !e.owedSettled && getEff(e).pending > 0))
  // what-if: ticked card EMIs — closing one costs its remaining balance and drops its monthly instalment
  const pickedEmis = cards.flatMap((c: any) => (c.emis ?? []).filter((e: any) => wi.picked.has(`${c.id}:${e.id}`) && getEff(e).pending > 0))
  const pickNeed = pickedEmis.reduce((s: number, e: any) => s + getEff(e).pending * Number(e.emi ?? 0), 0)
  const pickFree = pickedEmis.reduce((s: number, e: any) => s + Number(e.emi ?? 0), 0)
  const totOwedToMe = owedSpends.reduce((s: number, sp: any) => s + Number(sp.amount ?? 0), 0) + owedEmis.reduce((s: number, e: any) => s + getEff(e).pending * Number(e.emi ?? 0), 0)
  const owedCount   = owedSpends.length + owedEmis.length

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorState message="Couldn't load your credit cards." onRetry={() => refetch()} />

  return (
    <div className="space-y-4 text-[13px]">
      <PageHeader title="Credit Cards" action={
        <button className="btn-primary btn-sm" onClick={() => { setCardForm({ banker: '', cardLimit: 0, outstanding: 0 }); setFormErrors({}); setModalType('card') }}>
          <Plus size={14} /> Add Card
        </button>
      } />

      {cards.length === 0 ? <EmptyState icon="💳" title="No cards" sub="Add your first credit card" action={<button className="btn-primary btn-sm" onClick={() => { setCardForm({ banker: '', cardLimit: 0, outstanding: 0 }); setFormErrors({}); setModalType('card') }}>+ Add card</button>} /> : (<>

        {/* ── SUMMARY ROW ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 [&>*]:min-w-0">
          {[
            { label: 'Total Limit',     value: fmtINR(totLimit),   sub: `${cards.length} cards`,       accent: 'var(--cyan)' },
            { label: 'Total Liability', value: fmtINR(totalLiab),  sub: `${util}% utilization`,        accent: totalLiab > 0 ? 'var(--danger)' : 'var(--success)' },
            { label: 'EMI / month',     value: fmtINR(totEmiAll),  sub: `${fmtINR(totEmiPend)} pending · ${totEmiCount} EMI${totEmiCount !== 1 ? 's' : ''}${totEmiFriends > 0 ? ` · ${fmtINR(totEmi)} yours + ${fmtINR(totEmiFriends)} friends'` : ''}`, accent: 'var(--warning)' },
            { label: 'Spends',          value: fmtINR(totSpends),  sub: 'this billing cycle',           accent: 'var(--pink)' },
            { label: 'Outstanding',     value: fmtINR(totOut),     sub: totOut > 0 ? 'pay this cycle' : '✓ all clear', accent: totOut > 0 ? 'var(--danger)' : 'var(--success)' },
            { label: 'Friends Owe You', value: fmtINR(totOwedToMe), sub: owedCount > 0 ? `${owedCount} item${owedCount>1?'s':''}` : '✓ none pending', accent: totOwedToMe > 0 ? 'var(--info)' : 'var(--success)' },
          ].map(m => (
            <div key={m.label} className="rounded-2xl px-4 py-3 relative overflow-hidden" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${m.accent} 5%, var(--bg-card)) 0%, var(--bg-card) 70%)`, border: `1px solid var(--hairline)` }}>
              <div className="relative">
                <div className="text-[12px] font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:m.accent}} />{m.label}</div>
                <div className="text-[20px] font-semibold tracking-tight tabular-nums" style={{ color: m.accent }}>{m.value}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── VIEW SWITCH ── */}
        <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
          <SegTabs<'cards' | 'emis' | 'spends' | 'outstanding'> value={cardsView} onChange={setCardsView} accent="var(--warning)"
            options={[
              { id: 'cards', label: '💳 By card', badge: cards.length },
              { id: 'emis', label: '📋 All EMIs', badge: totEmiCount },
              { id: 'spends', label: '🛍️ Spends', badge: cards.reduce((n: number, c: any) => n + (c.spends ?? []).length, 0), color: 'var(--pink)' },
              { id: 'outstanding', label: '🧾 Outstanding', badge: cards.filter((c: any) => Number(c.outstanding ?? 0) > 0).length, color: 'var(--danger)' },
            ]} />
          {/* Smart insight — a slim pill beside the view switch instead of a full-width banner row of its own */}
          {(() => {
            const highUtil = (cards as any[]).filter((card:any) => cardLimitUse(card).rawPct > 70)
            if(!highUtil.length) return null
            const names = highUtil.map((c:any)=>c.banker).join(', ')
            return (
              <div className="text-[11px] px-2.5 py-1 rounded-lg min-w-0 flex-shrink whitespace-nowrap overflow-hidden text-ellipsis" title={`${highUtil.length} card${highUtil.length>1?'s':''} above 70% utilisation — high CIBIL impact. Pay down ${names} first.`}
                style={{background:'color-mix(in srgb, var(--danger) 8%, transparent)',border:'1px solid color-mix(in srgb, var(--danger) 18%, transparent)',color:'var(--text-faint)'}}>
                ⚠️ <span style={{color:'var(--danger)',fontWeight:700}}>{highUtil.length} card{highUtil.length>1?'s':''} &gt;70% used</span> — pay down <span style={{color:'var(--warning)',fontWeight:600}}>{names}</span> first
              </div>
            )
          })()}
          <div className="flex items-center gap-2 flex-wrap ml-auto flex-shrink-0 justify-end">
            {cardsView === 'emis' && (
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer mr-1" style={{ color: 'var(--text-faint)' }}>
                <input type="checkbox" checked={showDoneEmis} onChange={e => setShowDoneEmis(e.target.checked)} /> include finished EMIs
              </label>
            )}
            {cardsView === 'emis' && (
              <label className="flex items-center gap-1.5 text-[11px] mr-1" style={{ color: 'var(--text-faint)' }}>
                group by
                <select className="input text-[11px] py-0.5 px-1.5" style={{ width: 'auto', colorScheme: 'dark light' }} value={groupEmisBy} onChange={e => setGroupEmisBy(e.target.value as any)}>
                  <option value="card">Card</option>
                  <option value="category">Category</option>
                  <option value="ends">When it ends</option>
                  <option value="whose">Mine / friends'</option>
                  <option value="none">No grouping</option>
                </select>
              </label>
            )}
            <FromLink to="/lookup" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'rgba(244,114,182,0.12)',color:'var(--pink)',border:'1px solid rgba(244,114,182,0.2)'}}>📋 Payment Schedule →</FromLink>
            <FromLink to="/budget" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{background:'color-mix(in srgb, var(--warning) 12%, transparent)',color:'var(--warning)',border:'1px solid color-mix(in srgb, var(--warning) 20%, transparent)'}}>📊 Budget vs Spends →</FromLink>
          </div>
        </div>

        {/* ── TABLE ── */}
        <WhatIfBar count={pickedEmis.length} need={pickNeed} free={pickFree} billNow={totEmi} income={monthlyIncomeTotal(incomeRows as any[])} onClear={wi.clear} />
        {cardsView === 'cards' && (<>
        <div className="md:hidden text-[11px] text-right mb-1 print:hidden" style={{ color: 'var(--text-faint)' }}>swipe sideways for more columns ↔</div>
        <div className="rounded-2xl overflow-hidden text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflowX: 'auto' }}>

          {/* Column headers */}
          <div className="grid min-w-[760px] px-4 py-2 text-[12px] font-medium border-b"
            style={{ gridTemplateColumns: 'minmax(180px,1.7fr) minmax(85px,1fr) minmax(60px,1fr) minmax(90px,1fr) minmax(75px,1fr) minmax(70px,1fr) minmax(70px,1fr)', borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-faint)' }}>
            <SortHeader label="Card" col="banker" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Limit" col="limit" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Util%" col="util" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <span className="text-center">Due / Bill</span>
            <SortHeader label="EMI/mo" col="emiMo" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Spends" col="spends" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
            <span className="text-center">Action</span>
          </div>

          {/* Rows */}
          {(() => {
            const getMetrics = (c: any) => {
              const activeEmis = (c.emis ?? []).filter((e: any) => getEff(e).pending > 0)
              const emiMo      = activeEmis.filter(emiOwn).reduce((a: number, e: any) => a + Number(e.emi ?? 0), 0)
              const emiPendBal = activeEmis.reduce((a: number, e: any) => a + getEff(e).pending * Number(e.emi ?? 0), 0)
              const spends     = (c.spends ?? []).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
              const util       = cardLimitUse(c).pct
              return { emiMo, spends, util }
            }
            const displayCards = [...cards].sort((a: any, b: any) => {
              if (!sortCol) return 0
              let cmp = 0
              if (sortCol === 'banker') {
                cmp = String(a.banker ?? '').localeCompare(String(b.banker ?? ''))
              } else if (sortCol === 'limit') {
                cmp = Number(a.cardLimit ?? 0) - Number(b.cardLimit ?? 0)
              } else if (sortCol === 'util') {
                cmp = getMetrics(a).util - getMetrics(b).util
              } else if (sortCol === 'emiMo') {
                cmp = getMetrics(a).emiMo - getMetrics(b).emiMo
              } else if (sortCol === 'spends') {
                cmp = getMetrics(a).spends - getMetrics(b).spends
              }
              return sortDir === 'asc' ? cmp : -cmp
            })
            return displayCards.map((c: any, idx: number) => {
            const activeEmis = (c.emis ?? []).filter((e: any) => getEff(e).pending > 0)
            const emiMo      = activeEmis.filter(emiOwn).reduce((a: number, e: any) => a + Number(e.emi ?? 0), 0)
            const emiMoFr    = activeEmis.filter((e: any) => !emiOwn(e)).reduce((a: number, e: any) => a + Number(e.emi ?? 0), 0)
            const emiPendBal = activeEmis.reduce((a: number, e: any) => a + getEff(e).pending * Number(e.emi ?? 0), 0)
            const spends     = (c.spends ?? []).reduce((a: number, sp: any) => a + Number(sp.amount ?? 0), 0)
            const used       = cardLimitUse(c).pct
            const utilClr    = used > 70 ? 'var(--danger)' : used > 40 ? 'var(--warning)' : 'var(--success)'
            const isExp      = expanded === c.id
            const paidKey    = `card-${c.id}`
            const isPaid     = isPaidThisMonth(paidKey, resolveDueDay(c), markedKeys as string[])
            const daysLeft   = c.billingDay ? (c.billingDay >= today ? c.billingDay - today : 30 - today + c.billingDay) : null
            // Was reusing `daysLeft` (billing/statement day) for the "Due / Bill" column's
            // countdown text too — so it always counted down to the statement date, never the
            // actual payment due date. resolveDueDay() prefers dueDay, falling back to billingDay.
            const dueDayNum  = resolveDueDay(c) || null
            const daysToDue  = dueDayNum ? (dueDayNum >= today ? dueDayNum - today : 30 - today + dueDayNum) : null
            const tab        = expandTab[c.id ?? 0] ?? ((c.emis ?? []).length > 0 ? 'emis' : 'spends')
            const hasData    = Number(c.outstanding ?? 0) > 0 || emiMo > 0 || spends > 0

            return (
              <div key={c.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                {/* Main row */}
                <div
                  className="grid min-w-[760px] items-center px-4 py-3 cursor-pointer transition-colors"
                  style={{ gridTemplateColumns: 'minmax(180px,1.7fr) minmax(85px,1fr) minmax(60px,1fr) minmax(90px,1fr) minmax(75px,1fr) minmax(70px,1fr) minmax(70px,1fr)', background: isExp ? 'var(--bg-base)' : 'transparent' }}
                  onMouseEnter={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : c.id)}>

                  {/* Card name */}
                  <div className="flex items-start gap-1.5 min-w-0">
                    <ChevronDown size={12} className="flex-shrink-0 mt-1" style={{color:'var(--text-faint)',transform:isExp?'rotate(0)':'rotate(-90deg)',transition:'transform 0.2s'}}/>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[13px]">{c.banker}</span>
                        {activeEmis.length > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--info) 15%, transparent)', color: 'var(--info)' }}>{activeEmis.length} EMI</span>}
                      </div>
                      {daysLeft !== null && (
                        <div className="text-[11px] mt-0.5" style={{ color: daysLeft <= 3 ? 'var(--danger)' : daysLeft <= 7 ? 'var(--warning)' : 'var(--text-faint)' }}>
                          Statement in {daysLeft}d
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Limit */}
                  <div className="text-right">
                    <span className="mono text-[13px]" style={{ color: 'var(--text-faint)' }}>{fmtINR(c.cardLimit)}</span>
                  </div>

                  {/* Util — rupees in use, with the percentage beside it */}
                  {(() => { const u = cardLimitUse(c); return (
                    <div className="text-right whitespace-nowrap" title={`Outstanding ${fmtINR(u.outstanding)} + spends ${fmtINR(u.spends)} + EMIs still to pay ${fmtINR(u.emiLeft)} = ${fmtINR(u.used)} of ${fmtINR(u.limit)}${u.friends > 0 ? `. ${fmtINR(u.friends)} of this is friends' items — they use your limit but aren't in what you owe.` : ''}`}>
                      {u.limit > 0
                        ? <span className="mono font-semibold text-[13px]" style={{ color: utilClr }}>{fmtINR(u.used)} <span className="text-[11px] font-medium">({used}%)</span></span>
                        : <span className="mono text-[13px]" style={{ color: 'var(--text-faint)' }}>—</span>}
                      {u.limit > 0 && u.friends > 0 && <div className="text-[11px] leading-tight" style={{ color: 'var(--info)' }}>incl. {fmtINR(u.friends)} friends'</div>}
                    </div>
                  ) })()}

                  {/* Due / Bill */}
                  <div className="text-center">
                    {Number(c.outstanding ?? 0) > 0
                      ? <div>
                          <div className="mono font-semibold text-[13px]" style={{color:'var(--danger)'}}>{fmtINR(c.outstanding)}</div>
                          {/* Used to also print "{daysToDue}d to due" here as plain text, right above
                              this badge — same days-to-due number, just said twice in two formats.
                              The badge already carries it (colour-coded, "Due in Xd"/"Xd overdue"), so
                              the plain line was dropped.
                              Was `c.dueDay||null` — a card whose due date is only known via
                              `billingDay` (the same fallback `isPaid` above already uses through
                              `resolveDueDay`) never got a due badge at all. */}
                          {(()=>{const b=getDueBadge(resolveDueDay(c)||null,isPaid);return b?<div className="text-[11px] font-bold" style={{color:b.color}}>{b.label}</div>:null})()}
                        </div>
                      : emiMo > 0
                        /* Nothing on the statement, but instalments are coming: lead with the amount, same shape as a
                           card that has a bill, so the column reads "what to pay + when" either way. */
                        ? <div className="leading-tight" title="No statement balance — this is the EMI instalments charged on the due date">
                            <div className="mono font-semibold text-[13px]" style={{color:'var(--warning)'}}>{fmtINR(emiMo)}</div>
                            {(()=>{const b=getDueBadge(dueDayNum,isPaid);return <div className="text-[11px]" style={{color:isPaid ? 'var(--success)' : (b?.color ?? 'var(--text-faint)')}}>EMIs{isPaid ? ' · ✓ paid' : b ? <> · {b.label}</> : null}</div>})()}
                          </div>
                        : <div className="leading-tight">
                            <div className="text-[12px] font-medium" style={{color:'var(--success)'}}>✓ Nothing due</div>
                            {daysLeft !== null && <div className="text-[11px]" style={{color:'var(--text-faint)'}}>next statement in {daysLeft}d</div>}
                          </div>
                    }
                  </div>

                  {/* EMI */}
                  <div className="text-right">
                    {emiMo > 0
                      ? <div className="leading-tight"><span className="mono font-semibold text-[13px]" style={{ color: 'var(--warning)' }}>{fmtINR(emiMo)}</span></div>
                      : <span style={{ color: 'var(--text-faint)' }}>—</span>
                    }
                    {emiMoFr > 0 && <div className="text-[11px] leading-tight" style={{ color: 'var(--info)' }} title="Friends' EMIs on this card. They use your limit but aren't counted in what you owe.">+{fmtINR(emiMoFr)} friends'</div>}
                  </div>

                  {/* Spends */}
                  <div className="text-right">
                    {spends > 0
                      ? <span className="mono font-semibold text-[13px]" style={{ color: 'var(--pink)' }}>{fmtINR(spends)}</span>
                      : <span style={{ color: 'var(--text-faint)' }}>—</span>
                    }
                  </div>

                  {/* Action */}
                  <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                    <button title="Edit Card" className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10" style={{color:'var(--text-faint)'}} onClick={(e)=>{e.stopPropagation();setCardForm(c);setFormErrors({});setModalType('card')}}><Pencil size={11}/></button>
                    {hasData && (
                      <button title="Mark Paid"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold transition-all"
                        style={{background:'color-mix(in srgb, var(--success) 15%, transparent)',color:'var(--success)',border:'1px solid color-mix(in srgb, var(--success) 30%, transparent)'}}
                        onClick={() => markMut.mutate(paidKey)}>✓</button>
                    )}
                    <button title="Delete Card" className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20" style={{color:'var(--danger)'}} onClick={(e)=>{e.stopPropagation();setConfirmModal({message:`Delete ${c.banker||c.cardName}?`,onConfirm:()=>deleteMut.mutate(c),label:'Delete'})}}><Trash2 size={11}/></button>
                  </div>
                  
                </div>

                {/* Expanded */}
                {isExp && (
                  <div style={{ background: 'var(--bg-base)', borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                    {/* Tab bar */}
                    <div className="flex items-center border-b px-4" style={{ borderColor: 'color-mix(in srgb, var(--text) 5%, transparent)' }}>
                      {(c.emis ?? []).length > 0 && (
                        <button onClick={() => setExpandTab(t => ({ ...t, [c.id]: 'emis' }))}
                          className="py-2.5 px-1 mr-4 text-[11px] font-medium transition-colors border-b-2"
                          style={{ borderColor: tab === 'emis' ? 'var(--info)' : 'transparent', color: tab === 'emis' ? 'var(--info)' : 'var(--text-faint)' }}>
                          EMIs ({(c.emis ?? []).length})
                        </button>
                      )}
                      {(c.spends ?? []).length > 0 && (
                        <button onClick={() => setExpandTab(t => ({ ...t, [c.id]: 'spends' }))}
                          className="py-2.5 px-1 mr-4 text-[11px] font-medium transition-colors border-b-2"
                          style={{ borderColor: tab === 'spends' ? 'var(--pink)' : 'transparent', color: tab === 'spends' ? 'var(--pink)' : 'var(--text-faint)' }}>
                          Spends {fmtINR(spends)}
                        </button>
                      )}
                      <div className="ml-auto flex items-center gap-1.5 py-1.5">
                        {Number(c.outstanding ?? 0) > 0 && <button className="text-[11px] px-2.5 py-1 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)' }} onClick={() => setConfirmModal({ message: `Clear ${fmtINR(c.outstanding)}?`, onConfirm: () => payOutMut.mutate(c), label: 'Clear' })}>Clear Due</button>}
                        <button className="text-[11px] px-2.5 py-1 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: 'var(--text-faint)', border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)' }} onClick={() => { setActiveCard(c); setEmiForm({}); setFormErrors({}); setModalType('emi') }}>+ EMI</button>
                        <button className="text-[11px] px-2.5 py-1 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)', color: 'var(--text-faint)', border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)' }} onClick={() => { setActiveCard(c); setSpendForm({ spendDate: new Date().toISOString().slice(0, 10) }); setFormErrors({}); setModalType('spend') }}>+ Spend</button>
                        <button className="text-[11px] px-2 py-1 rounded" style={{ color: 'var(--text-faint)' }} onClick={() => { setCardForm(c); setFormErrors({}); setModalType('card') }}><Pencil size={12} /></button>
                        <button className="text-[11px] px-2 py-1 rounded text-red-400" onClick={() => setConfirmModal({ message: 'Delete card?', onConfirm: () => deleteMut.mutate(c), label: 'Delete' })}><Trash2 size={12} /></button>
                      </div>
                    </div>

                    {c.notes && (
                      <div className="px-4 py-2.5 flex items-start gap-2 text-[11px]" style={{ borderBottom: '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-faint)' }}>Notes:</span>
                        <span className="whitespace-pre-wrap">{c.notes}</span>
                      </div>
                    )}

                    {/* Tab content */}
                    {tab === 'emis' && (c.emis ?? []).length > 0 && (
                      <div>
                        <div className="grid px-4 py-1.5 text-[12px] " style={{ gridTemplateColumns: 'minmax(190px,2.4fr) minmax(90px,1.03fr) minmax(80px,0.91fr) minmax(80px,0.91fr) minmax(100px,1.14fr)', color: 'var(--text-faint)', background: 'color-mix(in srgb, var(--text) 3%, transparent)' }}>
                          <span>Item</span><span className="text-right">EMI/mo</span><span className="text-right">Pending</span><span className="text-center">Progress</span><span className="text-center">Action</span>
                        </div>
                        {(c.emis ?? []).map((e: any) => {
                          const eff = getEff({ ...e, missedMonths: e.missedMonths ?? 0 }), t = e.tenure ?? 0, pct = t > 0 ? Math.round(eff.paid / t * 100) : 0
                          return (
                            <div key={e.id} className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: 'minmax(190px,2.4fr) minmax(90px,1.03fr) minmax(80px,0.91fr) minmax(80px,0.91fr) minmax(100px,1.14fr)', borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)', opacity: eff.pending === 0 ? 0.4 : 1 }}>
                              <div className="flex items-start gap-1.5">
                                {eff.pending > 0 && <PickBox checked={wi.picked.has(`${c.id}:${e.id}`)} onToggle={() => wi.toggle(`${c.id}:${e.id}`)} label={`Add ${e.label} to the what-if`} />}
                                <div>
                                <span className="text-[13px] font-medium">{e.label}</span>
                                {(e.missedMonths ?? 0) > 0 && <span className="text-[11px] text-red-400 ml-2">⚠ {e.missedMonths} missed</span>}
                                <div className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--text-faint)' }}>
                                  <span>{eff.paid}/{t} paid</span>
                                  {e.category && <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>{e.category}</span>}
                                  {(() => {
                                    const policy = linkedPolicyFor(c.id, e.id)
                                    return policy ? (
                                      <span className="px-1.5 py-0.5 rounded-full flex items-center gap-0.5" style={{ background: 'color-mix(in srgb, var(--info) 12%, transparent)', color: 'var(--info)' }} title={`Linked to the ${policy.name} insurance policy — its premium is excluded from Insurance's own totals because of this EMI`}>
                                        <Shield size={9} /> {policy.name}
                                      </span>
                                    ) : null
                                  })()}
                                </div>
                                {(() => {
                                  const ef = emiFacts({ amount: e.principal, emi: e.emi, tenure: t, paid: eff.paid, rate: e.interestRate })
                                  return (
                                    <div className="text-[11px] mono mt-0.5 flex flex-wrap gap-x-3" style={{ color: 'var(--text-faint)' }}>
                                      {ef.borrowed != null && <span>borrowed <b style={{ color: 'var(--text-muted)' }}>{fmtINR(ef.borrowed)}</b></span>}
                                      <span>paid <b style={{ color: 'var(--success)' }}>{fmtINR(ef.totalPaid)}</b></span>
                                      {ef.rate != null && <span>rate <b style={{ color: rateColor(ef.rate) }}>{ef.rate}%{ef.rateEstimated && ef.rate > 0 ? ' ~' : ''}</b></span>}
                                      {ef.borrowed != null && <span>extra <b style={{ color: 'var(--orange, var(--warning))' }}>{fmtINR(ef.extraPayable)}</b></span>}
                                    </div>
                                  )
                                })()}
                                {e.owedBy && (
                                  <div className="mt-1">
                                    <button
                                      className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                                      style={e.owedSettled
                                        ? { background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)' }
                                        : { background: 'color-mix(in srgb, var(--info) 12%, transparent)', color: 'var(--info)', border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)' }}
                                      onClick={() => toggleEmiOwedMut.mutate({ id: e.id, owedSettled: !e.owedSettled })}>
                                      {e.owedSettled ? `✓ Settled — ${e.owedBy}` : `For ${e.owedBy} · tap to settle`}
                                    </button>
                                  </div>
                                )}
                                </div>
                              </div>
                              <div className="text-right"><span className="mono font-semibold" style={{ color: 'var(--warning)' }}>{fmtINR(e.emi)}</span></div>
                              <div className="text-right"><span className="mono text-[13px]" style={{ color: 'var(--text-faint)' }}>{fmtINR((e.emi ?? 0) * eff.pending)}</span></div>
                              <div className="text-center">
                                <span className="mono font-medium text-[13px]" style={{ color: pct > 75 ? 'var(--success)' : pct > 40 ? 'var(--info)' : 'var(--text-faint)' }}>{pct}%</span>
                                {/* Visual months-paid-vs-remaining bar alongside the "{paid}/{t} paid"
                                    text already under the item name — same bar style PayoffPage's
                                    Variable Monthly Budget and LoansPage's Tenure column use, so
                                    progress reads the same way everywhere it's shown. */}
                                <div style={{width:36,height:3,background:'color-mix(in srgb, var(--text) 10%, transparent)',borderRadius:2,margin:'3px auto 0'}}>
                                  <div style={{width:`${pct}%`,height:3,borderRadius:2,background: pct > 75 ? 'var(--success)' : pct > 40 ? 'var(--info)' : 'var(--text-faint)'}}/>
                                </div>
                              </div>
                              <div className="flex justify-center gap-1">
                                {eff.pending > 0
                                  ? <button className="btn btn-xs bg-green-500/10 text-green-400" onClick={() => markEmiMut.mutate({ cardId: c.id, emiId: e.id })}><CheckCircle size={11} /></button>
                                  : <button className="btn btn-xs bg-green-500/10 text-green-400" onClick={() => closeEmiMut.mutate({ card: c, emi: e })}><Archive size={11} /></button>
                                }
                                <button className="btn-ghost btn-xs" onClick={() => { setActiveCard(c); setEmiForm({ ...e }); setFormErrors({}); setModalType('editEmi') }}><Pencil size={11} /></button>
                                <button className="btn-danger btn-xs" onClick={() => setConfirmModal({ message: 'Delete?', onConfirm: () => deleteEmiMut.mutate(e.id), label: 'Delete' })}><Trash2 size={11} /></button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {tab === 'spends' && (c.spends ?? []).length > 0 && (
                      <div>
                        <div className="flex justify-end px-4 py-2" style={{ borderBottom: '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                          <button className="text-[11px] px-2.5 py-1 rounded font-medium" style={{ background: 'rgba(244,114,182,0.1)', color: 'var(--pink)', border: '1px solid rgba(244,114,182,0.2)' }} onClick={() => setConfirmModal({ message: `Clear all spends on ${c.banker}?`, onConfirm: () => clearSpendsMut.mutate(c), label: 'Clear all' })}>Clear all</button>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {(c.spends ?? []).map((sp: any) => (
                            <div key={sp.id} className="grid items-center px-4 py-2" style={{ gridTemplateColumns: 'minmax(80px,1.18fr) minmax(190px,2.4fr) minmax(70px,1.03fr) minmax(90px,1.32fr) minmax(32px,0.55fr)', borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)' }}>
                              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sp.spendDate}</span>
                              <div className="min-w-0">
                                <span className="text-[13px] truncate block">{sp.purpose}</span>
                                {sp.owedBy && (
                                  <button
                                    className="text-[11px] px-1.5 py-0.5 rounded-full font-medium mt-0.5"
                                    style={sp.owedSettled
                                      ? { background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)' }
                                      : { background: 'color-mix(in srgb, var(--info) 12%, transparent)', color: 'var(--info)', border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)' }}
                                    onClick={() => toggleSpendOwedMut.mutate({ id: sp.id, owedSettled: !sp.owedSettled })}>
                                    {sp.owedSettled ? `✓ Settled — ${sp.owedBy}` : `For ${sp.owedBy} · tap to settle`}
                                  </button>
                                )}
                              </div>
                              <span className="text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>{sp.category || '—'}</span>
                              <span className="mono text-right font-semibold" style={{ color: 'var(--pink)' }}>{fmtINR(Number(sp.amount ?? 0))}</span>
                              <button className="btn-danger btn-xs" onClick={() => setConfirmModal({ message: 'Delete?', onConfirm: () => deleteSpendMut.mutate(sp.id), label: 'Delete' })}><Trash2 size={10} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
          })()}

          {/* Footer */}
          <div className="grid min-w-[760px] px-4 py-3 text-[13px] font-bold border-t"
            style={{ gridTemplateColumns: 'minmax(180px,1.7fr) minmax(85px,1fr) minmax(60px,1fr) minmax(90px,1fr) minmax(75px,1fr) minmax(70px,1fr) minmax(70px,1fr)', borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-faint)' }}>
            <span>{cards.length} cards</span>
            <span className="text-right mono" style={{ color: 'var(--cyan)' }}>{fmtINR(totLimit)}</span>
            <span className="text-right mono whitespace-nowrap" style={{ color: utilClrFn(util) }}>{fmtINR(totOut + totSpends + totEmiPend)} <span className="text-[11px] font-medium">({util}%)</span></span>
            <span className="text-center mono" style={{ color: totOut > 0 ? 'var(--danger)' : 'var(--success)' }}>{totOut > 0 ? fmtINR(totOut) : '✓'}</span>
            <span className="text-right mono" style={{ color: 'var(--warning)' }}>{totEmiAll > 0 ? <>{fmtINR(totEmiAll)}{totEmiFriends > 0 && <span className="block text-[11px] font-normal leading-tight" style={{ color: 'var(--info)' }} title={`${fmtINR(totEmi)} yours + ${fmtINR(totEmiFriends)} friends'`}>incl. {fmtINR(totEmiFriends)} friends'</span>}</> : '—'}</span>
            <span className="text-right mono" style={{ color: 'var(--pink)' }}>{totSpends > 0 ? fmtINR(totSpends) : '—'}</span>
            <span></span>
          </div>
        </div>
        </>)}

        {/* ── ALL EMIs, EVERY CARD, ONE TABLE ── */}
        {cardsView === 'emis' && (() => {
          const rows = (cards as any[]).flatMap((c: any) => (c.emis ?? []).map((e: any) => {
            const eff = getEff({ ...e, missedMonths: e.missedMonths ?? 0 })
            const t = e.tenure ?? (eff.paid + eff.pending)
            const ef = emiFacts({ amount: e.principal, emi: e.emi, tenure: t, paid: eff.paid, rate: e.interestRate })
            const pend = eff.pending * Number(e.emi ?? 0)
            const endD = e.endDate ? new Date(e.endDate) : (() => { const d = new Date(); d.setMonth(d.getMonth() + eff.pending); return d })()
            return { c, e, eff, t, ef, pend, endD, own: !(e.owedBy && !e.owedSettled) }
          })).filter(r => showDoneEmis || r.eff.pending > 0)
          const val = (r: any): number | string => {
            switch (emiSortCol) {
              case 'name': return String(r.e.label ?? '').toLowerCase()
              case 'card': return String(r.c.banker ?? '').toLowerCase()
              case 'borrowed': return r.ef.borrowed ?? -1
              case 'emi': return Number(r.e.emi ?? 0)
              case 'paid': return r.ef.totalPaid
              case 'rate': return r.ef.rate ?? -1
              case 'extra': return r.ef.borrowed != null ? r.ef.extraPayable : -1
              case 'ends': return r.endD.getTime()
              default: return r.pend
            }
          }
          const list = [...rows].sort((a, b) => {
            const x = val(a), y = val(b)
            const cmp = typeof x === 'string' ? x.localeCompare(String(y)) : Number(x) - Number(y)
            return emiSortDir === 'asc' ? cmp : -cmp
          })
          const own = list.filter(r => r.own)
          const sum = (f: (r: any) => number) => own.reduce((a, r) => a + f(r), 0)
          // Grouping: card / category / end-date bucket / mine-vs-friends. Inside a group the table's own sort still applies.
          const ownPend = (items: any[]) => items.filter((r: any) => r.own).reduce((x: number, r: any) => x + r.pend, 0)
          const keyOf = (r: any): { key: string; label: string; order: number } => {
            switch (groupEmisBy) {
              case 'card': return { key: `c${r.c.id}`, label: `💳 ${r.c.banker}`, order: 0 }
              case 'category': { const k = r.e.category || 'Uncategorized'; return { key: `k${k}`, label: `🏷️ ${k}`, order: 0 } }
              case 'whose': return r.own ? { key: 'mine', label: '🙋 My EMIs', order: 0 } : { key: 'friends', label: '🤝 Carried for friends', order: 1 }
              case 'ends': {
                if (r.eff.pending <= 0) return { key: 'done', label: '✅ Finished', order: 9 }
                const m = r.eff.pending
                return m <= 3 ? { key: 'e3', label: '⏳ Ends within 3 months', order: 0 } : m <= 6 ? { key: 'e6', label: '⏳ Ends in 4–6 months', order: 1 }
                  : m <= 12 ? { key: 'e12', label: '⏳ Ends in 7–12 months', order: 2 } : { key: 'e13', label: '⏳ Runs beyond a year', order: 3 }
              }
              default: return { key: 'all', label: '', order: 0 }
            }
          }
          const byKey = new Map<string, { key: string; label: string; order: number; items: any[] }>()
          list.forEach((r: any) => { const k = keyOf(r); const g = byKey.get(k.key) ?? { ...k, items: [] }; g.items.push(r); byKey.set(k.key, g) })
          const groups = Array.from(byKey.values()).sort((a, b) =>
            groupEmisBy === 'card' || groupEmisBy === 'category' ? ownPend(b.items) - ownPend(a.items) : a.order - b.order)
          const COLS = 'minmax(200px,2.2fr) minmax(95px,1fr) minmax(70px,0.7fr) minmax(105px,1.1fr) minmax(85px,1fr) minmax(115px,1.2fr) minmax(95px,1fr) minmax(80px,0.8fr) 112px'
          if (!list.length) return <EmptyState icon="📋" title="No active EMIs" sub="EMIs you add to a card show up here, across all cards" />
          return (<>
            {groupEmisBy !== 'none' && groups.length > 1 && (() => {
              const keys = groups.map(g => `${groupEmisBy}:${g.key}`)
              const allClosed = keys.every(k => !openEmiGroups.has(k))
              return (
                <div className="flex justify-end mb-1 text-[11px] print:hidden" style={{ color: 'var(--text-faint)' }}>
                  <button type="button" className="hover:underline" style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                    onClick={() => setOpenEmiGroups(prev => { const n = new Set(prev); keys.forEach(k => allClosed ? n.add(k) : n.delete(k)); return n })}>
                    {allClosed ? '▾ expand all' : '▸ collapse all'}
                  </button>
                </div>
              )
            })()}
            <div className="md:hidden text-[11px] text-right mb-1 print:hidden" style={{ color: 'var(--text-faint)' }}>swipe sideways for more columns ↔</div>
            <div className="rounded-2xl overflow-hidden text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflowX: 'auto' }}>
              <div style={{ minWidth: 1090 }}>
                <div className="grid px-4 py-2 text-[12px] font-medium border-b" style={{ gridTemplateColumns: COLS, borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-faint)' }}>
                  <SortHeader label="EMI / Card" col="name" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} />
                  <SortHeader label="Borrowed" col="borrowed" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="right" />
                  <SortHeader label="Rate" col="rate" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="right" />
                  <SortHeader label="Extra payable" col="extra" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="right" />
                  <SortHeader label="EMI/mo" col="emi" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="right" />
                  <SortHeader label="Paid so far" col="paid" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="right" />
                  <SortHeader label="Pending" col="pending" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="right" />
                  <SortHeader label="Ends" col="ends" sortCol={emiSortCol} sortDir={emiSortDir} onSort={onEmiSort} align="center" />
                  <span className="text-center">Actions</span>
                </div>
                {groups.map(g => {
                  const gOwn = g.items.filter(r => r.own)
                  const gs = (f: (r: any) => number) => gOwn.reduce((x, r) => x + f(r), 0)
                  const gKey = `${groupEmisBy}:${g.key}`
                  const isCollapsed = groupEmisBy !== 'none' && !openEmiGroups.has(gKey)
                  const toggleGroup = () => setOpenEmiGroups(prev => { const n = new Set(prev); if (n.has(gKey)) n.delete(gKey); else n.add(gKey); return n })
                  return (
                  <Fragment key={g.key}>
                    {groupEmisBy !== 'none' && (
                      <div className="grid items-center px-4 py-2 text-[12px] cursor-pointer select-none" role="button" aria-expanded={!isCollapsed} tabIndex={0}
                        title={isCollapsed ? 'Click to expand' : 'Click to collapse'}
                        onClick={toggleGroup} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup() } }}
                        style={{ gridTemplateColumns: COLS, background: 'color-mix(in srgb, var(--text) 5%, transparent)', borderTop: '1px solid var(--hairline)' }}>
                        <span className="font-semibold truncate"><ChevronDown size={13} className="inline-block mr-1 -mt-0.5" style={{ color: 'var(--text-faint)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }} />{g.label} <span className="font-normal text-[11px]" style={{ color: 'var(--text-faint)' }}>· {g.items.length} EMI{g.items.length !== 1 ? 's' : ''}</span></span>
                        <span className="text-right mono" style={{ color: 'var(--text-faint)' }}>{gs(r => r.ef.borrowed ?? 0) > 0 ? fmtINR(gs(r => r.ef.borrowed ?? 0)) : '—'}</span>
                        <span></span>
                        <span className="text-right mono" style={{ color: 'var(--text-faint)' }}>{gs(r => r.ef.borrowed != null ? r.ef.extraPayable : 0) > 0 ? fmtINR(gs(r => r.ef.borrowed != null ? r.ef.extraPayable : 0)) : '—'}</span>
                        <span className="text-right mono font-semibold" style={{ color: 'var(--warning)' }}>{fmtINR(gs(r => r.eff.pending > 0 ? Number(r.e.emi ?? 0) : 0))}</span>
                        <span className="text-right mono" style={{ color: 'var(--text-faint)' }}>{fmtINR(gs(r => r.ef.totalPaid))}</span>
                        <span className="text-right mono font-semibold" style={{ color: 'var(--text-muted)' }}>{fmtINR(gs(r => r.pend))}</span>
                        <span></span>
                        <span></span>
                      </div>
                    )}
                    {!isCollapsed && g.items.map(({ c, e, eff, t, ef, pend, endD, own: isOwn }) => {
                  const pct = t > 0 ? Math.round(eff.paid / t * 100) : 0
                  return (
                    <div key={`${c.id}-${e.id}`} className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: COLS, borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)', opacity: eff.pending === 0 || !isOwn ? 0.55 : 1 }}>
                      <div className="flex items-start gap-1.5 min-w-0">
                        {eff.pending > 0 && <PickBox checked={wi.picked.has(`${c.id}:${e.id}`)} onToggle={() => wi.toggle(`${c.id}:${e.id}`)} label={`Add ${e.label} to the what-if`} />}
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium truncate">{e.label}</div>
                          <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--text-faint)' }}>
                            {groupEmisBy !== 'card' && <span>💳 {c.banker}</span>}
                            {e.category && <span className="px-1.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>{e.category}</span>}
                            {(e.missedMonths ?? 0) > 0 && <span className="text-red-400">⚠ {e.missedMonths} missed</span>}
                            {!isOwn && <span style={{ color: 'var(--info)' }}>for {e.owedBy}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right mono">{ef.borrowed != null ? fmtINR(ef.borrowed) : <span style={{ color: 'var(--text-faint)' }}>—</span>}</div>
                      <div className="text-right mono" title={ef.rateEstimated ? 'Worked out from borrowed amount, EMI and tenure — no rate entered' : 'Rate you entered'}>
                        {ef.rate == null ? <span style={{ color: 'var(--text-faint)' }}>—</span> : ef.rate > 0 ? <span className="font-semibold" style={{ color: rateColor(ef.rate) }}>{ef.rate}%{ef.rateEstimated && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> ~</span>}</span> : <span style={{ color: 'var(--success)' }}>0%</span>}
                      </div>
                      <div className="text-right">
                        {ef.borrowed != null ? (<>
                          <div className="mono font-semibold" style={{ color: ef.extraPayable > 0 ? 'var(--orange, var(--warning))' : 'var(--text-faint)' }}>{ef.extraPayable > 0 ? fmtINR(ef.extraPayable) : 'no extra'}</div>
                          {ef.extraPayable > 0 && <div className="text-[11px] mono" style={{ color: 'var(--text-faint)' }}>{fmtINR(ef.interestLeft)} left</div>}
                        </>) : <span style={{ color: 'var(--text-faint)' }} title="Add the borrowed amount (principal) to this EMI to see the extra">—</span>}
                      </div>
                      <div className="text-right mono font-semibold" style={{ color: 'var(--warning)' }}>{fmtINR(e.emi)}</div>
                      <div className="text-right">
                        <div className="mono" style={{ color: 'var(--success)' }}>{fmtINR(ef.totalPaid)}</div>
                        <div className="text-[11px] mono" style={{ color: 'var(--text-faint)' }}>{eff.paid}/{t} · {pct}%</div>
                        <div style={{ width: 56, height: 3, background: 'color-mix(in srgb, var(--text) 10%, transparent)', borderRadius: 2, marginLeft: 'auto', marginTop: 2 }}>
                          <div style={{ width: `${pct}%`, height: 3, borderRadius: 2, background: pct > 75 ? 'var(--success)' : pct > 40 ? 'var(--info)' : 'var(--text-faint)' }} />
                        </div>
                      </div>
                      <div className="text-right mono" style={{ color: 'var(--text-muted)' }}>{eff.pending > 0 ? fmtINR(pend) : '—'}</div>
                      <div className="text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>{eff.pending > 0 ? endD.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'done'}</div>
                      <div className="flex justify-center gap-1">
                        {eff.pending > 0
                          ? <button className="btn btn-xs bg-green-500/10 text-green-400" title="Mark this month's EMI paid" onClick={() => markEmiMut.mutate({ cardId: c.id, emiId: e.id })}><CheckCircle size={11} /></button>
                          : <button className="btn btn-xs bg-green-500/10 text-green-400" title="Archive this finished EMI" onClick={() => closeEmiMut.mutate({ card: c, emi: e })}><Archive size={11} /></button>}
                        <button className="btn-ghost btn-xs" title="Edit EMI" onClick={() => { setActiveCard(c); setEmiForm({ ...e }); setFormErrors({}); setModalType('editEmi') }}><Pencil size={11} /></button>
                        <button className="btn-danger btn-xs" title="Delete EMI" onClick={() => setConfirmModal({ message: `Delete ${e.label}?`, onConfirm: () => deleteEmiMut.mutate(e.id), label: 'Delete' })}><Trash2 size={11} /></button>
                      </div>
                    </div>
                  )
                    })}
                  </Fragment>
                  )
                })}
                <div className="grid items-center px-4 py-3 text-[12px] font-bold border-t" style={{ gridTemplateColumns: COLS, borderColor: 'var(--border-2, color-mix(in srgb, var(--text) 13%, transparent))', background: 'color-mix(in srgb, var(--text) 4%, transparent)' }}>
                  <span>{own.length} EMI{own.length !== 1 ? 's' : ''}{own.length !== list.length && <span className="font-normal" style={{ color: 'var(--text-faint)' }}> · {list.length - own.length} for friends excluded</span>}</span>
                  <span className="text-right mono">{fmtINR(sum(r => r.ef.borrowed ?? 0))}</span>
                  <span></span>
                  <span className="text-right mono" style={{ color: 'var(--orange, var(--warning))' }}>{fmtINR(sum(r => r.ef.borrowed != null ? r.ef.extraPayable : 0))}</span>
                  <span className="text-right mono" style={{ color: 'var(--warning)' }}>{fmtINR(sum(r => r.eff.pending > 0 ? Number(r.e.emi ?? 0) : 0))}</span>
                  <span className="text-right mono" style={{ color: 'var(--success)' }}>{fmtINR(sum(r => r.ef.totalPaid))}</span>
                  <span className="text-right mono">{fmtINR(sum(r => r.pend))}</span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </>)
        })()}

        {/* ── ALL SPENDS, EVERY CARD, ONE TABLE ── */}
        {cardsView === 'spends' && (() => {
          const rows = (cards as any[]).flatMap((c: any) => (c.spends ?? []).map((sp: any) => ({ c, sp, own: !(sp.owedBy && !sp.owedSettled) })))
          if (!rows.length) return <EmptyState icon="🛍️" title="No spends this cycle" sub="Spends you add to a card show up here, across all cards" />
          const val = (r: any): number | string => {
            switch (spendSortCol) {
              case 'purpose': return String(r.sp.purpose ?? '').toLowerCase()
              case 'card': return String(r.c.banker ?? '').toLowerCase()
              case 'category': return String(r.sp.category ?? '').toLowerCase()
              case 'amount': return Number(r.sp.amount ?? 0)
              default: return new Date(r.sp.spendDate ?? 0).getTime() || 0
            }
          }
          const list = [...rows].sort((a, b) => { const x = val(a), y = val(b); const cmp = typeof x === 'string' ? x.localeCompare(String(y)) : Number(x) - Number(y); return spendSortDir === 'asc' ? cmp : -cmp })
          const ownSum = list.filter(r => r.own).reduce((a, r) => a + Number(r.sp.amount ?? 0), 0)
          const friendSum = list.filter(r => !r.own).reduce((a, r) => a + Number(r.sp.amount ?? 0), 0)
          // by-category strip so "where did it go" is visible at a glance
          const byCat = new Map<string, number>()
          list.filter(r => r.own).forEach(r => byCat.set(r.sp.category || 'Other', (byCat.get(r.sp.category || 'Other') ?? 0) + Number(r.sp.amount ?? 0)))
          const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
          const COLS = 'minmax(90px,0.9fr) minmax(200px,2.2fr) minmax(110px,1.1fr) minmax(100px,1fr) minmax(110px,1fr) 56px'
          return (<>
            {cats.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {cats.map(([k, v]) => <span key={k} className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(244,114,182,0.08)', color: 'var(--text-muted)', border: '1px solid rgba(244,114,182,0.18)' }}>{k} <b className="mono" style={{ color: 'var(--pink)' }}>{fmtINR(v)}</b></span>)}
              </div>
            )}
            <div className="md:hidden text-[11px] text-right mb-1 print:hidden" style={{ color: 'var(--text-faint)' }}>swipe sideways for more columns ↔</div>
            <div className="rounded-2xl overflow-hidden text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflowX: 'auto' }}>
              <div style={{ minWidth: 820 }}>
                <div className="grid px-4 py-2 text-[12px] font-medium border-b" style={{ gridTemplateColumns: COLS, columnGap: 10, borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-faint)' }}>
                  <SortHeader label="Date" col="date" sortCol={spendSortCol} sortDir={spendSortDir} onSort={onSpendSort} />
                  <SortHeader label="Purpose" col="purpose" sortCol={spendSortCol} sortDir={spendSortDir} onSort={onSpendSort} />
                  <SortHeader label="Card" col="card" sortCol={spendSortCol} sortDir={spendSortDir} onSort={onSpendSort} />
                  <SortHeader label="Category" col="category" sortCol={spendSortCol} sortDir={spendSortDir} onSort={onSpendSort} />
                  <SortHeader label="Amount" col="amount" sortCol={spendSortCol} sortDir={spendSortDir} onSort={onSpendSort} align="right" />
                  <span></span>
                </div>
                {list.map(({ c, sp, own }) => (
                  <div key={`${c.id}-${sp.id}`} className="grid items-center px-4 py-2" style={{ gridTemplateColumns: COLS, columnGap: 10, borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)', opacity: own ? 1 : 0.6 }}>
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sp.spendDate}</span>
                    <div className="min-w-0">
                      <span className="text-[13px] truncate block">{sp.purpose}</span>
                      {sp.owedBy && (
                        <button className="text-[11px] px-1.5 py-0.5 rounded-full font-medium mt-0.5"
                          style={sp.owedSettled ? { background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)' } : { background: 'color-mix(in srgb, var(--info) 12%, transparent)', color: 'var(--info)', border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)' }}
                          onClick={() => toggleSpendOwedMut.mutate({ id: sp.id, owedSettled: !sp.owedSettled })}>
                          {sp.owedSettled ? `✓ Settled — ${sp.owedBy}` : `For ${sp.owedBy} · tap to settle`}
                        </button>
                      )}
                    </div>
                    <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>💳 {c.banker}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sp.category || '—'}</span>
                    <span className="mono text-right font-semibold" style={{ color: 'var(--pink)' }}>{fmtINR(Number(sp.amount ?? 0))}</span>
                    <button className="btn-danger btn-xs justify-self-center" title="Delete spend" onClick={() => setConfirmModal({ message: 'Delete?', onConfirm: () => deleteSpendMut.mutate(sp.id), label: 'Delete' })}><Trash2 size={10} /></button>
                  </div>
                ))}
                <div className="grid items-center px-4 py-3 text-[12px] font-bold border-t" style={{ gridTemplateColumns: COLS, columnGap: 10, borderColor: 'var(--border-2, color-mix(in srgb, var(--text) 13%, transparent))', background: 'color-mix(in srgb, var(--text) 4%, transparent)' }}>
                  <span style={{ gridColumn: '1 / 5' }}>{list.length} spend{list.length !== 1 ? 's' : ''}{friendSum > 0 && <span className="font-normal" style={{ color: 'var(--text-faint)' }}> · {fmtINR(friendSum)} for friends not included</span>}</span>
                  <span className="text-right mono" style={{ color: 'var(--pink)' }}>{fmtINR(ownSum)}</span>
                  <span></span>
                </div>
              </div>
            </div>
          </>)
        })()}

        {/* ── OUTSTANDING, EVERY CARD, ONE TABLE ── */}
        {cardsView === 'outstanding' && (() => {
          const rows = (cards as any[]).map((c: any) => {
            const out = Number(c.outstanding ?? 0)
            const sp = (c.spends ?? []).filter((x: any) => !(x.owedBy && !x.owedSettled)).reduce((a: number, x: any) => a + Number(x.amount ?? 0), 0)
            const emi = (c.emis ?? []).filter((e: any) => getEff(e).pending > 0 && !(e.owedBy && !e.owedSettled)).reduce((a: number, e: any) => a + Number(e.emi ?? 0), 0)
            const limit = Number(c.cardLimit ?? 0)
            const due = resolveDueDay(c) || null
            return { c, out, sp, emi, limit, due, use: cardLimitUse(c), util: cardLimitUse(c).pct, total: out + sp + emi }
          }).sort((a, b) => b.out - a.out)
          // The tab's badge counts cards that owe a statement balance, so the table lists those; a cleared card is one
          // click away rather than a dimmed row padding the list.
          const clearedCount = rows.filter(r => r.out <= 0).length
          const shown = showClearedCards ? rows : rows.filter(r => r.out > 0)
          const tOut = shown.reduce((a, r) => a + r.out, 0), tSp = shown.reduce((a, r) => a + r.sp, 0), tEmi = shown.reduce((a, r) => a + r.emi, 0)
          const COLS = 'minmax(150px,1.6fr) minmax(105px,1fr) minmax(100px,1fr) minmax(100px,1fr) minmax(110px,1.1fr) minmax(95px,1fr) minmax(70px,0.7fr) 96px'
          return (
            <>
              {clearedCount > 0 && (
                <div className="flex justify-end mb-1 text-[11px] print:hidden" style={{ color: 'var(--text-faint)' }}>
                  <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showClearedCards} onChange={e => setShowClearedCards(e.target.checked)} /> show {clearedCount} cleared card{clearedCount !== 1 ? 's' : ''}</label>
                </div>
              )}
              <div className="md:hidden text-[11px] text-right mb-1 print:hidden" style={{ color: 'var(--text-faint)' }}>swipe sideways for more columns ↔</div>
              <div className="rounded-2xl overflow-hidden text-[13px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflowX: 'auto' }}>
                <div style={{ minWidth: 900 }}>
                  <div className="grid px-4 py-2 text-[12px] font-medium border-b" style={{ gridTemplateColumns: COLS, borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-faint)' }}>
                    <span>Card</span><span className="text-right">Outstanding</span><span className="text-right">Spends</span><span className="text-right">EMIs / mo</span><span className="text-right">Total this cycle</span><span className="text-right">Limit used</span><span className="text-center">Due</span><span className="text-center">Action</span>
                  </div>
                  {shown.map(({ c, out, sp, emi, limit, due, use, util, total }) => (
                    <div key={c.id} className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: COLS, borderTop: '1px solid color-mix(in srgb, var(--text) 5%, transparent)', opacity: total === 0 ? 0.5 : 1 }}>
                      <div className="font-medium truncate">{c.banker}<div className="text-[11px] font-normal mono" style={{ color: 'var(--text-faint)' }}>limit {fmtINR(limit)}</div></div>
                      <div className="text-right mono font-semibold" style={{ color: out > 0 ? 'var(--danger)' : 'var(--text-faint)' }}>{out > 0 ? fmtINR(out) : '✓ clear'}</div>
                      <div className="text-right mono" style={{ color: sp > 0 ? 'var(--pink)' : 'var(--text-faint)' }}>{sp > 0 ? fmtINR(sp) : '—'}</div>
                      <div className="text-right mono" style={{ color: emi > 0 ? 'var(--warning)' : 'var(--text-faint)' }}>{emi > 0 ? fmtINR(emi) : '—'}</div>
                      <div className="text-right mono font-bold">{total > 0 ? fmtINR(total) : '—'}</div>
                      <div className="text-right mono" style={{ color: util > 70 ? 'var(--danger)' : util > 40 ? 'var(--warning)' : 'var(--success)' }} title={`Outstanding ${fmtINR(use.outstanding)} + spends ${fmtINR(use.spends)} + EMIs still to pay ${fmtINR(use.emiLeft)} = ${fmtINR(use.used)} of ${fmtINR(limit)} (friends' items use your limit too)`}>{limit > 0 ? <span className="whitespace-nowrap">{fmtINR(use.used)} <span className="text-[11px] opacity-80">({util}%)</span></span> : '—'}</div>
                      <div className="text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>{due ? `day ${due}` : '—'}</div>
                      <div className="flex justify-center">
                        {out > 0 && <button className="text-[11px] px-2.5 py-1 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)' }} onClick={() => setConfirmModal({ message: `Clear ${fmtINR(out)} on ${c.banker}?`, onConfirm: () => payOutMut.mutate(c), label: 'Clear' })}>Clear Due</button>}
                      </div>
                    </div>
                  ))}
                  <div className="grid items-center px-4 py-3 text-[12px] font-bold border-t" style={{ gridTemplateColumns: COLS, borderColor: 'var(--border-2, color-mix(in srgb, var(--text) 13%, transparent))', background: 'color-mix(in srgb, var(--text) 4%, transparent)' }}>
                    <span>{shown.length} card{shown.length !== 1 ? 's' : ''}{!showClearedCards && clearedCount > 0 ? <span className="font-normal" style={{ color: 'var(--text-faint)' }}> · {clearedCount} clear</span> : null}</span>
                    <span className="text-right mono" style={{ color: 'var(--danger)' }}>{fmtINR(tOut)}</span>
                    <span className="text-right mono" style={{ color: 'var(--pink)' }}>{fmtINR(tSp)}</span>
                    <span className="text-right mono" style={{ color: 'var(--warning)' }}>{fmtINR(tEmi)}</span>
                    <span className="text-right mono">{fmtINR(tOut + tSp + tEmi)}</span>
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Outstanding = statement balance due · Spends = this cycle's purchases, not billed yet · EMIs / mo = this month's instalments · Limit used = outstanding + spends + unpaid EMIs. Friends' items aren't in the amounts you owe, but they do use your limit, so they count in Limit used.</div>
            </>
          )
        })()}
      </>)}

      {/* MODALS */}
      {modalType === 'card' && (
        <Modal title={cardForm.id ? 'Edit Card' : 'Add Card'} onClose={() => { setModalType(null); setFormErrors({}) }}
          footer={<><button className="btn-secondary" onClick={() => { setModalType(null); setFormErrors({}) }}>Cancel</button><button className="btn-primary" disabled={saveMut.isPending || Object.keys(validateCard(cardForm)).length > 0} onClick={() => { const errs = validateCard(cardForm); if (Object.keys(errs).length > 0) { setFormErrors(errs); return } saveMut.mutate(cardForm) }}>{saveMut.isPending ? 'Saving...' : 'Save'}</button></>}>
          <div className="form-grid">
            <FormField label="Bank Name *" className="form-full"><input className={"input" + (formErrors.banker ? ' border-red-500' : '')} value={cardForm.banker} onChange={e => { setCardForm((f: any) => ({ ...f, banker: e.target.value })); setFormErrors(er => ({ ...er, banker: '' })) }} />{formErrors.banker && <p className="text-[11px] text-red-400 mt-1">{formErrors.banker}</p>}</FormField>
            <FormField label="Credit Limit (₹)"><AmountInput placeholder="e.g. 200000" className={"input" + (formErrors.cardLimit ? ' border-red-500' : '')} value={cardForm.cardLimit} onValue={n => { setCardForm((f: any) => ({ ...f, cardLimit: n ?? 0 })); setFormErrors(er => ({ ...er, cardLimit: '', outstanding: '' })) }} />{formErrors.cardLimit && <p className="text-[11px] text-red-400 mt-1">{formErrors.cardLimit}</p>}</FormField>
            <FormField label="Outstanding (₹)"><AmountInput placeholder="0" className={"input" + (formErrors.outstanding ? ' border-red-500' : '')} value={cardForm.outstanding} onValue={n => { setCardForm((f: any) => ({ ...f, outstanding: n ?? 0 })); setFormErrors(er => ({ ...er, outstanding: '' })) }} />{formErrors.outstanding && <p className="text-[11px] text-red-400 mt-1">{formErrors.outstanding}</p>}</FormField>
            <FormField label="Due Day"><input className={"input" + (formErrors.dueDay ? ' border-red-500' : '')} type="number" min={1} max={31} placeholder="1–31" value={cardForm.dueDay || ''} onChange={e => { setCardForm((f: any) => ({ ...f, dueDay: +e.target.value })); setFormErrors(er => ({ ...er, dueDay: '' })) }} />{formErrors.dueDay && <p className="text-[11px] text-red-400 mt-1">{formErrors.dueDay}</p>}</FormField>
            <FormField label="Statement Day"><input className={"input" + (formErrors.billingDay ? ' border-red-500' : '')} type="number" min={1} max={31} placeholder="1–31" value={cardForm.billingDay || ''} onChange={e => { setCardForm((f: any) => ({ ...f, billingDay: +e.target.value })); setFormErrors(er => ({ ...er, billingDay: '' })) }} />{formErrors.billingDay && <p className="text-[11px] text-red-400 mt-1">{formErrors.billingDay}</p>}</FormField>
            <FormField label="Notes" className="form-full"><textarea className="input" rows={3} value={cardForm.notes || ''} onChange={e => setCardForm((f: any) => ({ ...f, notes: e.target.value }))} /></FormField>
          </div>
        </Modal>
      )}
      {(modalType === 'emi' || modalType === 'editEmi') && activeCard && (
        <Modal title={`${modalType === 'editEmi' ? 'Edit' : 'Add'} EMI — ${activeCard.banker}`} onClose={() => { setModalType(null); setFormErrors({}) }}
          footer={<><button className="btn-secondary" onClick={() => { setModalType(null); setFormErrors({}) }}>Cancel</button><button className="btn-primary" disabled={(modalType === 'editEmi' ? editEmiMut.isPending : addEmiMut.isPending) || Object.keys(validateEmi(emiForm)).length > 0} onClick={() => { const errs = validateEmi(emiForm); if (Object.keys(errs).length > 0) { setFormErrors(errs); return } modalType === 'editEmi' ? editEmiMut.mutate({ emiId: emiForm.id, emi: emiForm }) : addEmiMut.mutate({ cardId: activeCard.id, emi: emiForm }) }}>{(modalType === 'editEmi' ? editEmiMut.isPending : addEmiMut.isPending) ? 'Saving...' : 'Save'}</button></>}>
          <div className="form-grid">
            <FormField label="Label *" className="form-full"><input className={"input" + (formErrors.label ? ' border-red-500' : '')} placeholder="iPhone, TV..." value={emiForm.label || ''} onChange={e => { setEmiForm((f: any) => ({ ...f, label: e.target.value })); setFormErrors(er => ({ ...er, label: '' })) }} />{formErrors.label && <p className="text-[11px] text-red-400 mt-1">{formErrors.label}</p>}</FormField>
            <FormField label="Amount borrowed / principal (₹)" className="form-full">
              <AmountInput className="input" placeholder="e.g. 79900 — the price/amount converted to EMI" value={emiForm.principal} onValue={n => setEmiForm((f: any) => ({ ...f, principal: n }))} />
              {(() => {
                const ef = emiFacts({ amount: emiForm.principal, emi: emiForm.emi, tenure: emiForm.tenure })
                if (ef.borrowed == null || !emiForm.emi || !emiForm.tenure) return <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>Optional, but it lets the app show the interest rate and the extra you pay on top.</p>
                return <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>You repay <b>{fmtINR(ef.totalPayable)}</b> in total → extra <b style={{ color: 'var(--warning)' }}>{fmtINR(ef.extraPayable)}</b>{ef.rate != null && ef.rate > 0 ? <> · about <b>{ef.rate}%</b> a year</> : ' · no-cost EMI'}</p>
              })()}
            </FormField>
            <FormField label="EMI/month (₹)"><AmountInput className={"input" + (formErrors.emi ? ' border-red-500' : '')} value={emiForm.emi} onValue={n => { setEmiForm((f: any) => ({ ...f, emi: n ?? 0 })); setFormErrors(er => ({ ...er, emi: '' })) }} />{formErrors.emi && <p className="text-[11px] text-red-400 mt-1">{formErrors.emi}</p>}</FormField>
            <FormField label="Tenure (months)"><input className={"input" + (formErrors.tenure ? ' border-red-500' : '')} type="number" value={emiForm.tenure || ''} onChange={e => { setEmiForm((f: any) => ({ ...f, tenure: +e.target.value })); setFormErrors(er => ({ ...er, tenure: '' })) }} />{formErrors.tenure && <p className="text-[11px] text-red-400 mt-1">{formErrors.tenure}</p>}</FormField>
            <FormField label="Start Date"><input className={"input" + (formErrors.startDate ? ' border-red-500' : '')} type="date" value={emiForm.startDate || ''} onChange={e => { setEmiForm((f: any) => ({ ...f, startDate: e.target.value })); setFormErrors(er => ({ ...er, startDate: '' })) }} />{formErrors.startDate && <p className="text-[11px] text-red-400 mt-1">{formErrors.startDate}</p>}</FormField>
            <FormField label="For / Owed by (optional)"><input className="input" placeholder="e.g. Rahul" value={emiForm.owedBy || ''} onChange={e => setEmiForm((f: any) => ({ ...f, owedBy: e.target.value }))} /></FormField>
            <FormField label="Category"><select className="select" value={emiForm.category || 'Other'} onChange={e => setEmiForm((f: any) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
            </select></FormField>
          </div>
        </Modal>
      )}
      {modalType === 'spend' && activeCard && (
        <Modal title={`Add Spend — ${activeCard.banker}`} onClose={() => { setModalType(null); setFormErrors({}) }}
          footer={<><button className="btn-secondary" onClick={() => { setModalType(null); setFormErrors({}) }}>Cancel</button><button className="btn-primary" disabled={addSpendMut.isPending || Object.keys(validateSpend(spendForm)).length > 0} onClick={() => { const errs = validateSpend(spendForm); if (Object.keys(errs).length > 0) { setFormErrors(errs); return } addSpendMut.mutate({ cardId: activeCard.id, spend: spendForm }) }}>{addSpendMut.isPending ? 'Adding...' : 'Add'}</button></>}>
          <div className="form-grid">
            <FormField label="Purpose *" className="form-full"><input className={"input" + (formErrors.purpose ? ' border-red-500' : '')} placeholder="Amazon, Fuel..." value={spendForm.purpose || ''} onChange={e => { setSpendForm((f: any) => ({ ...f, purpose: e.target.value })); setFormErrors(er => ({ ...er, purpose: '' })) }} />{formErrors.purpose && <p className="text-[11px] text-red-400 mt-1">{formErrors.purpose}</p>}</FormField>
            <FormField label="Amount (₹)"><AmountInput className={"input" + (formErrors.amount ? ' border-red-500' : '')} value={spendForm.amount} onValue={n => { setSpendForm((f: any) => ({ ...f, amount: n ?? 0 })); setFormErrors(er => ({ ...er, amount: '' })) }} />{formErrors.amount && <p className="text-[11px] text-red-400 mt-1">{formErrors.amount}</p>}</FormField>
            <FormField label="Date"><input className={"input" + (formErrors.spendDate ? ' border-red-500' : '')} type="date" value={spendForm.spendDate || ''} onChange={e => { setSpendForm((f: any) => ({ ...f, spendDate: e.target.value })); setFormErrors(er => ({ ...er, spendDate: '' })) }} />{formErrors.spendDate && <p className="text-[11px] text-red-400 mt-1">{formErrors.spendDate}</p>}</FormField>
            <FormField label="Category"><select className="select" value={spendForm.category || 'Other'} onChange={e => setSpendForm((f: any) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
            </select></FormField>
            <FormField label="For / Owed by (optional)"><input className="input" placeholder="e.g. Rahul" value={spendForm.owedBy || ''} onChange={e => setSpendForm((f: any) => ({ ...f, owedBy: e.target.value }))} /></FormField>
          </div>
        </Modal>
      )}
      {confirmModal && <ConfirmModal message={confirmModal.message} confirmLabel={confirmModal.label} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </div>
  )
}

function utilClrFn(u: number) { return u > 70 ? 'var(--danger)' : u > 40 ? 'var(--warning)' : 'var(--success)' }
