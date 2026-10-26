import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cardsApi, loansApi, personalEmiApi, expensesApi, savingsApi, investmentsApi, insuranceApi, incomeApi } from '../../api'
import api from '../../api/axios'
import { fmtINR } from '../../utils/format'
import { AmountInput } from '../common/AmountInput'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Quick add — one small form for adding anything, not just a card spend. Pick the kind, fill the few fields that
 * matter, save. It posts to the same endpoints the full forms use, so what it creates is indistinguishable from an
 * entry made on the page itself (open that page later to fill in the rest: rate, notes, debit account…).
 */
type FieldKind = 'text' | 'money' | 'int' | 'date' | 'select' | 'card'
interface Field { key: string; label: string; kind: FieldKind; required?: boolean; options?: string[]; placeholder?: string; wide?: boolean; def?: any }
interface QType {
  id: string; icon: string; label: string; fields: Field[]
  save: (v: Record<string, any>, ctx: { cards: any[] }) => Promise<any>
  keys: string[]
  done: (v: Record<string, any>, ctx: { cards: any[] }) => string
}

const today = () => new Date().toISOString().slice(0, 10)
const dayOf = (d: string) => { const n = new Date(d).getDate(); return Number.isFinite(n) ? n : undefined }
const FREQ = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-time']
const startDate: Field = { key: 'startDate', label: 'Start date', kind: 'date', required: true, def: today() }

