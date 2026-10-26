import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi, insuranceApi, expensesApi, incomeApi, peopleOweApi } from '../../api'
import { fmtINR, getEff } from '../../utils/format'
import { calcLoanSplit } from '../../utils/loanCalc'
import { Search, X } from 'lucide-react'

interface SearchResult {
  label: string
  sub: string
  amount?: number
  route: string
  icon: string
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { data: loans = [] } = useQuery({ queryKey: ['loans'], queryFn: loansApi.getAll, enabled: open })
  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.getAll, enabled: open })
  const { data: personal = [] } = useQuery({ queryKey: ['personal'], queryFn: personalEmiApi.getAll, enabled: open })
  const { data: savings = [] } = useQuery({ queryKey: ['savings'], queryFn: savingsApi.getAll, enabled: open })
  const { data: investments = [] } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll, enabled: open })
  const { data: insurance = [] } = useQuery({ queryKey: ['insurance'], queryFn: insuranceApi.getAll, enabled: open })
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.getAll, enabled: open })
  const { data: income = [] } = useQuery({ queryKey: ['income'], queryFn: incomeApi.getAll, enabled: open })
  const { data: peopleOwe = [] } = useQuery({ queryKey: ['people-owe'], queryFn: peopleOweApi.getAll, enabled: open })

  // Keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else setQuery('')
  }, [open])

  const q = query.toLowerCase().trim()

  const results: SearchResult[] = q.length < 1 ? [] : [
    ...loans.filter(l => l.lender?.toLowerCase().includes(q)).map(l => ({
      label: l.lender, sub: (() => { const e=getEff(l); const t=l.tenure??0; const sp=calcLoanSplit(l.amount??0,l.emi??0,t,e.paid,l.principalPaid??undefined); return `${l.loanType} · ${fmtINR(sp.princLeft)} remaining` })(), amount: l.emi, route: '/loans', icon: '🏦'
    })),
    ...cards.filter(c => c.banker?.toLowerCase().includes(q)).map(c => ({
      label: c.banker, sub: `Credit Card · ${fmtINR(c.outstanding)} outstanding`, route: '/cards', icon: '💳'
    })),
    ...personal.filter(p => p.person?.toLowerCase().includes(q)).map(p => ({
      label: p.person, sub: `I Owe · ${fmtINR(p.amount)}`, route: '/personal', icon: '🤝'
    })),
    ...savings.filter(v => v.name?.toLowerCase().includes(q)).map(v => ({
      label: v.name, sub: `Savings · ${fmtINR(v.monthly)}/mo`, route: '/savings', icon: '🪙'
    })),
    ...investments.filter(v => v.name?.toLowerCase().includes(q)).map(v => ({
      label: v.name, sub: `Investment · ${fmtINR(v.currentValue)} value`, route: '/investments', icon: '📈'
    })),
    ...insurance.filter(v => v.name?.toLowerCase().includes(q)).map(v => ({
      label: v.name, sub: `Insurance · ${fmtINR(v.premium)} premium`, route: '/insurance', icon: '🛡️'
    })),
    ...expenses.filter(e => e.label?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)).map(e => ({
      label: e.label, sub: `Expense · ${e.category} · ${fmtINR(e.amount)}/mo`, route: '/expenses', icon: '🔄'
    })),
    ...income.filter(i => i.label?.toLowerCase().includes(q)).map(i => ({
      label: i.label, sub: `Income · ${fmtINR(i.amount)}/mo`, route: '/income', icon: '💰'
    })),
    ...peopleOwe.filter((p: any) => p.person?.toLowerCase().includes(q)).map((p: any) => ({
      label: p.person, sub: `Owes me · ${fmtINR(p.amount)} · ${p.status}`, route: '/people-owe', icon: '🤑'
    })),
  ].slice(0, 8)

  const go = (route: string) => { navigate(route); setOpen(false) }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm text-[#aab2c2] hover:text-[#e8eaf0] transition-colors w-full" style={{background:'#161922',borderColor:'#252836'}}
        title="Search (Cmd+K)">
        <Search size={13} />
        <span className="text-xs">Search...</span>
        <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded hidden md:block" style={{background:"#262a38",color:"#aab2c2"}}>⌘K</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-start justify-center pt-20 px-4"
          onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
              <Search size={16} className="text-[#aab2c2] flex-shrink-0" />
              <input ref={inputRef} className="flex-1 bg-transparent text-[#e8eaf0] placeholder-[#8c96a9] outline-none text-sm"
                placeholder="Search loans, cards, people, expenses..."
                value={query} onChange={e => setQuery(e.target.value)} />
              <button onClick={() => setOpen(false)} className="text-[#8c96a9] hover:text-[#e8eaf0]"><X size={16} /></button>
            </div>
            {q.length > 0 && (
              <div className="max-h-80 overflow-y-auto">
                {results.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[#8c96a9] text-sm">No results for "{query}"</div>
                ) : results.map((r, i) => (
                  <button key={i} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] border-b border-[var(--border)] last:border-0 transition-colors text-left"
                    onClick={() => go(r.route)}>
                    <span className="text-lg">{r.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{r.label}</div>
                      <div className="text-xs text-[#aab2c2] truncate">{r.sub}</div>
                    </div>
                    {r.amount && <span className="mono text-sm text-[#aab2c2] flex-shrink-0">{fmtINR(r.amount)}</span>}
                  </button>
                ))}
              </div>
            )}
            {q.length === 0 && (
              <div className="px-4 py-6 text-center text-[#8c96a9] text-xs">
                Type to search across loans, cards, savings, expenses...
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
