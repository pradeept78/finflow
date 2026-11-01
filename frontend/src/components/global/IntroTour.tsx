import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Coins, Landmark, CheckCircle2, Plus, Compass, Lock, Info } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

/**
 * A short intro: shown once after someone first signs in, and again from "How FinFlow works" (More menu,
 * the sidebar, any page's ⓘ). Six cards, each one idea, with Skip on every card. Seen-state is per user,
 * on this device.
 */
const SLIDES: { icon: LucideIcon; color: string; title: string; body: string; points?: string[] }[] = [
  { icon: Landmark, color: 'var(--danger)', title: 'Everything you owe, in one place',
    body: 'Loans, credit cards, card EMIs, chits and hand loans — plus your savings, investments and income — so you always know where you stand.' },
  { icon: Coins, color: 'var(--success)', title: 'The numbers that matter',
    body: 'FinFlow keeps a few figures the same on every screen:',
    points: [
      'Committed / month — what repeats every month: EMIs, bills, insurance, savings, SIPs.',
      'Free / month — your income minus that.',
      "Card bill — what this month's card statements need.",
      'Left this month — what is free after the card bills.',
    ] },
  { icon: CheckCircle2, color: 'var(--warning)', title: 'Tick as you pay',
    body: 'The Due tab lists every payment this month by date. Tick each one when it is paid — nothing is assumed paid, so a missed EMI never hides. Late ones turn red.' },
  { icon: Plus, color: 'var(--orange)', title: 'Adding is quick',
    body: 'Tap Add for a card spend, EMI, loan, bill or anything else. Bank messages can read your bank SMS and add card spends, bills and EMI payments for you — with Undo.' },
  { icon: Compass, color: 'var(--info)', title: 'Finding your way',
    body: 'Home is the big picture. Due is this month. Debt and Savings hold their own pages as tabs. More has the calendar, budget, payoff plan, history and statements.',
    points: ['Not sure what a page shows? Tap the ⓘ at the top of any page.'] },
  { icon: Lock, color: 'var(--purple)', title: 'Your numbers stay yours',
    body: 'No bank logins and no reading your messages without you setting it up. Admins of this FinFlow can see accounts, never anyone\'s money.' },
]

const key = (id?: number | string) => `ff_intro_done_${id ?? 'anon'}`

export default function IntroTour() {
  const user = useAuthStore(s => s.user)
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  // First visit for this user on this device; and on request from anywhere (openIntro()).
  useEffect(() => {
    if (!user) return
    try { if (!localStorage.getItem(key(user.id))) { setI(0); setOpen(true) } } catch { /* storage blocked: skip the auto intro */ }
  }, [user?.id])
  useEffect(() => {
    const show = () => { setI(0); setOpen(true) }
    window.addEventListener('ff:intro', show)
    return () => window.removeEventListener('ff:intro', show)
  }, [])

  if (!open) return null
  const close = () => { try { localStorage.setItem(key(user?.id), '1') } catch { /* fine */ } setOpen(false) }
  const s = SLIDES[i], last = i === SLIDES.length - 1
  const Icon = s.icon

  return (
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4" role="dialog" aria-modal="true" aria-label="How FinFlow works">
      <div className="sheet-up w-full max-w-md rounded-t-2xl md:rounded-2xl border shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)', minHeight: 420 }}>
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}><Info size={14} />How FinFlow works · {i + 1} of {SLIDES.length}</span>
          <button type="button" onClick={close} className="text-[13px] font-medium px-2 py-1 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>Skip</button>
        </div>
        <div className="flex-1 px-6 pt-6 pb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}>
            <Icon size={28} strokeWidth={2} aria-hidden />
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight mb-2" style={{ color: 'var(--text)' }}>{s.title}</h2>
          <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.body}</p>
          {s.points && (
            <ul className="mt-3 space-y-2">
              {s.points.map(p => (
                <li key={p} className="flex gap-2 text-[13px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                  <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-5">
          <div className="flex gap-1.5" aria-hidden>
            {SLIDES.map((_, n) => (
              <span key={n} className="h-1.5 rounded-full transition-all" style={{ width: n === i ? 18 : 6, background: n === i ? 'var(--orange)' : 'var(--border)' }} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setI(i - 1)}>Back</button>}
            <button type="button" className="btn-primary btn-sm" onClick={() => (last ? close() : setI(i + 1))}>{last ? 'Get started' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