const TYPES: QType[] = [
  { id: 'spend', icon: '🛍️', label: 'Card spend', keys: ['cards'],
    fields: [
      { key: 'card', label: 'Card', kind: 'card', required: true, wide: true },
      { key: 'purpose', label: 'Purpose', kind: 'text', required: true, placeholder: 'Amazon, Fuel, Food...', wide: true },
      { key: 'amount', label: 'Amount (₹)', kind: 'money', required: true },
      { key: 'date', label: 'Date', kind: 'date', def: today() },
    ],
    save: v => api.post(`/credit-cards/${v.card}/spends`, { purpose: v.purpose, amount: Number(v.amount), spendDate: v.date || today() }),
    done: (v, c) => `${fmtINR(Number(v.amount))} spend added to ${c.cards.find(x => String(x.id) === String(v.card))?.banker ?? 'card'}` },
  { id: 'cardemi', icon: '💳', label: 'Card EMI', keys: ['cards'],
    fields: [
      { key: 'card', label: 'Card', kind: 'card', required: true, wide: true },
      { key: 'label', label: 'What is it for', kind: 'text', required: true, placeholder: 'iPhone, Sofa...', wide: true },
      { key: 'principal', label: 'Borrowed (₹)', kind: 'money', placeholder: 'price converted to EMI' },
      { key: 'emi', label: 'EMI / month (₹)', kind: 'money', required: true },
      { key: 'tenure', label: 'Tenure (months)', kind: 'int', required: true },
      startDate,
    ],
    save: v => api.post(`/credit-cards/${v.card}/emis`, { label: v.label, principal: v.principal || undefined, emi: Number(v.emi), tenure: Number(v.tenure), startDate: v.startDate }),
    done: (v, c) => `${v.label} EMI ${fmtINR(Number(v.emi))}/mo added to ${c.cards.find(x => String(x.id) === String(v.card))?.banker ?? 'card'}` },
  { id: 'expense', icon: '🧾', label: 'Expense / bill', keys: ['expenses'],
    fields: [
      { key: 'label', label: 'Name', kind: 'text', required: true, placeholder: 'Rent, Electricity...', wide: true },
      { key: 'amount', label: 'Amount (₹)', kind: 'money', required: true },
      { key: 'frequency', label: 'How often', kind: 'select', options: FREQ, def: 'Monthly' },
      { key: 'category', label: 'Category', kind: 'select', options: ['Rent', 'Food', 'Transport', 'Utilities', 'Subscriptions', 'Healthcare', 'Education', 'Family', 'Other'], def: 'Other' },
      { key: 'startDate', label: 'Due date', kind: 'date', required: true, def: today() },
    ],
    save: v => expensesApi.create({ label: v.label, amount: Number(v.amount), frequency: v.frequency, category: v.category, startDate: v.startDate, dueDay: dayOf(v.startDate), active: true }),
    done: v => `${v.label} ${fmtINR(Number(v.amount))} added (${String(v.frequency).toLowerCase()})` },
  { id: 'loan', icon: '🏦', label: 'Loan', keys: ['loans'],
    fields: [
      { key: 'lender', label: 'Lender', kind: 'text', required: true, wide: true },
      { key: 'loanType', label: 'Type', kind: 'select', options: ['Personal Loan', 'Home Loan', 'Car Loan', 'Bike Loan', 'Gold Loan', 'Education Loan', 'Business Loan'], def: 'Personal Loan', wide: true },
      { key: 'amount', label: 'Loan amount (₹)', kind: 'money', required: true },
      { key: 'emi', label: 'EMI / month (₹)', kind: 'money', required: true },
      { key: 'tenure', label: 'Tenure (months)', kind: 'int', required: true },
      startDate,
    ],
    save: v => loansApi.create({ lender: v.lender, loanType: v.loanType, amount: Number(v.amount), emi: Number(v.emi), tenure: Number(v.tenure), startDate: v.startDate, dueDay: dayOf(v.startDate) }),
    done: v => `${v.lender} loan added — EMI ${fmtINR(Number(v.emi))}/mo` },
  { id: 'iowe', icon: '🤝', label: 'I owe', keys: ['personal'],
    fields: [
      { key: 'person', label: 'Who', kind: 'text', required: true, wide: true },
      { key: 'amount', label: 'Amount owed (₹)', kind: 'money', required: true },
      { key: 'emi', label: 'EMI / month (₹)', kind: 'money', placeholder: 'if you pay monthly' },
      { key: 'tenure', label: 'Tenure (months)', kind: 'int', placeholder: 'blank = open-ended' },
      { key: 'startDate', label: 'Start date', kind: 'date', def: today() },
    ],
    save: v => personalEmiApi.create({ person: v.person, amount: Number(v.amount), emi: v.emi || undefined, tenure: v.tenure ? Number(v.tenure) : undefined, startDate: v.startDate || undefined, dueDay: v.startDate ? dayOf(v.startDate) : undefined }),
    done: v => `Owing ${v.person} ${fmtINR(Number(v.amount))} added` },
  { id: 'savings', icon: '🐖', label: 'Savings / chit', keys: ['savings'],
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, wide: true },
      { key: 'monthly', label: 'Monthly (₹)', kind: 'money', required: true },
      { key: 'tenure', label: 'Tenure (months)', kind: 'int', required: true },
      startDate,
    ],
    save: v => savingsApi.create({ name: v.name, monthly: Number(v.monthly), tenure: Number(v.tenure), mode: 'saving', startDate: v.startDate }),
    done: v => `${v.name} ${fmtINR(Number(v.monthly))}/mo added` },
  { id: 'sip', icon: '📈', label: 'SIP / investment', keys: ['investments'],
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true, wide: true },
      { key: 'investType', label: 'Type', kind: 'select', options: ['FD', 'RD', 'Mutual Fund', 'Stocks', 'PPF', 'NPS', 'Bonds', 'Gold', 'Other'], def: 'Mutual Fund' },
      { key: 'monthly', label: 'Monthly (₹)', kind: 'money', required: true },
      { key: 'startDate', label: 'Start date', kind: 'date', def: today() },
    ],
    save: v => investmentsApi.create({ name: v.name, investType: v.investType, monthly: Number(v.monthly), startDate: v.startDate || undefined }),
    done: v => `${v.name} ${fmtINR(Number(v.monthly))}/mo added` },
  { id: 'insurance', icon: '🛡️', label: 'Insurance', keys: ['insurance'],
    fields: [
      { key: 'name', label: 'Policy name', kind: 'text', required: true, wide: true },
      { key: 'policyType', label: 'Type', kind: 'select', options: ['Life', 'Health', 'Term', 'Vehicle', 'Emergency Fund', 'Death Fund', 'Other'], def: 'Life' },
      { key: 'frequency', label: 'Premium paid', kind: 'select', options: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Single'], def: 'Yearly' },
      { key: 'premium', label: 'Premium (₹)', kind: 'money', required: true },
      { key: 'startDate', label: 'Start / due date', kind: 'date', required: true, def: today() },
    ],
    save: v => insuranceApi.create({ name: v.name, policyType: v.policyType, premium: Number(v.premium), frequency: v.frequency, startDate: v.startDate, active: true }),
    done: v => `${v.name} premium ${fmtINR(Number(v.premium))} added` },
  { id: 'income', icon: '💰', label: 'Income', keys: ['income'],
    fields: [
      { key: 'label', label: 'Source', kind: 'text', required: true, placeholder: 'Salary, Rent received...', wide: true },
      { key: 'amount', label: 'Amount (₹)', kind: 'money', required: true },
      { key: 'frequency', label: 'How often', kind: 'select', options: FREQ, def: 'Monthly' },
      { key: 'startDate', label: 'Date', kind: 'date', def: today() },
    ],
    save: v => incomeApi.create({ label: v.label, amount: Number(v.amount), frequency: v.frequency, startDate: v.startDate || undefined, active: true }),
    done: v => `${v.label} ${fmtINR(Number(v.amount))} added` },
]

const initial = (t: QType) => Object.fromEntries(t.fields.map(f => [f.key, f.def ?? (f.kind === 'money' ? null : '')]))

export default function QuickAdd({ sidebarTrigger = false, hideTrigger = false }: { sidebarTrigger?: boolean; hideTrigger?: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typeId, setTypeId] = useState('spend')
  const type = TYPES.find(t => t.id === typeId) ?? TYPES[0]
  const [vals, setVals] = useState<Record<string, any>>(() => initial(TYPES[0]))

  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll, enabled: open })

  const pick = (id: string) => {
    const t = TYPES.find(x => x.id === id) ?? TYPES[0]
    setTypeId(t.id)
    setVals(v => ({ ...initial(t), card: v.card ?? '' })) // keep the chosen card when moving between spend ↔ EMI
  }

  const mut = useMutation({
    mutationFn: () => type.save(vals, { cards: cards as any[] }),
    onSuccess: () => {
      type.keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      toast.success(type.done(vals, { cards: cards as any[] }))
      setVals(initial(type)); setOpen(false)
    },
  })

  // The sidebar's "Quick add" row opens this same modal (optionally with a kind pre-picked via event detail), so on
  // desktop with the side menu the floating button (which sat on top of the last table column) is not needed.
  useEffect(() => {
    const h = (e: Event) => {
      const want = (e as CustomEvent)?.detail?.type
      if (want && TYPES.some(t => t.id === want)) pick(want)
      setOpen(true)
    }
    window.addEventListener('ff:quick-add', h)
    return () => window.removeEventListener('ff:quick-add', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const missing = useMemo(() => type.fields.filter(f => f.required && (f.kind === 'money' ? !(Number(vals[f.key]) > 0) : f.kind === 'int' ? !(Number(vals[f.key]) > 0) : !String(vals[f.key] ?? '').trim())), [type, vals])
  const canSubmit = missing.length === 0
  const submit = () => { if (canSubmit && !mut.isPending) mut.mutate() }
  const set = (k: string, v: any) => setVals(p => ({ ...p, [k]: v }))
  const amountKey = ['amount', 'premium', 'monthly', 'emi'].find(k => type.fields.some(f => f.key === k))
  const amt = amountKey ? Number(vals[amountKey]) : 0

  return (
    <>
      {/* Floating button — bottom right (it used to sit bottom-left, on top of the sidebar's user/Logout block) */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-3 right-3 ${hideTrigger ? 'hidden ' : ''}${sidebarTrigger ? 'md:hidden ' : ''}w-8 h-8 rounded-full bg-orange-500/90 hover:bg-orange-500 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40 opacity-50 hover:opacity-100 print:hidden`}
        title="Quick add">
        <Plus size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="font-bold">Quick add</div>
              <button onClick={() => setOpen(false)} className="text-[#aab2c2] hover:text-[#e8eaf0]" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {/* What are you adding? */}
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="What do you want to add">
                {TYPES.map(t => {
                  const on = t.id === typeId
                  return (
                    <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => pick(t.id)}
                      className="text-[12px] px-2.5 py-1 rounded-full border transition-colors"
                      style={{ background: on ? 'color-mix(in srgb, #f97316 15%, transparent)' : 'transparent', borderColor: on ? 'color-mix(in srgb, #f97316 50%, transparent)' : 'var(--border)', color: on ? 'var(--text)' : 'var(--text-muted)', fontWeight: on ? 600 : 400, cursor: 'pointer' }}>
                      {t.icon} {t.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {type.fields.map(f => (
                  <div key={f.key} className={f.wide ? 'col-span-2' : ''}>
                    <label className="label">{f.label}{f.required ? '' : <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> · optional</span>}</label>
                    {f.kind === 'card' ? (
                      <select className="select w-full" value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                        <option value="">Select card...</option>
                        {(cards as any[]).map(c => <option key={c.id} value={c.id}>{c.banker}</option>)}
                      </select>
                    ) : f.kind === 'select' ? (
                      <select className="select w-full" value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                        {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.kind === 'money' ? (
                      <AmountInput className="input w-full" placeholder={f.placeholder ?? '0'} value={vals[f.key]} onValue={n => set(f.key, n)} />
                    ) : (
                      <input className="input w-full" type={f.kind === 'date' ? 'date' : f.kind === 'int' ? 'number' : 'text'} min={f.kind === 'int' ? 1 : undefined}
                        placeholder={f.placeholder} value={vals[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submit()} />
                    )}
                  </div>
                ))}
              </div>

              <button className="btn-primary w-full justify-center mt-2" onClick={submit} disabled={!canSubmit || mut.isPending}>
                {mut.isPending ? 'Adding...' : `Add ${type.label.toLowerCase()}${amt > 0 ? ` · ${fmtINR(amt)}` : ''}`}
              </button>
              {!canSubmit && <div className="text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>Still needed: {missing.map(m => m.label.replace(/ \(.*\)/, '').toLowerCase()).join(', ')}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
